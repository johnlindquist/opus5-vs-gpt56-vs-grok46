# The Haunted Queue — Refactor an Async Scheduler

Refactor a deliberately tangled asynchronous job queue into a correct, testable, production-quality TypeScript module. Preserve its public methods while fixing documented semantic failures.

You are working in an empty isolated directory. Build the complete refactor now. Do not merely provide advice.

Use Bun 1.3-compatible TypeScript and only Bun/Node standard APIs. Do not install a package.

## Legacy source

Create `legacy/queue.ts` with exactly this code before refactoring:

```ts
export type JobFunction<T> = (
  signal: AbortSignal,
) => Promise<T> | T;

export interface AddOptions {
  priority?: number;
  retries?: number;
}

type Item<T> = {
  id: string;
  run: JobFunction<T>;
  priority: number;
  retries: number;
  attempt: number;
  resolve: (value: T | PromiseLike<T>) => void;
  reject: (error: unknown) => void;
};

export class JobQueue {
  #pending: Item<any>[] = [];
  #active = new Map<
    string,
    { item: Item<any>; controller: AbortController }
  >();
  #running = 0;
  #closed = false;
  #drainers: Array<() => void> = [];

  constructor(readonly concurrency = 2) {
    if (concurrency < 1) throw new Error("bad concurrency");
  }

  add<T>(
    id: string,
    run: JobFunction<T>,
    options: AddOptions = {},
  ): Promise<T> {
    if (this.#closed) throw new Error("closed");
    return new Promise<T>((resolve, reject) => {
      this.#pending.push({
        id,
        run,
        priority: options.priority || 0,
        retries: options.retries || 0,
        attempt: 0,
        resolve,
        reject,
      });
      this.#pending.sort((a, b) => b.priority - a.priority);
      this.#pump();
    });
  }

  cancel(id: string): boolean {
    const pendingIndex = this.#pending.findIndex(
      (item) => item.id === id,
    );
    if (pendingIndex >= 0) {
      this.#pending.splice(pendingIndex, 1);
      return true;
    }
    const active = this.#active.get(id);
    if (active) {
      active.controller.abort();
      return true;
    }
    return false;
  }

  close(): void {
    this.#closed = true;
  }

  drain(): Promise<void> {
    if (this.#pending.length === 0) {
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      this.#drainers.push(resolve);
    });
  }

  #pump(): void {
    while (
      this.#running < this.concurrency &&
      this.#pending.length > 0
    ) {
      const item = this.#pending.shift()!;
      const controller = new AbortController();
      this.#running += 1;
      this.#active.set(item.id, { item, controller });
      Promise.resolve(item.run(controller.signal))
        .then((value) => {
          item.resolve(value);
        })
        .catch((error) => {
          if (item.attempt < item.retries) {
            item.attempt += 1;
            setTimeout(() => {
              this.#pending.push(item);
              this.#pump();
            }, 25 * 2 ** item.attempt);
          } else {
            item.reject(error);
          }
        })
        .finally(() => {
          this.#running -= 1;
          this.#active.delete(item.id);
          if (this.#pending.length === 0) {
            for (const resolve of this.#drainers.splice(0)) {
              resolve();
            }
          }
          this.#pump();
        });
    }
  }
}
```

Do not edit that legacy file after creating it. Put the replacement under `src/`.

## Required preserved public surface

The replacement must continue to export:

```ts
export type JobFunction<T> = (
  signal: AbortSignal,
) => Promise<T> | T;

export interface AddOptions {
  priority?: number;
  retries?: number;
}

export class JobQueue {
  constructor(concurrency?: number);
  readonly concurrency: number;
  add<T>(
    id: string,
    run: JobFunction<T>,
    options?: AddOptions,
  ): Promise<T>;
  cancel(id: string): boolean;
  close(): void;
  drain(): Promise<void>;
}
```

Additional typed APIs such as `stats()` or event subscription are permitted, but the listed API must remain available.

## Correct semantics

Implement and test all of these:

- Concurrency must be an integer from 1 through 32.
- Higher priority starts first.
- Equal-priority jobs start in FIFO insertion order.
- At most `concurrency` jobs execute at once.
- Duplicate IDs are rejected while an ID is pending, running, or waiting to retry.
- After a job settles permanently, its ID may be used again.
- `retries` means additional attempts after the first attempt.
- Retry delay is `25 * 2 ** (attemptNumber - 1)` milliseconds for retry attempt numbers beginning at one.
- Synchronous task throws are handled exactly like rejected promises.
- Cancelling a pending job removes it and rejects its promise exactly once with an `AbortError`.
- Cancelling a running job aborts its signal and rejects with `AbortError`; it must not retry.
- Cancelling a job waiting in retry backoff cancels the timer and rejects with `AbortError`.
- `cancel` returns false when no live job has that ID.
- `close` prevents future additions but allows existing work and retries to settle.
- A rejected addition after close must use a typed `QueueClosedError`.
- `drain` resolves only when there are no pending, running, or retry-waiting jobs.
- Multiple concurrent `drain` callers all resolve.
- Jobs added before a pending `drain` resolves are included in that drain.
- No promise remains unresolved.
- No retry timer remains after the queue is fully drained.
- There are no unhandled promise rejections during tested operation.
- State transitions are deterministic enough for reproducible tests.

Document whether `add` throws synchronously or returns a rejected promise for invalid additions, then use that choice consistently. Prefer a rejected promise so callers can handle all addition failures uniformly.

## Architecture expectations

Use focused modules, for example:

- `src/job-queue.ts`
- `src/types.ts`
- `src/errors.ts`
- `src/backoff.ts`

Do not create abstraction solely for file count. The state machine and ownership of retry timers must be clear.

Add:

- `stats()` returning immutable counts for pending, running, retry-waiting, and total live IDs.
- A lightweight typed event subscription for queued, started, retrying, fulfilled, rejected, and cancelled transitions.
- No event listener may break queue execution if it throws.

## Tests

Use `bun:test`. Include at least twelve focused tests covering every semantic group above, including:

- Priority and FIFO.
- Concurrency ceiling.
- Duplicate ID lifecycle.
- Synchronous throw.
- Successful retry.
- Retry exhaustion.
- Pending cancellation.
- Running cancellation.
- Backoff cancellation.
- Drain with active jobs.
- Drain with retry waiting.
- Close behavior.
- Reusing an ID after settlement.
- Event ordering.
- No remaining timers or unresolved promises.

Keep test timing bounded. Use injectable backoff or another test seam rather than making the suite sleep for many seconds.

## Demonstration and report

Create:

- `demo.ts`: runs a small mixed-priority queue and prints events.
- `report.html`: direct-open local architecture and behavior report.
- `README.md`: migration notes, API, semantics, and commands.

`report.html` must include:

- A before/after architecture view.
- A state-transition diagram made with local HTML/CSS/SVG.
- A table of legacy failure modes and their fixes.
- Test summary.
- A timeline from a deterministic demonstration run.
- No external assets.
- A useful 1600×900 opening view.

Run:

```sh
bun test
bun run demo.ts
```

Capture deterministic demo output into `out/demo.txt` for the report.

## Non-negotiable delivery contract

Work only inside the current directory. Do not inspect, read, or write parent or sibling directories. Do not use the network except for the model session already in progress. Do not install packages. Do not create a deployment, publish anything, push anything, initialize Git, or leave a server or background process running. Do not create symlinks. Use only local files and built-in browser, Bun, or Node APIs.

Before finishing, create `battle-result.json` with exactly this shape:

```json
{
  "schema_version": 1,
  "status": "complete",
  "title": "The Haunted Queue — Refactor an Async Scheduler",
  "kind": "dev",
  "entrypoint": "report.html",
  "artifacts": [
    "report.html",
    "README.md",
    "legacy/queue.ts",
    "src/job-queue.ts",
    "demo.ts",
    "out/demo.txt"
  ],
  "checks": [
    {
      "name": "test suite",
      "command": "bun test",
      "status": "passed",
      "details": "All queue semantics tests passed."
    },
    {
      "name": "deterministic demonstration",
      "command": "bun run demo.ts",
      "status": "passed",
      "details": "The mixed-priority demonstration completed without unresolved jobs."
    }
  ],
  "summary": "A concise description of the refactored queue and corrected semantics.",
  "known_issues": []
}
```

List every important local file in artifacts. Every recorded check must be one you actually ran. If any required acceptance item remains unmet, set status to incomplete, mark the relevant check failed or not_run, and describe the issue honestly.
