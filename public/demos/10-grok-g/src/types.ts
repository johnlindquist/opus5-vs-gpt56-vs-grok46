export type JobFunction<T> = (
  signal: AbortSignal,
) => Promise<T> | T;

export interface AddOptions {
  priority?: number;
  retries?: number;
}

export interface QueueStats {
  readonly pending: number;
  readonly running: number;
  readonly retryWaiting: number;
  readonly live: number;
}

export type JobEventType =
  | "queued"
  | "started"
  | "retrying"
  | "fulfilled"
  | "rejected"
  | "cancelled";

export interface JobEvent {
  readonly type: JobEventType;
  readonly id: string;
  readonly sequence: number;
  readonly attempt: number;
  readonly priority: number;
  readonly delayMs?: number;
  readonly error?: unknown;
}

export type JobEventListener = (event: JobEvent) => void;
export type Unsubscribe = () => void;

export type CancelHandle = () => void;

export type Scheduler = (
  callback: () => void,
  delayMs: number,
) => CancelHandle;

export type RetryDelay = (retryAttemptNumber: number) => number;

export interface JobQueueHooks {
  retryDelayMs?: RetryDelay;
  schedule?: Scheduler;
}
