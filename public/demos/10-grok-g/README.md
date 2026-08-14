# The Haunted Queue

A production-quality TypeScript job queue that preserves the legacy `JobQueue` public surface while correcting the original scheduler's semantic failures.

## Migration notes

`add` **never throws** for invalid additions. Closed-queue, duplicate-id, and option errors **reject the returned promise**. Constructor still throws synchronously if `concurrency` is not an integer in `1..32`.

| Legacy behavior | Replacement |
| --- | --- |
| `add` throws `"closed"` | Rejects with `QueueClosedError` |
| Duplicate ids silently share one map slot | Rejects with `DuplicateJobError` while the id is live |
| `priority \|\| 0` plus unstable equal-key sort | Finite priority; equal priority is FIFO by insertion sequence |
| `retries \|\| 0` with delay `25 * 2 ** attempt` after increment | `retries` extra attempts; delay `25 * 2 ** (retryAttempt - 1)` |
| Cancel pending drops the promise | Pending cancel rejects once with `AbortError` |
| Cancel running aborts but still retries / never rejects | Abort signal, reject `AbortError`, no retry |
| Retry timers are uncancellable | Backoff handles are cancelled with the job |
| `drain` returns if `pending.length === 0` even while running | `drain` waits until pending, running, and retry-waiting are empty |
| Concurrency only checked as `< 1` | Integer `1` through `32` |
| Sync throws follow `Promise.resolve` (this part was already ok) | Same: sync throws match rejected promises |

Existing work and retries continue after `close()`. New `add` calls reject with `QueueClosedError`. After a job fulfills, rejects, or is cancelled, its id may be reused.

Import from `src/job-queue.ts` or `src/index.ts`. Leave `legacy/queue.ts` untouched.

## API

```ts
export type JobFunction<T> = (signal: AbortSignal) => Promise<T> | T;

export interface AddOptions {
  priority?: number; // default 0; higher starts first
  retries?: number;  // extra attempts after the first; default 0
}

class JobQueue {
  constructor(concurrency?: number, hooks?: JobQueueHooks);
  readonly concurrency: number;
  add<T>(id: string, run: JobFunction<T>, options?: AddOptions): Promise<T>;
  cancel(id: string): boolean;
  close(): void;
  drain(): Promise<void>;
  stats(): QueueStats;
  subscribe(listener: JobEventListener): Unsubscribe;
}
```

`JobQueueHooks.retryDelayMs` and `JobQueueHooks.schedule` are test seams. Production callers can omit them.

Typed errors: `QueueClosedError`, `DuplicateJobError`, `InvalidJobError`. Cancellation uses `DOMException` named `AbortError`.

`stats()` returns a frozen snapshot: `pending`, `running`, `retryWaiting`, `live`.

`subscribe` emits `queued`, `started`, `retrying`, `fulfilled`, `rejected`, and `cancelled`. A throwing listener is swallowed and cannot stall the queue.

## Semantics

- At most `concurrency` `run` functions execute at once (including work that was cancelled but has not returned).
- Duplicate ids are rejected while pending, running, or waiting to retry.
- Retry attempt `n` (starting at 1) waits `25 * 2 ** (n - 1)` ms unless a hook overrides delay.
- Cancelling a running job aborts its `AbortSignal` and rejects with `AbortError`; it does not re-enter the retry path.
- `drain` waiters all resolve together. Jobs added while a drain is outstanding are included in that drain.
- No retry timer is left armed after a successful drain.

## Commands

```sh
bun test
bun run demo.ts
```

Open `report.html` directly in a browser (no server required).

## Layout

- `legacy/queue.ts` — frozen original
- `src/errors.ts`, `src/types.ts`, `src/backoff.ts`, `src/job-queue.ts` — replacement
- `src/job-queue.test.ts` — bun:test suite
- `demo.ts` — mixed-priority deterministic run
- `out/demo.txt` — captured demo output
- `report.html` — architecture and behavior report
