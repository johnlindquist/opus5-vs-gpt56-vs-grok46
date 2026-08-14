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

export type QueueEvent =
  | { readonly type: "queued"; readonly id: string; readonly priority: number; readonly attempt: number }
  | { readonly type: "started"; readonly id: string; readonly attempt: number }
  | { readonly type: "retrying"; readonly id: string; readonly attempt: number; readonly delayMs: number; readonly error: unknown }
  | { readonly type: "fulfilled"; readonly id: string; readonly attempt: number }
  | { readonly type: "rejected"; readonly id: string; readonly attempt: number; readonly error: unknown }
  | { readonly type: "cancelled"; readonly id: string; readonly phase: "pending" | "running" | "retry-waiting" };

export type QueueEventListener = (event: Readonly<QueueEvent>) => void;

export interface JobQueueOptions {
  /**
   * Test/embedding seam. The default is exponentialBackoff.
   * It receives the one-based retry number (1 for the first retry).
   */
  readonly backoffDelay?: (retryNumber: number) => number;
}
