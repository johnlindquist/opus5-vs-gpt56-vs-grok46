/**
 * Characterization tests for `legacy/queue.ts`.
 *
 * These assert the *broken* behaviour on purpose. They exist so the failure
 * table in `report.html` and `README.md` is evidence rather than assertion, and
 * so the corresponding fixes in `src/` can be pointed at a reproduction.
 *
 * The legacy queue uses real timers, so these use small real delays.
 */

import { describe, expect, test } from "bun:test";
import { JobQueue as LegacyQueue } from "../legacy/queue.ts";

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/** Resolves to `"timeout"` if `promise` has not settled within `ms`. */
function within<T>(promise: Promise<T>, ms: number): Promise<T | "timeout"> {
  return Promise.race([
    promise,
    sleep(ms).then(() => "timeout" as const),
  ]);
}

describe("legacy failure modes", () => {
  test("#0 a synchronous throw escapes #pump, skipping retries and leaking the slot", async () => {
    const queue = new LegacyQueue(1);
    let attempts = 0;

    // `#pump` calls `item.run` from inside the `new Promise` executor, so a
    // synchronous throw unwinds the executor instead of reaching `.catch`.
    // The executor rejects the promise, which hides the damage from the caller.
    const job = queue.add(
      "sync",
      () => {
        attempts += 1;
        throw new Error("sync boom");
      },
      { retries: 3 },
    );

    await expect(job).rejects.toThrow("sync boom");
    expect(attempts).toBe(1); // three retries were configured and none happened

    // `#running` was incremented and never decremented: the queue is wedged.
    const next = queue.add("afterwards", () => "value");
    expect(await within(next, 40)).toBe("timeout");
    next.catch(() => {});
  });

  test("#1/#2 drain resolves while a retry is still armed", async () => {
    const queue = new LegacyQueue(1);
    let attempts = 0;
    const job = queue.add(
      "flaky",
      async () => {
        attempts += 1;
        if (attempts < 2) throw new Error("boom");
        return "ok";
      },
      { retries: 1 },
    );
    const blocker = queue.add("blocker", () => "done");

    await queue.drain();
    // Drain has resolved, yet the retry has not even started.
    expect(attempts).toBe(1);

    await job;
    await blocker;
    expect(attempts).toBe(2);
  });

  test("#3 a retried job is re-queued without re-sorting, losing its priority", async () => {
    const queue = new LegacyQueue(1);
    const order: string[] = [];
    let attempts = 0;

    const urgent = queue.add(
      "urgent",
      async () => {
        attempts += 1;
        if (attempts === 1) throw new Error("boom");
        order.push("urgent");
      },
      { priority: 100, retries: 1 },
    );

    // Occupy the worker so the retry lands behind this low-priority job.
    const filler = queue.add(
      "filler",
      async () => {
        await sleep(80);
        order.push("filler");
      },
      { priority: -100 },
    );

    await Promise.all([urgent, filler]);
    // Priority 100 ran after priority -100 purely because the retry was pushed.
    expect(order).toEqual(["filler", "urgent"]);
  });

  test("#4 the first retry waits 50ms instead of 25ms", async () => {
    const queue = new LegacyQueue(1);
    const stamps: number[] = [];
    let attempts = 0;

    await queue.add(
      "flaky",
      async () => {
        attempts += 1;
        stamps.push(performance.now());
        if (attempts < 2) throw new Error("boom");
        return "ok";
      },
      { retries: 1 },
    );

    const gap = stamps[1]! - stamps[0]!;
    expect(gap).toBeGreaterThanOrEqual(45); // documented curve says 25ms
  });

  test("#5 cancelling a running job retries it instead of ending it", async () => {
    const queue = new LegacyQueue(1);
    let attempts = 0;

    const job = queue.add(
      "long",
      (signal) => {
        attempts += 1;
        return new Promise((_resolve, reject) => {
          signal.addEventListener("abort", () => reject(new Error("aborted")));
        });
      },
      { retries: 1 },
    );

    await sleep(5);
    expect(queue.cancel("long")).toBe(true);
    await sleep(5);

    // The caller is still waiting, and the job is queued to run again.
    expect(await within(job, 40)).toBe("timeout");
    await sleep(80);
    expect(attempts).toBe(2); // ran a second time after being cancelled

    queue.cancel("long");
    job.catch(() => {}); // never settles; keep the runner quiet
  });

  test("#6 cancelling during retry backoff returns false and the job resurrects", async () => {
    const queue = new LegacyQueue(1);
    let attempts = 0;

    const job = queue.add(
      "flaky",
      async () => {
        attempts += 1;
        if (attempts < 2) throw new Error("boom");
        return "resurrected";
      },
      { retries: 1 },
    );

    await sleep(5); // now sleeping in backoff
    expect(queue.cancel("flaky")).toBe(false); // invisible to cancel

    expect(await job).toBe("resurrected"); // ran anyway
    expect(attempts).toBe(2);
  });

  test("#7 duplicate ids evict each other, making the first uncancellable", async () => {
    const queue = new LegacyQueue(2);
    const started: string[] = [];

    const first = queue.add("same", (signal) => {
      started.push("first");
      return new Promise<string>((resolve) => {
        signal.addEventListener("abort", () => resolve("first aborted"));
      });
    });
    const second = queue.add("same", (signal) => {
      started.push("second");
      return new Promise<string>((resolve) => {
        signal.addEventListener("abort", () => resolve("second aborted"));
      });
    });

    await sleep(5);
    expect(started).toEqual(["first", "second"]); // both ran under one id

    queue.cancel("same"); // only reaches the second registration
    expect(await within(second, 30)).toBe("second aborted");
    expect(await within(first, 30)).toBe("timeout"); // first is unreachable

    queue.cancel("same");
    first.catch(() => {});
  });

  test("#8 add throws synchronously after close, with an untyped Error", () => {
    const queue = new LegacyQueue(1);
    queue.close();
    let thrown: unknown;
    try {
      queue.add("late", () => 1);
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(Error);
    expect((thrown as Error).message).toBe("closed");
    expect((thrown as Error).constructor).toBe(Error); // nothing to discriminate on
  });

  test("#9 a NaN concurrency is accepted and deadlocks the queue", async () => {
    const queue = new LegacyQueue(Number.NaN); // NaN < 1 is false, so no throw
    expect(queue.concurrency).toBeNaN();

    let ran = false;
    const job = queue.add("never", () => {
      ran = true;
      return "value";
    });

    expect(await within(job, 40)).toBe("timeout");
    expect(ran).toBe(false);
    job.catch(() => {});
  });

  test("#9b a fractional concurrency is accepted", () => {
    expect(new LegacyQueue(1.5).concurrency).toBe(1.5);
    expect(new LegacyQueue(1e9).concurrency).toBe(1e9);
  });
});
