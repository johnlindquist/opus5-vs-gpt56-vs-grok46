/**
 * A concurrency-limited, priority-ordered, retrying job queue.
 *
 * ## State machine
 *
 * ```text
 *                 add()
 *                   │
 *                   ▼
 *              ┌─────────┐  slot free   ┌─────────┐  resolve   ┌───────────┐
 *              │ pending │─────────────▶│ running │───────────▶│ fulfilled │
 *              └─────────┘              └─────────┘            └───────────┘
 *                   │                      │   │  reject & retries left
 *                   │                      │   └──────────────┐
 *            cancel │               reject │ (exhausted)      ▼
 *                   │                      │           ┌───────────────┐
 *                   │                      ▼           │ retry-waiting │
 *                   │                ┌──────────┐      └───────────────┘
 *                   │                │ rejected │        │          │
 *                   │                └──────────┘ cancel │          │ timer
 *                   │                                    │          │ fires
 *                   ▼                                    ▼          │
 *              ┌───────────┐◀──── cancel (running) ──────────┐      │
 *              │ cancelled │                                        │
 *              └───────────┘                                        │
 *                   ▲                                               │
 *                   └────────────── back to pending ◀───────────────┘
 * ```
 *
 * `fulfilled`, `rejected`, and `cancelled` are terminal; terminal records are
 * dropped, which is what frees the id for reuse.
 *
 * ## Invariants
 *
 * - At most `concurrency` jobs are in `running` at any instant.
 * - Every live id maps to exactly one record; `add` rejects duplicates.
 * - A caller's promise settles exactly once.
 * - At most one retry timer exists per record, owned by that record and always
 *   cleared on cancellation, so a drained queue arms no timers.
 *
 * ## Error surfacing policy
 *
 * `add` **never throws synchronously**; every rejected addition (closed queue,
 * duplicate id, malformed arguments) comes back as a rejected promise so
 * callers can use a single `catch`. The constructor is the sole exception — it
 * throws {@link InvalidConcurrencyError}, because a constructor cannot return a
 * rejected promise.
 */

import { exponentialBackoff, hostScheduler } from "./backoff.ts";
import {
  AbortError,
  DuplicateJobIdError,
  InvalidConcurrencyError,
  InvalidJobError,
  QueueClosedError,
} from "./errors.ts";
import { logListenerError, TypedEmitter } from "./events.ts";
import type {
  AddOptions,
  BackoffStrategy,
  JobFunction,
  JobQueueOptions,
  JobState,
  QueueEventName,
  QueueListener,
  QueueStats,
  Scheduler,
  Unsubscribe,
} from "./types.ts";

export { exponentialBackoff, ManualScheduler } from "./backoff.ts";
export {
  AbortError,
  DuplicateJobIdError,
  InvalidConcurrencyError,
  InvalidJobError,
  isAbortError,
  QueueClosedError,
  QueueError,
} from "./errors.ts";
export type {
  AddOptions,
  BackoffStrategy,
  JobFunction,
  JobQueueOptions,
  JobState,
  QueueEventName,
  QueueEvents,
  QueueListener,
  QueueStats,
  Scheduler,
  Unsubscribe,
} from "./types.ts";

/** Lowest and highest accepted concurrency, inclusive. */
export const MIN_CONCURRENCY = 1;
export const MAX_CONCURRENCY = 32;

interface JobRecord<T> {
  readonly id: string;
  readonly run: JobFunction<T>;
  readonly priority: number;
  readonly retries: number;
  /** Insertion counter; breaks priority ties into FIFO order. */
  seq: number;
  /** Attempts started so far. 1 during the first execution. */
  attempts: number;
  state: JobState;
  /** True once the caller's promise has settled, in any way. */
  settled: boolean;
  /** True when cancelled mid-flight: the in-flight result is discarded. */
  abandoned: boolean;
  controller: AbortController | null;
  /** The single retry timer this record owns, or null. */
  timer: unknown | null;
  resolve: (value: T | PromiseLike<T>) => void;
  reject: (error: unknown) => void;
}

export class JobQueue {
  /** Maximum number of jobs executing at once. Integer in [1, 32]. */
  readonly concurrency: number;

  readonly #backoff: BackoffStrategy;
  readonly #scheduler: Scheduler;
  readonly #emitter: TypedEmitter;

  /** Sorted by priority descending, then `seq` ascending. */
  #pendingQueue: JobRecord<any>[] = [];
  /** Every record that currently owns its id: pending, running, or retrying. */
  #live = new Map<string, JobRecord<any>>();
  #running = 0;
  #retryWaiting = 0;
  #closed = false;
  #nextSeq = 0;
  #drainers: Array<() => void> = [];
  #pumping = false;
  #pumpRequested = false;

  /**
   * @param concurrency Jobs allowed to execute simultaneously, 1 through 32.
   * @param options Test seams: `backoff` curve and `scheduler` timer source.
   * @throws {InvalidConcurrencyError} for a non-integer or out-of-range value.
   */
  constructor(concurrency = 2, options: JobQueueOptions = {}) {
    if (
      typeof concurrency !== "number" ||
      !Number.isInteger(concurrency) ||
      concurrency < MIN_CONCURRENCY ||
      concurrency > MAX_CONCURRENCY
    ) {
      throw new InvalidConcurrencyError(concurrency);
    }
    this.concurrency = concurrency;
    this.#backoff = options.backoff ?? exponentialBackoff;
    this.#scheduler = options.scheduler ?? hostScheduler;
    this.#emitter = new TypedEmitter(options.onListenerError ?? logListenerError);
  }

  /**
   * Queues `run` under `id`.
   *
   * Returns a promise that settles with the job's result, or rejects with an
   * {@link AbortError} if the job is cancelled. Invalid additions come back as
   * a rejected promise rather than a synchronous throw.
   */
  add<T>(
    id: string,
    run: JobFunction<T>,
    options: AddOptions = {},
  ): Promise<T> {
    const invalid = this.#validate(id, run, options);
    if (invalid) return Promise.reject(invalid);

    const priority = options.priority ?? 0;
    const retries = options.retries ?? 0;

    let resolve!: (value: T | PromiseLike<T>) => void;
    let reject!: (error: unknown) => void;
    const promise = new Promise<T>((res, rej) => {
      resolve = res;
      reject = rej;
    });

    const record: JobRecord<T> = {
      id,
      run,
      priority,
      retries,
      seq: this.#nextSeq++,
      attempts: 0,
      state: "pending",
      settled: false,
      abandoned: false,
      controller: null,
      timer: null,
      resolve,
      reject,
    };

    this.#live.set(id, record);
    this.#enqueue(record);
    this.#emitter.emit("queued", { id, priority, retries });
    this.#pump();
    return promise;
  }

  /**
   * Cancels a live job in any state, rejecting its promise once with an
   * {@link AbortError}. A running job's signal is aborted and it will not
   * retry; a retry-waiting job's timer is cleared.
   *
   * @returns false when no live, unsettled job holds that id.
   */
  cancel(id: string): boolean {
    const record = this.#live.get(id);
    if (!record || record.settled) return false;

    switch (record.state) {
      case "pending": {
        const index = this.#pendingQueue.indexOf(record);
        if (index >= 0) this.#pendingQueue.splice(index, 1);
        this.#settleCancelled(record, "pending");
        this.#live.delete(id);
        break;
      }
      case "retry-waiting": {
        if (record.timer !== null) {
          this.#scheduler.clearTimeout(record.timer);
          record.timer = null;
        }
        this.#retryWaiting -= 1;
        this.#settleCancelled(record, "retry-waiting");
        this.#live.delete(id);
        break;
      }
      case "running": {
        // The slot and the id are released at cancellation time, not when the
        // abandoned task finally settles: a task that ignores its signal must
        // not be able to hold `drain` or its id hostage. Its eventual result is
        // discarded by `#onAttemptSettled`.
        record.abandoned = true;
        this.#running -= 1;
        this.#live.delete(id);
        this.#settleCancelled(record, "running");
        const controller = record.controller;
        record.controller = null;
        controller?.abort(new AbortError(id));
        break;
      }
      default:
        return false;
    }

    this.#pump();
    this.#resolveDrainersIfIdle();
    return true;
  }

  /** Refuses further additions. Work already accepted, including retries, still settles. */
  close(): void {
    this.#closed = true;
  }

  /**
   * Resolves once nothing is pending, running, or waiting in retry backoff.
   * Multiple concurrent callers all resolve, and jobs added while a drain is
   * outstanding are included in it.
   */
  drain(): Promise<void> {
    if (this.#isIdle()) return Promise.resolve();
    return new Promise<void>((resolve) => {
      this.#drainers.push(resolve);
    });
  }

  /** Immutable snapshot of queue occupancy. */
  stats(): QueueStats {
    return Object.freeze({
      pending: this.#pendingQueue.length,
      running: this.#running,
      retryWaiting: this.#retryWaiting,
      liveIds: this.#live.size,
      closed: this.#closed,
    });
  }

  /** Subscribes to a lifecycle event. Returns an unsubscribe function. */
  on<K extends QueueEventName>(
    event: K,
    listener: QueueListener<K>,
  ): Unsubscribe {
    return this.#emitter.on(event, listener);
  }

  /** Removes a listener registered with {@link on}. */
  off<K extends QueueEventName>(event: K, listener: QueueListener<K>): boolean {
    return this.#emitter.off(event, listener);
  }

  // ── internals ────────────────────────────────────────────────────────────

  #validate<T>(
    id: string,
    run: JobFunction<T>,
    options: AddOptions,
  ): Error | null {
    if (typeof id !== "string" || id.length === 0) {
      return new InvalidJobError("Job id must be a non-empty string.");
    }
    if (typeof run !== "function") {
      return new InvalidJobError(`Job "${id}" must supply a function to run.`);
    }
    if (options === null || typeof options !== "object") {
      return new InvalidJobError(`Options for job "${id}" must be an object.`);
    }
    const { priority, retries } = options;
    if (priority !== undefined && !Number.isFinite(priority)) {
      return new InvalidJobError(
        `Priority for job "${id}" must be a finite number.`,
      );
    }
    if (
      retries !== undefined &&
      (!Number.isInteger(retries) || retries < 0)
    ) {
      return new InvalidJobError(
        `Retries for job "${id}" must be an integer >= 0.`,
      );
    }
    if (this.#closed) return new QueueClosedError(id);
    if (this.#live.has(id)) return new DuplicateJobIdError(id);
    return null;
  }

  /** Inserts keeping the queue sorted by priority desc, seq asc. */
  #enqueue(record: JobRecord<any>): void {
    const queue = this.#pendingQueue;
    let index = queue.length;
    while (index > 0) {
      const previous = queue[index - 1]!;
      const outranks =
        previous.priority > record.priority ||
        (previous.priority === record.priority && previous.seq < record.seq);
      if (outranks) break;
      index -= 1;
    }
    queue.splice(index, 0, record);
  }

  /**
   * Fills free concurrency slots. Reentrant calls (a listener or a synchronous
   * job body calling `add`) are folded into a single trailing pass.
   */
  #pump(): void {
    if (this.#pumping) {
      this.#pumpRequested = true;
      return;
    }
    this.#pumping = true;
    try {
      while (this.#running < this.concurrency && this.#pendingQueue.length > 0) {
        this.#start(this.#pendingQueue.shift()!);
      }
    } finally {
      this.#pumping = false;
    }
    if (this.#pumpRequested) {
      this.#pumpRequested = false;
      this.#pump();
    }
  }

  #start(record: JobRecord<any>): void {
    const controller = new AbortController();
    record.controller = controller;
    record.state = "running";
    record.attempts += 1;
    this.#running += 1;
    this.#emitter.emit("started", { id: record.id, attempt: record.attempts });

    let result: Promise<unknown>;
    try {
      result = Promise.resolve(record.run(controller.signal));
    } catch (error) {
      // A synchronous throw is indistinguishable from a rejected promise.
      result = Promise.reject(error);
    }
    result.then(
      (value) => this.#onAttemptSettled(record, { ok: true, value }),
      (error) => this.#onAttemptSettled(record, { ok: false, error }),
    );
  }

  #onAttemptSettled(
    record: JobRecord<any>,
    outcome: { ok: true; value: unknown } | { ok: false; error: unknown },
  ): void {
    if (record.abandoned) {
      // Cancelled mid-flight: the slot, the id, and the caller's promise were
      // all settled by `cancel`. Whatever this attempt produced is discarded.
      return;
    }

    this.#running -= 1;
    record.controller = null;

    if (outcome.ok) {
      record.state = "fulfilled";
      record.settled = true;
      this.#live.delete(record.id);
      record.resolve(outcome.value);
      this.#emitter.emit("fulfilled", {
        id: record.id,
        attempts: record.attempts,
        value: outcome.value,
      });
    } else if (record.attempts <= record.retries) {
      this.#scheduleRetry(record, outcome.error);
    } else {
      record.state = "rejected";
      record.settled = true;
      this.#live.delete(record.id);
      record.reject(outcome.error);
      this.#emitter.emit("rejected", {
        id: record.id,
        attempts: record.attempts,
        error: outcome.error,
      });
    }

    this.#pump();
    this.#resolveDrainersIfIdle();
  }

  #scheduleRetry(record: JobRecord<any>, error: unknown): void {
    const retry = record.attempts; // attempt 1 failed → retry 1.
    let delayMs: number;
    try {
      delayMs = this.#backoff(retry);
    } catch (backoffError) {
      // A broken strategy must not strand the job; fail it with its own error.
      record.state = "rejected";
      record.settled = true;
      this.#live.delete(record.id);
      record.reject(error);
      this.#emitter.emit("rejected", {
        id: record.id,
        attempts: record.attempts,
        error,
      });
      void backoffError;
      return;
    }

    record.state = "retry-waiting";
    this.#retryWaiting += 1;
    // Arm before emitting so a listener that cancels during this event finds a
    // clearable timer instead of leaving one behind.
    record.timer = this.#scheduler.setTimeout(() => {
      record.timer = null;
      this.#retryWaiting -= 1;
      record.state = "pending";
      record.seq = this.#nextSeq++; // Re-enters at the back of its priority band.
      this.#enqueue(record);
      this.#pump();
      this.#resolveDrainersIfIdle();
    }, delayMs);
    this.#emitter.emit("retrying", { id: record.id, retry, delayMs, error });
  }

  #settleCancelled(
    record: JobRecord<any>,
    from: "pending" | "running" | "retry-waiting",
  ): void {
    record.state = "cancelled";
    record.settled = true;
    record.reject(new AbortError(record.id));
    this.#emitter.emit("cancelled", { id: record.id, from });
  }

  #isIdle(): boolean {
    return (
      this.#pendingQueue.length === 0 &&
      this.#running === 0 &&
      this.#retryWaiting === 0
    );
  }

  #resolveDrainersIfIdle(): void {
    if (!this.#isIdle() || this.#drainers.length === 0) return;
    for (const resolve of this.#drainers.splice(0)) resolve();
  }
}
