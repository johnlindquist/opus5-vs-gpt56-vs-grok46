/**
 * Deterministic demonstration of the refactored queue.
 *
 * Determinism comes from three choices:
 *   1. Retry timers run on a `ManualScheduler`, so backoff is virtual time the
 *      script advances explicitly — no wall-clock sleeps.
 *   2. "Work" is measured in microtask ticks, not milliseconds, so interleaving
 *      is fixed by the event loop rather than by machine speed.
 *   3. Every line is stamped with a monotonic sequence number plus virtual time.
 *
 * Run with `bun run demo.ts`. Output is byte-identical across runs.
 */

import { JobQueue, ManualScheduler, isAbortError } from "./src/job-queue.ts";
import type { QueueEventName } from "./src/job-queue.ts";

const clock = new ManualScheduler();
let listenerErrors = 0;
const queue = new JobQueue(2, {
  scheduler: clock,
  // Contained listener failures are reported here instead of to stderr, which
  // keeps the captured transcript clean and deterministic.
  onListenerError: () => {
    listenerErrors += 1;
  },
});

let seq = 0;
const lines: string[] = [];

function out(line = ""): void {
  lines.push(line);
  console.log(line);
}

function heading(title: string): void {
  out();
  out(`── ${title} ${"─".repeat(Math.max(0, 62 - title.length))}`);
}

function event(name: string, id: string, detail = ""): void {
  seq += 1;
  out(
    `${String(seq).padStart(3, "0")}  t=${String(clock.now).padStart(4)}ms  ` +
      `${name.padEnd(10)} ${id.padEnd(14)} ${detail}`,
  );
}

function snapshot(label: string): void {
  const s = queue.stats();
  out(
    `      stats @ ${label.padEnd(22)} pending=${s.pending} running=${s.running} ` +
      `retryWaiting=${s.retryWaiting} liveIds=${s.liveIds} closed=${s.closed}`,
  );
}

/** Simulated work: `ticks` microtask turns, then a value. */
async function work<T>(ticks: number, value: T): Promise<T> {
  for (let i = 0; i < ticks; i += 1) await null;
  return value;
}

/** Lets every queued microtask chain settle before the next scripted step. */
const settle = (): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, 0));

// ── wire up the typed event stream ─────────────────────────────────────────

const names: QueueEventName[] = [
  "queued",
  "started",
  "retrying",
  "fulfilled",
  "rejected",
  "cancelled",
];
const detail: Record<QueueEventName, (p: any) => string> = {
  queued: (p) => `priority=${p.priority} retries=${p.retries}`,
  started: (p) => `attempt ${p.attempt}`,
  retrying: (p) => `retry ${p.retry} in ${p.delayMs}ms (${p.error.message})`,
  fulfilled: (p) => `=> ${JSON.stringify(p.value)} after ${p.attempts} attempt(s)`,
  rejected: (p) => `!! ${p.error.message} after ${p.attempts} attempt(s)`,
  cancelled: (p) => `from ${p.from}`,
};
for (const name of names) {
  queue.on(name, (payload) => event(name, payload.id, detail[name](payload)));
}

// A deliberately broken listener: it must never affect execution.
queue.on("started", () => {
  throw new Error("this listener is broken on purpose");
});

const results: string[] = [];
const track = (id: string, promise: Promise<unknown>): Promise<void> =>
  promise.then(
    (value) => {
      results.push(`${id.padEnd(14)} fulfilled  ${JSON.stringify(value)}`);
    },
    (error) => {
      results.push(
        `${id.padEnd(14)} ${isAbortError(error) ? "cancelled " : "rejected  "} ` +
          `${(error as Error).name}: ${(error as Error).message}`,
      );
    },
  );

out("The Haunted Queue — deterministic demonstration");
out("concurrency=2, retry timers on a virtual clock, work measured in ticks");

// ── phase 1: priority and FIFO under a concurrency ceiling ─────────────────

heading("phase 1 · mixed priority admission");

const pending: Array<Promise<void>> = [];
pending.push(track("send-email", queue.add("send-email", () => work(3, "sent"), { priority: 10 })));
pending.push(track("index-docs", queue.add("index-docs", () => work(4, "indexed"), { priority: 0 })));
pending.push(track("warm-cache", queue.add("warm-cache", () => work(1, "warm"), { priority: 5 })));
pending.push(track("thumbnail", queue.add("thumbnail", () => work(2, "resized"), { priority: 5 })));
pending.push(track("stale-scan", queue.add("stale-scan", () => work(1, "scanned"), { priority: 0 })));

snapshot("after 5 adds");

// ── phase 2: rejected additions ────────────────────────────────────────────

heading("phase 2 · rejected additions");

await queue.add("send-email", () => work(0, "duplicate")).catch((error) => {
  seq += 1;
  out(
    `${String(seq).padStart(3, "0")}  t=${String(clock.now).padStart(4)}ms  ` +
      `refused    send-email     ${(error as Error).name}`,
  );
});

// ── phase 3: cancelling a pending job ──────────────────────────────────────

heading("phase 3 · cancel a job still waiting for a slot");

out(`      cancel("stale-scan") -> ${queue.cancel("stale-scan")}`);
out(`      cancel("not-a-job")  -> ${queue.cancel("not-a-job")}`);
snapshot("after cancellation");

await settle();
snapshot("phase 1 complete");

// ── phase 4: retries on a virtual clock ────────────────────────────────────

heading("phase 4 · retry with exponential backoff");

let uploadAttempts = 0;
pending.push(
  track(
    "flaky-upload",
    queue.add(
      "flaky-upload",
      () => {
        uploadAttempts += 1;
        if (uploadAttempts < 3) throw new Error(`network reset #${uploadAttempts}`);
        return work(1, "uploaded");
      },
      { priority: 5, retries: 3 },
    ),
  ),
);
pending.push(
  track(
    "bad-report",
    queue.add(
      "bad-report",
      () => Promise.reject(new Error("malformed template")),
      { priority: 1, retries: 1 },
    ),
  ),
);

await settle();
snapshot("both in backoff");

for (const step of [25, 25, 50]) {
  clock.advance(step);
  await settle();
}
snapshot("retries resolved");

// ── phase 5: cancelling a running job ──────────────────────────────────────

heading("phase 5 · cancel a running job");

pending.push(
  track(
    "stuck-crawler",
    queue.add(
      "stuck-crawler",
      (signal) =>
        new Promise((_resolve, reject) => {
          signal.addEventListener("abort", () =>
            reject(new Error("crawler observed its abort signal")),
          );
        }),
      { priority: 9, retries: 5 },
    ),
  ),
);
await settle();
snapshot("crawler running");
out(`      cancel("stuck-crawler") -> ${queue.cancel("stuck-crawler")}`);
await settle();
out(`      retry timers armed after cancelling a running job: ${clock.pending}`);

// ── phase 6: close and drain ───────────────────────────────────────────────

heading("phase 6 · close, then drain");

queue.close();
await queue.add("after-close", () => work(0, "never")).catch((error) => {
  seq += 1;
  out(
    `${String(seq).padStart(3, "0")}  t=${String(clock.now).padStart(4)}ms  ` +
      `refused    after-close    ${(error as Error).name}`,
  );
});

await queue.drain();
await Promise.all(pending);

heading("settled promises");
for (const line of results.slice().sort()) out(`      ${line}`);

heading("final state");
snapshot("after drain");
out(`      retry timers still armed:      ${clock.pending}`);
out(`      virtual time elapsed:          ${clock.now}ms`);
out(`      every tracked promise settled: ${results.length === pending.length}`);
out(`      listener failures contained:   ${listenerErrors}`);

await Bun.write("out/demo.txt", `${lines.join("\n")}\n`);
