import { JobQueue, type QueueEvent } from "./src/job-queue";

function describe(event: QueueEvent): string {
  switch (event.type) {
    case "queued":
      return `queued    ${event.id} priority=${event.priority} attempt=${event.attempt}`;
    case "started":
      return `started   ${event.id} attempt=${event.attempt}`;
    case "retrying":
      return `retrying  ${event.id} nextAttempt=${event.attempt} delay=${event.delayMs}ms`;
    case "fulfilled":
      return `fulfilled ${event.id} attempt=${event.attempt}`;
    case "rejected":
      return `rejected  ${event.id} attempt=${event.attempt}`;
    case "cancelled":
      return `cancelled ${event.id} phase=${event.phase}`;
  }
}

const queue = new JobQueue(1, { backoffDelay: () => 0 });
queue.subscribe((event) => console.log(describe(event)));

let release!: () => void;
const gate = new Promise<void>((resolve) => {
  release = resolve;
});

const control = queue.add("control", () => gate, { priority: 100 });
const low = queue.add("low", () => "low-result", { priority: 1 });
let flakyAttempt = 0;
const flaky = queue.add(
  "flaky-high",
  () => {
    flakyAttempt += 1;
    if (flakyAttempt === 1) throw new Error("planned first-attempt failure");
    return "flaky-result";
  },
  { priority: 5, retries: 1 },
);
const high = queue.add("high-fifo", () => "high-result", { priority: 5 });

console.log("release   control");
release();
const results = await Promise.all([control, low, flaky, high]);
await queue.drain();
console.log(`results   ${JSON.stringify(results)}`);
console.log(`stats     ${JSON.stringify(queue.stats())}`);
