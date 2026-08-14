# The Haunted Queue

A concurrency-limited, priority-ordered, retrying job queue for Bun 1.3 / TypeScript.
This is a behaviour-preserving-where-correct, behaviour-fixing-where-broken replacement
for `legacy/queue.ts`.

No dependencies. Bun and Node built-ins only.

```sh
bun test              # 34 tests: 24 for the replacement, 10 pinning the legacy bugs
bun run demo.ts       # deterministic transcript, also written to out/demo.txt
bun run build-report.ts   # regenerates report.html from out/
open report.html
```

`tsconfig.json` is set to `strict` with `noUncheckedIndexedAccess`. Everything under
`src/` typechecks clean; `demo.ts`, `build-report.ts`, and the tests report
`Cannot find name 'Bun'` / `Cannot find module 'bun:test'` under a bare `tsc`, because
those ambient types ship in `@types/bun` and this project installs nothing.

---

## Layout

| Path | Role |
| --- | --- |
| `legacy/queue.ts` | The original, kept verbatim for comparison. Not imported by anything. |
| `src/job-queue.ts` | The queue: state machine, scheduling, retry-timer ownership. Re-exports the public surface. |
| `src/types.ts` | Public types: `JobFunction`, `AddOptions`, `QueueStats`, `QueueEvents`, seams. |
| `src/errors.ts` | Typed error hierarchy rooted at `QueueError`. |
| `src/backoff.ts` | The delay curve, the host timer wrapper, and `ManualScheduler` for tests. |
| `src/events.ts` | A ~60-line typed emitter with contained listener failures. |
| `test/job-queue.test.ts` | The suite for the replacement. |
| `test/legacy-failures.test.ts` | Characterization tests that reproduce each legacy bug. |
| `demo.ts` | Deterministic mixed-priority demonstration. |
| `out/demo.txt` | Captured transcript of the demonstration. |
| `out/test.txt`, `out/test-results.xml` | Captured `bun test` output, human and JUnit. |
| `build-report.ts` | Regenerates `report.html` from the two `out/` artifacts, so the report cannot drift from what actually ran. |
| `report.html` | Architecture and behaviour report. Open it directly; no server, no external assets. |

---

## Migration

The public surface is unchanged, so the import path is the only required edit:

```diff
-import { JobQueue } from "./legacy/queue.ts";
+import { JobQueue } from "./src/job-queue.ts";
```

Four behavioural changes can be observed by existing callers. All of them are fixes,
but they are the places worth grepping for:

1. **`add` no longer throws synchronously after `close`.** It returns a rejected
   promise carrying `QueueClosedError`. A `try { queue.add(...) } catch` around a
   post-close addition will no longer fire — use `.catch` or `await`.
2. **Duplicate ids are refused.** The legacy queue silently ran two jobs under one
   id and let the second overwrite the first in its active map. Adding an id that is
   already pending, running, or retry-waiting now rejects with `DuplicateJobIdError`.
3. **Cancellation always rejects the caller's promise.** In the legacy queue,
   cancelling a running job aborted the signal but left the promise to whatever the
   task did next — often retrying, often hanging. Now it rejects once with
   `AbortError` and the job will not retry.
4. **`drain()` waits for running and retry-waiting work,** not just for the pending
   array to empty. Existing `await queue.drain()` calls will resolve strictly later
   than they used to, which is the point.

`priority` and `retries` keep their meaning and their defaults, and job functions
still receive an `AbortSignal`.

---

## API

```ts
new JobQueue(concurrency?: number, options?: JobQueueOptions)
```

`concurrency` defaults to `2` and must be an **integer from 1 through 32**; anything
else throws `InvalidConcurrencyError`. `options` is optional and exists mainly as a
test seam:

```ts
interface JobQueueOptions {
  backoff?: (retry: number) => number;               // default: 25 * 2 ** (retry - 1)
  scheduler?: Scheduler;                             // default: host setTimeout/clearTimeout
  onListenerError?: (error: unknown, event: QueueEventName) => void; // default: console.error
}
```

| Member | Behaviour |
| --- | --- |
| `readonly concurrency: number` | The validated ceiling. |
| `add<T>(id, run, options?): Promise<T>` | Queues `run`. Resolves with its value, or rejects with the task's error, `AbortError`, `QueueClosedError`, `DuplicateJobIdError`, or `InvalidJobError`. |
| `cancel(id): boolean` | Cancels a live job in any state. `false` if no live, unsettled job holds that id. |
| `close(): void` | Refuses further additions. Accepted work, including scheduled retries, still settles. |
| `drain(): Promise<void>` | Resolves when nothing is pending, running, or retry-waiting. |
| `stats(): QueueStats` | Frozen `{ pending, running, retryWaiting, liveIds, closed }`. |
| `on(event, listener): Unsubscribe` | Typed subscription. The returned function is idempotent. |
| `off(event, listener): boolean` | Removes a listener. |

### Errors

All queue-originated errors extend `QueueError`.

| Class | Raised when | Delivery |
| --- | --- | --- |
| `InvalidConcurrencyError` | Constructor gets a non-integer or out-of-range concurrency. | **Thrown synchronously** |
| `QueueClosedError` | `add` after `close`. | Rejected promise |
| `DuplicateJobIdError` | `add` with a live id. | Rejected promise |
| `InvalidJobError` | Empty id, non-function `run`, non-finite priority, negative or fractional retries. | Rejected promise |
| `AbortError` | The job was cancelled, in any state. `name === "AbortError"`. | Rejected promise |

`isAbortError(error)` recognises both this class and DOM-style abort reasons.

### Error surfacing policy

**`add` never throws synchronously.** Every rejected addition comes back as a rejected
promise so a caller needs exactly one error path:

```ts
try {
  const result = await queue.add("report", buildReport, { retries: 2 });
} catch (error) {
  if (error instanceof QueueClosedError) { /* shutting down */ }
  else if (isAbortError(error)) { /* cancelled */ }
  else { /* the task itself failed */ }
}
```

The constructor is the single exception, because a constructor cannot return a
rejected promise. Misconfigured concurrency is a programming error caught at
construction, not a runtime condition.

### Events

```ts
const off = queue.on("retrying", ({ id, retry, delayMs, error }) => {
  console.warn(`${id} retry ${retry} in ${delayMs}ms`, error);
});
```

| Event | Payload | Emitted |
| --- | --- | --- |
| `queued` | `{ id, priority, retries }` | Addition accepted. |
| `started` | `{ id, attempt }` | An attempt begins. `attempt` is 1-based. |
| `retrying` | `{ id, retry, delayMs, error }` | An attempt failed and a retry is armed. `retry` is 1-based. |
| `fulfilled` | `{ id, attempts, value }` | Terminal success. |
| `rejected` | `{ id, attempts, error }` | Terminal failure after retries are exhausted. |
| `cancelled` | `{ id, from }` | Cancelled out of `pending`, `running`, or `retry-waiting`. |

Emission is synchronous, so event order is a faithful trace of state transitions.
A listener that throws is contained: the error goes to `onListenerError` and the queue
carries on. A reporter that itself throws is swallowed too.

---

## Semantics

### Ordering

Jobs are selected by **priority descending, then insertion order ascending**. The
pending queue is kept sorted on insert, so equal priorities are strictly FIFO — the
legacy `Array#sort` on every `add` was stable in practice but re-sorted the whole
array each time and never gave retries a defined position.

Priority governs *which pending job starts next*, not preemption. A low-priority job
that already occupies a slot keeps it.

A retry re-enters the pending queue with a **fresh sequence number**, so it goes to the
back of its own priority band rather than jumping ahead of work queued while it slept.

### Concurrency

At most `concurrency` jobs are executing at any instant. Slots are released when an
attempt settles, or immediately when a running job is cancelled.

### Identity

An id is *live* while the job is pending, running, or retry-waiting; exactly one live
record exists per id. Once a job reaches a terminal state — fulfilled, rejected, or
cancelled — the id is released and may be reused.

### Retries

`retries: n` means `n` attempts **after** the first, so `n + 1` total. Retry `k` is
delayed by `25 * 2 ** (k - 1)` ms: 25, 50, 100, 200, …

A synchronous `throw` from a job function is converted to a rejection at the call site
and takes the identical path — including retries — as a rejected promise.

Each record owns **at most one** retry timer, stored on the record. Cancellation clears
it and decrements the retry-waiting count in the same step, so a drained queue has no
armed timers. Tests assert this with `ManualScheduler#pending`.

### Cancellation

| State when cancelled | Effect |
| --- | --- |
| `pending` | Removed from the queue; the promise rejects with `AbortError`; the task never runs. |
| `running` | The signal aborts (with an `AbortError` reason); the promise rejects with `AbortError`; **no retry is scheduled**. |
| `retry-waiting` | The timer is cleared; the promise rejects with `AbortError`. |
| terminal / unknown id | `cancel` returns `false` and nothing happens. |

The promise rejects exactly once — the record is marked settled before any other work,
so a second `cancel` is a no-op that returns `false`.

**Deliberate trade-off for the running case:** the concurrency slot and the id are
released at cancellation time, not when the abandoned task finally settles. A task that
ignores its `AbortSignal` therefore cannot hold `drain()` or its id hostage; its
eventual result is discarded. The cost is that such a misbehaving task may briefly
overlap with a replacement job. Tasks that honour their signal — the contract — see no
difference.

### Close

`close()` sets a flag. Accepted work runs to completion, retries included; only new
additions are refused, with `QueueClosedError`. There is no reopen.

### Drain

`drain()` resolves when `pending === 0 && running === 0 && retryWaiting === 0`.
Multiple concurrent callers all resolve. Because resolution is driven by that
condition rather than by a snapshot taken at call time, jobs added while a drain is
outstanding are included in it. Draining an idle queue resolves immediately.

---

## Legacy failure modes

Each numbered row is reproduced by a characterization test in
`test/legacy-failures.test.ts`, which runs against `legacy/queue.ts` and asserts the
*broken* behaviour. The table is evidence, not commentary.

| # | Legacy behaviour | Consequence | Fix |
| --- | --- | --- | --- |
| 0 | `#pump` calls `item.run(signal)` from inside the `new Promise` executor in `add`. A synchronous throw unwinds the executor. | The promise rejects immediately, `retries` is ignored entirely, and `#running` / `#active` are never cleaned up — with `concurrency: 1` the queue wedges permanently. | `run` is invoked in its own `try/catch` and the throw is converted to a rejection, taking the identical path — retries included — as an async failure. |
| 1 | `#running` is decremented in `.finally()` even when a retry has just been scheduled, and the item is not in `#pending` during backoff. | Retry-waiting work is invisible to every counter. | An explicit `retry-waiting` state with its own counter, distinct from pending and running. |
| 2 | `drain()` resolves as soon as `#pending` is empty, and returns an already-resolved promise if `#pending` is momentarily empty. | Drain resolves with jobs still executing and with retry timers still armed. | Resolves only when `pending`, `running`, and `retryWaiting` are all zero, re-checked after every transition. |
| 3 | A retried item is `push`ed back onto `#pending` with no re-sort — `#pending.sort()` only runs inside `add`. | A `priority: 100` retry runs *after* a `priority: -100` job. | The pending queue is kept sorted on insert, and a retry re-enters at a defined position in its own priority band. |
| 4 | `item.attempt += 1` happens *before* computing `25 * 2 ** item.attempt`. | The first retry waits 50ms instead of the documented 25ms; every delay is doubled. | `retry` is 1-based, and `25 * 2 ** (retry - 1)` is a pure function with its own unit test. |
| 5 | Cancelling a running job only calls `controller.abort()`. | The caller's promise never settles, and when the task rejects on abort the job is **retried after being cancelled**. | Cancellation is terminal: reject once with `AbortError`, mark the attempt abandoned, discard whatever it produces. |
| 6 | During backoff the item is in neither `#pending` nor `#active`, so `cancel` cannot see it. | `cancel` returns `false`, the timer survives, and the job resurrects itself and runs after being cancelled. | Retry-waiting is a live state; the record owns its single timer and cancellation clears it. |
| 7 | `#active` is keyed by id with no duplicate check. | Two jobs run under one id; the second evicts the first, leaving the first permanently uncancellable. | Duplicate ids are refused while live and released on settlement. |
| 8 | `add` throws a bare `new Error("closed")` after `close`. | Callers need both `try/catch` and `.catch`, and have nothing to discriminate on. | A rejected promise carrying the typed `QueueClosedError`. |
| 9 | `if (concurrency < 1) throw` — `NaN < 1` is false. | `new JobQueue(NaN)` builds a queue where `0 < NaN` is false, so it never runs anything and every `add` hangs. `1.5` and `1e9` are accepted too. | Integer range check, 1 through 32, with a typed `InvalidConcurrencyError`. |
| 10 | No `stats`, no events, no state field, real timers hardcoded. | Nothing to assert against; tests must sleep and guess. | `stats()`, six typed events, and an injectable `Scheduler` so the suite never sleeps. |

---

## Tests

34 tests across two files.

- `test/job-queue.test.ts` — 24 tests covering the replacement.
- `test/legacy-failures.test.ts` — 10 characterization tests pinning the legacy bugs
  in the table above.

The replacement's suite runs in tens of milliseconds because retry timers go through
`ManualScheduler`: virtual time is advanced explicitly and `clock.pending` doubles as a
leak detector. The legacy suite uses small real delays because the legacy queue calls
`setTimeout` directly — that lack of a seam is failure mode 10.

Groups: construction and range validation · priority and FIFO · concurrency ceiling ·
duplicate-id lifecycle across pending/running/retry-waiting · id reuse after each
terminal state · synchronous throw · successful retry with asserted delays · retry
exhaustion · the backoff curve itself · pending / running / backoff cancellation ·
`cancel` returning false · drain with active jobs · drain during backoff · drain
inclusion of late additions · close · invalid additions · event ordering · listener
containment · unsubscribe and frozen stats · a mixed-workload hygiene check asserting
no leftover timers, live ids, or unsettled promises.

```sh
bun test
```
