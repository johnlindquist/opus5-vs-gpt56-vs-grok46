import { describe, expect, test } from "bun:test";
import {
  AbortError,
  DuplicateJobIdError,
  JobQueue,
  QueueClosedError,
  type QueueEvent,
} from "../src/job-queue";
import { exponentialBackoff } from "../src/backoff";

function deferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const turn = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

describe("construction and addition validation", () => {
  test("concurrency must be an integer from 1 through 32", () => {
    for (const value of [0, -1, 1.5, 33, Number.NaN]) {
      expect(() => new JobQueue(value)).toThrow(RangeError);
    }
    expect(new JobQueue(1).concurrency).toBe(1);
    expect(new JobQueue(32).concurrency).toBe(32);
  });

  test("invalid additions return rejected promises", async () => {
    const queue = new JobQueue();
    await expect(queue.add("", () => 1)).rejects.toHaveProperty("name", "InvalidJobError");
    await expect(queue.add("bad-retries", () => 1, { retries: -1 })).rejects.toHaveProperty(
      "name",
      "InvalidJobError",
    );
    expect(queue.stats().live).toBe(0);
  });

  test("default backoff uses one-based retry numbers", () => {
    expect([1, 2, 3, 4].map(exponentialBackoff)).toEqual([25, 50, 100, 200]);
  });
});

describe("ordering and capacity", () => {
  test("higher priority starts first and equal priority is FIFO", async () => {
    const queue = new JobQueue(1);
    const gate = deferred();
    const order: string[] = [];
    const blocker = queue.add("blocker", () => gate.promise);
    const low = queue.add("low", () => order.push("low"), { priority: 1 });
    const highA = queue.add("high-a", () => order.push("high-a"), { priority: 5 });
    const highB = queue.add("high-b", () => order.push("high-b"), { priority: 5 });

    gate.resolve();
    await Promise.all([blocker, low, highA, highB]);
    expect(order).toEqual(["high-a", "high-b", "low"]);
  });

  test("never exceeds the concurrency ceiling", async () => {
    const queue = new JobQueue(3);
    const gates = Array.from({ length: 8 }, () => deferred());
    let active = 0;
    let maximum = 0;
    const jobs = gates.map((gate, index) =>
      queue.add(`job-${index}`, async () => {
        active += 1;
        maximum = Math.max(maximum, active);
        await gate.promise;
        active -= 1;
      }),
    );
    await turn();
    expect(queue.stats()).toEqual({ pending: 5, running: 3, retryWaiting: 0, live: 8 });
    for (const gate of gates) {
      gate.resolve();
      await turn();
    }
    await Promise.all(jobs);
    expect(maximum).toBe(3);
  });
});

describe("attempts and IDs", () => {
  test("duplicate IDs are rejected in pending, running, and retry backoff", async () => {
    const queue = new JobQueue(1, { backoffDelay: () => 20 });
    const gate = deferred();
    const running = queue.add("running", () => gate.promise);
    const pending = queue.add("pending", () => 1);
    await expect(queue.add("running", () => 2)).rejects.toBeInstanceOf(DuplicateJobIdError);
    await expect(queue.add("pending", () => 2)).rejects.toBeInstanceOf(DuplicateJobIdError);

    const retrying = queue.add("retrying", () => Promise.reject(new Error("once")), { retries: 1 });
    gate.resolve();
    await turn();
    await turn();
    expect(queue.stats().retryWaiting).toBe(1);
    await expect(queue.add("retrying", () => 2)).rejects.toBeInstanceOf(DuplicateJobIdError);
    queue.cancel("retrying");
    await expect(retrying).rejects.toBeInstanceOf(AbortError);
    await Promise.all([running, pending]);
  });

  test("synchronous throws reject like promise failures", async () => {
    const queue = new JobQueue();
    await expect(
      queue.add("sync", () => {
        throw new Error("synchronous");
      }),
    ).rejects.toThrow("synchronous");
    await queue.drain();
  });

  test("retries successfully with the specified one-based delays", async () => {
    const delays: number[] = [];
    const queue = new JobQueue(1, {
      backoffDelay: (retryNumber) => {
        delays.push(retryNumber);
        return 0;
      },
    });
    let attempts = 0;
    const value = await queue.add(
      "eventual",
      () => {
        attempts += 1;
        if (attempts < 3) throw new Error("try again");
        return "ok";
      },
      { retries: 2 },
    );
    expect(value).toBe("ok");
    expect(attempts).toBe(3);
    expect(delays).toEqual([1, 2]);
  });

  test("retry exhaustion rejects after first attempt plus additional retries", async () => {
    const queue = new JobQueue(1, { backoffDelay: () => 0 });
    let attempts = 0;
    await expect(
      queue.add(
        "exhausted",
        () => {
          attempts += 1;
          throw new Error(`failure-${attempts}`);
        },
        { retries: 2 },
      ),
    ).rejects.toThrow("failure-3");
    expect(attempts).toBe(3);
    expect(queue.stats().live).toBe(0);
  });

  test("an ID can be reused after permanent settlement", async () => {
    const queue = new JobQueue();
    expect(await queue.add("reusable", () => 1)).toBe(1);
    expect(await queue.add("reusable", () => 2)).toBe(2);
    await expect(queue.add("reusable", () => Promise.reject(new Error("done")))).rejects.toThrow("done");
    expect(await queue.add("reusable", () => 3)).toBe(3);
  });
});

describe("cancellation", () => {
  test("pending cancellation removes the job and rejects exactly once", async () => {
    const queue = new JobQueue(1);
    const gate = deferred();
    let calls = 0;
    const blocker = queue.add("blocker", () => gate.promise);
    const pending = queue.add("pending", () => {
      calls += 1;
    });
    expect(queue.cancel("pending")).toBe(true);
    expect(queue.cancel("pending")).toBe(false);
    await expect(pending).rejects.toBeInstanceOf(AbortError);
    expect(calls).toBe(0);
    gate.resolve();
    await blocker;
  });

  test("running cancellation aborts, rejects, never retries, and retains its slot until exit", async () => {
    const queue = new JobQueue(1, { backoffDelay: () => 0 });
    const exit = deferred();
    let attempts = 0;
    let observedSignal: AbortSignal | undefined;
    const running = queue.add(
      "running",
      async (signal) => {
        attempts += 1;
        observedSignal = signal;
        await exit.promise;
        throw new Error("late failure");
      },
      { retries: 3 },
    );
    await turn();
    expect(queue.cancel("running")).toBe(true);
    await expect(running).rejects.toBeInstanceOf(AbortError);
    expect(observedSignal?.aborted).toBe(true);
    expect(queue.stats()).toEqual({ pending: 0, running: 1, retryWaiting: 0, live: 1 });
    expect(queue.cancel("running")).toBe(true);
    exit.resolve();
    await queue.drain();
    expect(attempts).toBe(1);
    expect(queue.cancel("running")).toBe(false);
  });

  test("backoff cancellation clears the owned timer and prevents another attempt", async () => {
    const queue = new JobQueue(1, { backoffDelay: () => 10 });
    let attempts = 0;
    const retrying = queue.add(
      "backoff",
      () => {
        attempts += 1;
        throw new Error("retry");
      },
      { retries: 4 },
    );
    await turn();
    expect(queue.stats().retryWaiting).toBe(1);
    expect(queue.cancel("backoff")).toBe(true);
    await expect(retrying).rejects.toBeInstanceOf(AbortError);
    await queue.drain();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(attempts).toBe(1);
    expect(queue.stats()).toEqual({ pending: 0, running: 0, retryWaiting: 0, live: 0 });
  });
});

describe("drain, close, and observation", () => {
  test("drain waits for active and subsequently queued work; all callers resolve", async () => {
    const queue = new JobQueue(1);
    const firstGate = deferred();
    const secondGate = deferred();
    const first = queue.add("first", () => firstGate.promise);
    const drainA = queue.drain();
    const drainB = queue.drain();
    const second = queue.add("second", () => secondGate.promise);
    let drained = false;
    void drainA.then(() => {
      drained = true;
    });
    firstGate.resolve();
    await first;
    await turn();
    expect(drained).toBe(false);
    secondGate.resolve();
    await Promise.all([second, drainA, drainB]);
    expect(drained).toBe(true);
  });

  test("drain includes retry-waiting jobs", async () => {
    const queue = new JobQueue(1, { backoffDelay: () => 5 });
    let attempt = 0;
    const job = queue.add(
      "retry",
      () => {
        attempt += 1;
        if (attempt === 1) throw new Error("first");
        return "settled";
      },
      { retries: 1 },
    );
    const draining = queue.drain();
    let drained = false;
    void draining.then(() => {
      drained = true;
    });
    await turn();
    expect(queue.stats().retryWaiting).toBe(1);
    expect(drained).toBe(false);
    await expect(job).resolves.toBe("settled");
    await draining;
    expect(queue.stats().live).toBe(0);
  });

  test("close rejects future additions with QueueClosedError while existing retries finish", async () => {
    const queue = new JobQueue(1, { backoffDelay: () => 0 });
    let attempt = 0;
    const existing = queue.add(
      "existing",
      () => {
        attempt += 1;
        if (attempt === 1) throw new Error("retry");
        return "done";
      },
      { retries: 1 },
    );
    queue.close();
    await expect(queue.add("late", () => 1)).rejects.toBeInstanceOf(QueueClosedError);
    await expect(existing).resolves.toBe("done");
    await queue.drain();
  });

  test("events have deterministic transition order and throwing listeners are isolated", async () => {
    const queue = new JobQueue(1, { backoffDelay: () => 0 });
    const events: string[] = [];
    let attempt = 0;
    queue.subscribe(() => {
      throw new Error("observer failure");
    });
    const unsubscribe = queue.subscribe((event: QueueEvent) => {
      events.push(`${event.type}:${"attempt" in event ? event.attempt : "-"}`);
    });
    await queue.add(
      "events",
      () => {
        attempt += 1;
        if (attempt === 1) throw new Error("again");
        return "ok";
      },
      { retries: 1 },
    );
    unsubscribe();
    expect(events).toEqual([
      "queued:1",
      "started:1",
      "retrying:2",
      "queued:2",
      "started:2",
      "fulfilled:2",
    ]);
  });

  test("all promises settle and a fully drained queue owns no retry work", async () => {
    const queue = new JobQueue(2, { backoffDelay: () => 0 });
    const outcomes = await Promise.allSettled([
      queue.add("ok", () => "ok"),
      queue.add("bad", () => Promise.reject(new Error("bad")), { retries: 1 }),
      queue.add("sync-bad", () => {
        throw new Error("sync");
      }),
    ]);
    await queue.drain();
    expect(outcomes.map((outcome) => outcome.status)).toEqual(["fulfilled", "rejected", "rejected"]);
    const stats = queue.stats();
    expect(stats).toEqual({ pending: 0, running: 0, retryWaiting: 0, live: 0 });
    expect(Object.isFrozen(stats)).toBe(true);
  });
});
