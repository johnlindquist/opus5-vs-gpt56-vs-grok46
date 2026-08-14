/**
 * Public types for the job queue.
 *
 * `JobFunction` and `AddOptions` are byte-compatible with the legacy module so
 * that call sites migrate without edits.
 */

/** A unit of work. Receives an `AbortSignal` that fires when the job is cancelled. */
export type JobFunction<T> = (signal: AbortSignal) => Promise<T> | T;

/** Options accepted by `JobQueue#add`. */
export interface AddOptions {
  /** Higher runs first. Defaults to 0. Must be a finite number. */
  priority?: number;
  /**
   * Additional attempts *after* the first one. Defaults to 0, meaning a single
   * attempt. `retries: 2` means up to three total attempts.
   */
  retries?: number;
}

/** Lifecycle state of a live job. Terminal states are not retained. */
export type JobState =
  | "pending"
  | "running"
  | "retry-waiting"
  | "fulfilled"
  | "rejected"
  | "cancelled";

/** Immutable snapshot returned by `JobQueue#stats`. */
export interface QueueStats {
  /** Jobs queued and waiting for a concurrency slot. */
  readonly pending: number;
  /** Jobs currently executing. */
  readonly running: number;
  /** Jobs sleeping in retry backoff, holding a live timer. */
  readonly retryWaiting: number;
  /** Distinct ids that are pending, running, or retry-waiting. */
  readonly liveIds: number;
  /** True when the queue has been closed to new additions. */
  readonly closed: boolean;
}

/** Payload map for {@link JobQueue.on}. */
export interface QueueEvents {
  /** A job was accepted and placed in the pending queue. */
  queued: { id: string; priority: number; retries: number };
  /** An attempt began executing. `attempt` is 1-based. */
  started: { id: string; attempt: number };
  /** An attempt failed and a retry has been scheduled. */
  retrying: {
    id: string;
    /** 1-based retry number: 1 is the first retry, i.e. the second attempt. */
    retry: number;
    /** Delay before the retry attempt is re-queued. */
    delayMs: number;
    error: unknown;
  };
  /** The job settled successfully. */
  fulfilled: { id: string; attempts: number; value: unknown };
  /** The job settled with a failure after exhausting its retries. */
  rejected: { id: string; attempts: number; error: unknown };
  /** The job was cancelled. `from` is the state it was cancelled out of. */
  cancelled: {
    id: string;
    from: Extract<JobState, "pending" | "running" | "retry-waiting">;
  };
}

/** Name of any emitted event. */
export type QueueEventName = keyof QueueEvents;

/** Listener signature for a given event name. */
export type QueueListener<K extends QueueEventName> = (
  payload: QueueEvents[K],
) => void;

/** Removes a previously registered listener. Idempotent. */
export type Unsubscribe = () => void;

/**
 * Timer seam. Defaults to the host `setTimeout` / `clearTimeout`; tests inject
 * a manual clock so the suite never actually sleeps.
 */
export interface Scheduler {
  setTimeout(handler: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}

/** Computes the backoff delay in milliseconds for a 1-based retry number. */
export type BackoffStrategy = (retry: number) => number;

/** Optional second constructor argument. All fields have safe defaults. */
export interface JobQueueOptions {
  /** Override the retry delay curve. Defaults to `25 * 2 ** (retry - 1)`. */
  backoff?: BackoffStrategy;
  /** Override the timer source. Defaults to the host timers. */
  scheduler?: Scheduler;
  /**
   * Called when an event listener throws. Defaults to `console.error`.
   * Errors here never reach queue execution.
   */
  onListenerError?: (error: unknown, event: QueueEventName) => void;
}
