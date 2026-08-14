import { describe, expect, test } from "bun:test";
import {
  AbortError,
  DuplicateJobIdError,
  exponentialBackoff,
  InvalidConcurrencyError,
  InvalidJobError,
  JobQueue,
  ManualScheduler,
  QueueClosedError,
} from "../src/job-queue.ts";
import type { QueueEventName } from "../src/job-queue.ts";

// ── helpers ────────────────────────────────────────────────────────────────

/** Yields to the macrotask queue so every pending microtask chain settles. */
const flush = (): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, 0));

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (error: unknown) => void;
}

function deferred<T = void>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/** Records every emitted event as `"name:id"` for order assertions. */
function trace(queue: JobQueue): string[] {
  const log: string[] = [];
  const names: QueueEventName[] = [
    "queued",
    "started",
    "retrying",
    "fulfilled",
    "rejected",
    "cancelled",
  ];
  for (const name of names) {
    queue.on(name, (payload) => log.push(`${name}:${payload.id}`));
  }
  return log;
}

/** A queue whose retry timers are driven by an explicit clock. */
function withClock(concurrency = 1) {
  const clock = new ManualScheduler();
  return { clock, queue: new JobQueue(concurrency, { scheduler: clock }) };
}

// ── construction ───────────────────────────────────────────────────────────

describe("construction", () => {
  test("concurrency must be an integer from 1 through 32", () => {
    expect(new JobQueue().concurrency).toBe(2);
    expect(new JobQueue(1).concurrency).toBe(1);
    expect(new JobQueue(32).concurrency).toBe(32);
    for (const bad of [0, -1, 33, 2.5, Number.NaN, Infinity]) {
      expect(() => new JobQueue(bad)).toThrow(InvalidConcurrencyError);
    }
  });
});

// ── ordering ───────────────────────────────────────────────────────────────

describe("ordering", () => {
  test("higher priority starts first and ties keep FIFO insertion order", async () => {
    const queue = new JobQueue(1);
    const order: string[] = [];
    const gate = deferred();

    const blocker = queue.add("gate", async () => {
      await gate.promise;
      order.push("gate");
    });
    await flush(); // "gate" now occupies the only slot.

    const rest = [
      queue.add("a", () => void order.push("a"), { priority: 1 }),
      queue.add("b", () => void order.push("b"), { priority: 5 }),
      queue.add("c", () => void order.push("c"), { priority: 1 }),
      queue.add("d", () => void order.push("d"), { priority: 10 }),
      queue.add("e", () => void order.push("e"), { priority: 5 }),
    ];

    expect(queue.stats().pending).toBe(5);
    gate.resolve();
    await Promise.all([blocker, ...rest]);

    // d(10) → b(5) → e(5, later) → a(1) → c(1, later)
    expect(order).toEqual(["gate", "d", "b", "e", "a", "c"]);
  });

  test("at most `concurrency` jobs execute at once", async () => {
    const queue = new JobQueue(3);
    const release = deferred();
    let current = 0;
    let peak = 0;

    const jobs = Array.from({ length: 9 }, (_, index) =>
      queue.add(`job-${index}`, async () => {
        current += 1;
        peak = Math.max(peak, current);
        await release.promise;
        current -= 1;
      }),
    );

    await flush();
    expect(queue.stats()).toMatchObject({ running: 3, pending: 6 });
    release.resolve();
    await Promise.all(jobs);

    expect(peak).toBe(3);
    expect(queue.stats()).toMatchObject({ running: 0, pending: 0, liveIds: 0 });
  });
});

// ── identity ───────────────────────────────────────────────────────────────

describe("duplicate ids", () => {
  test("rejected while pending, running, or retry-waiting", async () => {
    const { clock, queue } = withClock(1);
    const gate = deferred();

    const running = queue.add("busy", () => gate.promise);
    await flush();
    await expect(queue.add("busy", () => 1)).rejects.toBeInstanceOf(
      DuplicateJobIdError,
    );

    const pending = queue.add("waiting", () => 2);
    await expect(queue.add("waiting", () => 3)).rejects.toBeInstanceOf(
      DuplicateJobIdError,
    );

    gate.resolve(undefined as never);
    await Promise.all([running, pending]);

    // Now the retry-waiting state.
    let attempts = 0;
    const flaky = queue.add(
      "flaky",
      () => {
        attempts += 1;
        if (attempts === 1) throw new Error("boom");
        return "done";
      },
      { retries: 1 },
    );
    await flush();
    expect(queue.stats().retryWaiting).toBe(1);
    await expect(queue.add("flaky", () => 4)).rejects.toBeInstanceOf(
      DuplicateJobIdError,
    );

    clock.advance(25);
    expect(await flaky).toBe("done");
  });

  test("an id becomes reusable after the job settles permanently", async () => {
    const queue = new JobQueue(1);

    expect(await queue.add("reused", () => "first")).toBe("first");
    expect(await queue.add("reused", () => "second")).toBe("second");

    await expect(
      queue.add("reused", () => {
        throw new Error("nope");
      }),
    ).rejects.toThrow("nope");

    const cancelled = queue.add("reused", () => new Promise(() => {}));
    expect(queue.cancel("reused")).toBe(true);
    await expect(cancelled).rejects.toBeInstanceOf(AbortError);

    expect(await queue.add("reused", () => "fourth")).toBe("fourth");
    expect(queue.stats().liveIds).toBe(0);
  });
});

// ── failure handling ───────────────────────────────────────────────────────

describe("failures and retries", () => {
  test("a synchronous throw behaves exactly like a rejected promise", async () => {
    const { clock, queue } = withClock(1);
    const events = trace(queue);

    // Handlers are attached up front so neither rejection is ever unhandled.
    const settled = await Promise.allSettled([
      queue.add("sync", () => {
        throw new Error("sync boom");
      }),
      queue.add("async", async () => {
        throw new Error("async boom");
      }),
    ]);

    expect(settled.map((entry) => entry.status)).toEqual([
      "rejected",
      "rejected",
    ]);
    expect((settled[0] as PromiseRejectedResult).reason.message).toBe(
      "sync boom",
    );
    expect((settled[1] as PromiseRejectedResult).reason.message).toBe(
      "async boom",
    );
    expect(events).toContain("rejected:sync");
    expect(events).toContain("rejected:async");

    // And a synchronous throw is retried just like an async one.
    let attempts = 0;
    const retried = queue.add(
      "sync-retry",
      () => {
        attempts += 1;
        if (attempts < 2) throw new Error("still bad");
        return "recovered";
      },
      { retries: 1 },
    );
    await flush();
    clock.advance(25);
    expect(await retried).toBe("recovered");
    expect(attempts).toBe(2);
  });

  test("a job that eventually succeeds resolves with the later attempt", async () => {
    const { clock, queue } = withClock(1);
    const delays: number[] = [];
    queue.on("retrying", (payload) => delays.push(payload.delayMs));

    let attempts = 0;
    const job = queue.add(
      "flaky",
      async () => {
        attempts += 1;
        if (attempts < 3) throw new Error(`attempt ${attempts} failed`);
        return `ok after ${attempts}`;
      },
      { retries: 3 },
    );

    await flush();
    expect(queue.stats().retryWaiting).toBe(1);
    clock.advance(25);
    await flush();
    clock.advance(50);

    expect(await job).toBe("ok after 3");
    // 25 * 2 ** (retry - 1)
    expect(delays).toEqual([25, 50]);
    expect(clock.pending).toBe(0);
  });

  test("`retries` is additional attempts; exhaustion rejects with the last error", async () => {
    const { clock, queue } = withClock(1);
    const attemptNumbers: number[] = [];
    queue.on("started", (payload) => attemptNumbers.push(payload.attempt));

    let attempts = 0;
    const job = queue.add(
      "doomed",
      () => {
        attempts += 1;
        return Promise.reject(new Error(`failure ${attempts}`));
      },
      { retries: 2 },
    );

    await flush();
    clock.advance(25);
    await flush();
    clock.advance(50);

    await expect(job).rejects.toThrow("failure 3");
    expect(attempts).toBe(3); // 1 initial + 2 retries
    expect(attemptNumbers).toEqual([1, 2, 3]);
    expect(clock.pending).toBe(0);
    expect(queue.stats().liveIds).toBe(0);
  });

  test("the default backoff curve is 25 * 2 ** (retry - 1)", () => {
    expect([1, 2, 3, 4].map(exponentialBackoff)).toEqual([25, 50, 100, 200]);
    expect(() => exponentialBackoff(0)).toThrow(RangeError);
  });
});

// ── cancellation ───────────────────────────────────────────────────────────

describe("cancellation", () => {
  test("cancelling a pending job removes it and rejects exactly once", async () => {
    const queue = new JobQueue(1);
    const gate = deferred();
    let ran = false;

    const blocker = queue.add("gate", () => gate.promise);
    await flush();

    const pending = queue.add("later", () => {
      ran = true;
    });
    expect(queue.stats().pending).toBe(1);

    let rejections = 0;
    pending.catch(() => (rejections += 1));

    expect(queue.cancel("later")).toBe(true);
    expect(queue.cancel("later")).toBe(false); // already settled
    await expect(pending).rejects.toBeInstanceOf(AbortError);

    gate.resolve(undefined as never);
    await blocker;
    await queue.drain();
    await flush();

    expect(ran).toBe(false);
    expect(rejections).toBe(1);
    expect(queue.stats().pending).toBe(0);
  });

  test("cancelling a running job aborts its signal and never retries", async () => {
    const { clock, queue } = withClock(1);
    let sawAbort = false;
    let attempts = 0;

    const job = queue.add(
      "long",
      (signal) => {
        attempts += 1;
        return new Promise((_resolve, reject) => {
          signal.addEventListener("abort", () => {
            sawAbort = true;
            reject(new Error("aborted inside the task"));
          });
        });
      },
      { retries: 3 },
    );

    await flush();
    expect(queue.stats().running).toBe(1);
    expect(queue.cancel("long")).toBe(true);

    await expect(job).rejects.toBeInstanceOf(AbortError);
    await flush();

    expect(sawAbort).toBe(true);
    expect(attempts).toBe(1);
    expect(clock.pending).toBe(0); // no retry was scheduled
    expect(queue.stats()).toMatchObject({ running: 0, liveIds: 0 });
  });

  test("cancelling during retry backoff clears the timer", async () => {
    const { clock, queue } = withClock(1);
    let attempts = 0;

    const job = queue.add(
      "backing-off",
      () => {
        attempts += 1;
        throw new Error("boom");
      },
      { retries: 5 },
    );

    await flush();
    expect(queue.stats().retryWaiting).toBe(1);
    expect(clock.pending).toBe(1);

    expect(queue.cancel("backing-off")).toBe(true);
    await expect(job).rejects.toBeInstanceOf(AbortError);

    clock.advance(10_000);
    await flush();

    expect(attempts).toBe(1);
    expect(clock.pending).toBe(0);
    expect(queue.stats()).toMatchObject({ retryWaiting: 0, liveIds: 0 });
  });

  test("cancel returns false when no live job holds the id", async () => {
    const queue = new JobQueue(1);
    expect(queue.cancel("never-existed")).toBe(false);
    await queue.add("done", () => "value");
    expect(queue.cancel("done")).toBe(false);
  });
});

// ── drain ──────────────────────────────────────────────────────────────────

describe("drain", () => {
  test("waits for active and pending jobs, and all callers resolve", async () => {
    const queue = new JobQueue(2);
    const gate = deferred();
    const finished: string[] = [];

    const jobs = ["a", "b", "c", "d"].map((id) =>
      queue.add(id, async () => {
        await gate.promise;
        finished.push(id);
      }),
    );
    await flush();

    let resolvedCount = 0;
    const drains = [queue.drain(), queue.drain(), queue.drain()].map((p) =>
      p.then(() => {
        resolvedCount += 1;
      }),
    );

    await flush();
    expect(resolvedCount).toBe(0);

    gate.resolve(undefined as never);
    await Promise.all([...jobs, ...drains]);

    expect(resolvedCount).toBe(3);
    expect(finished.length).toBe(4);
    expect(queue.stats()).toMatchObject({ pending: 0, running: 0, liveIds: 0 });
  });

  test("does not resolve while a job is waiting in retry backoff", async () => {
    const { clock, queue } = withClock(1);
    let resolved = false;
    let attempts = 0;

    const job = queue.add(
      "flaky",
      () => {
        attempts += 1;
        if (attempts < 2) throw new Error("boom");
        return "ok";
      },
      { retries: 1 },
    );

    await flush();
    expect(queue.stats().retryWaiting).toBe(1);

    const drained = queue.drain().then(() => {
      resolved = true;
    });
    await flush();
    expect(resolved).toBe(false);

    clock.advance(25);
    await Promise.all([job, drained]);
    expect(resolved).toBe(true);
    expect(clock.pending).toBe(0);
  });

  test("jobs added before a pending drain resolves are included in it", async () => {
    const queue = new JobQueue(1);
    const first = deferred();
    const second = deferred();
    const finished: string[] = [];

    const jobA = queue.add("a", async () => {
      await first.promise;
      finished.push("a");
    });
    await flush();

    const drained = queue.drain();
    const jobB = queue.add("b", async () => {
      await second.promise;
      finished.push("b");
    });

    first.resolve(undefined as never);
    await flush();
    expect(finished).toEqual(["a"]); // b is running, drain still outstanding

    second.resolve(undefined as never);
    await Promise.all([jobA, jobB, drained]);

    expect(finished).toEqual(["a", "b"]);
    expect(queue.stats()).toMatchObject({ pending: 0, running: 0 });
  });

  test("drain on an idle queue resolves immediately", async () => {
    const queue = new JobQueue(4);
    await queue.drain();
    expect(queue.stats().liveIds).toBe(0);
  });
});

// ── close ──────────────────────────────────────────────────────────────────

describe("close", () => {
  test("blocks additions with QueueClosedError but lets work and retries settle", async () => {
    const { clock, queue } = withClock(2);
    let attempts = 0;

    const flaky = queue.add(
      "flaky",
      () => {
        attempts += 1;
        if (attempts < 2) throw new Error("boom");
        return "recovered";
      },
      { retries: 1 },
    );
    const steady = queue.add("steady", async () => "fine");

    await flush();
    queue.close();
    expect(queue.stats().closed).toBe(true);

    const refused = queue.add("newcomer", () => "nope");
    await expect(refused).rejects.toBeInstanceOf(QueueClosedError);

    clock.advance(25);
    expect(await flaky).toBe("recovered");
    expect(await steady).toBe("fine");
    await queue.drain();
    expect(clock.pending).toBe(0);
  });

  test("invalid additions reject rather than throw synchronously", async () => {
    const queue = new JobQueue(1);
    const attempts = [
      queue.add("", () => 1),
      queue.add("bad-run", undefined as never),
      queue.add("bad-priority", () => 1, { priority: Number.NaN }),
      queue.add("bad-retries", () => 1, { retries: -1 }),
      queue.add("fractional-retries", () => 1, { retries: 1.5 }),
    ];
    for (const attempt of attempts) {
      expect(attempt).toBeInstanceOf(Promise);
      await expect(attempt).rejects.toBeInstanceOf(InvalidJobError);
    }
    expect(queue.stats().liveIds).toBe(0);
  });
});

// ── events and stats ───────────────────────────────────────────────────────

describe("events and stats", () => {
  test("transitions are emitted in a deterministic order", async () => {
    const { clock, queue } = withClock(1);
    const events = trace(queue);

    let attempts = 0;
    const flaky = queue.add(
      "flaky",
      () => {
        attempts += 1;
        if (attempts < 2) throw new Error("boom");
        return "ok";
      },
      { retries: 1 },
    );
    await flush();
    clock.advance(25);
    await flaky;

    expect(events).toEqual([
      "queued:flaky",
      "started:flaky",
      "retrying:flaky",
      "started:flaky",
      "fulfilled:flaky",
    ]);

    events.length = 0;
    const cancelled = queue.add("doomed", () => new Promise(() => {}));
    await flush();
    queue.cancel("doomed");
    await expect(cancelled).rejects.toBeInstanceOf(AbortError);

    expect(events).toEqual([
      "queued:doomed",
      "started:doomed",
      "cancelled:doomed",
    ]);
  });

  test("a listener that throws cannot break queue execution", async () => {
    const reported: string[] = [];
    const queue = new JobQueue(2, {
      onListenerError: (error, event) =>
        reported.push(`${event}:${(error as Error).message}`),
    });
    const seen: string[] = [];

    queue.on("started", () => {
      throw new Error("bad listener");
    });
    queue.on("fulfilled", (payload) => seen.push(payload.id));

    const results = await Promise.all([
      queue.add("a", () => 1),
      queue.add("b", () => 2),
    ]);

    expect(results).toEqual([1, 2]);
    expect(seen.sort()).toEqual(["a", "b"]);
    expect(reported).toEqual([
      "started:bad listener",
      "started:bad listener",
    ]);
  });

  test("a reporter that throws is also contained", async () => {
    const queue = new JobQueue(1, {
      onListenerError: () => {
        throw new Error("reporter exploded");
      },
    });
    queue.on("queued", () => {
      throw new Error("listener exploded");
    });

    expect(await queue.add("still-works", () => "value")).toBe("value");
  });

  test("unsubscribe stops delivery and stats snapshots are frozen", async () => {
    const queue = new JobQueue(1);
    const seen: string[] = [];
    const off = queue.on("queued", (payload) => seen.push(payload.id));

    await queue.add("one", () => 1);
    off();
    off(); // idempotent
    await queue.add("two", () => 2);
    expect(seen).toEqual(["one"]);

    const stats = queue.stats();
    expect(Object.isFrozen(stats)).toBe(true);
    expect(stats).toEqual({
      pending: 0,
      running: 0,
      retryWaiting: 0,
      liveIds: 0,
      closed: false,
    });
  });
});

// ── leak checks ────────────────────────────────────────────────────────────

describe("resource hygiene", () => {
  test("a mixed workload leaves no timers, live ids, or unsettled promises", async () => {
    const { clock, queue } = withClock(3);
    const settled: string[] = [];
    let attempts = 0;

    const track = <T>(id: string, promise: Promise<T>) =>
      promise.then(
        () => settled.push(`${id}:ok`),
        () => settled.push(`${id}:err`),
      );

    const work = [
      track("ok", queue.add("ok", async () => "value", { priority: 1 })),
      track(
        "flaky",
        queue.add(
          "flaky",
          () => {
            attempts += 1;
            if (attempts < 3) throw new Error("boom");
            return "late";
          },
          { retries: 3 },
        ),
      ),
      track(
        "doomed",
        queue.add(
          "doomed",
          () => {
            throw new Error("always");
          },
          { retries: 1 },
        ),
      ),
      track("hung", queue.add("hung", (signal) =>
        new Promise((_resolve, reject) => {
          signal.addEventListener("abort", () => reject(new Error("stopped")));
        }),
      )),
    ];

    await flush();
    queue.cancel("hung");

    // Drive every scheduled backoff to completion.
    for (let step = 0; step < 6; step += 1) {
      clock.advance(200);
      await flush();
    }

    await queue.drain();
    await Promise.all(work);

    expect(settled.sort()).toEqual([
      "doomed:err",
      "flaky:ok",
      "hung:err",
      "ok:ok",
    ]);
    expect(clock.pending).toBe(0);
    expect(queue.stats()).toEqual({
      pending: 0,
      running: 0,
      retryWaiting: 0,
      liveIds: 0,
      closed: false,
    });
  });
});
