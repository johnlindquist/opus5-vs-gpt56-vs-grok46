import { defaultRetryDelay, defaultSchedule } from "./backoff.ts";
import {
  abortError,
  DuplicateJobError,
  InvalidJobError,
  QueueClosedError,
} from "./errors.ts";
import type {
  AddOptions,
  JobEvent,
  JobEventListener,
  JobFunction,
  JobQueueHooks,
  QueueStats,
  RetryDelay,
  Scheduler,
  Unsubscribe,
} from "./types.ts";

export type {
  AddOptions,
  JobEvent,
  JobEventListener,
  JobFunction,
  JobQueueHooks,
  QueueStats,
  Unsubscribe,
} from "./types.ts";

export {
  DuplicateJobError,
  InvalidJobError,
  QueueClosedError,
  QueueError,
  abortError,
  isAbortError,
} from "./errors.ts";

export { retryDelayMs } from "./backoff.ts";

type Phase = "pending" | "running" | "retrying";

type Job<T> = {
  id: string;
  run: JobFunction<T>;
  priority: number;
  retries: number;
  executions: number;
  seq: number;
  resolve: (value: T) => void;
  reject: (error: unknown) => void;
  phase: Phase;
  controller?: AbortController;
  cancelTimer?: () => void;
  settled: boolean;
};

const MAX_CONCURRENCY = 32;

export class JobQueue {
  readonly concurrency: number;

  #pending: Job<unknown>[] = [];
  #live = new Map<string, Job<unknown>>();
  #inFlight = 0;
  #closed = false;
  #drainers: Array<() => void> = [];
  #listeners: JobEventListener[] = [];
  #seq = 0;
  #eventSeq = 0;
  #retryDelayMs: RetryDelay;
  #schedule: Scheduler;

  constructor(concurrency = 2, hooks: JobQueueHooks = {}) {
    if (
      !Number.isInteger(concurrency) ||
      concurrency < 1 ||
      concurrency > MAX_CONCURRENCY
    ) {
      throw new RangeError(
        "concurrency must be an integer from 1 through 32",
      );
    }
    this.concurrency = concurrency;
    this.#retryDelayMs = hooks.retryDelayMs ?? defaultRetryDelay;
    this.#schedule = hooks.schedule ?? defaultSchedule;
  }

  /**
   * Invalid additions (closed queue, duplicate id, bad options) return a
   * rejected promise and never throw synchronously, so callers can handle
   * every `add` failure through the same promise path.
   */
  add<T>(
    id: string,
    run: JobFunction<T>,
    options: AddOptions = {},
  ): Promise<T> {
    const invalid = this.#additionError(id, run, options);
    if (invalid) return Promise.reject(invalid);

    let resolve!: (value: T) => void;
    let reject!: (error: unknown) => void;
    const promise = new Promise<T>((res, rej) => {
      resolve = res;
      reject = rej;
    });

    const job: Job<T> = {
      id,
      run,
      priority: options.priority ?? 0,
      retries: options.retries ?? 0,
      executions: 0,
      seq: ++this.#seq,
      resolve,
      reject,
      phase: "pending",
      settled: false,
    };

    this.#live.set(id, job as Job<unknown>);
    this.#pending.push(job as Job<unknown>);
    this.#emit({
      type: "queued",
      id,
      sequence: 0,
      attempt: 0,
      priority: job.priority,
    });
    this.#pump();
    return promise;
  }

  cancel(id: string): boolean {
    const job = this.#live.get(id);
    if (!job || job.settled) return false;

    if (job.phase === "pending") {
      this.#removePending(job);
      this.#finalize(job, "cancelled", abortError());
      this.#afterStateChange();
      return true;
    }

    if (job.phase === "retrying") {
      job.cancelTimer?.();
      job.cancelTimer = undefined;
      this.#finalize(job, "cancelled", abortError());
      this.#afterStateChange();
      return true;
    }

    if (job.phase === "running") {
      job.controller?.abort();
      this.#finalize(job, "cancelled", abortError());
      return true;
    }

    return false;
  }

  close(): void {
    this.#closed = true;
  }

  drain(): Promise<void> {
    if (this.#isIdle()) return Promise.resolve();
    return new Promise((resolve) => {
      this.#drainers.push(resolve);
    });
  }

  stats(): QueueStats {
    let pending = 0;
    let running = 0;
    let retryWaiting = 0;
    for (const job of this.#live.values()) {
      if (job.phase === "pending") pending += 1;
      else if (job.phase === "running") running += 1;
      else retryWaiting += 1;
    }
    return Object.freeze({
      pending,
      running,
      retryWaiting,
      live: this.#live.size,
    });
  }

  subscribe(listener: JobEventListener): Unsubscribe {
    this.#listeners.push(listener);
    return () => {
      const index = this.#listeners.indexOf(listener);
      if (index >= 0) this.#listeners.splice(index, 1);
    };
  }

  get closed(): boolean {
    return this.#closed;
  }

  #additionError(
    id: string,
    run: JobFunction<unknown>,
    options: AddOptions,
  ): Error | undefined {
    if (this.#closed) return new QueueClosedError();
    if (typeof id !== "string" || id.length === 0) {
      return new InvalidJobError("id must be a non-empty string");
    }
    if (typeof run !== "function") {
      return new InvalidJobError("run must be a function");
    }
    if (this.#live.has(id)) return new DuplicateJobError(id);

    const { priority, retries } = options;
    if (
      priority !== undefined &&
      (typeof priority !== "number" || !Number.isFinite(priority))
    ) {
      return new InvalidJobError("priority must be a finite number");
    }
    if (
      retries !== undefined &&
      (!Number.isInteger(retries) || retries < 0)
    ) {
      return new InvalidJobError("retries must be an integer >= 0");
    }
    return undefined;
  }

  #pump(): void {
    while (this.#inFlight < this.concurrency) {
      const job = this.#takeNext();
      if (!job) break;
      void this.#execute(job);
    }
  }

  #takeNext(): Job<unknown> | undefined {
    if (this.#pending.length === 0) return undefined;
    let best = 0;
    for (let i = 1; i < this.#pending.length; i += 1) {
      const candidate = this.#pending[i]!;
      const current = this.#pending[best]!;
      if (
        candidate.priority > current.priority ||
        (candidate.priority === current.priority &&
          candidate.seq < current.seq)
      ) {
        best = i;
      }
    }
    const [job] = this.#pending.splice(best, 1);
    return job;
  }

  #removePending(job: Job<unknown>): void {
    const index = this.#pending.indexOf(job);
    if (index >= 0) this.#pending.splice(index, 1);
  }

  async #execute(job: Job<unknown>): Promise<void> {
    job.phase = "running";
    job.executions += 1;
    const controller = new AbortController();
    job.controller = controller;
    this.#inFlight += 1;
    this.#emit({
      type: "started",
      id: job.id,
      sequence: 0,
      attempt: job.executions,
      priority: job.priority,
    });

    let success = false;
    let value: unknown;
    let error: unknown;
    try {
      value = await Promise.resolve(job.run(controller.signal));
      success = true;
    } catch (caught) {
      error = caught;
    }

    this.#inFlight -= 1;
    job.controller = undefined;

    if (!job.settled) {
      if (success) {
        this.#finalize(job, "fulfilled", undefined, value);
      } else if (controller.signal.aborted) {
        this.#finalize(job, "cancelled", abortError());
      } else if (job.executions < 1 + job.retries) {
        this.#armRetry(job);
      } else {
        this.#finalize(job, "rejected", error);
      }
    }

    this.#afterStateChange();
  }

  #armRetry(job: Job<unknown>): void {
    const retryAttemptNumber = job.executions;
    const delayMs = this.#retryDelayMs(retryAttemptNumber);
    job.phase = "retrying";
    this.#emit({
      type: "retrying",
      id: job.id,
      sequence: 0,
      attempt: retryAttemptNumber,
      priority: job.priority,
      delayMs,
    });
    job.cancelTimer = this.#schedule(() => {
      job.cancelTimer = undefined;
      if (job.settled || job.phase !== "retrying") return;
      job.phase = "pending";
      this.#pending.push(job);
      this.#pump();
    }, delayMs);
  }

  #finalize(
    job: Job<unknown>,
    type: "fulfilled" | "rejected" | "cancelled",
    error?: unknown,
    value?: unknown,
  ): void {
    if (job.settled) return;
    job.settled = true;
    this.#live.delete(job.id);
    this.#emit({
      type,
      id: job.id,
      sequence: 0,
      attempt: job.executions,
      priority: job.priority,
      error,
    });
    if (type === "fulfilled") {
      job.resolve(value);
    } else {
      job.reject(error);
    }
  }

  #isIdle(): boolean {
    return this.#live.size === 0 && this.#inFlight === 0;
  }

  #afterStateChange(): void {
    if (this.#isIdle()) {
      for (const resolve of this.#drainers.splice(0)) resolve();
    }
    this.#pump();
  }

  #emit(partial: Omit<JobEvent, "sequence"> & { sequence: number }): void {
    const event: JobEvent = {
      ...partial,
      sequence: ++this.#eventSeq,
    };
    for (const listener of this.#listeners.slice()) {
      try {
        listener(event);
      } catch {
        // Listener failures must not affect queue execution.
      }
    }
  }
}
