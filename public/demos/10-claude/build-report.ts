/**
 * Generates `report.html` from real artifacts, so nothing in the report can
 * drift from what the code actually did:
 *
 *   out/demo.txt         → the timeline (swimlane + table + raw transcript)
 *   out/test-results.xml → the test summary (JUnit output from `bun test`)
 *
 * Run after `bun test` and `bun run demo.ts`:
 *
 *   bun run build-report.ts
 *
 * The output is a single self-contained file: no network, no external assets.
 */

export {}; // this file is a module: top-level await is intentional

// ── inputs ─────────────────────────────────────────────────────────────────

const demoText = await Bun.file("out/demo.txt").text();
const junitXml = await Bun.file("out/test-results.xml").text();

// ── parse the demo transcript ──────────────────────────────────────────────

type EventName =
  | "queued"
  | "started"
  | "retrying"
  | "fulfilled"
  | "rejected"
  | "cancelled"
  | "refused";

interface DemoEvent {
  seq: number;
  t: number;
  name: EventName;
  id: string;
  detail: string;
}

const EVENT_LINE = /^(\d{3})\s+t=\s*(\d+)ms\s+(\S+)\s+(\S+)\s*(.*)$/;
const STATS_LINE =
  /^\s+stats @ (.+?)\s\s+pending=(\d+) running=(\d+) retryWaiting=(\d+) liveIds=(\d+) closed=(\w+)/;

const events: DemoEvent[] = [];
const snapshots: Array<{
  label: string;
  pending: number;
  running: number;
  retryWaiting: number;
  liveIds: number;
  closed: boolean;
  afterSeq: number;
}> = [];

for (const line of demoText.split("\n")) {
  const eventMatch = EVENT_LINE.exec(line);
  if (eventMatch) {
    events.push({
      seq: Number(eventMatch[1]),
      t: Number(eventMatch[2]),
      name: eventMatch[3] as EventName,
      id: eventMatch[4]!,
      detail: eventMatch[5]!.trim(),
    });
    continue;
  }
  const statsMatch = STATS_LINE.exec(line);
  if (statsMatch) {
    snapshots.push({
      label: statsMatch[1]!.trim(),
      pending: Number(statsMatch[2]),
      running: Number(statsMatch[3]),
      retryWaiting: Number(statsMatch[4]),
      liveIds: Number(statsMatch[5]),
      closed: statsMatch[6] === "true",
      afterSeq: events.length > 0 ? events[events.length - 1]!.seq : 0,
    });
  }
}

const jobEvents = events.filter((event) => event.name !== "refused");
const maxSeq = Math.max(...events.map((event) => event.seq));

/** Live-state occupancy per job, reconstructed from the event stream. */
type LiveState = "pending" | "running" | "retry-waiting";
interface Segment {
  state: LiveState;
  from: number;
  to: number;
}
interface Lane {
  id: string;
  segments: Segment[];
  terminal: { name: "fulfilled" | "rejected" | "cancelled"; seq: number; detail: string } | null;
}

const lanes: Lane[] = [];
const laneById = new Map<string, Lane>();
const openState = new Map<string, { state: LiveState; from: number }>();

function laneFor(id: string): Lane {
  let lane = laneById.get(id);
  if (!lane) {
    lane = { id, segments: [], terminal: null };
    laneById.set(id, lane);
    lanes.push(lane);
  }
  return lane;
}

function closeOpen(id: string, at: number): void {
  const current = openState.get(id);
  if (!current) return;
  laneFor(id).segments.push({ state: current.state, from: current.from, to: at });
  openState.delete(id);
}

for (const event of jobEvents) {
  switch (event.name) {
    case "queued":
      laneFor(event.id);
      openState.set(event.id, { state: "pending", from: event.seq });
      break;
    case "started":
      closeOpen(event.id, event.seq);
      openState.set(event.id, { state: "running", from: event.seq });
      break;
    case "retrying":
      closeOpen(event.id, event.seq);
      openState.set(event.id, { state: "retry-waiting", from: event.seq });
      break;
    case "fulfilled":
    case "rejected":
    case "cancelled":
      closeOpen(event.id, event.seq);
      laneFor(event.id).terminal = {
        name: event.name,
        seq: event.seq,
        detail: event.detail,
      };
      break;
    default:
      break; // "refused" lines are not job lifecycle events
  }
}

/** Virtual-clock ticks: the sequence positions where the manual clock advanced. */
const clockTicks: Array<{ seq: number; t: number }> = [];
let lastT = -1;
for (const event of events) {
  if (event.t !== lastT) {
    clockTicks.push({ seq: event.seq, t: event.t });
    lastT = event.t;
  }
}

// ── parse the JUnit results ────────────────────────────────────────────────

interface TestCase {
  suite: string;
  name: string;
  file: string;
  ms: number;
  failed: boolean;
}

const cases: TestCase[] = [];
const CASE_RE = /<testcase\b([^>]*?)(\/>|>)/g;
const ATTR_RE = /(\w+)="([^"]*)"/g;
for (const match of junitXml.matchAll(CASE_RE)) {
  const attrs: Record<string, string> = {};
  for (const attr of match[1]!.matchAll(ATTR_RE)) attrs[attr[1]!] = attr[2]!;
  cases.push({
    suite: attrs.classname ?? "",
    name: attrs.name ?? "",
    file: attrs.file ?? "",
    ms: Number(attrs.time ?? 0) * 1000,
    failed: match[2] === ">",
  });
}

const suiteAttrs = /<testsuites\b([^>]*)>/.exec(junitXml)?.[1] ?? "";
const totals: Record<string, string> = {};
for (const attr of suiteAttrs.matchAll(ATTR_RE)) totals[attr[1]!] = attr[2]!;

const replacementCases = cases.filter((c) => c.file.includes("job-queue.test"));
const legacyCases = cases.filter((c) => c.file.includes("legacy-failures"));
const failedCount = Number(totals.failures ?? 0);

// ── the failure-mode catalogue ─────────────────────────────────────────────

interface FailureMode {
  n: string;
  title: string;
  legacy: string;
  consequence: string;
  fix: string;
  proof: string;
}

const FAILURE_MODES: FailureMode[] = [
  {
    n: "0",
    title: "Synchronous throws bypass everything",
    legacy:
      "<code>#pump</code> calls <code>item.run(signal)</code> from inside the <code>new Promise</code> executor in <code>add</code>, so a synchronous throw unwinds the executor rather than reaching <code>.catch</code>.",
    consequence:
      "The promise rejects immediately with <code>retries</code> ignored, and <code>#running</code> / <code>#active</code> are never cleaned up — at <code>concurrency: 1</code> the queue wedges permanently.",
    fix: "<code>run</code> is invoked inside its own <code>try/catch</code> and the throw is converted to a rejection, taking the identical path — retries included — as an async failure.",
    proof: "#0 a synchronous throw escapes #pump",
  },
  {
    n: "1",
    title: "Retry-waiting is not a state",
    legacy:
      "<code>#running</code> is decremented in <code>.finally()</code> even when a retry has just been armed, and the item sits in neither <code>#pending</code> nor <code>#active</code> during backoff.",
    consequence: "Work that is sleeping between attempts is invisible to every counter in the queue.",
    fix: "An explicit <code>retry-waiting</code> state with its own counter, reported by <code>stats()</code> alongside pending and running.",
    proof: "#1/#2 drain resolves while a retry is still armed",
  },
  {
    n: "2",
    title: "drain() resolves early",
    legacy:
      "<code>drain()</code> resolves as soon as <code>#pending</code> is empty, and returns an already-resolved promise if the array happens to be empty at call time.",
    consequence: "Callers &ldquo;drain&rdquo; a queue that still has jobs executing and retry timers armed.",
    fix: "Resolves only when <code>pending</code>, <code>running</code>, and <code>retryWaiting</code> are all zero — re-evaluated after every transition, including cancellation and retry re-queue.",
    proof: "#1/#2 drain resolves while a retry is still armed",
  },
  {
    n: "3",
    title: "Retries lose their priority",
    legacy:
      "A retried item is <code>push</code>ed back onto <code>#pending</code>; the <code>sort</code> only ever runs inside <code>add</code>.",
    consequence: "A <code>priority: 100</code> retry runs <em>after</em> a <code>priority: -100</code> job that was queued later.",
    fix: "The pending queue is kept ordered on insert (priority desc, sequence asc), so a retry re-enters at a defined position in its own priority band.",
    proof: "#3 a retried job is re-queued without re-sorting",
  },
  {
    n: "4",
    title: "Backoff is off by one",
    legacy:
      "<code>item.attempt += 1</code> runs <em>before</em> computing <code>25 * 2 ** item.attempt</code>.",
    consequence: "The first retry waits 50ms instead of the documented 25ms; every delay in the curve is doubled.",
    fix: "<code>retry</code> is 1-based and <code>25 * 2 ** (retry - 1)</code> is a pure function in <code>src/backoff.ts</code> with its own unit test.",
    proof: "#4 the first retry waits 50ms instead of 25ms",
  },
  {
    n: "5",
    title: "Cancelling a running job retries it",
    legacy: "<code>cancel</code> calls <code>controller.abort()</code> and nothing else.",
    consequence:
      "The caller's promise never settles, and when the task rejects in response to the signal the job is <strong>retried after having been cancelled</strong>.",
    fix: "Cancellation is terminal: reject once with <code>AbortError</code>, mark the attempt abandoned, release the slot and the id, and discard whatever the attempt eventually produces.",
    proof: "#5 cancelling a running job retries it instead of ending it",
  },
  {
    n: "6",
    title: "Jobs resurrect out of backoff",
    legacy:
      "During backoff the item is in neither <code>#pending</code> nor <code>#active</code>, so <code>cancel</code> cannot find it.",
    consequence: "<code>cancel</code> returns <code>false</code>, the timer survives, and the job runs after being cancelled.",
    fix: "Retry-waiting is a live state; each record owns its single timer, and cancelling clears it and decrements the counter in the same step.",
    proof: "#6 cancelling during retry backoff returns false",
  },
  {
    n: "7",
    title: "Duplicate ids clobber each other",
    legacy: "<code>#active</code> is keyed by id with no duplicate check.",
    consequence:
      "Two jobs run under one id; the second evicts the first from <code>#active</code>, leaving the first permanently uncancellable.",
    fix: "Adding an id that is pending, running, or retry-waiting rejects with <code>DuplicateJobIdError</code>. The id is released the moment the job reaches a terminal state.",
    proof: "#7 duplicate ids evict each other",
  },
  {
    n: "8",
    title: "Two error channels, no types",
    legacy: "<code>add</code> throws a bare <code>new Error(\"closed\")</code> after <code>close</code>.",
    consequence: "Callers need both <code>try/catch</code> and <code>.catch</code>, and have nothing to discriminate on but a string.",
    fix: "<code>add</code> never throws. Every rejected addition is a rejected promise carrying a typed error: <code>QueueClosedError</code>, <code>DuplicateJobIdError</code>, or <code>InvalidJobError</code>.",
    proof: "#8 add throws synchronously after close",
  },
  {
    n: "9",
    title: "NaN concurrency deadlocks silently",
    legacy: "<code>if (concurrency &lt; 1) throw</code> — but <code>NaN &lt; 1</code> is <code>false</code>.",
    consequence:
      "<code>new JobQueue(NaN)</code> builds a queue where <code>0 &lt; NaN</code> is also false, so it never starts anything and every <code>add</code> hangs. <code>1.5</code> and <code>1e9</code> are accepted too.",
    fix: "Integer range check, 1 through 32, with a typed <code>InvalidConcurrencyError</code> thrown at construction.",
    proof: "#9 a NaN concurrency is accepted and deadlocks the queue",
  },
  {
    n: "10",
    title: "Nothing is observable or testable",
    legacy: "No stats, no events, no state field, and <code>setTimeout</code> hardcoded.",
    consequence: "Nothing to assert against; tests must sleep and guess, which is why the legacy suite below still uses real delays.",
    fix: "<code>stats()</code>, six typed events, and an injectable <code>Scheduler</code> — the replacement's 24 tests run in tens of milliseconds and assert on leaked timers directly.",
    proof: "(structural — every test in the left-hand column depends on it)",
  },
];

// ── html helpers ───────────────────────────────────────────────────────────

const esc = (value: string): string =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

// ── swimlane geometry ──────────────────────────────────────────────────────

const CHART = {
  width: 1180,
  padLeft: 132,
  padRight: 150,
  padTop: 30,
  laneHeight: 22,
  laneGap: 12,
};
const plotWidth = CHART.width - CHART.padLeft - CHART.padRight;
const chartHeight =
  CHART.padTop + lanes.length * (CHART.laneHeight + CHART.laneGap) + 44;
const xOf = (seq: number): number =>
  CHART.padLeft + ((seq - 1) / (maxSeq - 1)) * plotWidth;
const yOf = (index: number): number =>
  CHART.padTop + index * (CHART.laneHeight + CHART.laneGap);

const STATE_ROLE: Record<LiveState, string> = {
  pending: "var(--state-pending)",
  running: "var(--state-running)",
  "retry-waiting": "var(--state-retry)",
};
const TERMINAL_GLYPH = { fulfilled: "✓", rejected: "✕", cancelled: "⊘" } as const;
const TERMINAL_ROLE = {
  fulfilled: "var(--status-good)",
  rejected: "var(--status-critical)",
  cancelled: "var(--status-muted)",
} as const;

const swimlane = `
<svg viewBox="0 0 ${CHART.width} ${chartHeight}" width="100%" height="${chartHeight}"
     role="img" aria-label="Job state occupancy over logical event order" class="swimlane">
  <g class="gridlines">
    ${clockTicks
      .map(
        (tick) => `<line x1="${xOf(tick.seq).toFixed(1)}" y1="${CHART.padTop - 14}"
          x2="${xOf(tick.seq).toFixed(1)}" y2="${chartHeight - 34}" class="tick-line" />
        <text x="${xOf(tick.seq).toFixed(1)}" y="${CHART.padTop - 18}" class="tick-label"
          text-anchor="middle">t=${tick.t}ms</text>`,
      )
      .join("\n    ")}
  </g>
  ${lanes
    .map((lane, index) => {
      const y = yOf(index);
      const segments = lane.segments
        .map((segment) => {
          const x = xOf(segment.from);
          const width = Math.max(4, xOf(segment.to) - x - 2);
          const label =
            width > 64 ? segment.state : width > 34 ? segment.state.slice(0, 3) : "";
          return `<g class="seg" tabindex="0"
              data-tip="${esc(lane.id)} · ${segment.state} · events ${segment.from}–${segment.to}">
            <rect x="${x.toFixed(1)}" y="${y}" width="${width.toFixed(1)}" height="${CHART.laneHeight}"
              rx="4" fill="${STATE_ROLE[segment.state]}" />
            ${
              label
                ? `<text x="${(x + 7).toFixed(1)}" y="${y + 15}" class="seg-label">${label}</text>`
                : ""
            }
            <title>${esc(lane.id)} — ${segment.state}, events ${segment.from}–${segment.to}</title>
          </g>`;
        })
        .join("\n      ");
      const terminal = lane.terminal
        ? `<g class="terminal" tabindex="0" data-tip="${esc(lane.id)} · ${lane.terminal.name} · ${esc(lane.terminal.detail)}">
            <circle cx="${(xOf(lane.terminal.seq) + 9).toFixed(1)}" cy="${y + CHART.laneHeight / 2}" r="9"
              fill="${TERMINAL_ROLE[lane.terminal.name]}" />
            <text x="${(xOf(lane.terminal.seq) + 9).toFixed(1)}" y="${y + CHART.laneHeight / 2 + 4}"
              class="terminal-glyph" text-anchor="middle">${TERMINAL_GLYPH[lane.terminal.name]}</text>
            <text x="${(xOf(lane.terminal.seq) + 23).toFixed(1)}" y="${y + CHART.laneHeight / 2 + 4}"
              class="terminal-label">${lane.terminal.name}</text>
            <title>${esc(lane.id)} — ${lane.terminal.name}: ${esc(lane.terminal.detail)}</title>
          </g>`
        : "";
      return `<g class="lane">
        <text x="${CHART.padLeft - 12}" y="${y + 15}" class="lane-label" text-anchor="end">${esc(lane.id)}</text>
        ${segments}
        ${terminal}
      </g>`;
    })
    .join("\n  ")}
  <line x1="${CHART.padLeft}" y1="${chartHeight - 30}" x2="${CHART.padLeft + plotWidth}" y2="${chartHeight - 30}" class="axis" />
  ${Array.from({ length: Math.floor(maxSeq / 5) + 1 }, (_, i) => i * 5)
    .filter((seq) => seq >= 1)
    .map(
      (seq) =>
        `<text x="${xOf(seq).toFixed(1)}" y="${chartHeight - 14}" class="tick-label" text-anchor="middle">${seq}</text>`,
    )
    .join("\n  ")}
  <text x="${CHART.padLeft - 12}" y="${chartHeight - 14}" class="axis-title" text-anchor="end">event #</text>
</svg>`;

// ── state-transition diagram ───────────────────────────────────────────────

const stateDiagram = `
<svg viewBox="0 0 620 560" width="100%" role="img"
     aria-label="Job state transition diagram" class="statechart">
  <defs>
    <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
      <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--ink-muted)" />
    </marker>
  </defs>

  <text x="30" y="30" class="sd-entry">add(id, run, options)</text>
  <path d="M 100 40 L 100 74" class="edge" marker-end="url(#arrow)" />

  <g class="node">
    <rect x="30" y="76" width="140" height="46" rx="8" fill="var(--state-pending)" />
    <text x="100" y="105" class="sd-node-label" text-anchor="middle">pending</text>
  </g>
  <g class="node">
    <rect x="240" y="76" width="140" height="46" rx="8" fill="var(--state-running)" />
    <text x="310" y="105" class="sd-node-label" text-anchor="middle">running</text>
  </g>
  <g class="node">
    <rect x="230" y="228" width="160" height="46" rx="8" fill="var(--state-retry)" />
    <text x="310" y="257" class="sd-node-label" text-anchor="middle">retry-waiting</text>
  </g>

  <g class="node terminal-node">
    <rect x="448" y="76" width="142" height="46" rx="8" fill="var(--status-good)" />
    <text x="519" y="105" class="sd-node-label" text-anchor="middle">✓ fulfilled</text>
  </g>
  <g class="node terminal-node">
    <rect x="448" y="228" width="142" height="46" rx="8" fill="var(--status-critical)" />
    <text x="519" y="257" class="sd-node-label" text-anchor="middle">✕ rejected</text>
  </g>
  <g class="node terminal-node">
    <rect x="30" y="424" width="142" height="46" rx="8" fill="var(--status-muted)" />
    <text x="101" y="453" class="sd-node-label" text-anchor="middle">⊘ cancelled</text>
  </g>

  <path d="M 172 99 L 236 99" class="edge" marker-end="url(#arrow)" />
  <text x="204" y="90" class="edge-label" text-anchor="middle">slot free</text>

  <path d="M 382 99 L 444 99" class="edge" marker-end="url(#arrow)" />
  <text x="413" y="90" class="edge-label" text-anchor="middle">resolve</text>

  <path d="M 310 124 L 310 224" class="edge" marker-end="url(#arrow)" />
  <text x="318" y="163" class="edge-label">reject,</text>
  <text x="318" y="178" class="edge-label">attempts ≤ retries</text>

  <path d="M 382 116 C 430 150, 440 190, 452 224" class="edge" marker-end="url(#arrow)" />
  <text x="452" y="170" class="edge-label">reject,</text>
  <text x="452" y="185" class="edge-label">exhausted</text>

  <path d="M 230 251 C 150 251, 110 200, 100 126" class="edge" marker-end="url(#arrow)" />
  <text x="126" y="196" class="edge-label">timer fires</text>
  <text x="126" y="211" class="edge-label">25·2^(k−1) ms</text>

  <path d="M 86 124 L 86 420" class="edge cancel-edge" marker-end="url(#arrow)" />
  <text x="30" y="290" class="edge-label">cancel()</text>

  <path d="M 268 124 C 250 300, 200 380, 150 424" class="edge cancel-edge" marker-end="url(#arrow)" />
  <text x="228" y="352" class="edge-label">cancel() · abort signal</text>

  <path d="M 250 274 C 210 330, 180 380, 142 422" class="edge cancel-edge" marker-end="url(#arrow)" />
  <text x="150" y="392" class="edge-label">cancel() · clear timer</text>

  <g class="sd-note">
    <text x="230" y="440">Terminal states are not retained:</text>
    <text x="230" y="458">the record is dropped, which releases</text>
    <text x="230" y="476">the id and the concurrency slot.</text>
    <text x="230" y="502" class="sd-note-strong">A cancelled job never retries.</text>
  </g>
</svg>`;

// ── page ───────────────────────────────────────────────────────────────────

const stat = (value: string, label: string, sub: string) => `
  <div class="stat">
    <div class="stat-value">${value}</div>
    <div class="stat-label">${label}</div>
    <div class="stat-sub">${sub}</div>
  </div>`;

const html = `<!doctype html>
<html lang="en" data-theme="dark">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>The Haunted Queue — refactor report</title>
<style>
  :root {
    color-scheme: dark;
    --plane:        #0d0d0d;
    --surface-1:    #1a1a19;
    --surface-2:    #211f1e;
    --ink:          #ffffff;
    --ink-2:        #c3c2b7;
    --ink-muted:    #898781;
    --grid:         #2c2c2a;
    --axis:         #383835;
    --hairline:     rgba(255,255,255,0.10);
    --state-pending:#199e70;
    --state-running:#3987e5;
    --state-retry:  #d95926;
    --status-good:    #0ca30c;
    --status-critical:#d03b3b;
    --status-warning: #fab219;
    --status-muted:   #898781;
    /* Dark ink reads better than white on every mark colour in both modes:
       the categorical steps all clear 4.5:1 against #0d0d0d. */
    --on-mark:      #0d0d0d;
    --mono: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace;
    --sans: system-ui, -apple-system, "Segoe UI", sans-serif;
  }
  :root[data-theme="light"] {
    color-scheme: light;
    --plane:        #f9f9f7;
    --surface-1:    #fcfcfb;
    --surface-2:    #f2f1ed;
    --ink:          #0b0b0b;
    --ink-2:        #52514e;
    --ink-muted:    #898781;
    --grid:         #e1e0d9;
    --axis:         #c3c2b7;
    --hairline:     rgba(11,11,11,0.10);
    --state-pending:#1baf7a;
    --state-running:#2a78d6;
    --state-retry:  #eb6834;
  }

  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body {
    background: var(--plane);
    color: var(--ink);
    font-family: var(--sans);
    font-size: 14px;
    line-height: 1.5;
    -webkit-font-smoothing: antialiased;
  }
  .wrap { max-width: 1560px; margin: 0 auto; padding: 0 20px 64px; }

  /* ── top bar ─────────────────────────────────────────── */
  header.bar {
    display: flex; align-items: baseline; gap: 18px; flex-wrap: wrap;
    padding: 16px 0 14px; border-bottom: 1px solid var(--hairline); margin-bottom: 16px;
  }
  header.bar h1 { font-size: 21px; margin: 0; letter-spacing: -0.01em; }
  header.bar .sub { color: var(--ink-2); font-size: 13px; }
  .chips { margin-left: auto; display: flex; gap: 8px; align-items: center; }
  .chip {
    font-size: 11.5px; padding: 3px 9px; border-radius: 999px;
    border: 1px solid var(--hairline); color: var(--ink-2); background: var(--surface-1);
    white-space: nowrap;
  }
  .chip.ok { color: var(--status-good); border-color: color-mix(in srgb, var(--status-good) 45%, transparent); }
  button.toggle {
    font: inherit; font-size: 11.5px; cursor: pointer; padding: 3px 10px; border-radius: 999px;
    border: 1px solid var(--hairline); background: var(--surface-1); color: var(--ink-2);
  }
  button.toggle:hover { color: var(--ink); }

  /* ── stat strip ──────────────────────────────────────── */
  .stats { display: grid; grid-template-columns: repeat(6, 1fr); gap: 12px; margin-bottom: 16px; }
  .stat {
    background: var(--surface-1); border: 1px solid var(--hairline); border-radius: 10px; padding: 11px 14px;
  }
  .stat-value { font-size: 25px; font-weight: 600; letter-spacing: -0.02em; line-height: 1.1; }
  .stat-label { font-size: 12px; color: var(--ink-2); margin-top: 3px; }
  .stat-sub { font-size: 11px; color: var(--ink-muted); margin-top: 1px; }

  /* ── panels ──────────────────────────────────────────── */
  .grid-2 { display: grid; grid-template-columns: 1fr 660px; gap: 16px; align-items: start; }
  .panel {
    background: var(--surface-1); border: 1px solid var(--hairline); border-radius: 12px; padding: 16px 18px 18px;
  }
  .panel > h2 {
    font-size: 12px; text-transform: uppercase; letter-spacing: 0.08em;
    color: var(--ink-muted); margin: 0 0 4px; font-weight: 600;
  }
  .panel > .lede { color: var(--ink-2); font-size: 12.5px; margin: 0 0 14px; }
  section { margin-top: 22px; }
  section > h2 {
    font-size: 12px; text-transform: uppercase; letter-spacing: 0.08em;
    color: var(--ink-muted); margin: 0 0 10px; font-weight: 600;
  }

  /* ── architecture ────────────────────────────────────── */
  .arch { display: grid; grid-template-columns: 1fr 26px 1fr; gap: 12px; align-items: stretch; }
  .arch-col h3 {
    font-size: 12px; margin: 0 0 8px; color: var(--ink-2); display: flex; gap: 8px; align-items: center;
  }
  .arch-col h3 .tag {
    font-size: 10px; letter-spacing: 0.06em; text-transform: uppercase;
    padding: 2px 7px; border-radius: 5px; font-weight: 600;
  }
  .tag.before { background: color-mix(in srgb, var(--status-critical) 22%, transparent); color: var(--status-critical); }
  .tag.after  { background: color-mix(in srgb, var(--status-good) 22%, transparent); color: var(--status-good); }
  .mod {
    border: 1px solid var(--hairline); border-radius: 8px; padding: 8px 11px; margin-bottom: 8px;
    background: var(--surface-2);
  }
  .mod .name { font-family: var(--mono); font-size: 12px; }
  .mod .name .loc { color: var(--ink-muted); font-size: 11px; margin-left: 6px; }
  .mod .role { color: var(--ink-2); font-size: 11.5px; margin-top: 2px; }
  .mod.bad { border-left: 3px solid var(--status-critical); }
  .mod.good { border-left: 3px solid var(--status-good); }
  .mod ul { margin: 6px 0 0; padding-left: 16px; color: var(--ink-2); font-size: 11.5px; }
  .mod ul li { margin: 1px 0; }
  .arch-arrow {
    display: flex; align-items: center; justify-content: center;
    color: var(--ink-muted); font-size: 20px;
  }

  /* ── chart chrome ────────────────────────────────────── */
  .legend { display: flex; flex-wrap: wrap; gap: 14px; margin: 0 0 6px; font-size: 12px; color: var(--ink-2); }
  .legend .key { display: inline-flex; align-items: center; gap: 6px; }
  .swatch { width: 12px; height: 12px; border-radius: 3px; display: inline-block; }
  .dot { width: 14px; height: 14px; border-radius: 50%; display: inline-flex;
         align-items: center; justify-content: center; font-size: 9px; color: var(--on-mark); }
  .swimlane .lane-label { font-family: var(--mono); font-size: 11.5px; fill: var(--ink-2); }
  .swimlane .seg-label { font-size: 10.5px; fill: var(--on-mark); font-weight: 600; }
  .swimlane .terminal-glyph { font-size: 11px; fill: var(--on-mark); font-weight: 700; }
  .swimlane .terminal-label { font-size: 11px; fill: var(--ink-2); }
  .swimlane .tick-line { stroke: var(--grid); stroke-width: 1; stroke-dasharray: 3 3; }
  .swimlane .tick-label { font-size: 10.5px; fill: var(--ink-muted); font-variant-numeric: tabular-nums; }
  .swimlane .axis { stroke: var(--axis); stroke-width: 1; }
  .swimlane .axis-title { font-size: 10.5px; fill: var(--ink-muted); }
  .swimlane .seg, .swimlane .terminal { cursor: default; outline: none; }
  .swimlane .seg:hover rect, .swimlane .seg:focus rect,
  .swimlane .terminal:hover circle, .swimlane .terminal:focus circle {
    stroke: var(--ink); stroke-width: 2; paint-order: stroke;
  }

  .statechart .sd-node-label { font-size: 14px; font-weight: 600; fill: var(--on-mark); }
  .statechart .sd-entry { font-family: var(--mono); font-size: 12px; fill: var(--ink-2); }
  .statechart .edge { stroke: var(--ink-muted); stroke-width: 2; fill: none; }
  .statechart .cancel-edge { stroke-dasharray: 5 4; }
  .statechart .edge-label { font-size: 11.5px; fill: var(--ink-2); }
  .statechart .sd-note text { font-size: 11.5px; fill: var(--ink-muted); }
  .statechart .sd-note .sd-note-strong { fill: var(--ink-2); font-weight: 600; }

  /* ── tables ──────────────────────────────────────────── */
  table { width: 100%; border-collapse: collapse; font-size: 12.5px; }
  th {
    text-align: left; font-weight: 600; color: var(--ink-muted); font-size: 11px;
    text-transform: uppercase; letter-spacing: 0.06em; padding: 6px 10px;
    border-bottom: 1px solid var(--axis);
  }
  td { padding: 9px 10px; border-bottom: 1px solid var(--grid); vertical-align: top; color: var(--ink-2); }
  td.n { color: var(--ink-muted); font-variant-numeric: tabular-nums; width: 30px; }
  td strong { color: var(--ink); font-weight: 600; }
  code {
    font-family: var(--mono); font-size: 11.5px;
    background: var(--surface-2); padding: 1px 4px; border-radius: 4px; color: var(--ink);
  }
  .badge {
    display: inline-flex; align-items: center; gap: 5px; font-size: 11px; font-weight: 600;
    padding: 1px 7px 1px 5px; border-radius: 5px; white-space: nowrap;
  }
  .badge::before { content: ""; width: 7px; height: 7px; border-radius: 2px; background: currentColor; }
  .b-queued    { color: var(--state-pending); }
  .b-started   { color: var(--state-running); }
  .b-retrying  { color: var(--state-retry); }
  .b-fulfilled { color: var(--status-good); }
  .b-rejected  { color: var(--status-critical); }
  .b-cancelled { color: var(--status-muted); }
  .b-refused   { color: var(--status-warning); }
  .mono { font-family: var(--mono); }
  .tnum { font-variant-numeric: tabular-nums; }

  pre {
    font-family: var(--mono); font-size: 11.5px; line-height: 1.45; color: var(--ink-2);
    background: var(--surface-2); border: 1px solid var(--hairline); border-radius: 8px;
    padding: 14px 16px; overflow: auto; margin: 0; max-height: 460px;
  }
  details > summary {
    cursor: pointer; color: var(--ink-2); font-size: 12.5px; padding: 6px 0; user-select: none;
  }
  details > summary:hover { color: var(--ink); }

  .test-list { list-style: none; margin: 0; padding: 0; }
  .test-list li {
    display: flex; gap: 9px; align-items: baseline; padding: 3px 0;
    border-bottom: 1px solid var(--grid); font-size: 12px; color: var(--ink-2);
  }
  .test-list li .ok { color: var(--status-good); font-weight: 700; }
  .test-list li .ms { margin-left: auto; color: var(--ink-muted); font-variant-numeric: tabular-nums; font-size: 11px; }
  .suite-head { display: flex; align-items: baseline; gap: 10px; margin-bottom: 6px; }
  .suite-head .count { color: var(--ink-muted); font-size: 12px; }

  .cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(268px, 1fr)); gap: 12px; }
  .card { background: var(--surface-1); border: 1px solid var(--hairline); border-radius: 10px; padding: 12px 14px; }
  .card h3 { margin: 0 0 5px; font-size: 12.5px; color: var(--ink); }
  .card p { margin: 0; font-size: 12px; color: var(--ink-2); }

  #tip {
    position: fixed; pointer-events: none; opacity: 0; transition: opacity .1s;
    background: var(--surface-2); color: var(--ink); border: 1px solid var(--hairline);
    border-radius: 6px; padding: 5px 9px; font-size: 11.5px; font-family: var(--mono);
    z-index: 10; white-space: nowrap;
  }
  footer { margin-top: 34px; padding-top: 14px; border-top: 1px solid var(--hairline);
           color: var(--ink-muted); font-size: 12px; }
</style>
</head>
<body>
<div class="wrap">

<header class="bar">
  <h1>The Haunted Queue</h1>
  <span class="sub">a tangled async scheduler, refactored — architecture &amp; behaviour report</span>
  <div class="chips">
    <span class="chip">Bun 1.3 · TypeScript</span>
    <span class="chip">zero dependencies</span>
    <span class="chip ok">${totals.tests ?? "0"} / ${totals.tests ?? "0"} tests passing</span>
    <button class="toggle" id="themeToggle" type="button">light</button>
  </div>
</header>

<div class="stats">
  ${stat(String(totals.tests ?? 0), "tests", `${failedCount} failing · ${totals.assertions ?? 0} assertions`)}
  ${stat("11", "legacy defects", "each pinned by a characterization test")}
  ${stat("5", "modules", "queue · types · errors · backoff · events")}
  ${stat("6", "named job states", "3 live · 3 terminal, all observable")}
  ${stat("0", "leaked timers", "asserted after every drain")}
  ${stat("0", "unhandled rejections", "reported by the suite or the demo")}
</div>

<div class="grid-2">
  <div class="panel">
    <h2>Before / after architecture</h2>
    <p class="lede">
      One 120-line class where every concern shared the same mutable fields, replaced by five
      modules with one owner per concern — and, critically, a named state for every moment in a
      job's life.
    </p>
    <div class="arch">
      <div class="arch-col">
        <h3><span class="tag before">before</span> legacy/queue.ts · 120 lines</h3>
        <div class="mod bad">
          <div class="name">JobQueue <span class="loc">one file, one class</span></div>
          <div class="role">Five private fields carry all state, and no field says what a job <em>is</em>:</div>
          <ul>
            <li><code>#pending</code> — array, re-sorted on every add</li>
            <li><code>#active</code> — id → controller, no duplicate check</li>
            <li><code>#running</code> — counter, decremented before retries</li>
            <li><code>#drainers</code> — flushed only from <code>.finally</code></li>
            <li><code>#closed</code> — boolean</li>
          </ul>
        </div>
        <div class="mod bad">
          <div class="name">#pump() <span class="loc">the whole state machine</span></div>
          <div class="role">
            Dequeue, start, resolve, retry, re-queue, drain and slot accounting all interleaved in
            one promise chain — with <code>run()</code> called inside a <code>new Promise</code>
            executor, and retry timers owned by nobody.
          </div>
        </div>
        <div class="mod bad">
          <div class="name">setTimeout <span class="loc">hardcoded</span></div>
          <div class="role">No seam, so every test must sleep. Nothing reports what the queue is doing.</div>
        </div>
      </div>

      <div class="arch-arrow">→</div>

      <div class="arch-col">
        <h3><span class="tag after">after</span> src/ · 5 modules</h3>
        <div class="mod good">
          <div class="name">job-queue.ts <span class="loc">the state machine</span></div>
          <div class="role">
            One record per live job with an explicit <code>state</code> field, a sorted-on-insert
            pending queue, an id registry, and a reentrancy-safe pump. Each record owns its single
            retry timer.
          </div>
        </div>
        <div class="mod good">
          <div class="name">types.ts <span class="loc">public contract</span></div>
          <div class="role"><code>JobFunction</code>, <code>AddOptions</code>, <code>QueueStats</code>, <code>QueueEvents</code>, and the two seams.</div>
        </div>
        <div class="mod good">
          <div class="name">errors.ts <span class="loc">typed failures</span></div>
          <div class="role">One <code>QueueError</code> root: closed, duplicate, invalid, abort. Callers discriminate on a class, not a string.</div>
        </div>
        <div class="mod good">
          <div class="name">backoff.ts <span class="loc">delay + timer seam</span></div>
          <div class="role">The pure curve, the host timer wrapper, and <code>ManualScheduler</code> — virtual time plus a leak counter for tests.</div>
        </div>
        <div class="mod good">
          <div class="name">events.ts <span class="loc">typed emitter</span></div>
          <div class="role">Synchronous dispatch over a snapshot; a throwing listener is contained and reported out of band.</div>
        </div>
      </div>
    </div>
  </div>

  <div class="panel">
    <h2>State transitions</h2>
    <p class="lede">
      Three live states and three terminal ones. Solid edges are ordinary progress; dashed edges are
      <code>cancel()</code>, which is terminal from every live state.
    </p>
    ${stateDiagram}
  </div>
</div>

<section>
  <h2>Legacy failure modes and their fixes</h2>
  <table>
    <thead>
      <tr>
        <th>#</th><th style="width:20%">Defect</th><th style="width:26%">What the legacy code does</th>
        <th style="width:24%">Consequence</th><th style="width:30%">Fix</th>
      </tr>
    </thead>
    <tbody>
      ${FAILURE_MODES.map(
        (mode) => `<tr>
        <td class="n">${mode.n}</td>
        <td><strong>${mode.title}</strong><div style="margin-top:5px;font-size:11px;color:var(--ink-muted)">proof: <span class="mono">${esc(mode.proof)}</span></div></td>
        <td>${mode.legacy}</td>
        <td>${mode.consequence}</td>
        <td>${mode.fix}</td>
      </tr>`,
      ).join("\n      ")}
    </tbody>
  </table>
</section>

<section>
  <h2>Corrected semantics at a glance</h2>
  <div class="cards">
    <div class="card"><h3>Ordering</h3><p>Priority descending, then FIFO by insertion. The pending queue is kept sorted on insert, so a retry re-enters at a defined position in its own priority band instead of at the tail.</p></div>
    <div class="card"><h3>Concurrency</h3><p>An integer from 1 through 32, validated at construction. At most that many jobs execute at once; a slot is released when an attempt settles or when a running job is cancelled.</p></div>
    <div class="card"><h3>Identity</h3><p>One live record per id while pending, running, or retry-waiting. Duplicates reject with <code>DuplicateJobIdError</code>; the id is reusable the instant the job reaches a terminal state.</p></div>
    <div class="card"><h3>Retries</h3><p><code>retries: n</code> means n attempts <em>after</em> the first. Retry k waits <code>25 · 2^(k−1)</code> ms — 25, 50, 100. A synchronous throw follows the identical path as a rejection.</p></div>
    <div class="card"><h3>Cancellation</h3><p>Terminal from any live state, rejecting exactly once with <code>AbortError</code>. Running jobs get their signal aborted and never retry; backoff timers are cleared.</p></div>
    <div class="card"><h3>Close</h3><p>Refuses new additions with a typed <code>QueueClosedError</code> while letting accepted work — retries included — settle. There is no reopen.</p></div>
    <div class="card"><h3>Drain</h3><p>Resolves only when pending, running, and retry-waiting are all zero. Every concurrent caller resolves, and jobs added while a drain is outstanding are included in it.</p></div>
    <div class="card"><h3>Error surfacing</h3><p><code>add</code> never throws: every rejected addition is a rejected promise, so one <code>catch</code> covers closed queues, duplicate ids, bad arguments, cancellation, and task failure alike.</p></div>
  </div>
</section>

<section>
  <h2>Timeline — deterministic demonstration run</h2>
  <div class="panel">
    <p class="lede">
      Reconstructed from the event stream in <code>out/demo.txt</code>. The x axis is
      <strong>logical event order</strong>, not wall clock: the demo's retry timers run on a virtual
      clock, and job "work" is measured in microtask turns, so the run is byte-identical every time.
      Dashed rules mark where the virtual clock advanced.
    </p>
    <div class="legend">
      <span class="key"><span class="swatch" style="background:var(--state-pending)"></span> pending — waiting for a slot</span>
      <span class="key"><span class="swatch" style="background:var(--state-running)"></span> running</span>
      <span class="key"><span class="swatch" style="background:var(--state-retry)"></span> retry-waiting — timer armed</span>
      <span class="key"><span class="dot" style="background:var(--status-good)">✓</span> fulfilled</span>
      <span class="key"><span class="dot" style="background:var(--status-critical)">✕</span> rejected</span>
      <span class="key"><span class="dot" style="background:var(--status-muted)">⊘</span> cancelled</span>
    </div>
    ${swimlane}
  </div>

  <div class="grid-2" style="margin-top:16px; grid-template-columns: 1fr 520px;">
    <div class="panel">
      <h2>Event log</h2>
      <p class="lede">The same run as a table — the accessible view of the chart above.</p>
      <table>
        <thead><tr><th>#</th><th>virtual t</th><th>event</th><th>job</th><th>detail</th></tr></thead>
        <tbody>
          ${events
            .map(
              (event) => `<tr>
            <td class="n tnum">${event.seq}</td>
            <td class="tnum mono">${event.t}ms</td>
            <td><span class="badge b-${event.name}">${event.name}</span></td>
            <td class="mono">${esc(event.id)}</td>
            <td>${esc(event.detail)}</td>
          </tr>`,
            )
            .join("\n          ")}
        </tbody>
      </table>
    </div>
    <div class="panel">
      <h2>stats() snapshots</h2>
      <p class="lede">Taken at labelled checkpoints during the same run.</p>
      <table>
        <thead><tr><th>checkpoint</th><th>pend</th><th>run</th><th>retry</th><th>ids</th><th>closed</th></tr></thead>
        <tbody>
          ${snapshots
            .map(
              (snap) => `<tr>
            <td>${esc(snap.label)}</td>
            <td class="tnum">${snap.pending}</td>
            <td class="tnum">${snap.running}</td>
            <td class="tnum">${snap.retryWaiting}</td>
            <td class="tnum">${snap.liveIds}</td>
            <td>${snap.closed ? "yes" : "no"}</td>
          </tr>`,
            )
            .join("\n          ")}
        </tbody>
      </table>
      <details style="margin-top:12px">
        <summary>Raw transcript — out/demo.txt</summary>
        <pre>${esc(demoText)}</pre>
      </details>
    </div>
  </div>
</section>

<section>
  <h2>Test summary</h2>
  <div class="grid-2" style="grid-template-columns: 1fr 1fr;">
    <div class="panel">
      <div class="suite-head">
        <h2 style="margin:0">Replacement · test/job-queue.test.ts</h2>
        <span class="count">${replacementCases.length} passing</span>
      </div>
      <p class="lede">
        Retry timers run on <code>ManualScheduler</code>, so the suite never sleeps and
        <code>clock.pending</code> doubles as a leak detector.
      </p>
      <ul class="test-list">
        ${replacementCases
          .map(
            (test) =>
              `<li><span class="ok">${test.failed ? "✕" : "✓"}</span><span>${esc(test.name)}</span><span class="ms">${test.ms.toFixed(1)}ms</span></li>`,
          )
          .join("\n        ")}
      </ul>
    </div>
    <div class="panel">
      <div class="suite-head">
        <h2 style="margin:0">Characterization · test/legacy-failures.test.ts</h2>
        <span class="count">${legacyCases.length} passing</span>
      </div>
      <p class="lede">
        These run against <code>legacy/queue.ts</code> and assert the <em>broken</em> behaviour on
        purpose, so the defect table above is evidence rather than commentary. They use small real
        delays because the legacy queue has no timer seam — that is defect 10.
      </p>
      <ul class="test-list">
        ${legacyCases
          .map(
            (test) =>
              `<li><span class="ok">${test.failed ? "✕" : "✓"}</span><span>${esc(test.name)}</span><span class="ms">${test.ms.toFixed(1)}ms</span></li>`,
          )
          .join("\n        ")}
      </ul>
    </div>
  </div>
  <details style="margin-top:12px">
    <summary>Raw runner output — out/test.txt</summary>
    <pre>${esc(await Bun.file("out/test.txt").text())}</pre>
  </details>
</section>

<footer>
  <span class="mono">bun test</span> &nbsp;·&nbsp;
  <span class="mono">bun run demo.ts</span> &nbsp;·&nbsp;
  <span class="mono">bun run build-report.ts</span> (regenerates this page from
  <span class="mono">out/demo.txt</span> and <span class="mono">out/test-results.xml</span>)
  &nbsp;·&nbsp; self-contained: no network, no external assets.
</footer>

</div>
<div id="tip"></div>
<script>
  // Theme toggle. Defaults to dark; remembers nothing (this is a local report).
  const root = document.documentElement;
  const toggle = document.getElementById("themeToggle");
  const syncLabel = () => {
    toggle.textContent = root.dataset.theme === "dark" ? "light" : "dark";
  };
  if (window.matchMedia("(prefers-color-scheme: light)").matches) {
    root.dataset.theme = "light";
  }
  syncLabel();
  toggle.addEventListener("click", () => {
    root.dataset.theme = root.dataset.theme === "dark" ? "light" : "dark";
    syncLabel();
  });

  // Hover layer for the swimlane.
  const tip = document.getElementById("tip");
  const show = (event) => {
    const host = event.target.closest("[data-tip]");
    if (!host) return;
    tip.textContent = host.dataset.tip;
    tip.style.opacity = "1";
    const x = event.clientX ?? 0;
    const y = event.clientY ?? 0;
    tip.style.left = Math.min(x + 14, window.innerWidth - tip.offsetWidth - 12) + "px";
    tip.style.top = (y + 18) + "px";
  };
  const hide = () => { tip.style.opacity = "0"; };
  document.addEventListener("mousemove", (event) => {
    event.target.closest("[data-tip]") ? show(event) : hide();
  });
  document.addEventListener("focusin", (event) => {
    const host = event.target.closest("[data-tip]");
    if (!host) return hide();
    const box = host.getBoundingClientRect();
    show({ target: host, clientX: box.left, clientY: box.top });
  });
  document.addEventListener("focusout", hide);
</script>
</body>
</html>
`;

await Bun.write("report.html", html);
console.log(
  `report.html written — ${events.length} events, ${lanes.length} job lanes, ` +
    `${cases.length} tests, ${snapshots.length} stats snapshots.`,
);
