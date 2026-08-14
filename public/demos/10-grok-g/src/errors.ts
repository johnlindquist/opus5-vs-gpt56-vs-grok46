export class QueueError extends Error {
  override readonly name: string = "QueueError";

  constructor(message: string) {
    super(message);
  }
}

export class QueueClosedError extends QueueError {
  override readonly name = "QueueClosedError";

  constructor(message = "Queue is closed") {
    super(message);
  }
}

export class DuplicateJobError extends QueueError {
  override readonly name = "DuplicateJobError";
  readonly id: string;

  constructor(id: string) {
    super(`Job id already in use: ${id}`);
    this.id = id;
  }
}

export class InvalidJobError extends QueueError {
  override readonly name = "InvalidJobError";

  constructor(message: string) {
    super(message);
  }
}

export function isAbortError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    (error as { name: unknown }).name === "AbortError"
  );
}

export function abortError(message = "The operation was aborted."): DOMException {
  return new DOMException(message, "AbortError");
}
