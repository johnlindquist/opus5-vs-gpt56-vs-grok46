import type { AnalysisSummary, SessionSummary, Severity } from "./types";

const CODE_HELP: Record<string, string> = {
  MALFORMED_JSON: "A source line could not be parsed as JSON.",
  MISSING_REQUIRED_FIELD: "A record lacks a field required by its event type.",
  UNKNOWN_EVENT_TYPE: "The event type is outside the supported event model.",
  INVALID_TIMESTAMP: "The timestamp cannot be interpreted as an ISO date.",
  DUPLICATE_EVENT_ID: "An event_id appears more than once in the file.",
  TIMESTAMP_REVERSAL: "Time moved backward within one session's source order.",
  ORPHAN_TOOL_END: "A tool_end has no earlier open tool_start with that span_id.",
  ORPHAN_PHASE_END: "A phase_end has no earlier open phase_start with that span_id.",
  OPEN_TOOL_SPAN: "A tool_start was not closed before the input ended.",
  OPEN_PHASE_SPAN: "A phase_start was not closed before the input ended.",
  MISSING_SESSION_END: "The session has no session_end record.",
  MULTIPLE_SESSION_START: "The session declares its start more than once.",
  EXCLUSIVE_TOOL_OVERLAP: "Two exclusive-prefixed tools were open simultaneously.",
};

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function formatMs(ms: number | null): string {
  if (ms === null) return "—";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(ms % 1000 === 0 ? 1 : 2)}s`;
}

function sessionCard(session: SessionSummary): string {
  const startMs = session.start_ts ? Date.parse(session.start_ts) : Math.min(...session.events.map((event) => event.timestamp_ms));
  const observedEnd = session.end_ts
    ? Date.parse(session.end_ts)
    : Math.max(startMs + 1, ...session.events.map((event) => event.timestamp_ms));
  const range = Math.max(1, observedEnd - startMs);
  const rows = session.spans.map((span) => {
    const left = Math.max(0, Math.min(100, ((Date.parse(span.start_ts) - startMs) / range) * 100));
    const end = span.end_ts ? Date.parse(span.end_ts) : observedEnd;
    const width = Math.max(1.2, Math.min(100 - left, ((end - Date.parse(span.start_ts)) / range) * 100));
    return `<div class="span-row">
      <div class="span-label"><span class="kind ${span.kind}">${span.kind}</span><span title="${escapeHtml(span.span_id)}">${escapeHtml(span.name)}</span></div>
      <div class="track"><div class="bar ${span.kind}${span.incomplete ? " open" : ""}" style="left:${left.toFixed(3)}%;width:${width.toFixed(3)}%" title="${escapeHtml(span.span_id)} · ${formatMs(span.duration_ms)}"></div></div>
    </div>`;
  }).join("");
  const eventTicks = session.events.map((event) => {
    const left = Math.max(0, Math.min(100, ((event.timestamp_ms - startMs) / range) * 100));
    return `<i style="left:${left.toFixed(3)}%" title="L${event.line} ${escapeHtml(event.type)}"></i>`;
  }).join("");
  return `<article class="session-card" data-session="${escapeHtml(session.session)}">
    <div class="session-head">
      <div><h2>${escapeHtml(session.session)}</h2><span class="outcome ${escapeHtml(session.outcome)}">${escapeHtml(session.outcome)}</span></div>
      <div class="metric"><b>${formatMs(session.wall_clock_ms)}</b><span>wall</span></div>
      <div class="metric"><b>${formatMs(session.tool_time_ms)}</b><span>tool sum</span></div>
      <div class="metric"><b>${session.peak_concurrent_tools}</b><span>peak tools</span></div>
      <div class="metric"><b>${session.event_count}</b><span>events</span></div>
    </div>
    <div class="axis"><span>0</span><div>${eventTicks}</div><span>${formatMs(session.wall_clock_ms)}</span></div>
    <div class="span-list">${rows || '<div class="empty">No phase or tool spans</div>'}</div>
  </article>`;
}

export function terminalReport(summary: AnalysisSummary): string {
  const lines = [
    `Trace Sheriff — ${summary.source}`,
    `${summary.line_count} lines · ${summary.valid_event_count} valid events · ${summary.malformed_line_count} malformed · ${summary.session_count} sessions`,
    `Findings: ${summary.finding_count} (${summary.severity_counts.error} error, ${summary.severity_counts.warning} warning, ${summary.severity_counts.info} info)`,
    "",
    "Sessions",
  ];
  for (const session of summary.sessions) {
    lines.push(
      `  ${session.session.padEnd(12)} ${session.outcome.padEnd(10)} wall ${formatMs(session.wall_clock_ms).padEnd(8)} tools ${formatMs(session.tool_time_ms).padEnd(8)} peak ${session.peak_concurrent_tools}  events ${session.event_count}  open ${session.incomplete_span_count}`,
    );
  }
  if (summary.findings.length) {
    lines.push("", "Findings");
    for (const item of summary.findings) {
      lines.push(
        `  L${String(item.line).padEnd(4)} ${item.severity.toUpperCase().padEnd(7)} ${item.code.padEnd(24)} ${item.session ? `[${item.session}] ` : ""}${item.message}`,
      );
    }
  }
  return `${lines.join("\n")}\n`;
}

export function htmlReport(summary: AnalysisSummary): string {
  const sessionOptions = summary.sessions
    .map((session) => `<option value="${escapeHtml(session.session)}">${escapeHtml(session.session)}</option>`)
    .join("");
  const cards = summary.sessions.map(sessionCard).join("");
  const findingRows = summary.findings.map((item) => `<tr data-session="${escapeHtml(item.session ?? "")}" data-severity="${item.severity}">
    <td><span class="sev ${item.severity}">${item.severity}</span></td><td>L${item.line}</td><td><code>${escapeHtml(item.code)}</code></td>
    <td>${escapeHtml(item.session ?? "global")}</td><td>${escapeHtml(item.message)}</td><td>${escapeHtml(item.related_id ?? "—")}</td>
  </tr>`).join("");
  const malformedRows = summary.malformed_lines.map((item) => `<tr>
    <td>L${item.line}</td><td><code>${escapeHtml(item.text)}</code></td><td>${escapeHtml(item.error)}</td>
  </tr>`).join("");
  const codeRows = Object.entries(CODE_HELP).map(([code, help]) =>
    `<div><code>${code}</code><span>${escapeHtml(help)}</span></div>`).join("");
  const embedded = JSON.stringify(summary).replaceAll("<", "\\u003c");
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Trace Sheriff · ${escapeHtml(summary.source)}</title>
<style>
:root{color-scheme:dark;--bg:#0a0d12;--panel:#111720;--line:#263243;--muted:#93a1b5;--text:#eef4ff;--cyan:#59d8ff;--purple:#a98cff;--red:#ff667a;--amber:#ffc45f;--green:#63e6a5}
*{box-sizing:border-box}body{margin:0;background:radial-gradient(circle at 15% 0,#172234 0,transparent 34%),var(--bg);color:var(--text);font:14px/1.45 ui-monospace,SFMono-Regular,Menlo,monospace}
main{max-width:1540px;margin:auto;padding:28px 34px 52px}header{display:flex;justify-content:space-between;align-items:flex-end;border-bottom:1px solid var(--line);padding-bottom:20px}
.eyebrow{color:var(--cyan);letter-spacing:.15em;text-transform:uppercase;font-size:11px}h1{font-size:30px;margin:4px 0 2px;letter-spacing:-.04em}header p{margin:0;color:var(--muted)}
.stamp{border:1px solid var(--green);color:var(--green);padding:8px 12px;transform:rotate(-1deg);text-transform:uppercase;font-weight:800}
.stats{display:grid;grid-template-columns:repeat(6,1fr);gap:10px;margin:20px 0}.stat{background:#101620cc;border:1px solid var(--line);padding:14px;border-radius:8px}.stat b{display:block;font-size:23px}.stat span{color:var(--muted);font-size:11px;text-transform:uppercase}
.controls{display:flex;gap:12px;align-items:center;margin:20px 0 12px}.controls label{color:var(--muted)}select{background:var(--panel);color:var(--text);border:1px solid var(--line);padding:7px 30px 7px 9px;border-radius:5px}
.legend{margin-left:auto;color:var(--muted);display:flex;gap:14px}.dot{width:9px;height:9px;display:inline-block;border-radius:2px;margin-right:5px}.dot.tool{background:var(--cyan)}.dot.phase{background:var(--purple)}
.grid{display:grid;grid-template-columns:1fr 1fr;gap:14px}.session-card{border:1px solid var(--line);background:linear-gradient(145deg,#121a25,#0f141c);padding:16px;border-radius:9px;min-height:210px}
.session-head{display:grid;grid-template-columns:1.5fr repeat(4,.72fr);gap:10px;align-items:start}.session-head h2{display:inline;margin:0 8px 0 0;font-size:20px}.outcome{font-size:10px;padding:3px 6px;border:1px solid var(--line);border-radius:10px;color:var(--amber)}.outcome.ok{color:var(--green)}.outcome.error,.outcome.incomplete{color:var(--red)}
.metric b,.metric span{display:block}.metric b{font-size:14px}.metric span{font-size:9px;color:var(--muted);text-transform:uppercase}
.axis{display:grid;grid-template-columns:32px 1fr 45px;align-items:center;color:var(--muted);font-size:9px;margin-top:18px}.axis>div{height:14px;border-bottom:1px solid var(--line);position:relative}.axis i{position:absolute;bottom:-3px;width:1px;height:6px;background:#64748b}
.span-row{display:grid;grid-template-columns:150px 1fr;gap:8px;align-items:center;margin-top:7px}.span-label{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-size:11px}.kind{display:inline-block;width:39px;font-size:8px;text-transform:uppercase;margin-right:6px;color:var(--purple)}.kind.tool{color:var(--cyan)}
.track{height:10px;background:#0a0f16;border-radius:3px;position:relative}.bar{height:100%;position:absolute;border-radius:2px}.bar.tool{background:var(--cyan)}.bar.phase{background:var(--purple)}.bar.open{background:repeating-linear-gradient(90deg,var(--amber) 0 5px,transparent 5px 8px);outline:1px solid var(--amber)}
section{margin-top:30px}h3{font-size:17px;margin:0 0 10px}.table-wrap{overflow:auto;border:1px solid var(--line);border-radius:8px}table{width:100%;border-collapse:collapse;background:#0e141d}th,td{text-align:left;padding:9px 10px;border-bottom:1px solid #1c2633;vertical-align:top}th{color:var(--muted);font-size:10px;text-transform:uppercase;position:sticky;top:0;background:#121923}td code{color:#d5e2f5}.sev{font-size:9px;text-transform:uppercase;font-weight:800}.sev.error{color:var(--red)}.sev.warning{color:var(--amber)}.sev.info{color:var(--cyan)}
.codes{display:grid;grid-template-columns:1fr 1fr;gap:1px;background:var(--line);border:1px solid var(--line);border-radius:8px;overflow:hidden}.codes>div{display:grid;grid-template-columns:190px 1fr;gap:8px;background:#0e141d;padding:9px}.codes span{color:var(--muted)}.malformed code{color:var(--red);white-space:pre-wrap}.empty{color:var(--muted);padding:15px}.hidden{display:none!important}
@media(max-width:1000px){main{padding:20px}.grid{grid-template-columns:1fr}.stats{grid-template-columns:repeat(3,1fr)}.codes{grid-template-columns:1fr}.session-head{grid-template-columns:1fr repeat(2,1fr)}}
</style>
</head>
<body><main>
<header><div><div class="eyebrow">Agent timeline forensics</div><h1>Trace Sheriff</h1><p>${escapeHtml(summary.source)} · ${summary.line_count} source lines</p></div><div class="stamp">Analysis complete</div></header>
<div class="stats">
  <div class="stat"><b>${summary.session_count}</b><span>sessions</span></div>
  <div class="stat"><b>${summary.valid_event_count}</b><span>valid events</span></div>
  <div class="stat"><b>${summary.finding_count}</b><span>findings</span></div>
  <div class="stat"><b>${summary.severity_counts.error}</b><span>errors</span></div>
  <div class="stat"><b>${summary.severity_counts.warning}</b><span>warnings</span></div>
  <div class="stat"><b>${summary.malformed_line_count}</b><span>malformed</span></div>
</div>
<div class="controls"><label>Session <select id="sessionFilter"><option value="">All sessions</option>${sessionOptions}</select></label><label>Severity <select id="severityFilter"><option value="">All severities</option><option>error</option><option>warning</option><option>info</option></select></label><div class="legend"><span><i class="dot tool"></i>tool</span><span><i class="dot phase"></i>phase</span></div></div>
<div class="grid">${cards}</div>
<section><h3>Findings ledger</h3><div class="table-wrap"><table><thead><tr><th>Severity</th><th>Line</th><th>Code</th><th>Session</th><th>Explanation</th><th>Related</th></tr></thead><tbody id="findings">${findingRows}</tbody></table></div></section>
<section class="malformed"><h3>Malformed source lines</h3><div class="table-wrap"><table><thead><tr><th>Line</th><th>Raw input</th><th>Parser detail</th></tr></thead><tbody>${malformedRows || '<tr><td colspan="3">None</td></tr>'}</tbody></table></div></section>
<section><h3>Anomaly code reference</h3><div class="codes">${codeRows}</div></section>
</main>
<script id="trace-data" type="application/json">${embedded}</script>
<script>
const sessionFilter=document.querySelector("#sessionFilter"),severityFilter=document.querySelector("#severityFilter");
function apply(){
 const s=sessionFilter.value,v=severityFilter.value;
 document.querySelectorAll(".session-card").forEach(el=>el.classList.toggle("hidden",!!s&&el.dataset.session!==s));
 document.querySelectorAll("#findings tr").forEach(el=>el.classList.toggle("hidden",(!!s&&el.dataset.session!==s)|| (!!v&&el.dataset.severity!==v)));
}
sessionFilter.addEventListener("change",apply);severityFilter.addEventListener("change",apply);
</script></body></html>`;
}

export { CODE_HELP };
