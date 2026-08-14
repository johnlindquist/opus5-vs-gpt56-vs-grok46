/**
 * Typed error hierarchy for the job queue.
 *
 * Every failure the queue itself originates is an instance of {@link QueueError},
 * so callers can distinguish "the queue said no" from "the task failed".
 */

/** Base class for every error the queue itself raises. */
export class QueueError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "QueueError";
  }
}

/** Thrown (as a rejection) when `add` is called after `close`. */
export class QueueClosedError extends QueueError {
  constructor(id: string) {
    super(`Cannot add job "${id}": the queue is closed.`);
    this.name = "QueueClosedError";
  }
}

/**
 * Rejection used when an id is already live — pending, running, or waiting in
 * retry backoff. Ids become reusable once the previous job settles permanently.
 */
export class DuplicateJobIdError extends QueueError {
  constructor(readonly id: string) {
    super(`Job id "${id}" is already live (pending, running, or retrying).`);
    this.name = "DuplicateJobIdError";
  }
}

/** Rejection used for structurally invalid additions (bad id, run, options). */
export class InvalidJobError extends QueueError {
  constructor(message: string) {
    super(message);
    this.name = "InvalidJobError";
  }
}

/** Thrown synchronously by the constructor for an out-of-range concurrency. */
export class InvalidConcurrencyError extends QueueError {
  constructor(received: unknown) {
    super(
      `Concurrency must be an integer from 1 through 32, received ${String(received)}.`,
    );
    this.name = "InvalidConcurrencyError";
  }
}

/**
 * Rejection used whenever a job is cancelled, in any state.
 *
 * `name` is `"AbortError"` to match the DOM convention, so existing
 * `err.name === "AbortError"` checks keep working across the migration.
 */
export class AbortError extends QueueError {
  constructor(readonly id: string, message = `Job "${id}" was cancelled.`) {
    super(message);
    this.name = "AbortError";
  }
}

/** True for any cancellation rejection, including DOM-style abort reasons. */
export function isAbortError(error: unknown): boolean {
  return (
    error instanceof AbortError ||
    (typeof error === "object" &&
      error !== null &&
      (error as { name?: unknown }).name === "AbortError")
  );
}
