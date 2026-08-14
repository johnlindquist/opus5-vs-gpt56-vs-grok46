export type JobFunction<T> = (
  signal: AbortSignal,
) => Promise<T> | T;

export interface AddOptions {
  priority?: number;
  retries?: number;
}

type Item<T> = {
  id: string;
  run: JobFunction<T>;
  priority: number;
  retries: number;
  attempt: number;
  resolve: (value: T | PromiseLike<T>) => void;
  reject: (error: unknown) => void;
};

export class JobQueue {
  #pending: Item<any>[] = [];
  #active = new Map<
    string,
    { item: Item<any>; controller: AbortController }
  >();
  #running = 0;
  #closed = false;
  #drainers: Array<() => void> = [];

  constructor(readonly concurrency = 2) {
    if (concurrency < 1) throw new Error("bad concurrency");
  }

  add<T>(
    id: string,
    run: JobFunction<T>,
    options: AddOptions = {},
  ): Promise<T> {
    if (this.#closed) throw new Error("closed");
    return new Promise<T>((resolve, reject) => {
      this.#pending.push({
        id,
        run,
        priority: options.priority || 0,
        retries: options.retries || 0,
        attempt: 0,
        resolve,
        reject,
      });
      this.#pending.sort((a, b) => b.priority - a.priority);
      this.#pump();
    });
  }

  cancel(id: string): boolean {
    const pendingIndex = this.#pending.findIndex(
      (item) => item.id === id,
    );
    if (pendingIndex >= 0) {
      this.#pending.splice(pendingIndex, 1);
      return true;
    }
    const active = this.#active.get(id);
    if (active) {
      active.controller.abort();
      return true;
    }
    return false;
  }

  close(): void {
    this.#closed = true;
  }

  drain(): Promise<void> {
    if (this.#pending.length === 0) {
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      this.#drainers.push(resolve);
    });
  }

  #pump(): void {
    while (
      this.#running < this.concurrency &&
      this.#pending.length > 0
    ) {
      const item = this.#pending.shift()!;
      const controller = new AbortController();
      this.#running += 1;
      this.#active.set(item.id, { item, controller });
      Promise.resolve(item.run(controller.signal))
        .then((value) => {
          item.resolve(value);
        })
        .catch((error) => {
          if (item.attempt < item.retries) {
            item.attempt += 1;
            setTimeout(() => {
              this.#pending.push(item);
              this.#pump();
            }, 25 * 2 ** item.attempt);
          } else {
            item.reject(error);
          }
        })
        .finally(() => {
          this.#running -= 1;
          this.#active.delete(item.id);
          if (this.#pending.length === 0) {
            for (const resolve of this.#drainers.splice(0)) {
              resolve();
            }
          }
          this.#pump();
        });
    }
  }
}
