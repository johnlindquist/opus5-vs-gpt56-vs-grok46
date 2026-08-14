# The Haunted Queue

A production-oriented, dependency-free TypeScript job queue for Bun 1.3 and
Node-standard runtimes. The refactor preserves the legacy `JobQueue` methods
while making scheduling, cancellation, retry ownership, draining, and
observation explicit and testable.

## Commands

```sh
bun test
bun run demo.ts
```

The checked-in deterministic demo transcript is at `out/demo.txt`. Open
`report.html` directly in a browser for the architecture and behavior report;
it has no external assets.

## API

```ts
import {
  JobQueue,
  AbortError,
  DuplicateJobIdError,
  QueueClosedError,
} from "./src/job-queue";

const queue = new JobQueue(4);
const unsubscribe = queue.subscribe((event) => console.log(event));

const result = await queue.add(
  "thumbnail:42",
  async (signal) => {
    // Cooperatively stop work when signal.aborted.
    return "complete";
  },
  { priority: 10, retries: 2 },
);

await queue.drain();
unsubscribe();
```

Preserved methods are `add`, `cancel`, `close`, and `drain`; `concurrency`
remains readonly. The refactor adds:

- `stats()` — a frozen snapshot containing `pending`, `running`,
  `retryWaiting`, and `live`.
- `subscribe(listener)` — typed transition events for `queued`, `started`,
  `retrying`, `fulfilled`, `rejected`, and `cancelled`. It returns an
  unsubscribe function. A listener that throws is isolated from queue work.
- An optional second constructor argument, `{ backoffDelay }`, for bounded,
  deterministic testing or embedding.

## Addition and error policy

The constructor throws synchronously for invalid concurrency because no queue
can be created. `subscribe` likewise throws for a non-function listener.

Every `add` validation failure returns a rejected promise rather than throwing:

- `QueueClosedError` after `close()`
- `DuplicateJobIdError` while an ID is live
- `InvalidJobError` for an empty ID, invalid task, non-finite priority, or
  negative/non-integer retry count

Cancellation rejects with `AbortError`. This uniform addition policy lets
callers handle both scheduling failures and task failures through `await` or
promise rejection handlers.

## Scheduling semantics

- Concurrency is an integer from 1 through 32.
- Pending work is ordered by descending numeric priority and then ascending
  insertion sequence, giving equal priorities stable FIFO behavior.
- `retries` counts additional attempts. Default retry delays are 25, 50, 100,
  200… milliseconds for retry numbers 1, 2, 3, 4….
- Synchronous throws and rejected promises enter the same failure transition.
- An ID remains live while pending, running, or in retry backoff. It becomes
  reusable only after permanent fulfillment, rejection, or cancellation has
  fully exited execution.
- Cancelling running work rejects the public promise and aborts its signal
  immediately. The execution slot and ID remain owned until the task returns;
  this prevents an abort-ignoring function from exceeding concurrency.
- `close()` rejects new additions but does not abandon accepted work or retries.
- `drain()` observes the live registry, so it includes pending, executing, and
  retry-waiting jobs. All current drain callers resolve together only at zero
  live IDs.

Tasks should listen to their `AbortSignal` for prompt cooperative shutdown.

## Layout

- `legacy/queue.ts` — exact, untouched source supplied for comparison
- `src/job-queue.ts` — state machine, scheduling, timer ownership, and API
- `src/types.ts` — public job, stats, event, and configuration types
- `src/errors.ts` — typed public failures
- `src/backoff.ts` — default one-based retry formula
- `test/job-queue.test.ts` — 18 focused Bun tests
- `demo.ts` and `out/demo.txt` — deterministic executable scenario and transcript
- `report.html` — standalone visual report

## Migration notes

Existing valid construction and calls continue to work. Code that depended on
`add()` throwing after close must instead await or catch its rejected promise.
Code that cancelled a pending legacy job without observing its promise must now
handle the intentional `AbortError`. Duplicate live IDs are no longer allowed.
`drain()` is stronger: it waits for running tasks and retry timers, not merely
an empty pending array.
