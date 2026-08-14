import { ANOMALY_CODES, type AnalysisReport, type Finding, type SessionReport, type SpanRecord } from "./types.ts";

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function attr(value: string): string {
  return escapeHtml(value);
}

function fmtMs(ms: number): string {
  if (ms < 1000) {
    return `${ms} ms`;
  }
  return `${(ms / 1000).toFixed(ms >= 10000 ? 1 : 3)} s`;
}

function sessionWindow(sessions: SessionReport[]): { min: number; max: number } {
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (const session of sessions) {
    const start = session.start_ts ? Date.parse(session.start_ts) : null;
    const end = session.end_ts ? Date.parse(session.end_ts) : session.tools.concat(session.phases).reduce((acc, span) => {
      const ts = span.end_ts ?? span.start_ts;
      return ts ? Math.max(acc, Date.parse(ts)) : acc;
    }, start ?? 0);
    if (start !== null && Number.isFinite(start)) {
      min = Math.min(min, start);
    }
    if (end !== null && Number.isFinite(end)) {
      max = Math.max(max, end);
    }
    for (const span of [...session.tools, ...session.phases]) {
      if (span.start_ts) {
        min = Math.min(min, Date.parse(span.start_ts));
      }
      if (span.end_ts) {
        max = Math.max(max, Date.parse(span.end_ts));
      }
    }
  }
  if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min) {
    return { min: 0, max: 1 };
  }
  return { min, max: max + 1 };
}

function pct(ms: number, range: { min: number; max: number }): number {
  return ((ms - range.min) / (range.max - range.min)) * 100;
}

function spanBar(span: SpanRecord, range: { min: number; max: number }, kind: "tool" | "phase"): string {
  if (!span.start_ts) {
    return "";
  }
  const start = Date.parse(span.start_ts);
  const end = span.end_ts ? Date.parse(span.end_ts) : range.max;
  const left = Math.max(0, pct(start, range));
  const right = Math.min(100, pct(end, range));
  const width = Math.max(0.6, right - left);
  const exclusive = (span.name ?? "").startsWith("exclusive:") ? " exclusive" : "";
  const open = span.complete ? "" : " open";
  const label = escapeHtml(`${span.name ?? span.span_id}`);
  const title = escapeHtml(
    `${span.kind} ${span.span_id} ${span.name ?? ""} ${span.start_ts} → ${span.end_ts ?? "open"}`,
  );
  return `<div class="bar ${kind}${exclusive}${open}" style="left:${left.toFixed(3)}%;width:${width.toFixed(3)}%" title="${title}"><span>${label}</span></div>`;
}

function findingRow(finding: Finding): string {
  return `<tr data-session="${attr(finding.session ?? "")}" data-severity="${attr(finding.severity)}" data-code="${attr(finding.code)}">
  <td><span class="sev ${finding.severity}">${finding.severity}</span></td>
  <td class="mono">${escapeHtml(finding.code)}</td>
  <td class="num">${finding.line}</td>
  <td>${escapeHtml(finding.session ?? "—")}</td>
  <td class="mono">${escapeHtml(finding.event_id ?? "—")}</td>
  <td class="mono">${escapeHtml(finding.span_id ?? "—")}</td>
  <td>${escapeHtml(finding.message)}</td>
</tr>`;
}

function sessionCard(session: SessionReport, range: { min: number; max: number }): string {
  const bars = [
    ...session.phases.map((span) => spanBar(span, range, "phase")),
    ...session.tools.map((span) => spanBar(span, range, "tool")),
  ].join("");
  const counts = Object.entries(session.event_counts)
    .filter(([, n]) => n > 0)
    .map(([k, n]) => `<li><span>${escapeHtml(k)}</span><b>${n}</b></li>`)
    .join("");
  const idle = session.idle_gaps
    .map((gap) => `<li>${escapeHtml(gap.start_ts.slice(11, 23))}–${escapeHtml(gap.end_ts.slice(11, 23))} (${fmtMs(gap.duration_ms)})</li>`)
    .join("") || "<li>none</li>";
  const incomplete =
    session.incomplete_spans.length === 0
      ? "<li>none</li>"
      : session.incomplete_spans
          .map((span) => `<li>${escapeHtml(span.kind)} ${escapeHtml(span.span_id)}</li>`)
          .join("");
  return `<article class="session-card" data-session="${attr(session.id)}" id="session-${attr(session.id)}">
  <header>
    <h2>${escapeHtml(session.id)}</h2>
    <span class="outcome ${attr(session.outcome)}">${escapeHtml(session.outcome)}</span>
  </header>
  <p class="window">${escapeHtml(session.start_ts ?? "?")} → ${escapeHtml(session.end_ts ?? "open")}</p>
  <dl class="metrics">
    <div><dt>Wall</dt><dd>${fmtMs(session.wall_clock_duration_ms)}</dd></div>
    <div><dt>Tool time</dt><dd>${fmtMs(session.tool_time_ms)}</dd></div>
    <div><dt>Peak tools</dt><dd>${session.peak_concurrent_tools}</dd></div>
  </dl>
  <div class="track" aria-label="Timeline for ${attr(session.id)}">${bars}</div>
  <div class="split">
    <div>
      <h3>Events</h3>
      <ul class="counts">${counts}</ul>
    </div>
    <div>
      <h3>Idle gaps</h3>
      <ul>${idle}</ul>
    </div>
    <div>
      <h3>Incomplete</h3>
      <ul>${incomplete}</ul>
    </div>
  </div>
</article>`;
}

export function formatHtml(report: AnalysisReport): string {
  const range = sessionWindow(report.sessions);
  const ticks: string[] = [];
  const span = range.max - range.min;
  for (let i = 0; i <= 4; i += 1) {
    const t = range.min + (span * i) / 4;
    ticks.push(
      `<span style="left:${(i * 25).toFixed(1)}%">${escapeHtml(new Date(t).toISOString().slice(11, 23))}Z</span>`,
    );
  }
  const glossary = Object.entries(ANOMALY_CODES)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(
      ([code, meta]) => `<tr>
  <td class="mono">${escapeHtml(code)}</td>
  <td><span class="sev ${meta.severity}">${meta.severity}</span></td>
  <td>${escapeHtml(meta.title)}</td>
  <td>${escapeHtml(meta.explanation)}</td>
</tr>`,
    )
    .join("");
  const sessionOptions = report.sessions
    .map((session) => `<option value="${attr(session.id)}">${escapeHtml(session.id)}</option>`)
    .join("");
  const malformed = report.findings.filter((f) => f.code === "MALFORMED_JSON");
  const malformedBlock =
    malformed.length === 0
      ? "<p class=\"empty\">No malformed lines.</p>"
      : `<ul class="malformed">${malformed
          .map((f) => `<li><span class="mono">L${f.line}</span> ${escapeHtml(f.message)}</li>`)
          .join("")}</ul>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Trace Sheriff — ${escapeHtml(report.source)}</title>
<style>
  :root {
    --bg: #12151c;
    --bg-2: #1b2130;
    --ink: #e8edf7;
    --muted: #9aa6bd;
    --line: #2a3348;
    --gold: #e2b340;
    --phase: #5b8def;
    --tool: #3ecf8e;
    --exclusive: #ff7a59;
    --open: #f0c14b;
    --error: #ff5d6c;
    --warning: #f4b942;
    --info: #6cb6ff;
  }
  * { box-sizing: border-box; }
  html, body { margin: 0; background: var(--bg); color: var(--ink); font: 14px/1.45 "IBM Plex Sans", "Segoe UI", sans-serif; }
  body { min-height: 100vh; }
  header.hero {
    padding: 28px 32px 18px;
    border-bottom: 1px solid var(--line);
    background: linear-gradient(180deg, #1c2436 0%, var(--bg) 100%);
  }
  .badge { display: inline-flex; gap: 8px; align-items: center; letter-spacing: 0.12em; text-transform: uppercase; font-size: 11px; color: var(--gold); }
  .star { width: 14px; height: 14px; background: var(--gold); clip-path: polygon(50% 0, 61% 35%, 98% 35%, 68% 57%, 79% 91%, 50% 70%, 21% 91%, 32% 57%, 2% 35%, 39% 35%); }
  h1 { margin: 8px 0 6px; font-size: 28px; font-weight: 650; }
  .lede { color: var(--muted); max-width: 70ch; }
  .stats { display: flex; flex-wrap: wrap; gap: 18px; margin-top: 16px; }
  .stat { background: var(--bg-2); border: 1px solid var(--line); border-radius: 10px; min-width: 120px; padding: 10px 14px; }
  .stat b { display: block; font-size: 20px; }
  .stat span { color: var(--muted); font-size: 12px; }
  main { padding: 20px 32px 48px; }
  .axis { position: relative; height: 22px; margin: 8px 0 14px; color: var(--muted); font-size: 11px; font-variant-numeric: tabular-nums; }
  .axis span { position: absolute; transform: translateX(-50%); }
  .axis span:first-child { transform: none; }
  .axis span:last-child { transform: translateX(-100%); }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
  .session-card { background: var(--bg-2); border: 1px solid var(--line); border-radius: 14px; padding: 14px 16px 16px; min-height: 240px; }
  .session-card header { display: flex; justify-content: space-between; align-items: center; }
  .session-card h2 { margin: 0; font-size: 20px; }
  .window { color: var(--muted); font-variant-numeric: tabular-nums; margin: 4px 0 10px; }
  .outcome { font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em; padding: 4px 8px; border-radius: 999px; border: 1px solid var(--line); }
  .outcome.ok { color: var(--tool); }
  .outcome.error { color: var(--error); }
  .outcome.incomplete, .outcome.unknown { color: var(--warning); }
  .metrics { display: flex; gap: 16px; margin: 0 0 10px; }
  .metrics div { margin: 0; }
  .metrics dt { color: var(--muted); font-size: 11px; }
  .metrics dd { margin: 0; font-weight: 650; }
  .track { position: relative; height: 54px; background: #10141d; border: 1px solid var(--line); border-radius: 8px; overflow: hidden; }
  .bar { position: absolute; top: 8px; height: 16px; border-radius: 4px; overflow: hidden; white-space: nowrap; font-size: 10px; padding: 1px 6px; color: #081018; }
  .bar.phase { background: var(--phase); top: 8px; }
  .bar.tool { background: var(--tool); top: 30px; }
  .bar.exclusive { background: var(--exclusive); }
  .bar.open { outline: 1px dashed var(--open); background-image: repeating-linear-gradient(135deg, transparent, transparent 4px, rgba(0,0,0,.18) 4px, rgba(0,0,0,.18) 8px); }
  .split { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px; margin-top: 10px; }
  .split h3 { margin: 0 0 4px; font-size: 11px; color: var(--muted); text-transform: uppercase; letter-spacing: 0.08em; }
  ul { margin: 0; padding-left: 16px; }
  .counts { list-style: none; padding: 0; }
  .counts li { display: flex; justify-content: space-between; gap: 8px; }
  .filters { display: flex; flex-wrap: wrap; gap: 12px; align-items: end; margin: 28px 0 12px; }
  label { display: flex; flex-direction: column; gap: 4px; color: var(--muted); font-size: 12px; }
  select { background: var(--bg-2); color: var(--ink); border: 1px solid var(--line); border-radius: 8px; padding: 8px 10px; }
  table { width: 100%; border-collapse: collapse; background: var(--bg-2); border: 1px solid var(--line); border-radius: 12px; overflow: hidden; }
  th, td { text-align: left; padding: 8px 10px; border-bottom: 1px solid var(--line); vertical-align: top; }
  th { font-size: 11px; color: var(--muted); letter-spacing: 0.06em; text-transform: uppercase; }
  .mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px; }
  .num { font-variant-numeric: tabular-nums; }
  .sev { display: inline-block; padding: 2px 7px; border-radius: 999px; font-size: 11px; text-transform: uppercase; }
  .sev.error { background: rgba(255,93,108,.18); color: var(--error); }
  .sev.warning { background: rgba(244,185,66,.16); color: var(--warning); }
  .sev.info { background: rgba(108,182,255,.16); color: var(--info); }
  .malformed { background: #23181c; border: 1px solid #4a2a32; border-radius: 10px; padding: 10px 16px; }
  h2.section { margin: 28px 0 8px; font-size: 18px; }
  .hidden { display: none !important; }
  @media (max-width: 1100px) { .grid, .split { grid-template-columns: 1fr; } main, header.hero { padding-left: 16px; padding-right: 16px; } }
</style>
</head>
<body>
<header class="hero">
  <div class="badge"><span class="star"></span> Trace Sheriff · local forensics</div>
  <h1>Agent timeline reconstruction</h1>
  <p class="lede">Self-contained report for <span class="mono">${escapeHtml(report.source)}</span>. Four concurrent sessions, span reconstruction, and structural anomalies — including every malformed line.</p>
  <div class="stats">
    <div class="stat"><b>${report.line_count}</b><span>Lines</span></div>
    <div class="stat"><b>${report.valid_event_count}</b><span>Valid events</span></div>
    <div class="stat"><b>${report.malformed_line_count}</b><span>Malformed</span></div>
    <div class="stat"><b>${report.session_count}</b><span>Sessions</span></div>
    <div class="stat"><b>${report.finding_count}</b><span>Findings</span></div>
    <div class="stat"><b>${report.severity_counts.error}/${report.severity_counts.warning}/${report.severity_counts.info}</b><span>Error / warn / info</span></div>
  </div>
</header>
<main>
  <h2 class="section">Shared wall-clock</h2>
  <div class="axis">${ticks.join("")}</div>
  <div class="grid" id="session-grid">
    ${report.sessions.map((session) => sessionCard(session, range)).join("\n")}
  </div>

  <h2 class="section">Malformed input</h2>
  ${malformedBlock}

  <div class="filters">
    <label>Session
      <select id="session-filter">
        <option value="">All sessions</option>
        ${sessionOptions}
      </select>
    </label>
    <label>Severity
      <select id="severity-filter">
        <option value="">All severities</option>
        <option value="error">error</option>
        <option value="warning">warning</option>
        <option value="info">info</option>
      </select>
    </label>
  </div>

  <h2 class="section">Findings</h2>
  <table>
    <thead>
      <tr>
        <th>Severity</th><th>Code</th><th>Line</th><th>Session</th><th>Event</th><th>Span</th><th>Explanation</th>
      </tr>
    </thead>
    <tbody id="findings-body">
      ${report.findings.map(findingRow).join("\n")}
    </tbody>
  </table>

  <h2 class="section">Anomaly codes</h2>
  <table>
    <thead><tr><th>Code</th><th>Default severity</th><th>Title</th><th>Meaning</th></tr></thead>
    <tbody>${glossary}</tbody>
  </table>
</main>
<script>
(function () {
  const sessionFilter = document.getElementById("session-filter");
  const severityFilter = document.getElementById("severity-filter");
  const rows = Array.from(document.querySelectorAll("#findings-body tr"));
  const cards = Array.from(document.querySelectorAll(".session-card"));
  function apply() {
    const session = sessionFilter.value;
    const severity = severityFilter.value;
    for (const card of cards) {
      card.classList.toggle("hidden", Boolean(session) && card.getAttribute("data-session") !== session);
    }
    for (const row of rows) {
      const rowSession = row.getAttribute("data-session") || "";
      const sessionMatch = !session || rowSession === session || rowSession === "";
      const severityMatch = !severity || row.getAttribute("data-severity") === severity;
      row.classList.toggle("hidden", !(sessionMatch && severityMatch));
    }
  }
  sessionFilter.addEventListener("change", apply);
  severityFilter.addEventListener("change", apply);
})();
</script>
</body>
</html>
`;
}
