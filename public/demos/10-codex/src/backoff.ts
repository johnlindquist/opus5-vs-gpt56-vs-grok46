/** Return the delay for a one-based retry number. */
export function exponentialBackoff(retryNumber: number): number {
  return 25 * 2 ** (retryNumber - 1);
}
