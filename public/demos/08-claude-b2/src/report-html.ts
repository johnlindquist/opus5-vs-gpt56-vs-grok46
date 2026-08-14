/**
 * Standalone HTML report. No external assets, no server: all data is inlined
 * as JSON and the filtering runs in the page.
 */

import { CODE_DOCS, type Report } from "./types.ts";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Safe to drop inside a <script> block: no closing tag can escape. */
function embedJson(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

const STYLE = `
:root {
  color-scheme: dark;
  --bg: #0e1117;
  --panel: #151b24;
  --panel-2: #1b2330;
  --line: #26303f;
  --text: #e6edf3;
  --muted: #8b98a9;
  --tool: #4c9be8;
  --tool-open: #f0883e;
  --phase: #a371f7;
  --error: #f85149;
  --warning: #e3b341;
  --info: #58a6ff;
  --ok: #3fb950;
}
* { box-sizing: border-box; }
body {
  margin: 0;
  background: var(--bg);
  color: var(--text);
  font: 13px/1.45 ui-sans-serif, -apple-system, "Segoe UI", Roboto, sans-serif;
}
code, .mono { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
header {
  padding: 14px 20px 12px;
  border-bottom: 1px solid var(--line);
  background: linear-gradient(180deg, #131a24, #0e1117);
  display: flex;
  align-items: baseline;
  gap: 14px;
  flex-wrap: wrap;
}
h1 { font-size: 17px; margin: 0; letter-spacing: .2px; }
h1 span { color: var(--muted); font-weight: 400; }
.src { color: var(--muted); font-size: 12px; }
main { padding: 14px 20px 40px; max-width: 1560px; }
.kpis { display: grid; grid-template-columns: repeat(8, 1fr); gap: 8px; margin-bottom: 14px; }
.kpi {
  background: var(--panel); border: 1px solid var(--line); border-radius: 8px; padding: 8px 10px;
}
.kpi b { display: block; font-size: 20px; line-height: 1.2; font-variant-numeric: tabular-nums; }
.kpi span { color: var(--muted); font-size: 11px; text-transform: uppercase; letter-spacing: .5px; }
.kpi.error b { color: var(--error); }
.kpi.warning b { color: var(--warning); }
.kpi.info b { color: var(--info); }
section {
  background: var(--panel); border: 1px solid var(--line); border-radius: 10px;
  padding: 12px 14px; margin-bottom: 14px;
}
section > h2 {
  font-size: 12px; text-transform: uppercase; letter-spacing: .8px; color: var(--muted);
  margin: 0 0 10px;
}
.controls { display: flex; gap: 18px; flex-wrap: wrap; align-items: center; }
.controls fieldset { border: 0; margin: 0; padding: 0; display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
.controls legend, .controls .lbl { color: var(--muted); font-size: 11px; text-transform: uppercase; letter-spacing: .6px; }
label.chk { display: inline-flex; align-items: center; gap: 5px; cursor: pointer; user-select: none; }
input[type=search] {
  background: var(--panel-2); border: 1px solid var(--line); color: var(--text);
  border-radius: 6px; padding: 4px 8px; min-width: 220px;
}
button {
  background: var(--panel-2); border: 1px solid var(--line); color: var(--text);
  border-radius: 6px; padding: 4px 9px; cursor: pointer;
}
button.on { border-color: var(--tool); color: #cfe6ff; }
.lane { border-top: 1px solid var(--line); padding: 8px 0 10px; }
.lane:first-of-type { border-top: 0; }
.lane-head { display: flex; align-items: baseline; gap: 10px; margin-bottom: 6px; flex-wrap: wrap; }
.lane-head .name { font-weight: 600; font-size: 14px; }
.pill { border-radius: 999px; padding: 1px 8px; font-size: 11px; border: 1px solid var(--line); color: var(--muted); }
.pill.ok { color: var(--ok); border-color: #1d4429; background: #11291a; }
.pill.error { color: var(--error); border-color: #58201d; background: #2a1413; }
.pill.incomplete { color: var(--warning); border-color: #4d3d15; background: #26200d; }
.meta { color: var(--muted); font-size: 11.5px; font-variant-numeric: tabular-nums; }
.track { position: relative; background: var(--panel-2); border: 1px solid var(--line); border-radius: 6px; }
.row { position: relative; height: 22px; }
.row + .row { border-top: 1px dashed #202a37; }
.bar {
  position: absolute; top: 3px; height: 16px; border-radius: 4px; overflow: hidden;
  font-size: 10.5px; line-height: 16px; padding: 0 5px; white-space: nowrap; color: #061018;
  min-width: 3px;
}
.bar.tool { background: var(--tool); }
.bar.phase { background: var(--phase); }
.bar.open { background: repeating-linear-gradient(45deg, var(--tool-open), var(--tool-open) 5px, #b4611f 5px, #b4611f 10px); color: #1a0d02; }
.bar.excl { box-shadow: inset 0 0 0 2px #10202e; }
.ticks { position: relative; height: 14px; color: var(--muted); font-size: 10px; }
.tick { position: absolute; top: 0; transform: translateX(-50%); white-space: nowrap; }
.mark { position: absolute; top: 0; bottom: 0; width: 1px; background: rgba(248,81,73,.65); }
table { width: 100%; border-collapse: collapse; font-size: 12.5px; }
th { text-align: left; color: var(--muted); font-weight: 600; font-size: 11px; text-transform: uppercase; letter-spacing: .5px; padding: 4px 8px; border-bottom: 1px solid var(--line); }
td { padding: 4px 8px; border-bottom: 1px solid #1b222c; vertical-align: top; }
tr:hover td { background: #182030; }
td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; }
.sev { font-weight: 700; font-size: 11px; letter-spacing: .4px; }
.sev.error { color: var(--error); }
.sev.warning { color: var(--warning); }
.sev.info { color: var(--info); }
.codes { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
.code-card { background: var(--panel-2); border: 1px solid var(--line); border-radius: 8px; padding: 8px 10px; }
.code-card h3 { margin: 0 0 3px; font-size: 12px; font-family: ui-monospace, monospace; }
.code-card p { margin: 0; color: var(--muted); font-size: 11.5px; }
.legend { display: flex; gap: 14px; flex-wrap: wrap; color: var(--muted); font-size: 11.5px; align-items: center; }
.swatch { display: inline-block; width: 11px; height: 11px; border-radius: 3px; margin-right: 5px; vertical-align: -1px; }
.empty { color: var(--muted); padding: 8px; }
.count { color: var(--muted); font-weight: 400; }
@media (max-width: 1200px) { .kpis { grid-template-columns: repeat(4, 1fr); } .codes { grid-template-columns: repeat(2, 1fr); } }
`;

const SCRIPT = String.raw`
const R = window.__TRACE__;
const $ = (s) => document.querySelector(s);
const fmtMs = (v) => v == null ? "—" : v < 1000 ? v + "ms" : (v / 1000).toFixed(v % 1000 === 0 ? 0 : 1) + "s";
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

const state = {
  sessions: new Set(R.sessions.map((s) => s.session)),
  severities: new Set(["error", "warning", "info"]),
  align: "relative",
  q: "",
};

const parse = (ts) => Date.parse(ts);
const spanEnd = (span, sessionEnd) => (span.end_ts ? parse(span.end_ts) : sessionEnd);

/** Greedy packing so overlapping spans of one kind get their own row. */
function packRows(spans, sessionEnd) {
  const rows = [];
  for (const span of spans) {
    const start = parse(span.start_ts);
    const end = spanEnd(span, sessionEnd);
    let placed = false;
    for (const row of rows) {
      if (row[row.length - 1].end <= start) { row.push({ span, start, end }); placed = true; break; }
    }
    if (!placed) rows.push([{ span, start, end }]);
  }
  return rows;
}

function renderTimeline() {
  const timed = R.sessions.filter((s) => s.start_ts && s.end_ts);
  const shown = timed.filter((s) => state.sessions.has(s.session));
  const globalMin = Math.min(...timed.map((s) => parse(s.start_ts)));
  const globalMax = Math.max(...timed.map((s) => parse(s.end_ts)));
  const maxWall = Math.max(1, ...timed.map((s) => s.wall_clock_ms));
  const html = shown.map((s) => {
    const sStart = parse(s.start_ts);
    const sEnd = parse(s.end_ts);
    const win = state.align === "relative"
      ? { base: sStart, span: maxWall }
      : { base: globalMin, span: Math.max(1, globalMax - globalMin) };
    const pct = (t) => ((t - win.base) / win.span) * 100;
    const rows = [
      ...packRows(s.spans.filter((x) => x.kind === "phase"), sEnd),
      ...packRows(s.spans.filter((x) => x.kind === "tool"), sEnd),
    ];
    const body = (rows.length ? rows : [[]]).map((row) => {
      const bars = row.map(({ span, start, end }) => {
        const left = Math.max(0, pct(start));
        const width = Math.max(0.35, pct(end) - pct(start));
        const cls = ["bar", span.kind, span.complete ? "" : "open", span.exclusive ? "excl" : ""].filter(Boolean).join(" ");
        const dur = span.complete ? fmtMs(span.duration_ms) : "open";
        const title = span.kind + " " + span.span_id + " · " + (span.name || "(unnamed)") + " · " + dur +
          " · lines " + span.start_line + "→" + (span.end_line ?? "—");
        return '<div class="' + cls + '" style="left:' + left.toFixed(3) + '%;width:' + width.toFixed(3) + '%" title="' + esc(title) + '">' +
          esc((span.name || span.span_id) + " · " + dur) + "</div>";
      }).join("");
      return '<div class="row">' + bars + "</div>";
    }).join("");
    // Error markers are only placed when the finding resolves to a known span,
    // so a mark always points at real time rather than at the session origin.
    const marks = R.findings
      .filter((f) => f.session === s.session && f.severity === "error")
      .map((f) => {
        const span = f.span_id ? s.spans.find((x) => x.span_id === f.span_id) : null;
        if (!span) return "";
        return '<div class="mark" style="left:' + Math.max(0, Math.min(100, pct(parse(span.start_ts)))).toFixed(3) +
          '%" title="' + esc(f.code + ": " + f.message) + '"></div>';
      }).join("");
    const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => {
      const rel = state.align === "relative" ? f * maxWall : win.base + f * win.span - sStart;
      const label = state.align === "relative" ? "+" + fmtMs(Math.round(f * maxWall)) : new Date(win.base + f * win.span).toISOString().slice(11, 19) + "Z";
      return '<div class="tick" style="left:' + (f * 100) + '%">' + esc(label) + "</div>";
    }).join("");
    return '<div class="lane" data-session="' + esc(s.session) + '">' +
      '<div class="lane-head"><span class="name">' + esc(s.session) + '</span>' +
      '<span class="pill ' + s.outcome + '">' + esc(s.outcome) + "</span>" +
      '<span class="meta">start ' + esc(s.start_ts) + " · wall " + fmtMs(s.wall_clock_ms) +
      " · tool time " + fmtMs(s.tool_time_ms) + " (" + s.tool_utilization_pct + "%) · peak " + s.peak_concurrent_tools +
      " · events " + s.event_count + " · spans " + s.span_count + " (" + s.incomplete_span_count + " open)" +
      " · lines " + s.first_line + "–" + s.last_line + "</span>" +
      '<span class="meta">' + s.severity_counts.error + " err / " + s.severity_counts.warning + " warn / " + s.severity_counts.info + " info</span>" +
      "</div>" +
      '<div class="track">' + body + marks + "</div>" +
      '<div class="ticks">' + ticks + "</div></div>";
  }).join("");
  $("#timeline").innerHTML = html || '<div class="empty">No sessions selected.</div>';
}

function renderFindings() {
  const q = state.q.toLowerCase();
  const rows = R.findings.filter((f) =>
    state.severities.has(f.severity) &&
    (f.session === null || state.sessions.has(f.session)) &&
    (q === "" || (f.code + " " + f.message + " " + (f.session || "") + " " + (f.span_id || "") + " " + (f.event_id || "")).toLowerCase().includes(q))
  );
  $("#finding-count").textContent = rows.length + " of " + R.findings.length;
  $("#findings-body").innerHTML = rows.length === 0
    ? '<tr><td colspan="6" class="empty">No findings match the current filters.</td></tr>'
    : rows.map((f) =>
        "<tr>" +
        '<td class="num mono">' + f.line + "</td>" +
        '<td class="sev ' + f.severity + '">' + f.severity.toUpperCase() + "</td>" +
        '<td class="mono">' + esc(f.code) + "</td>" +
        "<td>" + esc(f.session || "—") + "</td>" +
        '<td class="mono">' + esc(f.span_id || f.event_id || "—") + "</td>" +
        "<td>" + esc(f.message) + "</td></tr>"
      ).join("");
}

function renderMalformed() {
  const el = $("#malformed-body");
  if (!el) return;
  el.innerHTML = R.malformed_lines.length === 0
    ? '<tr><td colspan="3" class="empty">No malformed lines.</td></tr>'
    : R.malformed_lines.map((m) =>
        '<tr><td class="num mono">' + m.line + "</td><td>" + esc(m.reason) + '</td><td class="mono">' + esc(m.snippet) + "</td></tr>"
      ).join("");
}

function render() { renderTimeline(); renderFindings(); }

document.addEventListener("change", (e) => {
  const t = e.target;
  if (t.dataset.session) {
    t.checked ? state.sessions.add(t.dataset.session) : state.sessions.delete(t.dataset.session);
    render();
  } else if (t.dataset.severity) {
    t.checked ? state.severities.add(t.dataset.severity) : state.severities.delete(t.dataset.severity);
    renderFindings();
  }
});
document.addEventListener("input", (e) => {
  if (e.target.id === "q") { state.q = e.target.value; renderFindings(); }
});
document.addEventListener("click", (e) => {
  const t = e.target;
  if (t.id === "align-rel" || t.id === "align-abs") {
    state.align = t.id === "align-rel" ? "relative" : "absolute";
    $("#align-rel").classList.toggle("on", state.align === "relative");
    $("#align-abs").classList.toggle("on", state.align === "absolute");
    renderTimeline();
  }
  if (t.id === "all-sessions" || t.id === "no-sessions") {
    const on = t.id === "all-sessions";
    document.querySelectorAll("[data-session]").forEach((el) => { el.checked = on; });
    state.sessions = new Set(on ? R.sessions.map((s) => s.session) : []);
    render();
  }
});

renderMalformed();
render();
`;

export function renderHtml(report: Report): string {
  const totals = report.severity_counts;
  const openSpans = report.sessions.reduce((sum, s) => sum + s.incomplete_span_count, 0);

  const kpi = (value: string | number, label: string, cls = "") =>
    `<div class="kpi ${cls}"><b>${escapeHtml(String(value))}</b><span>${escapeHtml(label)}</span></div>`;

  const sessionChecks = report.sessions
    .map(
      (s) =>
        `<label class="chk"><input type="checkbox" data-session="${escapeHtml(s.session)}" checked> ${escapeHtml(
          s.session,
        )}</label>`,
    )
    .join("");

  const severityChecks = (["error", "warning", "info"] as const)
    .map(
      (sev) =>
        `<label class="chk"><input type="checkbox" data-severity="${sev}" checked> <span class="sev ${sev}">${sev.toUpperCase()}</span> (${
          totals[sev]
        })</label>`,
    )
    .join("");

  const usedCodes = new Set(report.findings.map((f) => f.code));
  const codeCards = CODE_DOCS.map((doc) => {
    const count = report.findings.filter((f) => f.code === doc.code).length;
    return `<div class="code-card"><h3><span class="sev ${doc.severity}">${doc.severity.toUpperCase()}</span> ${escapeHtml(
      doc.code,
    )} <span class="count">· ${count} in this run</span></h3><p><b>${escapeHtml(doc.title)}.</b> ${escapeHtml(
      doc.explanation,
    )}</p></div>`;
  }).join("");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Trace Sheriff — ${escapeHtml(report.source)}</title>
<style>${STYLE}</style>
</head>
<body>
<header>
  <h1>Trace Sheriff <span>· agent timeline forensics</span></h1>
  <span class="src mono">${escapeHtml(report.source)}</span>
  <span class="src">${escapeHtml(report.generated_with)} · schema v${report.schema_version} · ${
    usedCodes.size
  } distinct anomaly codes</span>
</header>
<main>
  <div class="kpis">
    ${kpi(report.session_count, "sessions")}
    ${kpi(report.line_count, "lines read")}
    ${kpi(report.valid_event_count, "valid events")}
    ${kpi(report.malformed_line_count, "malformed", report.malformed_line_count > 0 ? "warning" : "")}
    ${kpi(report.finding_count, "findings")}
    ${kpi(totals.error, "errors", "error")}
    ${kpi(totals.warning, "warnings", "warning")}
    ${kpi(openSpans, "open spans", openSpans > 0 ? "warning" : "")}
  </div>

  <section>
    <h2>Filters</h2>
    <div class="controls">
      <fieldset><span class="lbl">Sessions</span>${sessionChecks}
        <button id="all-sessions">all</button><button id="no-sessions">none</button></fieldset>
      <fieldset><span class="lbl">Severity</span>${severityChecks}</fieldset>
      <fieldset><span class="lbl">Timeline</span>
        <button id="align-rel" class="on">aligned to session start</button>
        <button id="align-abs">absolute clock</button></fieldset>
      <fieldset><span class="lbl">Search</span><input id="q" type="search" placeholder="code, message, span…"></fieldset>
    </div>
  </section>

  <section>
    <h2>Timeline</h2>
    <div class="legend">
      <span><span class="swatch" style="background:var(--phase)"></span>phase span</span>
      <span><span class="swatch" style="background:var(--tool)"></span>tool span</span>
      <span><span class="swatch" style="background:var(--tool-open)"></span>never closed</span>
      <span><span class="swatch" style="background:rgba(248,81,73,.65);width:2px"></span>error finding</span>
      <span>hover any bar for span id, name, duration and source lines</span>
    </div>
    <div id="timeline"></div>
  </section>

  <section>
    <h2>Findings <span class="count" id="finding-count"></span></h2>
    <table>
      <thead><tr><th class="num">line</th><th>severity</th><th>code</th><th>session</th><th>span / event</th><th>explanation</th></tr></thead>
      <tbody id="findings-body"></tbody>
    </table>
  </section>

  <section>
    <h2>Malformed lines (${report.malformed_line_count})</h2>
    <table>
      <thead><tr><th class="num">line</th><th>reason</th><th>raw text</th></tr></thead>
      <tbody id="malformed-body"></tbody>
    </table>
  </section>

  <section>
    <h2>Anomaly codes</h2>
    <div class="codes">${codeCards}</div>
  </section>
</main>
<script>window.__TRACE__ = ${embedJson(report)};</script>
<script>${SCRIPT}</script>
</body>
</html>
`;
}
