export class QueueClosedError extends Error {
  override readonly name = "QueueClosedError";

  constructor() {
    super("The job queue is closed");
  }
}

export class DuplicateJobIdError extends Error {
  override readonly name = "DuplicateJobIdError";

  constructor(readonly id: string) {
    super(`A live job already uses the ID "${id}"`);
  }
}

export class InvalidJobError extends TypeError {
  override readonly name = "InvalidJobError";
}

export class AbortError extends Error {
  override readonly name = "AbortError";

  constructor(readonly id: string) {
    super(`Job "${id}" was cancelled`);
  }
}
