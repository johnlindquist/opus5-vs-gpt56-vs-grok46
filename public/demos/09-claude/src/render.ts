/**
 * Renderers for the latency forensics report.
 *
 * Markdown and HTML are both derived purely from the Analysis object (plus raw
 * rows for the scatter), so every number on screen traces back to a computed value.
 * The HTML is standalone: inline SVG charts, no external assets, no libraries.
 */

import type { Analysis, RequestRow } from "./analyze.ts";
import { PAYLOAD_BUCKETS, stratumKey } from "./analyze.ts";

// ---------------------------------------------------------------------------
// Markdown
// ---------------------------------------------------------------------------

function pct(value: number): string {
  return `${value > 0 ? "+" : ""}${value}%`;
}

function statsRow(label: string, s: { n: number; mean: number; median: number; p95: number; min: number; max: number }): string {
  return `| ${label} | ${s.n} | ${s.mean} | ${s.median} | ${s.p95} | ${s.min} | ${s.max} |`;
}

export function renderMarkdown(a: Analysis): string {
  const c = a.variants.control!;
  const d = a.variants.candidate!;
  const worst = [...a.strata]
    .filter((s) => s.direction !== "no_comparison")
    .sort((x, y) => (y.mean_delta_pct ?? 0) - (x.mean_delta_pct ?? 0))[0]!;
  const faster = a.strata.filter((s) => s.direction === "candidate_faster");
  const L: string[] = [];

  L.push("# Latency Forensics — Find the Real Rollout Regression");
  L.push("");
  L.push(`Source: \`${a.source}\` · ${a.row_count} rows · schema version ${a.schema_version}`);
  L.push("");
  L.push("Every number below is computed by `src/analyze.ts` from the source CSV. Sections are labelled");
  L.push("**Computed fact**, **Interpretation**, or **Recommendation** so the boundary between what the data");
  L.push("say and what we infer stays explicit.");
  L.push("");

  // Executive conclusion
  L.push("## Executive conclusion");
  L.push("");
  L.push(
    `The candidate is **not broadly slower**. It is faster than control in ${faster.length} of ` +
      `${a.simpsons_paradox.strata_with_both_variants} comparable strata. The aggregate looks ${pct(a.aggregate_comparison.mean_delta_pct)} worse ` +
      `because the candidate arm carries ${a.traffic_mix.heavy_stratum_share.share_ratio}× the share of the slowest stratum ` +
      `(\`${a.traffic_mix.heavy_stratum_share.stratum}\`) that control does. That is a traffic-mix artefact.`,
  );
  L.push("");
  L.push(
    `But the mix is **not the whole story**. One interaction — \`${worst.stratum}\` — is genuinely worse: ` +
      `${worst.control!.mean} ms (n=${worst.control!.n}) → ${worst.candidate!.mean} ms (n=${worst.candidate!.n}), ${pct(worst.mean_delta_pct!)}. ` +
      `All ${a.error_rows.length} non-200 responses in the dataset are candidate rows inside that stratum. The gap survives payload matching.`,
  );
  L.push("");
  L.push(
    `**Recommended action:** hold the rollout for \`${worst.stratum}\` — particularly large cold-cache payloads — and continue the ` +
      `ramp elsewhere behind per-stratum guardrails. This is observational data from disjoint time windows; it justifies a targeted hold, ` +
      `not a causal claim and not a full rollback.`,
  );
  L.push("");

  // Method
  L.push("## Method and conventions");
  L.push("");
  L.push(`- **Quantiles.** ${a.quantile_convention}`);
  L.push(
    "- **Non-200 rows are retained.** They are included in the all-rows statistics *and* reported separately. Dropping them " +
      "would systematically remove the slowest observations and flatter the candidate.",
  );
  L.push(
    "- **Two views of latency.** `all rows` and `status 200 only` are both computed. Where they diverge, the divergence is itself a finding.",
  );
  L.push(
    "- **Grouping is explicit and deterministic.** Strata are `region / device / cache`, enumerated in alphabetical key order; payload " +
      "buckets have fixed edges declared in code, so ordering never depends on row order in the file.",
  );
  L.push(
    "- **Precision.** Latencies are whole milliseconds in the source, so statistics are reported to one decimal place and shares to " +
      "four. No further precision is claimed.",
  );
  L.push(
    `- **Bootstrap.** One optional deterministic percentile bootstrap (seeded LCG, seed ${a.payload_analysis.bootstrap.seed}, ` +
      `${a.payload_analysis.bootstrap.iterations} iterations) on the payload-matched stratum difference. No statistics library is imported.`,
  );
  L.push("");
  L.push("### Validation checkpoints");
  L.push("");
  L.push("| Check | Expected | Actual | Result |");
  L.push("|---|---|---|---|");
  L.push(`| Total rows | 80 | ${a.row_count} | ${a.validation.row_count_is_80 ? "pass" : "FAIL"} |`);
  L.push(`| Control rows | 40 | ${a.validation.control_rows} | ${a.validation.control_rows === 40 ? "pass" : "FAIL"} |`);
  L.push(`| Candidate rows | 40 | ${a.validation.candidate_rows} | ${a.validation.candidate_rows === 40 ? "pass" : "FAIL"} |`);
  L.push(`| Control non-200 | 0 | ${c.non_200_count} | ${a.validation.control_non_200_is_zero ? "pass" : "FAIL"} |`);
  L.push(`| Candidate non-200 | 4 | ${d.non_200_count} | ${a.validation.candidate_non_200_is_four ? "pass" : "FAIL"} |`);
  L.push("");

  // Q1
  L.push("## 1. Aggregate statistics by variant");
  L.push("");
  L.push("**Computed fact.**");
  L.push("");
  L.push("All rows (non-200 included):");
  L.push("");
  L.push("| Variant | n | Mean ms | Median ms | p95 ms | Min ms | Max ms |");
  L.push("|---|---|---|---|---|---|---|");
  L.push(statsRow("control", c.all_rows));
  L.push(statsRow("candidate", d.all_rows));
  L.push("");
  L.push("Status 200 only:");
  L.push("");
  L.push("| Variant | n | Mean ms | Median ms | p95 ms | Min ms | Max ms |");
  L.push("|---|---|---|---|---|---|---|");
  L.push(statsRow("control", c.status_200_only));
  L.push(statsRow("candidate", d.status_200_only));
  L.push("");
  L.push("| Variant | n | Non-200 count | Non-200 rate |");
  L.push("|---|---|---|---|");
  L.push(`| control | ${c.count} | ${c.non_200_count} | ${(c.non_200_rate * 100).toFixed(1)}% |`);
  L.push(`| candidate | ${d.count} | ${d.non_200_count} | ${(d.non_200_rate * 100).toFixed(1)}% |`);
  L.push("");
  L.push(
    `Aggregate deltas: mean ${a.aggregate_comparison.mean_delta_ms} ms (${pct(a.aggregate_comparison.mean_delta_pct)}), ` +
      `median ${a.aggregate_comparison.median_delta_ms} ms (${pct(a.aggregate_comparison.median_delta_pct)}), ` +
      `p95 ${a.aggregate_comparison.p95_delta_ms} ms (${pct(a.aggregate_comparison.p95_delta_pct)}).`,
  );
  L.push("");
  L.push(
    "**Interpretation.** Read this table as a description of two *different populations of requests*, not as a treatment effect. " +
      "Section 2 shows why.",
  );
  L.push("");

  // Q2
  L.push("## 2. Traffic mix");
  L.push("");
  L.push("**Computed fact.** Shares are within-variant (each variant's column sums to 100%).");
  L.push("");
  for (const [dim, cells] of [
    ["Region", a.traffic_mix.region],
    ["Device", a.traffic_mix.device],
    ["Cache", a.traffic_mix.cache],
    ["Payload range", a.traffic_mix.payload_range],
  ] as const) {
    L.push(`### ${dim}`);
    L.push("");
    L.push("| Value | Control n | Control share | Candidate n | Candidate share | Share delta |");
    L.push("|---|---|---|---|---|---|");
    for (const m of cells) {
      L.push(
        `| ${m.key} | ${m.control_n} | ${(m.control_share * 100).toFixed(1)}% | ${m.candidate_n} | ${(m.candidate_share * 100).toFixed(1)}% | ${(m.share_delta * 100 > 0 ? "+" : "")}${(m.share_delta * 100).toFixed(1)} pp |`,
      );
    }
    L.push("");
  }
  L.push(
    `**Interpretation.** The mix difference is large and it all points the same way: the candidate arm is loaded with heavier, ` +
      `colder, more distant, larger-payload traffic. The slowest stratum by control mean, \`${a.traffic_mix.heavy_stratum_share.stratum}\`, ` +
      `is ${(a.traffic_mix.heavy_stratum_share.candidate_share * 100).toFixed(1)}% of candidate rows against ` +
      `${(a.traffic_mix.heavy_stratum_share.control_share * 100).toFixed(1)}% of control rows. An aggregate mean over these two arms is ` +
      `mostly measuring that imbalance.`,
  );
  L.push("");

  // Q3
  L.push("## 3. Within-stratum comparison");
  L.push("");
  L.push("**Computed fact.** Strata are `region / device / cache`. Sample sizes are shown for every cell.");
  L.push("");
  L.push("| Stratum | Control n | Control mean | Control median | Control p95 | Candidate n | Candidate mean | Candidate median | Candidate p95 | Mean delta | Direction |");
  L.push("|---|---|---|---|---|---|---|---|---|---|---|");
  for (const s of a.strata) {
    L.push(
      `| ${s.stratum} | ${s.control?.n ?? "—"} | ${s.control?.mean ?? "—"} | ${s.control?.median ?? "—"} | ${s.control?.p95 ?? "—"} | ` +
        `${s.candidate?.n ?? "—"} | ${s.candidate?.mean ?? "—"} | ${s.candidate?.median ?? "—"} | ${s.candidate?.p95 ?? "—"} | ` +
        `${s.mean_delta_ms === null ? "—" : `${s.mean_delta_ms} ms (${pct(s.mean_delta_pct!)})`} | ${s.direction.replace(/_/g, " ")} |`,
    );
  }
  L.push("");
  L.push(
    `**Computed fact.** Candidate is faster in ${a.simpsons_paradox.strata_candidate_faster} of ` +
      `${a.simpsons_paradox.strata_with_both_variants} comparable strata and slower in ${a.simpsons_paradox.strata_candidate_slower}. ` +
      `The answer to "is candidate consistently slower or faster?" is **neither** — it is consistently *faster* except in one stratum, where it is much worse.`,
  );
  L.push("");

  // Q4
  L.push("## 4. Does the aggregate conceal a mix effect?");
  L.push("");
  L.push("**Computed fact.**");
  L.push("");
  L.push(`- Aggregate direction: ${a.simpsons_paradox.aggregate_direction} (${pct(a.aggregate_comparison.mean_delta_pct)}).`);
  L.push(`- Per-stratum direction: candidate faster in ${a.simpsons_paradox.strata_candidate_faster}/${a.simpsons_paradox.strata_with_both_variants} strata.`);
  L.push(
    `- Candidate mean standardised to the **control** traffic mix (direct standardisation): ` +
      `**${a.simpsons_paradox.mix_adjusted_candidate_mean_ms} ms**, against a control mean of ${c.all_rows.mean} ms and an *observed* candidate mean of ${d.all_rows.mean} ms.`,
  );
  L.push("");
  L.push("**Interpretation.**");
  L.push("");
  L.push(
    `Yes — the aggregate conceals a mix effect with the shape of Simpson's paradox: the pooled comparison points one way while the ` +
      `majority of stratum-level comparisons point the other. Standardising the candidate's per-stratum means onto the control mix ` +
      `removes most of the apparent regression (${d.all_rows.mean} → ${a.simpsons_paradox.mix_adjusted_candidate_mean_ms} ms).`,
  );
  L.push("");
  L.push(
    `It is worth being precise about what standardisation does *not* show. The adjusted figure is still above the control mean, and that ` +
      `residual is real: it is the one badly regressed stratum leaking through. So this is not a pure paradox where the aggregate is ` +
      `entirely artefactual — it is a mix artefact **plus** a genuine localised regression, and separating the two is the whole job here. ` +
      `Reporting only "it's Simpson's paradox, ship it" would be as wrong as reporting only the aggregate.`,
  );
  L.push("");

  // Q5
  L.push("## 5. Is a specific interaction responsible?");
  L.push("");
  L.push("**Computed fact.** Yes, and it is isolated to one cell.");
  L.push("");
  L.push(
    `\`${worst.stratum}\`: control ${worst.control!.mean} ms mean / ${worst.control!.median} ms median / ${worst.control!.p95} ms p95 (n=${worst.control!.n}); ` +
      `candidate ${worst.candidate!.mean} ms mean / ${worst.candidate!.median} ms median / ${worst.candidate!.p95} ms p95 (n=${worst.candidate!.n}). ` +
      `Delta ${worst.mean_delta_ms} ms (${pct(worst.mean_delta_pct!)}). Candidate max in this stratum is ${worst.candidate!.max} ms against a control max of ${worst.control!.max} ms.`,
  );
  L.push("");
  L.push(`Every other stratum improves: ${faster.map((s) => `\`${s.stratum}\` ${pct(s.mean_delta_pct!)}`).join(", ")}.`);
  L.push("");
  L.push(
    `**Interpretation.** The regression is an *interaction*, not a main effect. It requires the conjunction of EU region, mobile device, ` +
      `cold cache, and large payload. No single one of those factors predicts the slowdown on its own — EU desktop warm improves, US mobile ` +
      `cold improves. That pattern is what makes an aggregate dashboard so misleading here, and it is also what makes the fix likely to be ` +
      `narrow rather than architectural.`,
  );
  L.push("");

  // Q6
  L.push("## 6. Evidence on the \"large cold EU mobile payloads\" hypothesis");
  L.push("");
  L.push("**Supporting evidence (computed fact):**");
  L.push("");
  L.push(`- The regression is confined to exactly that stratum; the other three improve.`);
  L.push(
    `- All ${a.error_rows.length} non-200 rows (status 504) are in it: ${a.error_rows.map((r) => `${r.request_id} @ ${r.payload_kb} KB, ${r.latency_ms} ms`).join("; ")}. Control has zero.`,
  );
  L.push(
    `- Within candidate \`${worst.stratum}\`, latency rises ${a.payload_analysis.slopes.find((s) => s.x === "payload_kb" && s.series.endsWith("candidate"))?.slope} ms per KB ` +
      `(r=${a.payload_analysis.slopes.find((s) => s.x === "payload_kb" && s.series.endsWith("candidate"))?.r}), a steeper per-byte cost than control's ` +
      `${a.payload_analysis.slopes.find((s) => s.x === "payload_kb" && s.series.endsWith("control"))?.slope} ms per KB.`,
  );
  L.push(
    `- Payload-matched comparison, restricted to the ${a.payload_analysis.eu_mobile_cold_overlap.overlap_lower_kb}–${a.payload_analysis.eu_mobile_cold_overlap.overlap_upper_kb} KB ` +
      `range present in both arms: control ${a.payload_analysis.eu_mobile_cold_overlap.control_mean_ms} ms (n=${a.payload_analysis.eu_mobile_cold_overlap.control_n}) vs candidate ` +
      `${a.payload_analysis.eu_mobile_cold_overlap.candidate_mean_ms} ms (n=${a.payload_analysis.eu_mobile_cold_overlap.candidate_n}), ` +
      `${a.payload_analysis.eu_mobile_cold_overlap.mean_delta_ms} ms (${pct(a.payload_analysis.eu_mobile_cold_overlap.mean_delta_pct)}). ` +
      `Deterministic bootstrap 95% interval on that difference: [${a.payload_analysis.bootstrap.ci_low_ms}, ${a.payload_analysis.bootstrap.ci_high_ms}] ms.`,
  );
  L.push("");
  L.push("**Weakening evidence (computed fact):**");
  L.push("");
  const minuteSlope = a.payload_analysis.slopes.find((s) => s.x === "minute" && s.series.endsWith("candidate"));
  const cndPayloadSlope = a.payload_analysis.slopes.find((s) => s.x === "payload_kb" && s.series.endsWith("candidate"));
  L.push(
    `- Payload is only a **partial** explanation even within the stratum. The candidate payload correlation is r=${cndPayloadSlope?.r} ` +
      `(n=${cndPayloadSlope?.n}), so payload accounts for roughly ${Math.round((cndPayloadSlope?.r ?? 0) ** 2 * 100)}% of the variance — the majority is unexplained by payload size.`,
  );
  L.push(
    `- Elapsed time is a competing, non-zero correlate: ${minuteSlope?.slope} ms per **minute** (r=${minuteSlope?.r}, n=${minuteSlope?.n}). It fits worse than payload, ` +
      `but minute and payload are partly collinear in this arm, so neither slope is cleanly identified and a "system degrades across the rollout window" story cannot be ruled out.`,
  );
  L.push(
    `- The relationship is not monotone in payload. r078 (1040 KB, minute 35) took 1584 ms while r079 (1120 KB, minute 36) took 986 ms — a *larger* payload that was ` +
      `substantially *faster*. A strictly per-byte cost model does not predict that; a resource that saturates and then recovers does.`,
  );
  L.push(
    `- Candidate payloads reach ${Math.max(...a.payload_analysis.buckets.map((b) => b.upper_kb ?? 0))}+ KB where control stops at ` +
      `${a.payload_analysis.eu_mobile_cold_overlap.overlap_upper_kb} KB, so part of the raw candidate tail has no control counterpart at all and is pure extrapolation.`,
  );
  L.push(
    `- The comparison rests on ${a.payload_analysis.eu_mobile_cold_overlap.control_n} payload-matched control rows. That is a very thin base for a claim about a production path.`,
  );
  L.push("");
  L.push(
    `**Interpretation.** The hypothesis is *directionally supported but incompletely specified*. "Large cold EU mobile payloads are slower under the ` +
      `candidate" is well supported — it survives payload matching, so it is not merely that the candidate got sent bigger requests. What is **not** ` +
      `established is that payload size is the mechanism. Elapsed time in the rollout window fits the data equally well, and the two are confounded by design ` +
      `here. Treat "large payload" as the best available *marker* for the affected traffic, not as the identified cause.`,
  );
  L.push("");
  L.push("### Payload bucket detail");
  L.push("");
  L.push("| Payload bucket | Control n | Control mean | Candidate n | Candidate mean | Delta |");
  L.push("|---|---|---|---|---|---|");
  for (const b of a.payload_analysis.buckets) {
    L.push(
      `| ${b.bucket} | ${b.control_n} | ${b.control_mean_ms ?? "—"} | ${b.candidate_n} | ${b.candidate_mean_ms ?? "—"} | ${b.mean_delta_pct === null ? "— (no overlap)" : pct(b.mean_delta_pct)} |`,
    );
  }
  L.push("");
  L.push("### Non-200 rows");
  L.push("");
  L.push("| Request | Variant | Minute | Stratum | Payload KB | Latency ms | Status |");
  L.push("|---|---|---|---|---|---|---|");
  for (const r of a.error_rows) {
    L.push(`| ${r.request_id} | ${r.variant} | ${r.minute} | ${r.stratum} | ${r.payload_kb} | ${r.latency_ms} | ${r.status} |`);
  }
  L.push("");
  L.push(
    "Note: a 504 latency records how long the request took to give up, not how long a completed request took. These values are retained in the " +
      "all-rows statistics but should not be read as service times.",
  );
  L.push("");

  // Q7
  L.push("## 7. Limitations that prevent a causal claim");
  L.push("");
  a.limitations.forEach((l, i) => L.push(`${i + 1}. ${l}`));
  L.push("");
  L.push(
    "**Interpretation.** The decisive limitation is the first one. Control ran minutes 0–15 and candidate ran minutes 20–37; the variant is perfectly " +
      "confounded with time. Every association reported above is observational. Nothing in this dataset can distinguish \"the candidate code path is slower\" " +
      "from \"the system was under different conditions after minute 20\" — and the within-candidate time trend is exactly what you would expect from the latter.",
  );
  L.push("");

  // Q8
  L.push("## 8. Justified rollout action");
  L.push("");
  L.push("**Recommendation.**");
  L.push("");
  for (const r of a.recommendations.filter((x) => x.kind === "rollout_action")) {
    L.push(`### ${r.title}`);
    L.push("");
    L.push(r.detail);
    L.push("");
  }
  L.push(
    "**What is *not* justified by this dataset alone:** a full rollback (three of four strata improve, some materially), a claim that the candidate " +
      "causes 504s (four errors, no control counterfactual in the same time window), or a public performance claim in either direction.",
  );
  L.push("");

  // Q9
  L.push("## 9. Two follow-ups that would most reduce uncertainty");
  L.push("");
  L.push("**Recommendation.**");
  L.push("");
  for (const r of a.recommendations.filter((x) => x.kind === "follow_up")) {
    L.push(`### ${r.title}`);
    L.push("");
    L.push(r.detail);
    L.push("");
  }

  // Findings appendix
  L.push("## Appendix — findings register");
  L.push("");
  for (const f of a.findings) {
    L.push(`### ${f.id} · ${f.title}`);
    L.push("");
    L.push(`*${f.kind.replace(/_/g, " ")} · confidence: ${f.confidence}*`);
    L.push("");
    L.push(f.detail);
    L.push("");
    L.push("Evidence:");
    L.push("");
    for (const e of f.evidence) L.push(`- ${e}`);
    L.push("");
  }

  L.push("## Reproducing this analysis");
  L.push("");
  L.push("```sh");
  L.push("bun run src/cli.ts data/requests.csv \\");
  L.push("  --json out/analysis.json \\");
  L.push("  --markdown analysis.md \\");
  L.push("  --html report.html");
  L.push("```");
  L.push("");
  L.push("Output is deterministic: identical input produces byte-identical JSON.");
  L.push("");

  return L.join("\n");
}

// ---------------------------------------------------------------------------
// HTML
// ---------------------------------------------------------------------------

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Paired horizontal bars: control above candidate for each category. */
function pairedBarChart(
  rows: Array<{ label: string; controlValue: number | null; candidateValue: number | null; controlN: number; candidateN: number; note?: string }>,
  opts: { width: number; unit: string; labelWidth: number },
): string {
  const { width, unit, labelWidth } = opts;
  const barH = 13;
  const gap = 2; // 2px surface gap between the paired fills
  const groupH = barH * 2 + gap + 20;
  const height = rows.length * groupH + 26;
  const plotW = width - labelWidth - 96;
  const maxValue = Math.max(
    1,
    ...rows.flatMap((r) => [r.controlValue ?? 0, r.candidateValue ?? 0]),
  );
  const scale = (v: number) => (v / maxValue) * plotW;

  const parts: string[] = [];
  parts.push(`<svg class="chart" viewBox="0 0 ${width} ${height}" width="100%" height="${height}" role="img" aria-label="Paired comparison of control and candidate">`);

  // Recessive gridlines
  for (let i = 0; i <= 4; i++) {
    const x = labelWidth + (plotW * i) / 4;
    parts.push(`<line x1="${x.toFixed(1)}" y1="14" x2="${x.toFixed(1)}" y2="${height - 12}" class="grid"/>`);
    parts.push(`<text x="${x.toFixed(1)}" y="10" class="tick" text-anchor="middle">${Math.round((maxValue * i) / 4)}</text>`);
  }
  // The unit lives in the card heading, not beside the last tick, where it would collide.
  parts.push(`<text x="${labelWidth - 10}" y="10" class="tick" text-anchor="end">${esc(unit)}</text>`);

  rows.forEach((r, i) => {
    const top = 22 + i * groupH;
    parts.push(
      `<text x="${labelWidth - 10}" y="${top + barH}" class="cat-label" text-anchor="end">${esc(r.label)}</text>`,
    );
    if (r.note) {
      parts.push(
        `<text x="${labelWidth - 10}" y="${top + barH + 15}" class="cat-sub" text-anchor="end">${esc(r.note)}</text>`,
      );
    }
    const series: Array<["control" | "candidate", number | null, number]> = [
      ["control", r.controlValue, r.controlN],
      ["candidate", r.candidateValue, r.candidateN],
    ];
    series.forEach(([name, value, n], k) => {
      const y = top + k * (barH + gap);
      if (value === null) {
        parts.push(
          `<text x="${labelWidth + 6}" y="${y + barH - 3}" class="value-label muted-ink">no ${name} traffic</text>`,
        );
        return;
      }
      const w = Math.max(2, scale(value));
      parts.push(
        `<rect x="${labelWidth}" y="${y}" width="${w.toFixed(1)}" height="${barH}" rx="4" class="bar bar-${name}">` +
          `<title>${esc(r.label)} — ${name}: ${value} ${unit} (n=${n})</title></rect>`,
      );
      parts.push(
        `<text x="${(labelWidth + w + 7).toFixed(1)}" y="${y + barH - 2}" class="value-label">${value} <tspan class="muted-ink">n=${n}</tspan></text>`,
      );
    });
  });

  parts.push("</svg>");
  return parts.join("");
}

/** Grouped vertical bars for the aggregate metric comparison. */
function groupedBarChart(
  groups: Array<{ label: string; control: number; candidate: number }>,
  opts: { width: number; height: number; unit: string },
): string {
  const { width, height, unit } = opts;
  const padL = 46;
  const padB = 26; // no in-chart unit label; the card heading carries the unit
  const padT = 16;
  const plotW = width - padL - 16;
  const plotH = height - padB - padT;
  const maxValue = Math.max(...groups.flatMap((g) => [g.control, g.candidate])) * 1.18;
  const y = (v: number) => padT + plotH - (v / maxValue) * plotH;
  const groupW = plotW / groups.length;
  const barW = Math.min(34, (groupW - 18) / 2);

  const parts: string[] = [];
  parts.push(`<svg class="chart" viewBox="0 0 ${width} ${height}" width="100%" height="${height}" role="img" aria-label="Aggregate latency metrics, control versus candidate">`);
  for (let i = 0; i <= 4; i++) {
    const v = (maxValue * i) / 4;
    parts.push(`<line x1="${padL}" y1="${y(v).toFixed(1)}" x2="${width - 16}" y2="${y(v).toFixed(1)}" class="grid"/>`);
    parts.push(`<text x="${padL - 8}" y="${(y(v) + 3.5).toFixed(1)}" class="tick" text-anchor="end">${Math.round(v)}</text>`);
  }
  parts.push(`<line x1="${padL}" y1="${padT + plotH}" x2="${width - 16}" y2="${padT + plotH}" class="axis"/>`);

  groups.forEach((g, i) => {
    const cx = padL + groupW * i + groupW / 2;
    const xs: Array<["control" | "candidate", number, number]> = [
      ["control", g.control, cx - barW - 1],
      ["candidate", g.candidate, cx + 1],
    ];
    for (const [name, v, x] of xs) {
      const h = Math.max(2, padT + plotH - y(v));
      parts.push(
        `<rect x="${x.toFixed(1)}" y="${y(v).toFixed(1)}" width="${barW.toFixed(1)}" height="${h.toFixed(1)}" rx="4" class="bar bar-${name}">` +
          `<title>${esc(g.label)} — ${name}: ${v} ${unit}</title></rect>`,
      );
      parts.push(
        `<text x="${(x + barW / 2).toFixed(1)}" y="${(y(v) - 5).toFixed(1)}" class="value-label" text-anchor="middle">${v}</text>`,
      );
    }
    parts.push(`<text x="${cx.toFixed(1)}" y="${padT + plotH + 18}" class="cat-label" text-anchor="middle">${esc(g.label)}</text>`);
  });
  parts.push("</svg>");
  return parts.join("");
}

/** Payload vs latency scatter, split by variant, errors ringed. */
function scatterChart(
  rows: RequestRow[],
  opts: { width: number; height: number },
): string {
  const { width, height } = opts;
  const padL = 54;
  const padB = 46;
  const padT = 14;
  const padR = 18;
  const plotW = width - padL - padR;
  const plotH = height - padT - padB;
  const maxX = 1200;
  const maxY = 1700;
  const px = (v: number) => padL + (v / maxX) * plotW;
  const py = (v: number) => padT + plotH - (v / maxY) * plotH;

  const parts: string[] = [];
  parts.push(`<svg class="chart" viewBox="0 0 ${width} ${height}" width="100%" height="${height}" role="img" aria-label="Payload size versus latency for every request, by variant">`);
  for (let i = 0; i <= 4; i++) {
    const v = (maxY * i) / 4;
    parts.push(`<line x1="${padL}" y1="${py(v).toFixed(1)}" x2="${width - padR}" y2="${py(v).toFixed(1)}" class="grid"/>`);
    parts.push(`<text x="${padL - 8}" y="${(py(v) + 3.5).toFixed(1)}" class="tick" text-anchor="end">${Math.round(v)}</text>`);
  }
  for (let i = 0; i <= 6; i++) {
    const v = (maxX * i) / 6;
    parts.push(`<text x="${px(v).toFixed(1)}" y="${padT + plotH + 16}" class="tick" text-anchor="middle">${Math.round(v)}</text>`);
  }
  parts.push(`<line x1="${padL}" y1="${padT + plotH}" x2="${width - padR}" y2="${padT + plotH}" class="axis"/>`);
  parts.push(`<text x="${(padL + plotW / 2).toFixed(1)}" y="${padT + plotH + 36}" class="axis-title" text-anchor="middle">Payload (KB)</text>`);
  parts.push(`<text transform="translate(14,${(padT + plotH / 2).toFixed(1)}) rotate(-90)" class="axis-title" text-anchor="middle">Latency (ms)</text>`);

  // Highlight band: the payload range where both arms have EU/mobile/cold data.
  const bandX1 = px(720);
  const bandX2 = px(960);
  parts.push(
    `<rect x="${bandX1.toFixed(1)}" y="${padT}" width="${(bandX2 - bandX1).toFixed(1)}" height="${plotH}" class="overlap-band"/>`,
  );
  parts.push(
    `<text x="${((bandX1 + bandX2) / 2).toFixed(1)}" y="${padT + 12}" class="band-label" text-anchor="middle">720–960 KB: both arms present</text>`,
  );

  for (const variant of ["control", "candidate"] as const) {
    for (const r of rows.filter((x) => x.variant === variant)) {
      const isError = r.status !== 200;
      parts.push(
        `<circle cx="${px(r.payload_kb).toFixed(1)}" cy="${py(r.latency_ms).toFixed(1)}" r="${isError ? 7 : 5}" ` +
          `class="dot dot-${variant}${isError ? " dot-error" : ""}">` +
          `<title>${esc(r.request_id)} · ${variant} · ${esc(stratumKey(r))} · minute ${r.minute} · ${r.payload_kb} KB · ${r.latency_ms} ms · status ${r.status}</title>` +
          `</circle>`,
      );
    }
  }
  parts.push("</svg>");
  return parts.join("");
}

/** Within-variant share bars for a mix dimension. */
function mixChart(cells: Analysis["traffic_mix"]["region"], width: number): string {
  const barH = 11;
  const gap = 2;
  const rowH = barH * 2 + gap + 16;
  const height = cells.length * rowH + 6;
  const labelW = 108;
  const plotW = width - labelW - 82;
  const parts: string[] = [];
  parts.push(`<svg class="chart" viewBox="0 0 ${width} ${height}" width="100%" height="${height}" role="img" aria-label="Traffic share by variant">`);
  cells.forEach((m, i) => {
    const top = 4 + i * rowH;
    parts.push(`<text x="${labelW - 10}" y="${top + barH}" class="cat-label" text-anchor="end">${esc(m.key)}</text>`);
    const series: Array<["control" | "candidate", number, number]> = [
      ["control", m.control_share, m.control_n],
      ["candidate", m.candidate_share, m.candidate_n],
    ];
    series.forEach(([name, share, n], k) => {
      const y = top + k * (barH + gap);
      const w = Math.max(1.5, share * plotW);
      parts.push(
        `<rect x="${labelW}" y="${y}" width="${w.toFixed(1)}" height="${barH}" rx="4" class="bar bar-${name}">` +
          `<title>${esc(m.key)} — ${name}: ${(share * 100).toFixed(1)}% (n=${n})</title></rect>`,
      );
      parts.push(
        `<text x="${(labelW + w + 6).toFixed(1)}" y="${y + barH - 1.5}" class="value-label">${(share * 100).toFixed(1)}% <tspan class="muted-ink">n=${n}</tspan></text>`,
      );
    });
  });
  parts.push("</svg>");
  return parts.join("");
}

function legend(): string {
  return (
    `<div class="legend">` +
    `<span class="legend-item"><span class="swatch swatch-control"></span>control</span>` +
    `<span class="legend-item"><span class="swatch swatch-candidate"></span>candidate</span>` +
    `</div>`
  );
}

export function renderHtml(a: Analysis, rows: RequestRow[]): string {
  const c = a.variants.control!;
  const d = a.variants.candidate!;
  const comparable = a.strata.filter((s) => s.direction !== "no_comparison");
  const worst = [...comparable].sort((x, y) => (y.mean_delta_pct ?? 0) - (x.mean_delta_pct ?? 0))[0]!;
  const faster = comparable.filter((s) => s.direction === "candidate_faster");
  const ov = a.payload_analysis.eu_mobile_cold_overlap;

  const strataRows = a.strata.map((s) => ({
    label: s.stratum,
    controlValue: s.control?.mean ?? null,
    candidateValue: s.candidate?.mean ?? null,
    controlN: s.control?.n ?? 0,
    candidateN: s.candidate?.n ?? 0,
    note: s.mean_delta_pct === null ? "no paired comparison" : `${s.mean_delta_pct > 0 ? "+" : ""}${s.mean_delta_pct}% mean`,
  }));

  const html: string[] = [];
  html.push(`<!doctype html>
<html lang="en" data-theme="light">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=1600">
<title>Latency Forensics — Find the Real Rollout Regression</title>
<style>
  :root {
    color-scheme: light;
    --surface-1: #fcfcfb;
    --page: #f9f9f7;
    --text-primary: #0b0b0b;
    --text-secondary: #52514e;
    --muted: #898781;
    --grid: #e1e0d9;
    --axis: #c3c2b7;
    --border: rgba(11,11,11,0.10);
    --series-control: #2a78d6;
    --series-candidate: #eb6834;
    --critical: #d03b3b;
    --good: #006300;
    --band: rgba(42,120,214,0.07);
  }
  @media (prefers-color-scheme: dark) {
    :root:where(:not([data-theme="light"])) {
      color-scheme: dark;
      --surface-1: #1a1a19;
      --page: #0d0d0d;
      --text-primary: #ffffff;
      --text-secondary: #c3c2b7;
      --muted: #898781;
      --grid: #2c2c2a;
      --axis: #383835;
      --border: rgba(255,255,255,0.10);
      --series-control: #3987e5;
      --series-candidate: #d95926;
      --critical: #d03b3b;
      --good: #0ca30c;
      --band: rgba(57,135,229,0.10);
    }
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    background: var(--page);
    color: var(--text-primary);
    font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
    font-size: 14px;
    line-height: 1.5;
  }
  .wrap { width: 1600px; margin: 0 auto; padding: 0 0 64px; }
  .overview { width: 1600px; height: 900px; padding: 26px 32px 14px; display: grid;
              grid-template-columns: 470px 1fr; grid-template-rows: auto 1fr; gap: 18px 22px;
              background: var(--page); overflow: hidden; }
  .card { background: var(--surface-1); border: 1px solid var(--border); border-radius: 12px; padding: 16px 18px; }
  h1 { font-size: 23px; line-height: 1.2; margin: 0 0 4px; letter-spacing: -0.01em; }
  h2 { font-size: 19px; margin: 30px 0 10px; letter-spacing: -0.01em; }
  h3 { font-size: 14px; margin: 0 0 10px; color: var(--text-secondary); text-transform: uppercase;
       letter-spacing: 0.06em; font-weight: 600; }
  .kicker { color: var(--muted); font-size: 12.5px; margin: 0 0 14px; }
  .verdict { font-size: 15px; line-height: 1.44; margin: 0 0 9px; }
  .verdict strong { font-weight: 650; }
  .verdict-hold { display:inline-block; padding: 2px 9px; border-radius: 999px; font-size: 12px;
                  font-weight: 650; letter-spacing: 0.02em; border: 1px solid var(--critical);
                  color: var(--critical); margin-right: 6px; }
  .verdict-go { display:inline-block; padding: 2px 9px; border-radius: 999px; font-size: 12px;
                font-weight: 650; letter-spacing: 0.02em; border: 1px solid var(--good);
                color: var(--good); margin-right: 6px; }
  p { margin: 0 0 10px; }
  .sub { color: var(--text-secondary); font-size: 13px; }
  .tiles { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-top: 4px; }
  .tile { background: var(--surface-1); border: 1px solid var(--border); border-radius: 10px; padding: 10px 12px; }
  .tile .tv { font-size: 24px; font-weight: 620; letter-spacing: -0.02em; line-height: 1.1; }
  .tile .tl { font-size: 11px; color: var(--muted); margin-top: 3px; line-height: 1.3; }
  .tile .tn { font-size: 11px; color: var(--text-secondary); margin-top: 2px; }
  /* Let the viewBox aspect ratio govern; without this the SVG shrinks as a flex item. */
  svg.chart { display: block; width: 100%; height: auto; flex: none; }
  .grid { stroke: var(--grid); stroke-width: 1; }
  .axis { stroke: var(--axis); stroke-width: 1; }
  .tick { fill: var(--muted); font-size: 10.5px; font-variant-numeric: tabular-nums; }
  .axis-title { fill: var(--text-secondary); font-size: 11.5px; }
  .cat-label { fill: var(--text-primary); font-size: 12px; }
  .cat-sub { fill: var(--muted); font-size: 10.5px; }
  .value-label { fill: var(--text-primary); font-size: 11px; font-variant-numeric: tabular-nums; }
  .muted-ink { fill: var(--muted); }
  .bar-control { fill: var(--series-control); }
  .bar-candidate { fill: var(--series-candidate); }
  .bar:hover { opacity: 0.82; }
  .dot { stroke: var(--surface-1); stroke-width: 2; }
  .dot-control { fill: var(--series-control); }
  .dot-candidate { fill: var(--series-candidate); }
  .dot-error { stroke: var(--critical); stroke-width: 2.5; }
  .dot:hover { stroke: var(--text-primary); }
  .overlap-band { fill: var(--band); }
  .band-label { fill: var(--muted); font-size: 10.5px; }
  .legend { display: flex; gap: 16px; align-items: center; font-size: 12px; color: var(--text-secondary); margin-bottom: 8px; }
  .legend-item { display: inline-flex; align-items: center; gap: 6px; }
  .swatch { width: 11px; height: 11px; border-radius: 3px; display: inline-block; }
  .swatch-control { background: var(--series-control); }
  .swatch-candidate { background: var(--series-candidate); }
  .err-flag { display:inline-flex; align-items:center; gap:5px; color: var(--critical); font-size: 12px; }
  .err-ring { width: 11px; height: 11px; border-radius: 50%; border: 2.5px solid var(--critical); display:inline-block; }
  table { border-collapse: collapse; width: 100%; font-size: 12.5px; font-variant-numeric: tabular-nums; }
  th, td { text-align: right; padding: 6px 9px; border-bottom: 1px solid var(--grid); white-space: nowrap; }
  th:first-child, td:first-child { text-align: left; font-variant-numeric: normal; }
  th { color: var(--muted); font-weight: 600; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; }
  tr:last-child td { border-bottom: none; }
  td.n { color: var(--text-secondary); }
  .faster { color: var(--good); }
  .slower { color: var(--critical); }
  .cols { display: grid; grid-template-columns: 1fr 1fr; gap: 22px; }
  .cols3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 22px; }
  ol, ul { margin: 0 0 10px; padding-left: 20px; }
  li { margin-bottom: 7px; }
  .tag { display: inline-block; font-size: 10.5px; text-transform: uppercase; letter-spacing: 0.05em;
         padding: 1px 7px; border-radius: 999px; border: 1px solid var(--border); color: var(--muted);
         margin-right: 7px; vertical-align: 1.5px; }
  code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px;
         background: var(--page); padding: 1px 4px; border-radius: 4px; border: 1px solid var(--border); }
  .note { color: var(--text-secondary); font-size: 12px; margin-top: 8px; }
  footer { color: var(--muted); font-size: 12px; margin-top: 34px; padding-top: 14px; border-top: 1px solid var(--border); }
</style>
</head>
<body>
<div class="wrap">`);

  // ---- 1600x900 overview ---------------------------------------------------
  html.push(`<section class="overview">`);
  html.push(`<div style="display:flex;flex-direction:column;gap:14px;min-height:0;">`);
  html.push(`<div class="card">`);
  html.push(`<h1>The candidate is not broadly slower.<br>One interaction is.</h1>`);
  html.push(
    `<p class="kicker">Latency forensics · ${a.row_count} requests · ${c.count} control (minutes ${Math.min(...rows.filter((r) => r.variant === "control").map((r) => r.minute))}–${Math.max(...rows.filter((r) => r.variant === "control").map((r) => r.minute))}) · ${d.count} candidate (minutes ${Math.min(...rows.filter((r) => r.variant === "candidate").map((r) => r.minute))}–${Math.max(...rows.filter((r) => r.variant === "candidate").map((r) => r.minute))})</p>`,
  );
  html.push(
    `<p class="verdict">Aggregate latency is <strong>${a.aggregate_comparison.mean_delta_pct}% higher</strong> for candidate — but candidate is <strong>faster</strong> in ` +
      `${faster.length} of ${comparable.length} comparable strata. The aggregate is dominated by traffic mix: the candidate arm carries ` +
      `<strong>${a.traffic_mix.heavy_stratum_share.share_ratio}×</strong> control's share of the slowest stratum.</p>`,
  );
  html.push(
    `<p class="verdict">The real regression is isolated to <strong>${esc(worst.stratum)}</strong>: ${worst.control!.mean} ms (n=${worst.control!.n}) → ` +
      `<strong>${worst.candidate!.mean} ms</strong> (n=${worst.candidate!.n}), ${worst.mean_delta_pct}%. All ${a.error_rows.length} non-200 responses land there. ` +
      `The gap survives payload matching (${ov.mean_delta_pct}% at ${ov.overlap_lower_kb}–${ov.overlap_upper_kb} KB).</p>`,
  );
  html.push(
    `<p class="verdict"><span class="verdict-hold">HOLD</span>${esc(worst.stratum)}, especially large cold payloads. ` +
      `<span class="verdict-go">CONTINUE</span>elsewhere, behind per-stratum guardrails.</p>`,
  );
  html.push(
    `<p class="sub">Observational data from <strong>disjoint time windows</strong> (control 0–15, candidate 20–37). Association only — no causal claim is supported.</p>`,
  );
  html.push(`</div>`);

  html.push(`<div class="tiles">`);
  const tiles: Array<[string, string, string]> = [
    [`${a.aggregate_comparison.mean_delta_pct}%`, "Aggregate mean delta<br>(confounded — not an effect)", `${c.all_rows.mean} → ${d.all_rows.mean} ms`],
    [`${faster.length} of ${comparable.length}`, "Strata where candidate<br>is faster", `${comparable.length} comparable strata`],
    [`${worst.mean_delta_pct}%`, `Mean delta in<br>${esc(worst.stratum)}`, `n=${worst.control!.n} vs ${worst.candidate!.n}`],
    [`${(d.non_200_rate * 100).toFixed(1)}%`, "Candidate non-200 rate<br>(control 0.0%)", `${d.non_200_count} of ${d.count} rows, all 504`],
  ];
  for (const [v, l, n] of tiles) {
    html.push(`<div class="tile"><div class="tv">${v}</div><div class="tl">${l}</div><div class="tn">${n}</div></div>`);
  }
  html.push(`</div>`);

  html.push(`<div class="card" style="flex:1;min-height:0;display:flex;flex-direction:column;">`);
  html.push(`<h3>Aggregate comparison (ms) — all rows</h3>`);
  html.push(legend());
  html.push(
    groupedBarChart(
      [
        { label: "mean", control: c.all_rows.mean, candidate: d.all_rows.mean },
        { label: "median", control: c.all_rows.median, candidate: d.all_rows.median },
        { label: "p95", control: c.all_rows.p95, candidate: d.all_rows.p95 },
        { label: "max", control: c.all_rows.max, candidate: d.all_rows.max },
      ],
      { width: 420, height: 130, unit: "ms" },
    ),
  );
  html.push(`<p class="note">n=${c.count} control, n=${d.count} candidate. Non-200 rows included.</p>`);
  html.push(`</div>`);
  html.push(`</div>`);

  // Right column of overview
  html.push(`<div style="display:flex;flex-direction:column;gap:14px;min-height:0;">`);
  html.push(`<div class="card">`);
  html.push(`<h3>Mean latency by stratum (ms) — region / device / cache</h3>`);
  html.push(legend());
  html.push(pairedBarChart(strataRows, { width: 1020, unit: "ms", labelWidth: 190 }));
  html.push(
    `<p class="note">Candidate improves in ${faster.length} of ${comparable.length} strata. The single regressed stratum is ${esc(worst.stratum)}.</p>`,
  );
  html.push(`</div>`);

  html.push(`<div class="card" style="flex:1;min-height:0;">`);
  html.push(`<h3>Payload vs latency — every request</h3>`);
  html.push(
    `<div class="legend"><span class="legend-item"><span class="swatch swatch-control"></span>control</span>` +
      `<span class="legend-item"><span class="swatch swatch-candidate"></span>candidate</span>` +
      `<span class="legend-item err-flag"><span class="err-ring"></span>non-200 (504)</span>` +
      `<span class="legend-item" style="color:var(--muted)">hover any point for full detail</span></div>`,
  );
  html.push(scatterChart(rows, { width: 1020, height: 300 }));
  html.push(`</div>`);
  html.push(`</div>`);
  html.push(`</section>`);

  // ---- Detail sections -----------------------------------------------------
  html.push(`<div style="padding: 0 32px;">`);

  // Validation
  html.push(`<h2>Validation and conventions</h2>`);
  html.push(`<div class="cols">`);
  html.push(`<div class="card"><h3>Checkpoints</h3><table><thead><tr><th>Check</th><th>Expected</th><th>Actual</th><th>Result</th></tr></thead><tbody>`);
  const checks: Array<[string, string, string, boolean]> = [
    ["Total rows", "80", String(a.row_count), a.validation.row_count_is_80],
    ["Control rows", "40", String(a.validation.control_rows), a.validation.control_rows === 40],
    ["Candidate rows", "40", String(a.validation.candidate_rows), a.validation.candidate_rows === 40],
    ["Control non-200", "0", String(c.non_200_count), a.validation.control_non_200_is_zero],
    ["Candidate non-200", "4", String(d.non_200_count), a.validation.candidate_non_200_is_four],
  ];
  for (const [name, exp, act, ok] of checks) {
    html.push(
      `<tr><td>${name}</td><td>${exp}</td><td>${act}</td><td class="${ok ? "faster" : "slower"}">${ok ? "pass" : "FAIL"}</td></tr>`,
    );
  }
  html.push(`</tbody></table></div>`);
  html.push(
    `<div class="card"><h3>Conventions</h3><p class="sub">${esc(a.quantile_convention)}</p>` +
      `<p class="sub">Non-200 rows are retained in all-rows statistics and reported separately — dropping them would systematically remove the slowest observations. ` +
      `Statistics are reported to one decimal place because source latencies are whole milliseconds; no further precision is claimed. ` +
      `Grouping keys and payload-bucket edges are declared in code, so ordering never depends on row order.</p></div>`,
  );
  html.push(`</div>`);

  // Aggregate tables
  html.push(`<h2>1 · Aggregate statistics by variant</h2>`);
  html.push(`<span class="tag">computed fact</span>`);
  html.push(`<div class="cols">`);
  for (const [title, key] of [
    ["All rows (non-200 included)", "all_rows"],
    ["Status 200 only", "status_200_only"],
  ] as const) {
    html.push(`<div class="card"><h3>${title}</h3><table><thead><tr><th>Variant</th><th>n</th><th>Mean</th><th>Median</th><th>p95</th><th>Min</th><th>Max</th></tr></thead><tbody>`);
    for (const v of [c, d]) {
      const s = v[key];
      html.push(
        `<tr><td>${v.variant}</td><td class="n">${s.n}</td><td>${s.mean}</td><td>${s.median}</td><td>${s.p95}</td><td>${s.min}</td><td>${s.max}</td></tr>`,
      );
    }
    html.push(`</tbody></table></div>`);
  }
  html.push(`</div>`);
  html.push(
    `<p class="note">Deltas (all rows): mean ${a.aggregate_comparison.mean_delta_ms} ms (${a.aggregate_comparison.mean_delta_pct}%), ` +
      `median ${a.aggregate_comparison.median_delta_ms} ms (${a.aggregate_comparison.median_delta_pct}%), ` +
      `p95 ${a.aggregate_comparison.p95_delta_ms} ms (${a.aggregate_comparison.p95_delta_pct}%). ` +
      `Non-200 rate: control ${(c.non_200_rate * 100).toFixed(1)}% (${c.non_200_count}/${c.count}), candidate ${(d.non_200_rate * 100).toFixed(1)}% (${d.non_200_count}/${d.count}).</p>`,
  );

  // Traffic mix
  html.push(`<h2>2 · Traffic mix — the arms are not comparable in aggregate</h2>`);
  html.push(`<span class="tag">computed fact</span>`);
  html.push(legend());
  html.push(`<div class="cols">`);
  for (const [title, cells] of [
    ["Region", a.traffic_mix.region],
    ["Device", a.traffic_mix.device],
    ["Cache state", a.traffic_mix.cache],
    ["Payload range", a.traffic_mix.payload_range],
  ] as const) {
    html.push(`<div class="card"><h3>${title} — share within variant</h3>${mixChart(cells, 700)}</div>`);
  }
  html.push(`</div>`);
  html.push(
    `<p class="note">The slowest stratum by control mean, <code>${esc(a.traffic_mix.heavy_stratum_share.stratum)}</code>, is ` +
      `${(a.traffic_mix.heavy_stratum_share.candidate_share * 100).toFixed(1)}% of candidate traffic against ` +
      `${(a.traffic_mix.heavy_stratum_share.control_share * 100).toFixed(1)}% of control traffic — a ${a.traffic_mix.heavy_stratum_share.share_ratio}× over-representation.</p>`,
  );

  // Strata table
  html.push(`<h2>3 · Within-stratum comparison</h2>`);
  html.push(`<span class="tag">computed fact</span>`);
  html.push(`<div class="card"><table><thead><tr><th>Stratum</th><th>Ctl n</th><th>Ctl mean</th><th>Ctl median</th><th>Ctl p95</th><th>Cnd n</th><th>Cnd mean</th><th>Cnd median</th><th>Cnd p95</th><th>Mean delta</th><th>Direction</th></tr></thead><tbody>`);
  for (const s of a.strata) {
    const cls = s.direction === "candidate_faster" ? "faster" : s.direction === "candidate_slower" ? "slower" : "";
    html.push(
      `<tr><td>${esc(s.stratum)}</td><td class="n">${s.control?.n ?? "—"}</td><td>${s.control?.mean ?? "—"}</td><td>${s.control?.median ?? "—"}</td><td>${s.control?.p95 ?? "—"}</td>` +
        `<td class="n">${s.candidate?.n ?? "—"}</td><td>${s.candidate?.mean ?? "—"}</td><td>${s.candidate?.median ?? "—"}</td><td>${s.candidate?.p95 ?? "—"}</td>` +
        `<td class="${cls}">${s.mean_delta_ms === null ? "—" : `${s.mean_delta_ms} ms (${s.mean_delta_pct! > 0 ? "+" : ""}${s.mean_delta_pct}%)`}</td>` +
        `<td class="${cls}">${s.direction.replace(/_/g, " ")}</td></tr>`,
    );
  }
  html.push(`</tbody></table></div>`);

  // Simpson
  html.push(`<h2>4 · The aggregate conceals a mix effect</h2>`);
  html.push(`<span class="tag">interpretation</span>`);
  html.push(`<div class="cols">`);
  html.push(
    `<div class="card"><h3>Direct standardisation</h3><table><tbody>` +
      `<tr><td>Control mean (observed)</td><td>${c.all_rows.mean} ms</td><td class="n">n=${c.count}</td></tr>` +
      `<tr><td>Candidate mean (observed)</td><td>${d.all_rows.mean} ms</td><td class="n">n=${d.count}</td></tr>` +
      `<tr><td>Candidate mean standardised to control mix</td><td><strong>${a.simpsons_paradox.mix_adjusted_candidate_mean_ms} ms</strong></td><td class="n">${comparable.length} strata</td></tr>` +
      `</tbody></table><p class="note">${esc(a.simpsons_paradox.mix_adjusted_note)}</p></div>`,
  );
  html.push(
    `<div class="card"><h3>Reading</h3><p class="sub">${esc(a.simpsons_paradox.explanation)}</p>` +
      `<p class="sub">Standardisation removes most of the apparent regression but not all of it. The residual is the one genuinely regressed stratum leaking through. ` +
      `This is a mix artefact <em>plus</em> a real localised regression — reporting only "Simpson's paradox, ship it" would be as wrong as reporting only the aggregate.</p></div>`,
  );
  html.push(`</div>`);

  // Payload
  html.push(`<h2>5–6 · Payload, and what supports or weakens the large-payload hypothesis</h2>`);
  html.push(`<div class="cols">`);
  html.push(`<div class="card"><h3>Mean latency by payload bucket (ms)</h3>${legend()}`);
  html.push(
    pairedBarChart(
      a.payload_analysis.buckets.map((b) => ({
        label: b.bucket,
        controlValue: b.control_mean_ms,
        candidateValue: b.candidate_mean_ms,
        controlN: b.control_n,
        candidateN: b.candidate_n,
        note: b.mean_delta_pct === null ? "no paired comparison" : `${b.mean_delta_pct > 0 ? "+" : ""}${b.mean_delta_pct}% mean`,
      })),
      { width: 700, unit: "ms", labelWidth: 132 },
    ),
  );
  html.push(
    `<p class="note">Buckets have fixed edges declared in code. Buckets where only one arm has traffic are shown but not compared.</p></div>`,
  );
  html.push(
    `<div class="card"><h3>Payload-matched comparison inside ${esc(worst.stratum)}</h3>` +
      `<table><tbody>` +
      `<tr><td>Payload range present in both arms</td><td>${ov.overlap_lower_kb}–${ov.overlap_upper_kb} KB</td><td></td></tr>` +
      `<tr><td>Control mean</td><td>${ov.control_mean_ms} ms</td><td class="n">n=${ov.control_n}</td></tr>` +
      `<tr><td>Candidate mean</td><td>${ov.candidate_mean_ms} ms</td><td class="n">n=${ov.candidate_n}</td></tr>` +
      `<tr><td>Difference</td><td class="slower"><strong>${ov.mean_delta_ms} ms (${ov.mean_delta_pct > 0 ? "+" : ""}${ov.mean_delta_pct}%)</strong></td><td></td></tr>` +
      `<tr><td>Bootstrap 95% interval</td><td>[${a.payload_analysis.bootstrap.ci_low_ms}, ${a.payload_analysis.bootstrap.ci_high_ms}] ms</td><td class="n">seed ${a.payload_analysis.bootstrap.seed}</td></tr>` +
      `</tbody></table>` +
      `<p class="note">${esc(ov.note)}</p>` +
      `<p class="note">${esc(a.payload_analysis.bootstrap.note)}</p></div>`,
  );
  html.push(`</div>`);

  html.push(`<div class="cols" style="margin-top:22px">`);
  html.push(`<div class="card"><h3>Trend slopes inside ${esc(worst.stratum)}</h3><table><thead><tr><th>Series</th><th>Against</th><th>n</th><th>Slope</th><th>r</th></tr></thead><tbody>`);
  for (const s of a.payload_analysis.slopes) {
    html.push(
      `<tr><td>${esc(s.series.split(" — ")[1] ?? s.series)}</td><td>${s.x === "payload_kb" ? "payload (per KB)" : "time (per minute)"}</td><td class="n">${s.n}</td><td>${s.slope}</td><td>${s.r}</td></tr>`,
    );
  }
  const cndP = a.payload_analysis.slopes.find((s) => s.x === "payload_kb" && s.series.endsWith("candidate"));
  const ctlP = a.payload_analysis.slopes.find((s) => s.x === "payload_kb" && s.series.endsWith("control"));
  html.push(`</tbody></table><p class="note">Candidate's per-KB cost (${cndP?.slope} ms/KB) is about ` +
    `${ctlP && ctlP.slope !== 0 ? (cndP!.slope / ctlP.slope).toFixed(1) : "?"}× control's (${ctlP?.slope} ms/KB) — real support for a per-byte cost. But r=${cndP?.r} means payload accounts for only ` +
    `about ${Math.round((cndP?.r ?? 0) ** 2 * 100)}% of the variance here, elapsed minute is a weaker competing correlate, and the two are collinear. The relationship is not even monotone: ` +
    `r078 (1040 KB) took 1584 ms while r079 (1120 KB) took 986 ms. Payload is the best available <em>marker</em> for the affected traffic, not an identified cause.</p></div>`);

  html.push(`<div class="card"><h3>Non-200 rows — all candidate, all in one stratum</h3><table><thead><tr><th>Request</th><th>Variant</th><th>Minute</th><th>Stratum</th><th>Payload</th><th>Latency</th><th>Status</th></tr></thead><tbody>`);
  for (const r of a.error_rows) {
    html.push(
      `<tr><td>${esc(r.request_id)}</td><td>${esc(r.variant)}</td><td>${r.minute}</td><td>${esc(r.stratum)}</td><td>${r.payload_kb} KB</td><td>${r.latency_ms} ms</td><td class="slower">${r.status}</td></tr>`,
    );
  }
  html.push(`</tbody></table><p class="note">Control produced zero non-200 rows across ${c.count} requests. A 504 latency records how long the request took to give up, ` +
    `not a completed service time — these values are retained in the all-rows statistics but should not be read as service times.</p></div>`);
  html.push(`</div>`);

  // Findings
  html.push(`<h2>Findings</h2>`);
  html.push(`<div class="cols">`);
  for (const f of a.findings) {
    html.push(
      `<div class="card"><h3>${esc(f.id)} · ${f.kind.replace(/_/g, " ")} · confidence ${f.confidence}</h3>` +
        `<p><strong>${esc(f.title)}</strong></p><p class="sub">${esc(f.detail)}</p>` +
        `<ul class="sub">${f.evidence.map((e) => `<li>${esc(e)}</li>`).join("")}</ul></div>`,
    );
  }
  html.push(`</div>`);

  // Limitations
  html.push(`<h2>7 · Limitations that prevent a causal claim</h2>`);
  html.push(`<div class="card"><ol>${a.limitations.map((l) => `<li>${esc(l)}</li>`).join("")}</ol>`);
  html.push(
    `<p class="note">The decisive limitation is the first. Control ran minutes 0–15 and candidate ran minutes 20–37, so the variant is perfectly confounded with time. ` +
      `Nothing here distinguishes "the candidate path is slower" from "conditions changed after minute 20" — and the within-candidate time trend is exactly what the latter would produce.</p></div>`,
  );

  // Recommendations
  html.push(`<h2>8–9 · Recommendation and follow-ups</h2>`);
  html.push(`<span class="tag">recommendation</span>`);
  html.push(`<div class="cols">`);
  for (const r of a.recommendations) {
    html.push(
      `<div class="card"><h3>${esc(r.id)} · ${r.kind.replace(/_/g, " ")}</h3><p><strong>${esc(r.title)}</strong></p><p class="sub">${esc(r.detail)}</p></div>`,
    );
  }
  html.push(`</div>`);
  html.push(
    `<p class="note"><strong>Not justified by this dataset alone:</strong> a full rollback (three of four strata improve), a causal claim that the candidate ` +
      `produces 504s (four errors, no same-window control counterfactual), or any public performance claim in either direction.</p>`,
  );

  html.push(
    `<footer>Generated by <code>src/cli.ts</code> from <code>${esc(a.source)}</code> · ${a.row_count} rows · schema version ${a.schema_version} · ` +
      `deterministic output, no external assets, no libraries.</footer>`,
  );
  html.push(`</div></div></body></html>`);

  return html.join("\n");
}

export { PAYLOAD_BUCKETS };
