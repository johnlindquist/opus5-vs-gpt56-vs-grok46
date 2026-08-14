import type { RequestRow, Stats } from "./analyze";

type Analysis = ReturnType<typeof import("./analyze").analyze>;

const fmt = (value: number, digits = 1) =>
  value.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
const pct = (rate: number) => `${fmt(rate * 100, 1)}%`;
const signed = (value: number, digits = 1) => `${value > 0 ? "+" : ""}${fmt(value, digits)}`;
const escapeHtml = (value: unknown) => String(value)
  .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;").replaceAll("'", "&#39;");

function statsLine(stats: Stats): string {
  return `n=${stats.count}; mean ${fmt(stats.mean_ms)} ms; median ${fmt(stats.median_ms)} ms; ` +
    `p95 ${fmt(stats.p95_ms)} ms; min–max ${fmt(stats.min_ms, 0)}–${fmt(stats.max_ms, 0)} ms; ` +
    `non-200 ${stats.non_200_count}/${stats.count} (${pct(stats.non_200_rate)})`;
}

export function renderMarkdown(result: Analysis): string {
  const variants = result.variants as any;
  const control = variants.control.all_requests as Stats;
  const candidate = variants.candidate.all_requests as Stats;
  const successCandidate = variants.candidate.status_200_only as Stats;
  const euCold = result.payload_analysis.candidate_eu_mobile_cold;
  const errors = result.payload_analysis.error_rows;

  const mixSections = Object.entries(result.traffic_mix).map(([dimension, categories]) => {
    const lines = (categories as any[]).map((item) =>
      `| ${item.category} | ${item.control.count} (${pct(item.control.share)}) | ` +
      `${item.candidate.count} (${pct(item.candidate.share)}) | ` +
      `${signed(item.candidate_minus_control_share_pp)} pp |`
    ).join("\n");
    return `### ${dimension.replaceAll("_", " ")}\n\n` +
      `| Category | Control | Candidate | Candidate − control |\n` +
      `|---|---:|---:|---:|\n${lines}`;
  }).join("\n\n");

  const strataRows = result.strata.map((item) =>
    `| ${item.region} × ${item.device} × ${item.cache} | ${statsLine(item.control)} | ` +
    `${statsLine(item.candidate)} | ${signed(item.mean_delta_ms)} ms (${signed(item.mean_delta_percent)}%) |`
  ).join("\n");

  const payloadRows = result.payload_analysis.ranges.map((item) =>
    `| ${item.range} | ${item.variant} | ${item.count} | ${fmt(item.mean_ms)} | ` +
    `${fmt(item.median_ms)} | ${fmt(item.p95_ms)} | ${item.non_200_count} |`
  ).join("\n");

  const errorRows = errors.map((row) =>
    `| ${row.request_id} | ${row.minute} | ${row.payload_kb} | ${row.latency_ms} | ${row.status} |`
  ).join("\n");

  return `# Latency Forensics — Find the Real Rollout Regression

## Executive conclusion

**Computed fact:** Candidate aggregate latency is worse: its mean is ${fmt(candidate.mean_ms)} ms versus ${fmt(control.mean_ms)} ms for control (${signed(candidate.mean_ms - control.mean_ms)} ms), and its p95 is ${fmt(candidate.p95_ms)} ms versus ${fmt(control.p95_ms)} ms. Candidate has ${candidate.non_200_count}/${candidate.count} non-200 responses (${pct(candidate.non_200_rate)}); control has none. All requests, including 504s, are retained in these primary figures.

**Interpretation:** This is not a broad regression. Candidate is faster in three of four comparable region × device × cache strata. The exception—EU × mobile × cold—is ${fmt(result.strata.find((s) => s.key === "eu|mobile|cold")!.mean_delta_ms)} ms slower on mean and contains every observed 504. Candidate traffic also contains much more of this slow stratum, so traffic mix inflates the aggregate gap. Yet direct standardization to the combined stratum mix still leaves candidate ${signed(result.mix_adjustment.candidate_minus_control_ms)} ms slower, meaning mix alone does not explain the result.

**Recommendation:** Do not continue an unrestricted rollout from this evidence. Pause or exclude EU mobile cold traffic behind a guardrail while running a concurrent, randomized, payload-balanced comparison. The association is strong enough for operational caution, but this time-separated observational sample cannot establish that the candidate path caused the regression.

## Method

- Source: \`${result.source}\`; ${result.row_count} rows (control n=${control.count}, candidate n=${candidate.count}).
- Quantiles: ${result.quantile_convention}
- Primary latency statistics include every status. Status-200-only statistics are shown separately where they clarify sensitivity.
- Payload ranges are fixed at 0–255, 256–511, 512–767, and 768+ KB.
- Group keys and output categories are lexically sorted for deterministic output.

## 1. Aggregate comparison

| Variant | All requests | Status 200 only |
|---|---|---|
| Control | ${statsLine(control)} | ${statsLine(variants.control.status_200_only)} |
| Candidate | ${statsLine(candidate)} | ${statsLine(successCandidate)} |

Removing candidate 504s lowers the candidate mean to ${fmt(successCandidate.mean_ms)} ms (n=${successCandidate.count}), but this remains an outcome-conditioned sensitivity view, not the primary comparison.

## 2. Traffic mix

${mixSections}

The largest consequential imbalance is the bundled EU × mobile × cold stratum: control n=4 (10.0%) versus candidate n=14 (35.0%). Marginal tables above also show candidate has more EU, mobile, cold, and 768+ KB traffic; because these attributes co-occur, the marginal shifts must not be interpreted as independent effects.

## 3. Comparable strata

| Stratum | Control | Candidate | Mean delta |
|---|---|---|---:|
${strataRows}

Candidate is faster in US desktop warm, EU desktop warm, and US mobile cold. It is slower only in EU mobile cold. Therefore the aggregate result conceals a mix effect resembling Simpson’s paradox, but not a complete sign reversal: direct standardization gives ${fmt(result.mix_adjustment.standardized_control_mean_ms)} ms for control and ${fmt(result.mix_adjustment.standardized_candidate_mean_ms)} ms for candidate (${signed(result.mix_adjustment.candidate_minus_control_ms)} ms). The raw aggregate gap is ${signed(result.mix_adjustment.aggregate_candidate_minus_control_ms)} ms.

## 4. Payload and interaction analysis

| Payload KB range | Variant | n | Mean ms | Median ms | p95 ms | Non-200 |
|---|---|---:|---:|---:|---:|---:|
${payloadRows}

The candidate EU × mobile × cold slice has ${statsLine(euCold.all_requests)}. Its status-200-only mean is ${fmt(euCold.status_200_only.mean_ms)} ms (n=${euCold.status_200_only.count}), so high latency is not confined to the four errors. ${euCold.count_payload_at_least_768_kb}/${euCold.all_requests.count} observations in this slice are at least 768 KB.

Evidence supporting the “large cold EU mobile payload” hypothesis:

- It is the only comparable stratum where candidate is slower, by ${signed(result.strata.find((s) => s.key === "eu|mobile|cold")!.mean_delta_ms)} ms on mean.
- All four 504s occur there, at 880–1040 KB, and successful rows in the slice are also slow.
- Candidate’s 768+ KB band is dramatically slower than its smaller bands.

Evidence weakening a causal payload claim:

- Region, mobile device, cold cache, larger payload, later time, and candidate are tightly bundled; their individual contributions are not identifiable.
- The control EU mobile cold sample is only n=4, and its payload range (720–960 KB) overlaps only part of candidate’s range (720–1120 KB).
- Candidate latency is not monotonic in payload (for example, 1120 KB includes both 986 and 1512 ms), and there are no concurrent randomized observations.

## 5. Error rows

| Request | Minute | Payload KB | Latency ms | Status |
|---|---:|---:|---:|---:|
${errorRows}

## 6. Data-quality and design limitations

${result.limitations.map((item) => `- ${item}`).join("\n")}

These limitations prevent a causal claim. The dataset supports a localized association and an operational decision, not attribution to payload size or the candidate implementation alone.

## 7. Rollout action and follow-ups

**Action justified by this dataset alone:** pause or exclude the EU mobile cold candidate slice and retain a conservative guardrail. The dataset does not justify either a full rollout or a claim that all candidate traffic is slower.

The two highest-value follow-ups are:

1. **Experiment:** ${result.recommendations[1].text}
2. **Measurement:** ${result.recommendations[2].text}

Those directly address the two largest uncertainties: treatment/time and mix confounding, then the location of delay and timeout mechanism.
`;
}

function statCard(name: string, stats: Stats, tone: string): string {
  return `<article class="stat-card ${tone}">
    <div class="eyebrow">${escapeHtml(name)} · n=${stats.count}</div>
    <div class="big">${fmt(stats.mean_ms)}<span> ms mean</span></div>
    <div class="mini"><b>${fmt(stats.median_ms)}</b> median <b>${fmt(stats.p95_ms)}</b> p95 <b>${fmt(stats.max_ms, 0)}</b> max</div>
    <div class="error">${stats.non_200_count} non-200 · ${pct(stats.non_200_rate)}</div>
  </article>`;
}

function scatterSvg(rows: RequestRow[]): string {
  const width = 920, height = 390, left = 64, right = 24, top = 26, bottom = 52;
  const xMin = 0, xMax = 1150, yMin = 0, yMax = 1650;
  const x = (value: number) => left + (value - xMin) / (xMax - xMin) * (width - left - right);
  const y = (value: number) => top + (yMax - value) / (yMax - yMin) * (height - top - bottom);
  const gridY = [0, 400, 800, 1200, 1600].map((value) =>
    `<line x1="${left}" y1="${y(value)}" x2="${width - right}" y2="${y(value)}"/><text x="${left - 10}" y="${y(value) + 4}" text-anchor="end">${value}</text>`
  ).join("");
  const gridX = [0, 256, 512, 768, 1024].map((value) =>
    `<line x1="${x(value)}" y1="${top}" x2="${x(value)}" y2="${height - bottom}"/><text x="${x(value)}" y="${height - 24}" text-anchor="middle">${value}</text>`
  ).join("");
  const points = rows.map((row) => {
    const risky = row.region === "eu" && row.device === "mobile" && row.cache === "cold";
    const className = row.status !== 200 ? "point error-point" :
      row.variant === "control" ? "point control-point" :
      risky ? "point risk-point" : "point candidate-point";
    return `<circle class="${className}" cx="${x(row.payload_kb).toFixed(1)}" cy="${y(row.latency_ms).toFixed(1)}" r="${row.status !== 200 ? 6 : 4.2}">
      <title>${escapeHtml(row.request_id)} · ${row.variant} · ${row.payload_kb} KB · ${row.latency_ms} ms · ${row.status}</title>
    </circle>`;
  }).join("");
  return `<svg class="scatter" viewBox="0 0 ${width} ${height}" role="img" aria-label="Payload versus latency scatter plot">
    <g class="grid">${gridY}${gridX}</g>
    <text class="axis-label" x="${(left + width - right) / 2}" y="${height - 3}" text-anchor="middle">Payload (KB)</text>
    <text class="axis-label" transform="translate(15 ${(top + height - bottom) / 2}) rotate(-90)" text-anchor="middle">Latency (ms)</text>
    <rect class="risk-zone" x="${x(700)}" y="${y(1650)}" width="${x(1150) - x(700)}" height="${y(800) - y(1650)}"/>
    ${points}
  </svg>`;
}

export function renderHtml(result: Analysis, rows: RequestRow[]): string {
  const variants = result.variants as any;
  const control = variants.control.all_requests as Stats;
  const candidate = variants.candidate.all_requests as Stats;
  const mix = result.traffic_mix;
  const errorRows = result.payload_analysis.error_rows;
  const mixRows = (dimension: string, items: any[]) => items.map((item) =>
    `<tr><td>${escapeHtml(dimension)}</td><td>${escapeHtml(item.category)}</td>` +
    `<td>${item.control.count} <small>${pct(item.control.share)}</small></td>` +
    `<td>${item.candidate.count} <small>${pct(item.candidate.share)}</small></td>` +
    `<td class="${item.candidate_minus_control_share_pp > 0 ? "bad" : ""}">${signed(item.candidate_minus_control_share_pp)} pp</td></tr>`
  ).join("");
  const stratumRows = result.strata.map((item) =>
    `<tr><td><b>${item.region.toUpperCase()}</b> · ${item.device} · ${item.cache}</td>` +
    `<td>n=${item.control.count}<br><b>${fmt(item.control.mean_ms)}</b> ms</td>` +
    `<td>n=${item.candidate.count}<br><b>${fmt(item.candidate.mean_ms)}</b> ms</td>` +
    `<td class="${item.direction === "candidate_slower" ? "bad" : "good"}"><b>${signed(item.mean_delta_ms)} ms</b><br>${signed(item.mean_delta_percent)}%</td></tr>`
  ).join("");
  const errors = errorRows.map((row) =>
    `<tr><td>${row.request_id}</td><td>${row.minute}</td><td>${row.region} · ${row.device} · ${row.cache}</td>` +
    `<td>${row.payload_kb} KB</td><td>${row.latency_ms} ms</td><td><span class="status">${row.status}</span></td></tr>`
  ).join("");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Latency Forensics — Rollout Regression</title>
<style>
:root{--ink:#17201c;--muted:#5e6b64;--paper:#f5f2e9;--panel:#fffdf7;--line:#d8d4c8;--green:#0c7454;--mint:#d9eee4;--red:#a23b34;--rose:#f3dcd6;--amber:#c7771c;--navy:#233f62}
*{box-sizing:border-box}html{background:var(--paper);color:var(--ink);font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
body{margin:0}.page{max-width:1600px;margin:auto;padding:34px 44px 70px}.topline{display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid var(--line);padding-bottom:14px}
.brand{font:700 13px/1 ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:.12em;text-transform:uppercase}.meta{color:var(--muted);font-size:13px}
h1{font-size:clamp(42px,4.2vw,72px);line-height:.98;letter-spacing:-.055em;max-width:1050px;margin:42px 0 18px}h2{font-size:29px;letter-spacing:-.03em;margin:0 0 16px}h3{font-size:18px;margin:0}
.verdict{display:grid;grid-template-columns:1.5fr .8fr;gap:26px;align-items:stretch}.lead{font-size:20px;line-height:1.5;max-width:1000px;color:#334039;margin:0}
.callout{border-left:5px solid var(--red);background:var(--rose);padding:22px 24px;border-radius:3px 14px 14px 3px}.callout b{display:block;font-size:21px;margin-bottom:8px}.callout p{margin:0;line-height:1.45}
.cards{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin:30px 0}.stat-card{background:var(--panel);border:1px solid var(--line);border-top:5px solid var(--navy);padding:20px;border-radius:12px;min-height:152px}.stat-card.candidate{border-top-color:var(--red)}
.eyebrow{font:700 12px/1.3 ui-monospace,monospace;text-transform:uppercase;color:var(--muted)}.big{font-size:40px;font-weight:760;letter-spacing:-.05em;margin:13px 0 8px}.big span{font-size:14px;letter-spacing:0;color:var(--muted);font-weight:500}.mini{display:flex;gap:12px;font-size:12px;color:var(--muted)}.mini b{color:var(--ink)}.error{margin-top:11px;font-size:13px;color:var(--red);font-weight:700}
.delta-card{background:var(--ink);color:white;border-color:var(--ink)}.delta-card .eyebrow,.delta-card .mini{color:#b7c3bc}.delta-card .big{color:#ffd1c7}.adjusted-card{border-top-color:var(--amber)}
.overview-grid{display:grid;grid-template-columns:1.1fr .9fr;gap:18px}.panel{background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:22px}.panel-head{display:flex;justify-content:space-between;gap:12px;align-items:end;margin-bottom:10px}.panel-head p{margin:0;color:var(--muted);font-size:12px}
table{width:100%;border-collapse:collapse;font-size:13px}th{text-align:left;color:var(--muted);font-size:11px;text-transform:uppercase;letter-spacing:.08em;padding:9px 10px;border-bottom:1px solid var(--line)}td{padding:10px;border-bottom:1px solid #e7e3d9}tr:last-child td{border:0}small{color:var(--muted)}.good{color:var(--green)}.bad{color:var(--red)}
.note{margin:14px 0 0;padding:12px 14px;border-radius:8px;background:var(--mint);font-size:13px;line-height:1.45}.section{margin-top:28px}.wide-grid{display:grid;grid-template-columns:1.45fr .55fr;gap:18px}
.scatter{width:100%;height:auto}.grid line{stroke:#dedbd2;stroke-width:1}.grid text,.axis-label{fill:var(--muted);font-size:12px}.risk-zone{fill:#f3dcd6;opacity:.55}.point{stroke:var(--panel);stroke-width:1.5}.control-point{fill:var(--navy)}.candidate-point{fill:var(--green)}.risk-point{fill:var(--amber)}.error-point{fill:var(--red);stroke:var(--ink);stroke-width:2}
.legend{display:flex;gap:15px;flex-wrap:wrap;font-size:12px;color:var(--muted)}.dot{display:inline-block;width:9px;height:9px;border-radius:50%;margin-right:5px}.dot.control{background:var(--navy)}.dot.candidate{background:var(--green)}.dot.risk{background:var(--amber)}.dot.err{background:var(--red)}
.finding{padding:15px 0;border-bottom:1px solid var(--line)}.finding:last-child{border:0}.finding .tag{font:700 10px ui-monospace,monospace;color:var(--muted);text-transform:uppercase}.finding p{margin:5px 0 0;line-height:1.45}.status{background:var(--rose);color:var(--red);font-weight:800;padding:3px 7px;border-radius:5px}
.bottom-grid{display:grid;grid-template-columns:1fr 1fr;gap:18px}.list{margin:0;padding-left:20px}.list li{margin:9px 0;line-height:1.45}.recommend{border:2px solid var(--green);background:#f4fff9}.recommend h2{color:var(--green)}
.foot{display:flex;justify-content:space-between;margin-top:28px;padding-top:16px;border-top:1px solid var(--line);color:var(--muted);font-size:12px}
@media(max-width:950px){.page{padding:24px}.verdict,.overview-grid,.wide-grid,.bottom-grid{grid-template-columns:1fr}.cards{grid-template-columns:1fr 1fr}h1{font-size:44px}}@media print{body{background:white}.page{padding:20px}.panel,.stat-card{break-inside:avoid}}
</style>
</head>
<body><main class="page">
  <header class="topline"><div class="brand">Rollout observatory / 01</div><div class="meta">${result.row_count} requests · deterministic analysis · all statuses retained</div></header>
  <section class="verdict">
    <div><h1>A localized regression,<br>amplified by traffic mix.</h1>
      <p class="lead">Candidate is faster in <b>3 of 4</b> comparable slices, but EU mobile cold traffic is <b>${fmt(result.strata.find((s) => s.key === "eu|mobile|cold")!.mean_delta_ms)} ms slower</b> on mean and contains all four 504s. Mix worsens the headline; it does not explain it away.</p>
    </div>
    <aside class="callout"><b>Decision: do not roll forward unrestricted.</b><p>Pause or guard the EU mobile cold slice. Preserve the faster slices only inside a controlled, concurrent follow-up. Association is strong; causality is not established.</p></aside>
  </section>
  <section class="cards">
    ${statCard("Control", control, "control")}
    ${statCard("Candidate", candidate, "candidate")}
    <article class="stat-card delta-card"><div class="eyebrow">Raw aggregate gap</div><div class="big">${signed(candidate.mean_ms - control.mean_ms)}<span> ms</span></div><div class="mini">candidate − control mean</div><div class="error">Headline is mix-sensitive</div></article>
    <article class="stat-card adjusted-card"><div class="eyebrow">Mix-standardized gap</div><div class="big">${signed(result.mix_adjustment.candidate_minus_control_ms)}<span> ms</span></div><div class="mini">combined stratum weights</div><div class="error">Regression remains</div></article>
  </section>
  <section class="overview-grid">
    <article class="panel"><div class="panel-head"><h2>Comparable strata</h2><p>Exact n and mean · all statuses</p></div>
      <table><thead><tr><th>Region · device · cache</th><th>Control</th><th>Candidate</th><th>Delta</th></tr></thead><tbody>${stratumRows}</tbody></table>
      <p class="note"><b>Simpson-like mix effect:</b> candidate has more weight in the slow EU mobile cold slice (n=14 vs n=4). Standardizing reduces the mean gap from ${signed(result.mix_adjustment.aggregate_candidate_minus_control_ms)} to ${signed(result.mix_adjustment.candidate_minus_control_ms)} ms, but does not reverse it.</p>
    </article>
    <article class="panel"><div class="panel-head"><h2>Traffic mix</h2><p>Share of each 40-row variant</p></div>
      <table><thead><tr><th>Dimension</th><th>Category</th><th>Control</th><th>Candidate</th><th>Δ share</th></tr></thead><tbody>
      ${mixRows("Region", mix.region)}${mixRows("Device", mix.device)}${mixRows("Cache", mix.cache)}${mixRows("Payload KB", mix.payload_range_kb)}
      </tbody></table>
    </article>
  </section>
  <section class="section wide-grid">
    <article class="panel"><div class="panel-head"><div><h2>Payload vs latency</h2><div class="legend"><span><i class="dot control"></i>control</span><span><i class="dot candidate"></i>candidate, other</span><span><i class="dot risk"></i>candidate EU mobile cold</span><span><i class="dot err"></i>504</span></div></div><p>Hover points for request details</p></div>
      ${scatterSvg(rows)}
    </article>
    <article class="panel"><h2>What the pattern says</h2>
      ${result.findings.map((item) => `<div class="finding"><span class="tag">${escapeHtml(item.kind.replaceAll("_", " "))}</span><p>${escapeHtml(item.text)}</p></div>`).join("")}
      <div class="finding"><span class="tag">Counter-evidence</span><p>Payload, region, device, cache, time, and variant are bundled. Control has only n=4 in the suspect slice, and latency is not monotonic with payload.</p></div>
    </article>
  </section>
  <section class="section panel"><div class="panel-head"><h2>Error rows</h2><p>No non-200 request was discarded</p></div>
    <table><thead><tr><th>Request</th><th>Minute</th><th>Slice</th><th>Payload</th><th>Latency</th><th>Status</th></tr></thead><tbody>${errors}</tbody></table>
  </section>
  <section class="section bottom-grid">
    <article class="panel"><h2>Why this is not causal</h2><ul class="list">${result.limitations.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul></article>
    <article class="panel recommend"><h2>Next move</h2><p><b>${escapeHtml(result.recommendations[0].text)}</b></p><ol class="list"><li>${escapeHtml(result.recommendations[1].text)}</li><li>${escapeHtml(result.recommendations[2].text)}</li></ol></article>
  </section>
  <footer class="foot"><span>Quantile: linear interpolation, h=(n−1)p</span><span>Source: ${escapeHtml(result.source)} · generated with Bun/TypeScript · no external assets</span></footer>
</main></body></html>`;
}
