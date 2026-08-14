import { describe, expect, test } from "bun:test";
import { retryDelayMs } from "../src/backoff.ts";
import {
  abortError,
  DuplicateJobError,
  InvalidJobError,
  JobQueue,
  QueueClosedError,
} from "../src/job-queue.ts";
import type { JobEvent, JobEventType, Scheduler } from "../src/types.ts";

class ManualScheduler {
  #next = 1;
  readonly timers = new Map<number, { callback: () => void; delayMs: number }>();

  schedule: Scheduler = (callback, delayMs) => {
    const id = this.#next++;
    this.timers.set(id, { callback, delayMs });
    return () => {
      this.timers.delete(id);
    };
  };

  get size(): number {
    return this.timers.size;
  }

  flush(): void {
    const pending = [...this.timers.values()];
    this.timers.clear();
    for (const timer of pending) timer.callback();
  }
}

async function waitFor(
  predicate: () => boolean,
  label = "condition",
): Promise<void> {
  for (let i = 0; i < 100; i += 1) {
    if (predicate()) return;
    await Promise.resolve();
  }
  throw new Error(`timed out waiting for ${label}`);
}

function instantQueue(concurrency = 2): JobQueue {
  return new JobQueue(concurrency, { retryDelayMs: () => 0 });
}

describe("concurrency bounds", () => {
  test("rejects non-integers and values outside 1..32", () => {
    expect(() => new JobQueue(0)).toThrow(RangeError);
    expect(() => new JobQueue(33)).toThrow(RangeError);
    expect(() => new JobQueue(1.5)).toThrow(RangeError);
    expect(new JobQueue(1).concurrency).toBe(1);
    expect(new JobQueue(32).concurrency).toBe(32);
    expect(new JobQueue().concurrency).toBe(2);
  });
});

describe("priority and FIFO", () => {
  test("higher priority starts first; equal priority stays insertion order", async () => {
    const order: string[] = [];
    const queue = new JobQueue(1);
    let release!: () => void;
    const blocker = new Promise<void>((resolve) => {
      release = resolve;
    });

    const blocked = queue.add("block", () => blocker);
    const jobs = [
      queue.add("a", async () => {
        order.push("a");
      }, { priority: 1 }),
      queue.add("b", async () => {
        order.push("b");
      }, { priority: 1 }),
      queue.add("c", async () => {
        order.push("c");
      }, { priority: 5 }),
      queue.add("d", async () => {
        order.push("d");
      }, { priority: 0 }),
    ];

    expect(queue.stats().pending).toBe(4);
    release();
    await blocked;
    await Promise.all(jobs);
    await queue.drain();
    expect(order).toEqual(["c", "a", "b", "d"]);
  });
});

describe("concurrency ceiling", () => {
  test("runs at most concurrency jobs at once", async () => {
    const queue = new JobQueue(2);
    let current = 0;
    let peak = 0;
    const releases: Array<() => void> = [];

    const jobs = Array.from({ length: 5 }, (_, index) =>
      queue.add(`j${index}`, () => {
        current += 1;
        peak = Math.max(peak, current);
        return new Promise<number>((resolve) => {
          releases.push(() => {
            current -= 1;
            resolve(index);
          });
        });
      }),
    );

    await waitFor(() => queue.stats().running === 2, "two running");
    expect(queue.stats().pending).toBe(3);
    expect(peak).toBe(2);

    while (releases.length > 0) {
      releases.shift()!();
      await Promise.resolve();
    }
    await Promise.all(jobs);
    await queue.drain();
    expect(peak).toBe(2);
  });
});

describe("duplicate id lifecycle", () => {
  test("rejects duplicate ids while pending, running, or retrying", async () => {
    const scheduler = new ManualScheduler();
    const queue = new JobQueue(1, {
      schedule: scheduler.schedule,
      retryDelayMs: () => 10,
    });

    let release!: (value: string) => void;
    const running = queue.add(
      "dup",
      () =>
        new Promise<string>((resolve) => {
          release = resolve;
        }),
    );

    await waitFor(() => queue.stats().running === 1, "running");
    await expect(
      queue.add("dup", () => "nope"),
    ).rejects.toBeInstanceOf(DuplicateJobError);

    const pending = queue.add("other", () => "other");
    await expect(
      queue.add("other", () => "nope"),
    ).rejects.toBeInstanceOf(DuplicateJobError);

    release("done");
    await expect(running).resolves.toBe("done");
    await pending;

    const retrying = queue.add(
      "retry-id",
      () => {
        throw new Error("boom");
      },
      { retries: 2 },
    );
    await waitFor(() => queue.stats().retryWaiting === 1, "retry wait");
    await expect(
      queue.add("retry-id", () => "nope"),
    ).rejects.toBeInstanceOf(DuplicateJobError);
    queue.cancel("retry-id");
    await expect(retrying).rejects.toMatchObject({ name: "AbortError" });
    await queue.drain();
  });

  test("reuses an id after permanent settlement", async () => {
    const queue = instantQueue(1);
    await expect(queue.add("slot", () => 1)).resolves.toBe(1);
    await expect(queue.add("slot", () => 2)).resolves.toBe(2);
    await expect(
      queue.add("slot", () => {
        throw new Error("fail");
      }),
    ).rejects.toThrow("fail");
    await expect(queue.add("slot", () => 3)).resolves.toBe(3);
    await queue.drain();
  });
});

describe("synchronous throw", () => {
  test("treats sync throws like rejected promises", async () => {
    const queue = instantQueue(1);
    await expect(
      queue.add("sync", () => {
        throw new Error("sync-fail");
      }),
    ).rejects.toThrow("sync-fail");
    await queue.drain();
    expect(queue.stats().live).toBe(0);
  });
});

describe("retries", () => {
  test("retries additional attempts after the first and then succeeds", async () => {
    const scheduler = new ManualScheduler();
    const queue = new JobQueue(1, {
      schedule: scheduler.schedule,
      retryDelayMs: (n) => 25 * 2 ** (n - 1),
    });
    let attempts = 0;
    const job = queue.add(
      "ok-retry",
      () => {
        attempts += 1;
        if (attempts < 3) throw new Error(`fail-${attempts}`);
        return "recovered";
      },
      { retries: 2 },
    );

    await waitFor(() => scheduler.size === 1, "first backoff");
    expect(queue.stats().retryWaiting).toBe(1);
    expect([...scheduler.timers.values()][0]?.delayMs).toBe(25);
    scheduler.flush();
    await waitFor(() => scheduler.size === 1, "second backoff");
    expect([...scheduler.timers.values()][0]?.delayMs).toBe(50);
    scheduler.flush();
    await expect(job).resolves.toBe("recovered");
    expect(attempts).toBe(3);
    await queue.drain();
    expect(scheduler.size).toBe(0);
  });

  test("rejects after retry exhaustion without leaving live work", async () => {
    const queue = instantQueue(1);
    let attempts = 0;
    await expect(
      queue.add(
        "exhausted",
        () => {
          attempts += 1;
          throw new Error("still-bad");
        },
        { retries: 2 },
      ),
    ).rejects.toThrow("still-bad");
    expect(attempts).toBe(3);
    await queue.drain();
    expect(queue.stats()).toEqual({
      pending: 0,
      running: 0,
      retryWaiting: 0,
      live: 0,
    });
  });
});

describe("cancellation", () => {
  test("cancels a pending job and rejects once with AbortError", async () => {
    const queue = new JobQueue(1);
    let release!: () => void;
    const blocker = queue.add(
      "hold",
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    );
    let rejects = 0;
    const pending = queue.add("wait", () => "never");
    pending.catch(() => {
      rejects += 1;
    });

    expect(queue.cancel("wait")).toBe(true);
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    expect(rejects).toBe(1);
    expect(queue.cancel("wait")).toBe(false);
    release();
    await blocker;
    await queue.drain();
  });

  test("cancels a running job, aborts its signal, and does not retry", async () => {
    const queue = new JobQueue(1, { retryDelayMs: () => 0 });
    let observed: AbortSignal | undefined;
    let attempts = 0;
    const job = queue.add(
      "run",
      (signal) => {
        attempts += 1;
        observed = signal;
        return new Promise<string>((_resolve, reject) => {
          signal.addEventListener("abort", () => {
            reject(abortError());
          });
        });
      },
      { retries: 5 },
    );

    await waitFor(() => queue.stats().running === 1, "running job");
    expect(queue.cancel("run")).toBe(true);
    expect(observed?.aborted).toBe(true);
    await expect(job).rejects.toMatchObject({ name: "AbortError" });
    expect(attempts).toBe(1);
    await queue.drain();
    expect(queue.stats().live).toBe(0);
  });

  test("cancels a retry backoff timer and rejects with AbortError", async () => {
    const scheduler = new ManualScheduler();
    const queue = new JobQueue(1, {
      schedule: scheduler.schedule,
      retryDelayMs: () => 1000,
    });
    const job = queue.add(
      "backed-off",
      () => {
        throw new Error("not-yet");
      },
      { retries: 4 },
    );

    await waitFor(() => scheduler.size === 1, "backoff timer");
    expect(queue.stats().retryWaiting).toBe(1);
    expect(queue.cancel("backed-off")).toBe(true);
    expect(scheduler.size).toBe(0);
    await expect(job).rejects.toMatchObject({ name: "AbortError" });
    expect(queue.cancel("missing")).toBe(false);
    await queue.drain();
  });
});

describe("drain", () => {
  test("waits for active jobs and resolves every concurrent waiter", async () => {
    const queue = new JobQueue(2);
    let release!: () => void;
    const body = new Promise<void>((resolve) => {
      release = resolve;
    });
    const job = queue.add("active", () => body);

    const drains = [queue.drain(), queue.drain(), queue.drain()];
    let resolved = 0;
    for (const drain of drains) {
      void drain.then(() => {
        resolved += 1;
      });
    }
    await Promise.resolve();
    expect(resolved).toBe(0);

    release();
    await job;
    await Promise.all(drains);
    expect(resolved).toBe(3);
  });

  test("waits through retry backoff and includes jobs added before it resolves", async () => {
    const scheduler = new ManualScheduler();
    const queue = new JobQueue(1, {
      schedule: scheduler.schedule,
      retryDelayMs: () => 5,
    });
    let attempts = 0;
    const first = queue.add(
      "needs-retry",
      () => {
        attempts += 1;
        if (attempts === 1) throw new Error("again");
        return "ok";
      },
      { retries: 1 },
    );

    const drain = queue.drain();
    let drained = false;
    void drain.then(() => {
      drained = true;
    });

    await waitFor(() => queue.stats().retryWaiting === 1, "retry waiting");
    expect(drained).toBe(false);

    const extra = queue.add("late", () => "late");
    expect(drained).toBe(false);

    scheduler.flush();
    await first;
    await extra;
    await drain;
    expect(drained).toBe(true);
    expect(queue.stats().live).toBe(0);
    expect(scheduler.size).toBe(0);
  });
});

describe("close", () => {
  test("rejects later additions with QueueClosedError and lets existing work finish", async () => {
    const queue = instantQueue(1);
    let release!: (value: string) => void;
    const existing = queue.add(
      "keep",
      () =>
        new Promise<string>((resolve) => {
          release = resolve;
        }),
    );
    queue.close();
    await expect(queue.add("nope", () => 1)).rejects.toBeInstanceOf(
      QueueClosedError,
    );
    release("kept");
    await expect(existing).resolves.toBe("kept");
    await queue.drain();
  });

  test("add failures are rejected promises, not synchronous throws", async () => {
    const queue = instantQueue(1);
    queue.close();
    let threw = false;
    let rejected: unknown;
    try {
      const result = queue.add("x", () => 1);
      rejected = await result.catch((error: unknown) => error);
    } catch (error) {
      threw = true;
      rejected = error;
    }
    expect(threw).toBe(false);
    expect(rejected).toBeInstanceOf(QueueClosedError);
    const open = instantQueue(1);
    await expect(open.add("", () => 1)).rejects.toBeInstanceOf(
      InvalidJobError,
    );
  });
});

describe("events and isolation", () => {
  test("emits queued, started, retrying, fulfilled in order", async () => {
    const scheduler = new ManualScheduler();
    const queue = new JobQueue(1, {
      schedule: scheduler.schedule,
      retryDelayMs: () => 1,
    });
    const types: JobEventType[] = [];
    queue.subscribe((event: JobEvent) => {
      types.push(event.type);
    });
    let attempts = 0;
    const job = queue.add(
      "trace",
      () => {
        attempts += 1;
        if (attempts === 1) throw new Error("once");
        return 7;
      },
      { retries: 1 },
    );
    await waitFor(() => types.includes("retrying"), "retry event");
    scheduler.flush();
    await job;
    expect(types).toEqual([
      "queued",
      "started",
      "retrying",
      "started",
      "fulfilled",
    ]);
  });

  test("a throwing listener does not break execution or settlement", async () => {
    const queue = instantQueue(1);
    queue.subscribe(() => {
      throw new Error("listener exploded");
    });
    await expect(queue.add("safe", () => "ok")).resolves.toBe("ok");
    await queue.drain();
  });
});

describe("cleanup", () => {
  test("leaves no retry timers or live jobs after drain", async () => {
    const scheduler = new ManualScheduler();
    const queue = new JobQueue(2, {
      schedule: scheduler.schedule,
      retryDelayMs: () => 3,
    });
    const resultsPromise = Promise.allSettled([
      queue.add("a", () => "A", { priority: 2 }),
      queue.add(
        "b",
        () => {
          throw new Error("b");
        },
        { retries: 1 },
      ),
      queue.add("c", () => "C"),
    ]);
    await waitFor(() => scheduler.size === 1, "retry timer");
    scheduler.flush();
    const results = await resultsPromise;
    await queue.drain();
    expect(results[0]).toEqual({ status: "fulfilled", value: "A" });
    expect(results[2]).toEqual({ status: "fulfilled", value: "C" });
    expect(queue.stats()).toEqual({
      pending: 0,
      running: 0,
      retryWaiting: 0,
      live: 0,
    });
    expect(scheduler.size).toBe(0);
  });
});

describe("backoff formula", () => {
  test("uses 25 * 2 ** (attemptNumber - 1)", () => {
    expect(retryDelayMs(1)).toBe(25);
    expect(retryDelayMs(2)).toBe(50);
    expect(retryDelayMs(3)).toBe(100);
    expect(retryDelayMs(4)).toBe(200);
  });
});
