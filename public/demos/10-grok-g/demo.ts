import {
  JobQueue,
  type JobEvent,
} from "./src/job-queue.ts";

function formatEvent(event: JobEvent): string {
  const delay =
    event.delayMs === undefined ? "" : ` delayMs=${event.delayMs}`;
  return [
    String(event.sequence).padStart(2, "0"),
    event.type.padEnd(10, " "),
    event.id.padEnd(10, " "),
    `priority=${event.priority}`,
    `attempt=${event.attempt}${delay}`,
  ].join("  ");
}

const events: JobEvent[] = [];
const queue = new JobQueue(2, { retryDelayMs: () => 0 });

queue.subscribe((event) => {
  events.push(event);
  console.log(formatEvent(event));
});

console.log("Haunted Queue demonstration");
console.log("concurrency=2 retryDelayMs=0 (deterministic)");
console.log("--- events ---");

let flakyTries = 0;
const jobs = [
  queue.add("paint", () => "painted", { priority: 1 }),
  queue.add("invoice", () => "invoiced", { priority: 5 }),
  queue.add("email", () => "sent", { priority: 5 }),
  queue.add("backup", () => "archived", { priority: 0 }),
  queue.add(
    "flaky",
    () => {
      flakyTries += 1;
      if (flakyTries === 1) {
        throw new Error("transient");
      }
      return "stable";
    },
    { priority: 3, retries: 1 },
  ),
];

const results = await Promise.allSettled(jobs);
await queue.drain();

console.log("--- settlements ---");
const labels = ["paint", "invoice", "email", "backup", "flaky"];
for (let i = 0; i < results.length; i += 1) {
  const result = results[i]!;
  if (result.status === "fulfilled") {
    console.log(`${labels[i]}  fulfilled  ${String(result.value)}`);
  } else {
    console.log(`${labels[i]}  rejected   ${String(result.reason)}`);
  }
}

const stats = queue.stats();
console.log("--- stats ---");
console.log(
  `pending=${stats.pending} running=${stats.running} retryWaiting=${stats.retryWaiting} live=${stats.live}`,
);
console.log(`eventCount=${events.length} flakyTries=${flakyTries}`);
console.log("drain complete; no live jobs remain.");
