import { exponentialBackoff } from "./backoff";
import {
  AbortError,
  DuplicateJobIdError,
  InvalidJobError,
  QueueClosedError,
} from "./errors";
import type {
  AddOptions,
  JobFunction,
  JobQueueOptions,
  QueueEvent,
  QueueEventListener,
  QueueStats,
} from "./types";

type Phase = "pending" | "running" | "retry-waiting";

interface Item<T = unknown> {
  readonly id: string;
  readonly run: JobFunction<T>;
  readonly priority: number;
  readonly retries: number;
  sequence: number;
  attempt: number;
  phase: Phase;
  controller?: AbortController;
  retryTimer?: ReturnType<typeof setTimeout>;
  promiseSettled: boolean;
  cancelled: boolean;
  readonly resolve: (value: T | PromiseLike<T>) => void;
  readonly reject: (error: unknown) => void;
}

export class JobQueue {
  readonly concurrency: number;

  #closed = false;
  #pending: Item[] = [];
  #running = 0;
  #retryWaiting = 0;
  #sequence = 0;
  #live = new Map<string, Item>();
  #drainers = new Set<() => void>();
  #listeners = new Set<QueueEventListener>();
  #backoffDelay: (retryNumber: number) => number;

  constructor(concurrency = 2, options: JobQueueOptions = {}) {
    if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 32) {
      throw new RangeError("concurrency must be an integer from 1 through 32");
    }
    if (options.backoffDelay !== undefined && typeof options.backoffDelay !== "function") {
      throw new TypeError("backoffDelay must be a function");
    }
    this.concurrency = concurrency;
    this.#backoffDelay = options.backoffDelay ?? exponentialBackoff;
  }

  add<T>(
    id: string,
    run: JobFunction<T>,
    options: AddOptions = {},
  ): Promise<T> {
    if (options === null || typeof options !== "object") {
      return Promise.reject(new InvalidJobError("options must be an object"));
    }
    const invalid = this.#validateAddition(id, run, options);
    if (invalid) return Promise.reject(invalid);

    let resolve!: (value: T | PromiseLike<T>) => void;
    let reject!: (error: unknown) => void;
    const promise = new Promise<T>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    const item: Item<T> = {
      id,
      run,
      priority: options.priority ?? 0,
      retries: options.retries ?? 0,
      sequence: this.#sequence++,
      attempt: 0,
      phase: "pending",
      promiseSettled: false,
      cancelled: false,
      resolve,
      reject,
    };
    this.#live.set(id, item as Item);
    this.#insertPending(item as Item);
    this.#emit({ type: "queued", id, priority: item.priority, attempt: 1 });
    this.#pump();
    return promise;
  }

  cancel(id: string): boolean {
    const item = this.#live.get(id);
    if (!item) return false;
    if (item.cancelled) return true;

    item.cancelled = true;
    const phase = item.phase;
    if (phase === "pending") {
      const index = this.#pending.indexOf(item);
      if (index >= 0) this.#pending.splice(index, 1);
      this.#rejectOnce(item, new AbortError(id));
      this.#live.delete(id);
      this.#emit({ type: "cancelled", id, phase: "pending" });
      this.#checkDrain();
      return true;
    }

    if (phase === "retry-waiting") {
      if (item.retryTimer !== undefined) {
        clearTimeout(item.retryTimer);
        item.retryTimer = undefined;
      }
      this.#retryWaiting -= 1;
      this.#rejectOnce(item, new AbortError(id));
      this.#live.delete(id);
      this.#emit({ type: "cancelled", id, phase: "retry-waiting" });
      this.#checkDrain();
      return true;
    }

    item.controller?.abort();
    this.#rejectOnce(item, new AbortError(id));
    this.#emit({ type: "cancelled", id, phase: "running" });
    return true;
  }

  close(): void {
    this.#closed = true;
  }

  drain(): Promise<void> {
    if (this.#live.size === 0) return Promise.resolve();
    return new Promise<void>((resolve) => {
      this.#drainers.add(resolve);
    });
  }

  stats(): Readonly<QueueStats> {
    return Object.freeze({
      pending: this.#pending.length,
      running: this.#running,
      retryWaiting: this.#retryWaiting,
      live: this.#live.size,
    });
  }

  subscribe(listener: QueueEventListener): () => void {
    if (typeof listener !== "function") {
      throw new TypeError("listener must be a function");
    }
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  }

  #validateAddition<T>(
    id: string,
    run: JobFunction<T>,
    options: AddOptions,
  ): Error | undefined {
    if (this.#closed) return new QueueClosedError();
    if (typeof id !== "string" || id.length === 0) {
      return new InvalidJobError("id must be a non-empty string");
    }
    if (typeof run !== "function") {
      return new InvalidJobError("run must be a function");
    }
    if (this.#live.has(id)) return new DuplicateJobIdError(id);
    const priority = options.priority ?? 0;
    const retries = options.retries ?? 0;
    if (!Number.isFinite(priority)) {
      return new InvalidJobError("priority must be a finite number");
    }
    if (!Number.isInteger(retries) || retries < 0) {
      return new InvalidJobError("retries must be a non-negative integer");
    }
    return undefined;
  }

  #insertPending(item: Item): void {
    this.#pending.push(item);
    this.#pending.sort(
      (left, right) =>
        right.priority - left.priority || left.sequence - right.sequence,
    );
  }

  #pump(): void {
    while (this.#running < this.concurrency && this.#pending.length > 0) {
      const item = this.#pending.shift()!;
      if (item.cancelled) continue;
      this.#start(item);
    }
  }

  #start(item: Item): void {
    item.phase = "running";
    item.attempt += 1;
    item.controller = new AbortController();
    this.#running += 1;
    this.#emit({ type: "started", id: item.id, attempt: item.attempt });

    Promise.resolve()
      .then(() => item.run(item.controller!.signal))
      .then(
        (value) => this.#attemptFulfilled(item, value),
        (error) => this.#attemptRejected(item, error),
      )
      .catch(() => {
        // The transition methods are designed not to throw. This final guard
        // prevents an implementation or hostile thenable from becoming unhandled.
      });
  }

  #attemptFulfilled(item: Item, value: unknown): void {
    this.#finishRunningAttempt(item);
    if (item.cancelled) {
      this.#finishCancelledRunning(item);
      return;
    }
    this.#resolveOnce(item, value);
    this.#live.delete(item.id);
    this.#emit({ type: "fulfilled", id: item.id, attempt: item.attempt });
    this.#pump();
    this.#checkDrain();
  }

  #attemptRejected(item: Item, error: unknown): void {
    this.#finishRunningAttempt(item);
    if (item.cancelled) {
      this.#finishCancelledRunning(item);
      return;
    }
    if (item.attempt <= item.retries) {
      this.#scheduleRetry(item, error);
      this.#pump();
      return;
    }
    this.#rejectOnce(item, error);
    this.#live.delete(item.id);
    this.#emit({ type: "rejected", id: item.id, attempt: item.attempt, error });
    this.#pump();
    this.#checkDrain();
  }

  #finishRunningAttempt(item: Item): void {
    this.#running -= 1;
    item.controller = undefined;
  }

  #finishCancelledRunning(item: Item): void {
    this.#live.delete(item.id);
    this.#pump();
    this.#checkDrain();
  }

  #scheduleRetry(item: Item, error: unknown): void {
    const retryNumber = item.attempt;
    const delayMs = this.#backoffDelay(retryNumber);
    if (!Number.isFinite(delayMs) || delayMs < 0) {
      const delayError = new RangeError("backoffDelay must return a finite non-negative number");
      this.#rejectOnce(item, delayError);
      this.#live.delete(item.id);
      this.#emit({ type: "rejected", id: item.id, attempt: item.attempt, error: delayError });
      this.#checkDrain();
      return;
    }

    item.phase = "retry-waiting";
    this.#retryWaiting += 1;
    this.#emit({
      type: "retrying",
      id: item.id,
      attempt: item.attempt + 1,
      delayMs,
      error,
    });
    item.retryTimer = setTimeout(() => {
      item.retryTimer = undefined;
      this.#retryWaiting -= 1;
      if (item.cancelled) {
        this.#checkDrain();
        return;
      }
      item.phase = "pending";
      item.sequence = this.#sequence++;
      this.#insertPending(item);
      this.#emit({
        type: "queued",
        id: item.id,
        priority: item.priority,
        attempt: item.attempt + 1,
      });
      this.#pump();
    }, delayMs);
  }

  #resolveOnce(item: Item, value: unknown): void {
    if (item.promiseSettled) return;
    item.promiseSettled = true;
    item.resolve(value);
  }

  #rejectOnce(item: Item, error: unknown): void {
    if (item.promiseSettled) return;
    item.promiseSettled = true;
    item.reject(error);
  }

  #emit(event: QueueEvent): void {
    const frozen = Object.freeze(event);
    for (const listener of [...this.#listeners]) {
      try {
        listener(frozen);
      } catch {
        // Observers are isolated from scheduler execution.
      }
    }
  }

  #checkDrain(): void {
    if (this.#live.size !== 0) return;
    for (const resolve of this.#drainers) resolve();
    this.#drainers.clear();
  }
}

export type {
  AddOptions,
  JobFunction,
  JobQueueOptions,
  QueueEvent,
  QueueEventListener,
  QueueStats,
} from "./types";
export {
  AbortError,
  DuplicateJobIdError,
  InvalidJobError,
  QueueClosedError,
} from "./errors";
