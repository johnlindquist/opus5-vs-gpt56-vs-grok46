/**
 * Retry backoff and the timer seam.
 *
 * The delay curve is a pure function of the retry number so it can be unit
 * tested without timers, and the queue only ever reaches timers through a
 * {@link Scheduler}, which tests replace with a manual clock.
 */

import type { BackoffStrategy, Scheduler } from "./types.ts";

/** Base delay of the default curve, in milliseconds. */
export const BASE_DELAY_MS = 25;

/**
 * Default curve: `25 * 2 ** (retry - 1)` ms, with `retry` starting at one.
 * Retry 1 → 25ms, retry 2 → 50ms, retry 3 → 100ms.
 */
export const exponentialBackoff: BackoffStrategy = (retry: number): number => {
  if (!Number.isInteger(retry) || retry < 1) {
    throw new RangeError(`retry must be an integer >= 1, received ${retry}`);
  }
  return BASE_DELAY_MS * 2 ** (retry - 1);
};

/** Wraps the host timers. Bound so it works when destructured. */
export const hostScheduler: Scheduler = {
  setTimeout: (handler, ms) => setTimeout(handler, ms),
  clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

/**
 * A deterministic clock for tests: timers only fire when `advance` is called,
 * and `pending` reveals leaked timers.
 */
export class ManualScheduler implements Scheduler {
  #now = 0;
  #nextId = 1;
  #timers = new Map<number, { at: number; handler: () => void }>();

  setTimeout(handler: () => void, ms: number): unknown {
    const id = this.#nextId++;
    this.#timers.set(id, { at: this.#now + Math.max(0, ms), handler });
    return id;
  }

  clearTimeout(handle: unknown): void {
    this.#timers.delete(handle as number);
  }

  /** Number of timers still armed. Should be zero once a queue has drained. */
  get pending(): number {
    return this.#timers.size;
  }

  /** Current virtual time in milliseconds. */
  get now(): number {
    return this.#now;
  }

  /**
   * Moves virtual time forward, firing every timer whose deadline has passed in
   * deadline order (ties broken by creation order). Timers armed during the
   * advance are honoured if they fall inside the same window.
   */
  advance(ms: number): void {
    const target = this.#now + ms;
    for (;;) {
      const due = [...this.#timers.entries()]
        .filter(([, timer]) => timer.at <= target)
        .sort((a, b) => a[1].at - b[1].at || a[0] - b[0]);
      const next = due[0];
      if (!next) break;
      const [id, timer] = next;
      this.#timers.delete(id);
      this.#now = Math.max(this.#now, timer.at);
      timer.handler();
    }
    this.#now = target;
  }
}
