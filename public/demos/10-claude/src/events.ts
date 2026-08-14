/**
 * A tiny typed emitter.
 *
 * Two properties matter for the queue: emission is synchronous (so event order
 * is a deterministic reflection of state transitions), and a listener that
 * throws can never interrupt the emitting code path.
 */

import type {
  QueueEventName,
  QueueEvents,
  QueueListener,
  Unsubscribe,
} from "./types.ts";

/** Receives errors thrown by listeners, out of band from queue execution. */
export type ListenerErrorReporter = (
  error: unknown,
  event: QueueEventName,
) => void;

/** Default reporter: log and continue. */
export const logListenerError: ListenerErrorReporter = (error, event) => {
  console.error(`[JobQueue] listener for "${event}" threw:`, error);
};

export class TypedEmitter {
  #listeners = new Map<QueueEventName, Set<(payload: never) => void>>();
  readonly #report: ListenerErrorReporter;

  constructor(report: ListenerErrorReporter = logListenerError) {
    this.#report = report;
  }

  /** Registers `listener`. Returns an idempotent unsubscribe function. */
  on<K extends QueueEventName>(
    event: K,
    listener: QueueListener<K>,
  ): Unsubscribe {
    let set = this.#listeners.get(event);
    if (!set) {
      set = new Set();
      this.#listeners.set(event, set);
    }
    set.add(listener as (payload: never) => void);
    let removed = false;
    return () => {
      if (removed) return;
      removed = true;
      set!.delete(listener as (payload: never) => void);
    };
  }

  /** Removes a listener. Returns true if it was registered. */
  off<K extends QueueEventName>(event: K, listener: QueueListener<K>): boolean {
    return (
      this.#listeners.get(event)?.delete(listener as (payload: never) => void) ??
      false
    );
  }

  /**
   * Notifies listeners synchronously over a snapshot of the set, so a listener
   * that subscribes or unsubscribes during dispatch cannot corrupt iteration.
   * Thrown errors are contained and handed to the reporter; a reporter that
   * itself throws is ignored, so no listener can derail the queue.
   */
  emit<K extends QueueEventName>(event: K, payload: QueueEvents[K]): void {
    const set = this.#listeners.get(event);
    if (!set || set.size === 0) return;
    for (const listener of [...set]) {
      try {
        (listener as QueueListener<K>)(payload);
      } catch (error) {
        try {
          this.#report(error, event);
        } catch {
          // Nothing left to do; never propagate into queue execution.
        }
      }
    }
  }

  /** Drops every listener. Used by tests and teardown. */
  clear(): void {
    this.#listeners.clear();
  }
}
