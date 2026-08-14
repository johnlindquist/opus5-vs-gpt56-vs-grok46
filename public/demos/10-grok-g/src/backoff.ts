import type { RetryDelay, Scheduler } from "./types.ts";

export const RETRY_BASE_MS = 25;

/**
 * Delay before retry attempt `retryAttemptNumber` (1-based).
 * Formula: 25 * 2 ** (attemptNumber - 1)
 */
export function retryDelayMs(retryAttemptNumber: number): number {
  if (
    !Number.isInteger(retryAttemptNumber) ||
    retryAttemptNumber < 1
  ) {
    throw new RangeError("retryAttemptNumber must be an integer >= 1");
  }
  return RETRY_BASE_MS * 2 ** (retryAttemptNumber - 1);
}

export const defaultRetryDelay: RetryDelay = retryDelayMs;

export const defaultSchedule: Scheduler = (callback, delayMs) => {
  const handle = setTimeout(callback, delayMs);
  return () => {
    clearTimeout(handle);
  };
};
