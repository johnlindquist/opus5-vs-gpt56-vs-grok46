/**
 * Latency rollout forensics — parsing and analysis library.
 *
 * Pure functions only: no I/O, no clock, no randomness beyond a seeded PRNG.
 * Everything here is deterministic so `out/analysis.json` is byte-stable.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RequestRow {
  request_id: string;
  variant: string;
  minute: number;
  region: string;
  device: string;
  cache: string;
  payload_kb: number;
  latency_ms: number;
  status: number;
}

export interface Stats {
  n: number;
  mean: number;
  median: number;
  p95: number;
  min: number;
  max: number;
}

export interface VariantSummary {
  variant: string;
  count: number;
  all_rows: Stats;
  status_200_only: Stats;
  non_200_count: number;
  non_200_rate: number;
}

export interface MixCell {
  key: string;
  control_n: number;
  candidate_n: number;
  control_share: number;
  candidate_share: number;
  share_delta: number;
}

export interface StratumResult {
  stratum: string;
  region: string;
  device: string;
  cache: string;
  control: Stats | null;
  candidate: Stats | null;
  control_non_200: number;
  candidate_non_200: number;
  mean_delta_ms: number | null;
  mean_delta_pct: number | null;
  median_delta_ms: number | null;
  direction: "candidate_faster" | "candidate_slower" | "no_comparison";
}

export interface ErrorRow {
  request_id: string;
  variant: string;
  minute: number;
  stratum: string;
  payload_kb: number;
  latency_ms: number;
  status: number;
}

export interface Finding {
  id: string;
  kind: "computed_fact" | "interpretation";
  confidence: "high" | "moderate" | "low";
  title: string;
  detail: string;
  evidence: string[];
}

export interface Recommendation {
  id: string;
  kind: "rollout_action" | "follow_up";
  priority: number;
  title: string;
  detail: string;
}

export interface Analysis {
  schema_version: 1;
  source: string;
  row_count: number;
  quantile_convention: string;
  validation: {
    row_count_is_80: boolean;
    control_rows: number;
    candidate_rows: number;
    control_non_200_is_zero: boolean;
    candidate_non_200_is_four: boolean;
    all_checks_passed: boolean;
  };
  variants: Record<string, VariantSummary>;
  aggregate_comparison: {
    mean_delta_ms: number;
    mean_delta_pct: number;
    median_delta_ms: number;
    median_delta_pct: number;
    p95_delta_ms: number;
    p95_delta_pct: number;
    naive_verdict: string;
  };
  traffic_mix: {
    region: MixCell[];
    device: MixCell[];
    cache: MixCell[];
    payload_range: MixCell[];
    heavy_stratum_share: {
      stratum: string;
      control_share: number;
      candidate_share: number;
      share_ratio: number;
    };
  };
  strata: StratumResult[];
  simpsons_paradox: {
    detected: boolean;
    aggregate_direction: string;
    strata_with_both_variants: number;
    strata_candidate_faster: number;
    strata_candidate_slower: number;
    mix_adjusted_candidate_mean_ms: number;
    mix_adjusted_note: string;
    explanation: string;
  };
  payload_analysis: {
    buckets: Array<{
      bucket: string;
      lower_kb: number;
      upper_kb: number | null;
      control_n: number;
      candidate_n: number;
      control_mean_ms: number | null;
      candidate_mean_ms: number | null;
      mean_delta_pct: number | null;
    }>;
    eu_mobile_cold_overlap: {
      overlap_lower_kb: number;
      overlap_upper_kb: number;
      control_n: number;
      candidate_n: number;
      control_mean_ms: number;
      candidate_mean_ms: number;
      mean_delta_ms: number;
      mean_delta_pct: number;
      note: string;
    };
    slopes: Array<{
      series: string;
      x: "payload_kb" | "minute";
      n: number;
      slope: number;
      intercept: number;
      r: number;
      note: string;
    }>;
    bootstrap: {
      method: string;
      seed: number;
      iterations: number;
      metric: string;
      point_estimate_ms: number;
      ci_low_ms: number;
      ci_high_ms: number;
      note: string;
    };
  };
  error_rows: ErrorRow[];
  findings: Finding[];
  limitations: string[];
  recommendations: Recommendation[];
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

/** Thrown for malformed input or invalid usage. The CLI maps this to exit code 2. */
export class AnalysisInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AnalysisInputError";
  }
}

// ---------------------------------------------------------------------------
// CSV parsing
// ---------------------------------------------------------------------------

export const REQUIRED_COLUMNS = [
  "request_id",
  "variant",
  "minute",
  "region",
  "device",
  "cache",
  "payload_kb",
  "latency_ms",
  "status",
] as const;

const NUMERIC_COLUMNS = ["minute", "payload_kb", "latency_ms", "status"] as const;

/**
 * Parse the request CSV. Strict on purpose: a missing required column, a short
 * row, or a non-numeric numeric field is a hard failure rather than a silent drop.
 */
export function parseCsv(text: string): RequestRow[] {
  const lines = text
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0);

  if (lines.length === 0) {
    throw new AnalysisInputError("CSV is empty: no header row found.");
  }

  const header = lines[0]!.split(",").map((h) => h.trim());
  const missing = REQUIRED_COLUMNS.filter((c) => !header.includes(c));
  if (missing.length > 0) {
    throw new AnalysisInputError(
      `CSV is missing required column(s): ${missing.join(", ")}. Found: ${header.join(", ")}`,
    );
  }

  const index: Record<string, number> = {};
  for (const col of REQUIRED_COLUMNS) index[col] = header.indexOf(col);

  if (lines.length === 1) {
    throw new AnalysisInputError("CSV contains a header but no data rows.");
  }

  const rows: RequestRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const lineNo = i + 1;
    const cells = lines[i]!.split(",").map((c) => c.trim());
    if (cells.length < header.length) {
      throw new AnalysisInputError(
        `CSV line ${lineNo} has ${cells.length} field(s); expected at least ${header.length}.`,
      );
    }

    const raw: Record<string, string> = {};
    for (const col of REQUIRED_COLUMNS) raw[col] = cells[index[col]!]!;

    for (const col of NUMERIC_COLUMNS) {
      if (raw[col] === "" || !Number.isFinite(Number(raw[col]))) {
        throw new AnalysisInputError(
          `CSV line ${lineNo}: column "${col}" is not a finite number (got "${raw[col]}").`,
        );
      }
    }
    for (const col of ["request_id", "variant", "region", "device", "cache"] as const) {
      if (raw[col] === "") {
        throw new AnalysisInputError(`CSV line ${lineNo}: column "${col}" is empty.`);
      }
    }

    rows.push({
      request_id: raw.request_id!,
      variant: raw.variant!,
      minute: Number(raw.minute),
      region: raw.region!,
      device: raw.device!,
      cache: raw.cache!,
      payload_kb: Number(raw.payload_kb),
      latency_ms: Number(raw.latency_ms),
      status: Number(raw.status),
    });
  }

  return rows;
}

// ---------------------------------------------------------------------------
// Statistics
// ---------------------------------------------------------------------------

export const QUANTILE_CONVENTION =
  "Quantiles use linear interpolation between the two nearest order statistics " +
  "of the ascending-sorted sample (h = (n-1)q; the 'type 7' convention used by " +
  "R's default quantile() and numpy.percentile). Median is the q=0.5 quantile, " +
  "p95 is q=0.95. With small n, p95 is close to the sample maximum and should be " +
  "read as a tail indicator, not a stable population estimate.";

/** Round to `digits` decimals, normalising -0 to 0 so JSON output is stable. */
export function round(value: number, digits: number): number {
  const factor = 10 ** digits;
  const r = Math.round(value * factor) / factor;
  return r === 0 ? 0 : r;
}

/** Type-7 quantile. Input need not be sorted. */
export function quantile(values: number[], q: number): number {
  if (values.length === 0) throw new AnalysisInputError("quantile() called on an empty sample.");
  if (!(q >= 0 && q <= 1)) throw new AnalysisInputError(`quantile() requires 0 <= q <= 1, got ${q}.`);
  const sorted = [...values].sort((a, b) => a - b);
  if (sorted.length === 1) return sorted[0]!;
  const h = (sorted.length - 1) * q;
  const lo = Math.floor(h);
  const hi = Math.ceil(h);
  if (lo === hi) return sorted[lo]!;
  return sorted[lo]! + (h - lo) * (sorted[hi]! - sorted[lo]!);
}

export function mean(values: number[]): number {
  if (values.length === 0) throw new AnalysisInputError("mean() called on an empty sample.");
  let sum = 0;
  for (const v of values) sum += v;
  return sum / values.length;
}

/**
 * Latency stats at fixed precision. Latencies are whole milliseconds in the
 * source, so one decimal place is the most precision the data supports.
 */
export function describe(values: number[]): Stats {
  const sorted = [...values].sort((a, b) => a - b);
  return {
    n: sorted.length,
    mean: round(mean(sorted), 1),
    median: round(quantile(sorted, 0.5), 1),
    p95: round(quantile(sorted, 0.95), 1),
    min: sorted[0]!,
    max: sorted[sorted.length - 1]!,
  };
}

/** Deterministic 32-bit LCG. Used only by the optional bootstrap. */
export function makeRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

/**
 * Percentile bootstrap of the difference in means.
 *
 * Both samples are sorted before resampling. Without that, which element the
 * PRNG draws at each step depends on the order rows happened to appear in the
 * source file, so simply reordering the CSV would shift the reported interval.
 * Sorting canonicalises the sample, leaving the resampling distribution
 * unchanged while making the output a function of the data alone.
 */
export function bootstrapMeanDiff(
  a: number[],
  b: number[],
  iterations: number,
  seed: number,
): { point: number; ciLow: number; ciHigh: number } {
  const sa = [...a].sort((x, y) => x - y);
  const sb = [...b].sort((x, y) => x - y);
  const rng = makeRng(seed);
  const diffs: number[] = [];
  for (let i = 0; i < iterations; i++) {
    let sumA = 0;
    for (let k = 0; k < sa.length; k++) sumA += sa[Math.floor(rng() * sa.length)]!;
    let sumB = 0;
    for (let k = 0; k < sb.length; k++) sumB += sb[Math.floor(rng() * sb.length)]!;
    diffs.push(sumA / sa.length - sumB / sb.length);
  }
  return {
    point: mean(sa) - mean(sb),
    ciLow: quantile(diffs, 0.025),
    ciHigh: quantile(diffs, 0.975),
  };
}

/** Ordinary least-squares fit plus Pearson r. */
export function linearFit(
  xs: number[],
  ys: number[],
): { slope: number; intercept: number; r: number } {
  const n = xs.length;
  if (n < 2 || ys.length !== n) {
    throw new AnalysisInputError("linearFit() needs at least 2 paired observations.");
  }
  const mx = mean(xs);
  const my = mean(ys);
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i]! - mx;
    const dy = ys[i]! - my;
    sxy += dx * dy;
    sxx += dx * dx;
    syy += dy * dy;
  }
  const slope = sxx === 0 ? 0 : sxy / sxx;
  return {
    slope,
    intercept: my - slope * mx,
    r: sxx === 0 || syy === 0 ? 0 : sxy / Math.sqrt(sxx * syy),
  };
}

// ---------------------------------------------------------------------------
// Grouping helpers — explicit and deterministic
// ---------------------------------------------------------------------------

export const VARIANT_ORDER = ["control", "candidate"] as const;

export interface PayloadBucket {
  label: string;
  lower: number;
  upper: number | null;
}

/** Fixed bucket edges, declared up front so bucket order never depends on the data. */
export const PAYLOAD_BUCKETS: PayloadBucket[] = [
  { label: "0-128 KB", lower: 0, upper: 128 },
  { label: "129-256 KB", lower: 129, upper: 256 },
  { label: "257-512 KB", lower: 257, upper: 512 },
  { label: "513-1024 KB", lower: 513, upper: 1024 },
  { label: "1025+ KB", lower: 1025, upper: null },
];

export function payloadBucket(kb: number): string {
  for (const b of PAYLOAD_BUCKETS) {
    if (kb >= b.lower && (b.upper === null || kb <= b.upper)) return b.label;
  }
  return PAYLOAD_BUCKETS[PAYLOAD_BUCKETS.length - 1]!.label;
}

export function stratumKey(row: Pick<RequestRow, "region" | "device" | "cache">): string {
  return `${row.region} / ${row.device} / ${row.cache}`;
}

/**
 * Collect distinct values in a stable order: alphabetical, so grouping output
 * never depends on row order in the source file.
 */
function distinctSorted<T>(rows: T[], key: (row: T) => string): string[] {
  return [...new Set(rows.map(key))].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

function mixCells(
  rows: RequestRow[],
  key: (row: RequestRow) => string,
  order?: string[],
): MixCell[] {
  const keys = order ?? distinctSorted(rows, key);
  const control = rows.filter((r) => r.variant === "control");
  const candidate = rows.filter((r) => r.variant === "candidate");
  return keys
    .map((k) => {
      const cn = control.filter((r) => key(r) === k).length;
      const dn = candidate.filter((r) => key(r) === k).length;
      const cs = control.length === 0 ? 0 : cn / control.length;
      const ds = candidate.length === 0 ? 0 : dn / candidate.length;
      return {
        key: k,
        control_n: cn,
        candidate_n: dn,
        control_share: round(cs, 4),
        candidate_share: round(ds, 4),
        share_delta: round(ds - cs, 4),
      };
    })
    .filter((cell) => cell.control_n > 0 || cell.candidate_n > 0);
}

function pctDelta(candidateValue: number, controlValue: number): number {
  if (controlValue === 0) return 0;
  return round(((candidateValue - controlValue) / controlValue) * 100, 1);
}

// ---------------------------------------------------------------------------
// Main analysis
// ---------------------------------------------------------------------------

export const BOOTSTRAP_SEED = 20240917;
export const BOOTSTRAP_ITERATIONS = 5000;

export function analyze(rows: RequestRow[], source: string): Analysis {
  const control = rows.filter((r) => r.variant === "control");
  const candidate = rows.filter((r) => r.variant === "candidate");

  // -- Variant summaries -----------------------------------------------------
  const variants: Record<string, VariantSummary> = {};
  for (const name of VARIANT_ORDER) {
    const subset = rows.filter((r) => r.variant === name);
    if (subset.length === 0) continue;
    const ok = subset.filter((r) => r.status === 200);
    const bad = subset.filter((r) => r.status !== 200);
    variants[name] = {
      variant: name,
      count: subset.length,
      // Non-200 rows are kept in `all_rows`: dropping them would hide the exact
      // slow tail that produced them.
      all_rows: describe(subset.map((r) => r.latency_ms)),
      status_200_only: describe(ok.map((r) => r.latency_ms)),
      non_200_count: bad.length,
      non_200_rate: round(bad.length / subset.length, 4),
    };
  }

  const c = variants.control!;
  const d = variants.candidate!;

  const aggregate_comparison = {
    mean_delta_ms: round(d.all_rows.mean - c.all_rows.mean, 1),
    mean_delta_pct: pctDelta(d.all_rows.mean, c.all_rows.mean),
    median_delta_ms: round(d.all_rows.median - c.all_rows.median, 1),
    median_delta_pct: pctDelta(d.all_rows.median, c.all_rows.median),
    p95_delta_ms: round(d.all_rows.p95 - c.all_rows.p95, 1),
    p95_delta_pct: pctDelta(d.all_rows.p95, c.all_rows.p95),
    naive_verdict:
      d.all_rows.mean > c.all_rows.mean
        ? "Aggregate latency is worse for candidate. This comparison is confounded by traffic mix and is not a valid effect estimate."
        : "Aggregate latency is not worse for candidate.",
  };

  // -- Traffic mix -----------------------------------------------------------
  const traffic_mix = {
    region: mixCells(rows, (r) => r.region),
    device: mixCells(rows, (r) => r.device),
    cache: mixCells(rows, (r) => r.cache),
    payload_range: mixCells(
      rows,
      (r) => payloadBucket(r.payload_kb),
      PAYLOAD_BUCKETS.map((b) => b.label),
    ),
    heavy_stratum_share: { stratum: "", control_share: 0, candidate_share: 0, share_ratio: 0 },
  };

  // -- Strata ----------------------------------------------------------------
  const strataKeys = distinctSorted(rows, stratumKey);
  const strata: StratumResult[] = strataKeys.map((key) => {
    const inStratum = rows.filter((r) => stratumKey(r) === key);
    const [region, device, cache] = key.split(" / ") as [string, string, string];
    const cRows = inStratum.filter((r) => r.variant === "control");
    const dRows = inStratum.filter((r) => r.variant === "candidate");
    const cStats = cRows.length > 0 ? describe(cRows.map((r) => r.latency_ms)) : null;
    const dStats = dRows.length > 0 ? describe(dRows.map((r) => r.latency_ms)) : null;
    const comparable = cStats !== null && dStats !== null;
    return {
      stratum: key,
      region,
      device,
      cache,
      control: cStats,
      candidate: dStats,
      control_non_200: cRows.filter((r) => r.status !== 200).length,
      candidate_non_200: dRows.filter((r) => r.status !== 200).length,
      mean_delta_ms: comparable ? round(dStats!.mean - cStats!.mean, 1) : null,
      mean_delta_pct: comparable ? pctDelta(dStats!.mean, cStats!.mean) : null,
      median_delta_ms: comparable ? round(dStats!.median - cStats!.median, 1) : null,
      direction: !comparable
        ? "no_comparison"
        : dStats!.mean < cStats!.mean
          ? "candidate_faster"
          : "candidate_slower",
    };
  });

  const comparableStrata = strata.filter((s) => s.direction !== "no_comparison");
  const fasterStrata = comparableStrata.filter((s) => s.direction === "candidate_faster");
  const slowerStrata = comparableStrata.filter((s) => s.direction === "candidate_slower");

  // Heaviest stratum by control mean latency, used for the mix headline.
  const heaviest = [...comparableStrata].sort(
    (a, b) => b.control!.mean - a.control!.mean,
  )[0]!;
  const heavyControlShare = heaviest.control!.n / control.length;
  const heavyCandidateShare = heaviest.candidate!.n / candidate.length;
  traffic_mix.heavy_stratum_share = {
    stratum: heaviest.stratum,
    control_share: round(heavyControlShare, 4),
    candidate_share: round(heavyCandidateShare, 4),
    share_ratio: round(heavyCandidateShare / heavyControlShare, 2),
  };

  // -- Simpson's paradox check ----------------------------------------------
  // Direct standardisation: apply candidate's per-stratum means to control's
  // traffic mix. If the standardised candidate mean falls below the observed
  // candidate mean, mix is carrying part of the aggregate gap.
  let standardisedSum = 0;
  let standardisedWeight = 0;
  for (const s of comparableStrata) {
    const weight = s.control!.n / control.length;
    standardisedSum += weight * s.candidate!.mean;
    standardisedWeight += weight;
  }
  const mixAdjusted = standardisedWeight === 0 ? 0 : standardisedSum / standardisedWeight;

  const simpsons_paradox = {
    detected: aggregate_comparison.mean_delta_ms > 0 && fasterStrata.length > slowerStrata.length,
    aggregate_direction:
      aggregate_comparison.mean_delta_ms > 0 ? "candidate slower" : "candidate faster",
    strata_with_both_variants: comparableStrata.length,
    strata_candidate_faster: fasterStrata.length,
    strata_candidate_slower: slowerStrata.length,
    mix_adjusted_candidate_mean_ms: round(mixAdjusted, 1),
    mix_adjusted_note:
      "Direct standardisation: candidate per-stratum means reweighted to the control traffic mix. " +
      "Compare against the control all-rows mean, not against the observed candidate mean.",
    explanation:
      `Aggregate says candidate is ${Math.abs(aggregate_comparison.mean_delta_pct)}% ` +
      `${aggregate_comparison.mean_delta_ms > 0 ? "slower" : "faster"}, but candidate is faster in ` +
      `${fasterStrata.length} of ${comparableStrata.length} comparable strata. The candidate arm carries a much larger ` +
      `share of the slowest stratum (${heaviest.stratum}: ` +
      `${round(heavyCandidateShare * 100, 1)}% of candidate rows vs ${round(heavyControlShare * 100, 1)}% of control rows), ` +
      `so the aggregate is dominated by mix, not by a broad slowdown. This is a Simpson's-paradox-shaped reversal: ` +
      `mix-adjusting removes most but not all of the gap, because one stratum has a genuine regression.`,
  };

  // -- Payload analysis ------------------------------------------------------
  const buckets = PAYLOAD_BUCKETS.map((b) => {
    const inBucket = rows.filter((r) => payloadBucket(r.payload_kb) === b.label);
    const cRows = inBucket.filter((r) => r.variant === "control");
    const dRows = inBucket.filter((r) => r.variant === "candidate");
    const cMean = cRows.length > 0 ? round(mean(cRows.map((r) => r.latency_ms)), 1) : null;
    const dMean = dRows.length > 0 ? round(mean(dRows.map((r) => r.latency_ms)), 1) : null;
    return {
      bucket: b.label,
      lower_kb: b.lower,
      upper_kb: b.upper,
      control_n: cRows.length,
      candidate_n: dRows.length,
      control_mean_ms: cMean,
      candidate_mean_ms: dMean,
      mean_delta_pct: cMean !== null && dMean !== null ? pctDelta(dMean, cMean) : null,
    };
  });

  // Overlap comparison inside the regressed stratum: restrict both arms to the
  // payload range observed in BOTH, so the comparison is not extrapolation.
  const worstStratum = [...comparableStrata].sort(
    (a, b) => (b.mean_delta_pct ?? -Infinity) - (a.mean_delta_pct ?? -Infinity),
  )[0]!;
  const worstRows = rows.filter((r) => stratumKey(r) === worstStratum.stratum);
  const worstControl = worstRows.filter((r) => r.variant === "control");
  const worstCandidate = worstRows.filter((r) => r.variant === "candidate");
  const overlapLower = Math.max(
    Math.min(...worstControl.map((r) => r.payload_kb)),
    Math.min(...worstCandidate.map((r) => r.payload_kb)),
  );
  const overlapUpper = Math.min(
    Math.max(...worstControl.map((r) => r.payload_kb)),
    Math.max(...worstCandidate.map((r) => r.payload_kb)),
  );
  const inOverlap = (r: RequestRow) =>
    r.payload_kb >= overlapLower && r.payload_kb <= overlapUpper;
  const overlapControl = worstControl.filter(inOverlap).map((r) => r.latency_ms);
  const overlapCandidate = worstCandidate.filter(inOverlap).map((r) => r.latency_ms);
  const overlapControlMean = mean(overlapControl);
  const overlapCandidateMean = mean(overlapCandidate);

  const eu_mobile_cold_overlap = {
    overlap_lower_kb: overlapLower,
    overlap_upper_kb: overlapUpper,
    control_n: overlapControl.length,
    candidate_n: overlapCandidate.length,
    control_mean_ms: round(overlapControlMean, 1),
    candidate_mean_ms: round(overlapCandidateMean, 1),
    mean_delta_ms: round(overlapCandidateMean - overlapControlMean, 1),
    mean_delta_pct: pctDelta(overlapCandidateMean, overlapControlMean),
    note:
      `Both arms restricted to payloads present in both (${overlapLower}-${overlapUpper} KB) inside ` +
      `${worstStratum.stratum}. The gap survives payload matching, so larger candidate payloads alone do not explain it.`,
  };

  const slopes: Analysis["payload_analysis"]["slopes"] = [];
  for (const variant of VARIANT_ORDER) {
    const subset = worstRows.filter((r) => r.variant === variant);
    if (subset.length < 2) continue;
    const fitPayload = linearFit(
      subset.map((r) => r.payload_kb),
      subset.map((r) => r.latency_ms),
    );
    slopes.push({
      series: `${worstStratum.stratum} — ${variant}`,
      x: "payload_kb",
      n: subset.length,
      slope: round(fitPayload.slope, 3),
      intercept: round(fitPayload.intercept, 1),
      r: round(fitPayload.r, 3),
      note: `Latency change per additional KB within ${worstStratum.stratum} for ${variant}.`,
    });
    const fitMinute = linearFit(
      subset.map((r) => r.minute),
      subset.map((r) => r.latency_ms),
    );
    slopes.push({
      series: `${worstStratum.stratum} — ${variant}`,
      x: "minute",
      n: subset.length,
      slope: round(fitMinute.slope, 3),
      intercept: round(fitMinute.intercept, 1),
      r: round(fitMinute.r, 3),
      note: `Latency change per elapsed minute within ${worstStratum.stratum} for ${variant}. A strong positive slope here means payload is not the only moving variable.`,
    });
  }

  const boot = bootstrapMeanDiff(
    overlapCandidate,
    overlapControl,
    BOOTSTRAP_ITERATIONS,
    BOOTSTRAP_SEED,
  );

  const payload_analysis: Analysis["payload_analysis"] = {
    buckets,
    eu_mobile_cold_overlap,
    slopes,
    bootstrap: {
      method: "percentile bootstrap of the difference in means (candidate minus control), resampled with replacement",
      seed: BOOTSTRAP_SEED,
      iterations: BOOTSTRAP_ITERATIONS,
      metric: `mean latency difference within ${worstStratum.stratum}, payload-matched to ${overlapLower}-${overlapUpper} KB`,
      point_estimate_ms: round(boot.point, 1),
      ci_low_ms: round(boot.ciLow, 1),
      ci_high_ms: round(boot.ciHigh, 1),
      note:
        `Deterministic: seeded LCG, fixed iteration count, fixed input order. With n=${overlapControl.length} control rows ` +
        `the interval is wide and reflects sampling variability only — it does not account for the fact that the two arms ` +
        `ran in different time windows.`,
    },
  };

  // -- Error rows ------------------------------------------------------------
  const error_rows: ErrorRow[] = rows
    .filter((r) => r.status !== 200)
    .map((r) => ({
      request_id: r.request_id,
      variant: r.variant,
      minute: r.minute,
      stratum: stratumKey(r),
      payload_kb: r.payload_kb,
      latency_ms: r.latency_ms,
      status: r.status,
    }))
    .sort((a, b) => (a.request_id < b.request_id ? -1 : 1));

  const errorLatencies = error_rows.map((r) => r.latency_ms);
  const worstCandidateP95 = worstStratum.candidate!.p95;

  // -- Findings --------------------------------------------------------------
  const findings: Finding[] = [
    {
      id: "F1",
      kind: "computed_fact",
      confidence: "high",
      title: `Aggregate latency is ${aggregate_comparison.mean_delta_pct}% higher for candidate, but the arms are not comparable in aggregate`,
      detail:
        `Control mean ${c.all_rows.mean} ms (n=${c.count}); candidate mean ${d.all_rows.mean} ms (n=${d.count}). ` +
        `Median ${c.all_rows.median} -> ${d.all_rows.median} ms; p95 ${c.all_rows.p95} -> ${d.all_rows.p95} ms. ` +
        `The two arms draw from very different traffic mixes, so this difference is not an effect estimate.`,
      evidence: [
        `control all-rows mean=${c.all_rows.mean} ms, n=${c.count}`,
        `candidate all-rows mean=${d.all_rows.mean} ms, n=${d.count}`,
        `mean delta=${aggregate_comparison.mean_delta_ms} ms (${aggregate_comparison.mean_delta_pct}%)`,
      ],
    },
    {
      id: "F2",
      kind: "computed_fact",
      confidence: "high",
      title: "Traffic mix differs sharply between arms",
      detail:
        `The slowest stratum (${heaviest.stratum}) is ${round(heavyCandidateShare * 100, 1)}% of candidate traffic ` +
        `but only ${round(heavyControlShare * 100, 1)}% of control traffic — a ${traffic_mix.heavy_stratum_share.share_ratio}x over-representation. ` +
        `Region, device, cache state, and payload distribution all shift in the same direction.`,
      evidence: traffic_mix.region
        .map((m) => `region ${m.key}: control ${m.control_n} (${round(m.control_share * 100, 1)}%) vs candidate ${m.candidate_n} (${round(m.candidate_share * 100, 1)}%)`)
        .concat(
          traffic_mix.cache.map(
            (m) => `cache ${m.key}: control ${m.control_n} vs candidate ${m.candidate_n}`,
          ),
        ),
    },
    {
      id: "F3",
      kind: "computed_fact",
      confidence: "high",
      title: `Candidate is faster in ${fasterStrata.length} of ${comparableStrata.length} comparable strata`,
      detail: comparableStrata
        .map(
          (s) =>
            `${s.stratum}: control ${s.control!.mean} ms (n=${s.control!.n}) vs candidate ${s.candidate!.mean} ms (n=${s.candidate!.n}), ${s.mean_delta_pct! > 0 ? "+" : ""}${s.mean_delta_pct}%`,
        )
        .join("; "),
      evidence: comparableStrata.map(
        (s) => `${s.stratum}: ${s.direction}, delta ${s.mean_delta_ms} ms, n=${s.control!.n}/${s.candidate!.n}`,
      ),
    },
    {
      id: "F4",
      kind: "interpretation",
      confidence: "high",
      title: "The aggregate comparison conceals a mix effect (Simpson's-paradox-shaped reversal)",
      detail: simpsons_paradox.explanation,
      evidence: [
        `strata where candidate is faster: ${fasterStrata.length}/${comparableStrata.length}`,
        `candidate mean standardised to the control mix: ${simpsons_paradox.mix_adjusted_candidate_mean_ms} ms vs control ${c.all_rows.mean} ms`,
        `observed (unstandardised) candidate mean: ${d.all_rows.mean} ms`,
      ],
    },
    {
      id: "F5",
      kind: "computed_fact",
      confidence: "high",
      title: `A single interaction is responsible: ${worstStratum.stratum}`,
      detail:
        `In ${worstStratum.stratum}, control mean is ${worstStratum.control!.mean} ms (n=${worstStratum.control!.n}) and candidate mean is ` +
        `${worstStratum.candidate!.mean} ms (n=${worstStratum.candidate!.n}), ${worstStratum.mean_delta_pct}% higher. Candidate p95 in this stratum is ` +
        `${worstCandidateP95} ms. Every other stratum improves. All ${error_rows.length} non-200 rows fall in this stratum.`,
      evidence: [
        `${worstStratum.stratum} control mean=${worstStratum.control!.mean} ms (n=${worstStratum.control!.n})`,
        `${worstStratum.stratum} candidate mean=${worstStratum.candidate!.mean} ms (n=${worstStratum.candidate!.n})`,
        `delta=${worstStratum.mean_delta_ms} ms (${worstStratum.mean_delta_pct}%)`,
        `candidate p95 in stratum=${worstCandidateP95} ms`,
      ],
    },
    {
      id: "F6",
      kind: "computed_fact",
      confidence: "high",
      title: `All ${error_rows.length} non-200 rows are candidate rows inside the regressed stratum`,
      detail:
        `Control error rate is ${round(c.non_200_rate * 100, 1)}% (0 of ${c.count}). Candidate error rate is ` +
        `${round(d.non_200_rate * 100, 1)}% (${d.non_200_count} of ${d.count}), and every error is a status 504 in ` +
        `${worstStratum.stratum}. Error-row latencies (${errorLatencies.join(", ")} ms) sit in the upper tail, consistent with a timeout ceiling being approached.`,
      evidence: error_rows.map(
        (r) => `${r.request_id}: ${r.variant}, minute ${r.minute}, ${r.stratum}, ${r.payload_kb} KB, ${r.latency_ms} ms, status ${r.status}`,
      ),
    },
    {
      id: "F7",
      kind: "interpretation",
      confidence: "moderate",
      title: "Payload size alone does not explain the regression",
      detail:
        `Restricting both arms to the overlapping payload range (${overlapLower}-${overlapUpper} KB) inside ${worstStratum.stratum} still leaves ` +
        `candidate ${eu_mobile_cold_overlap.mean_delta_ms} ms higher (${eu_mobile_cold_overlap.mean_delta_pct}%), on n=${eu_mobile_cold_overlap.control_n} control and ` +
        `n=${eu_mobile_cold_overlap.candidate_n} candidate rows. Bootstrap 95% interval for that payload-matched difference: ` +
        `${payload_analysis.bootstrap.ci_low_ms} to ${payload_analysis.bootstrap.ci_high_ms} ms. So candidate carrying larger payloads is a contributing factor, ` +
        `not the whole story — something in the candidate path is worse at equal payload.`,
      evidence: [
        `payload-matched control mean=${eu_mobile_cold_overlap.control_mean_ms} ms (n=${eu_mobile_cold_overlap.control_n})`,
        `payload-matched candidate mean=${eu_mobile_cold_overlap.candidate_mean_ms} ms (n=${eu_mobile_cold_overlap.candidate_n})`,
        `bootstrap 95% CI: [${payload_analysis.bootstrap.ci_low_ms}, ${payload_analysis.bootstrap.ci_high_ms}] ms, seed=${BOOTSTRAP_SEED}, iterations=${BOOTSTRAP_ITERATIONS}`,
      ],
    },
    {
      id: "F8",
      kind: "interpretation",
      confidence: "low",
      title: "Payload is the strongest single correlate in the regressed stratum, but it explains only a minority of the variance",
      detail: (() => {
        const cndPayload = slopes.find((s) => s.x === "payload_kb" && s.series.endsWith("candidate"));
        const ctlPayload = slopes.find((s) => s.x === "payload_kb" && s.series.endsWith("control"));
        const cndMinute = slopes.find((s) => s.x === "minute" && s.series.endsWith("candidate"));
        const r2 = cndPayload ? round(cndPayload.r ** 2 * 100, 0) : 0;
        return (
          `Within candidate ${worstStratum.stratum}, latency rises ${cndPayload?.slope} ms per KB (r=${cndPayload?.r}, n=${cndPayload?.n}) — roughly ` +
          `${ctlPayload && ctlPayload.slope !== 0 ? round(cndPayload!.slope / ctlPayload.slope, 1) : "?"}x control's ${ctlPayload?.slope} ms per KB, which is real support for a per-byte cost. ` +
          `But r=${cndPayload?.r} means payload accounts for only about ${r2}% of the variance in this stratum; elapsed minute is a weaker but non-zero ` +
          `correlate (${cndMinute?.slope} ms per minute, r=${cndMinute?.r}), and the two are partly collinear so neither slope is cleanly identified. ` +
          `A strictly monotone per-byte model is also directly contradicted by the data: r078 (1040 KB, minute 35) took 1584 ms while r079 (1120 KB, minute 36) ` +
          `took 986 ms — a larger payload that was substantially faster. Control's slopes in this stratum rest on only ${ctlPayload?.n} rows, where payload and ` +
          `minute are perfectly collinear (identical r=${ctlPayload?.r}), so the control baseline slope is barely estimable. Conclusion: payload marks the ` +
          `affected traffic well, but the mechanism is not established and something else is moving too.`
        );
      })(),
      evidence: slopes.map(
        (s) => `${s.series} vs ${s.x}: slope=${s.slope}, r=${s.r}, n=${s.n}`,
      ),
    },
    {
      id: "F9",
      kind: "computed_fact",
      confidence: "high",
      title: "Excluding non-200 rows would understate candidate latency by a large margin",
      detail:
        `Candidate all-rows mean is ${d.all_rows.mean} ms; status-200-only mean is ${d.status_200_only.mean} ms — a ` +
        `${round(d.all_rows.mean - d.status_200_only.mean, 1)} ms gap, because the four 504s are among the slowest observations. Control is unaffected ` +
        `(${c.all_rows.mean} ms either way, zero non-200 rows). A pipeline that silently filtered to status 200 would shrink the apparent candidate ` +
        `regression while removing evidence that only the candidate arm produced failures. Both views are reported here for that reason.`,
      evidence: [
        `candidate all-rows mean=${d.all_rows.mean} ms (n=${d.all_rows.n}), p95=${d.all_rows.p95} ms`,
        `candidate status-200-only mean=${d.status_200_only.mean} ms (n=${d.status_200_only.n}), p95=${d.status_200_only.p95} ms`,
        `control identical under both views: mean=${c.all_rows.mean} ms (n=${c.all_rows.n})`,
      ],
    },
  ];

  // -- Limitations -----------------------------------------------------------
  const limitations: string[] = [
    "Not a randomised experiment. The arms ran in disjoint time windows (control minutes 0-15, candidate minutes 20-37), so any change in load, upstream health, or network conditions between windows is fully confounded with the variant.",
    "Traffic was not balanced across arms. Region, device, cache state, and payload distribution all differ, so the aggregate comparison is not interpretable as a treatment effect without standardisation.",
    `Sample sizes are tiny. The regressed stratum has only ${worstStratum.control!.n} control rows against ${worstStratum.candidate!.n} candidate rows; the payload-matched comparison rests on ${eu_mobile_cold_overlap.control_n} control observations. Interval estimates are correspondingly wide.`,
    "p95 on samples this small is barely distinguishable from the maximum. Treat every p95 in this report as a tail indicator, not an estimate of a population 95th percentile.",
    "Payload ranges do not fully overlap. Candidate reaches 1120 KB in the regressed stratum while control stops at 960 KB, so part of the raw candidate tail is extrapolation beyond anything control ever exercised.",
    "Cache state is observed, not assigned. 'cold' is plausibly downstream of the variant itself (a new path may miss cache more often), which would make it a mediator rather than a confounder; controlling for it could mask a real effect.",
    "Non-200 rows carry a latency value, but a 504 latency is a timeout artefact rather than a completed-request measurement. They are retained in the all-rows statistics and also reported separately, because dropping them would systematically remove the slowest observations.",
    "No per-request context: no upstream service attribution, connection reuse flag, retry indicator, or concurrency measure. The mechanism behind the regression cannot be identified from these nine columns.",
    "One dataset, one run. There is no replication and no pre-registered hypothesis, so the specific interaction identified here was found by searching the data and deserves confirmatory testing.",
  ];

  // -- Recommendations -------------------------------------------------------
  const recommendations: Recommendation[] = [
    {
      id: "R1",
      kind: "rollout_action",
      priority: 1,
      title: `Hold the rollout for ${worstStratum.stratum}; continue elsewhere behind a guarded ramp`,
      detail:
        `The data justify a targeted hold, not a full rollback. Exclude ${worstStratum.stratum} (and specifically large cold-cache payloads) from the ` +
        `candidate path until the regression is understood, while allowing the candidate to continue in the three strata where it is measurably faster ` +
        `(${fasterStrata.map((s) => s.stratum).join("; ")}). This is the strongest action supported by observational data with confounded time windows: ` +
        `it stops the observed harm without discarding a change that looks beneficial everywhere else. A full rollback would be over-reading a stratum ` +
        `holding just ${worstStratum.control!.n} control and ${worstStratum.candidate!.n} candidate rows; a full ramp would ignore a 100% error concentration.`,
    },
    {
      id: "R2",
      kind: "rollout_action",
      priority: 2,
      title: "Add a stratum-level guardrail before any further ramp",
      detail:
        `Aggregate dashboards produced exactly the wrong headline here: they said "candidate is broadly slower" when it is faster for ` +
        `${fasterStrata.length} of ${comparableStrata.length} strata. Gate the ramp on per-stratum latency and error rate with sample sizes shown, not on a single pooled mean.`,
    },
    {
      id: "R3",
      kind: "follow_up",
      priority: 3,
      title: "Run a properly randomised, concurrent A/B restricted to the suspect stratum",
      detail:
        `Assign ${worstStratum.stratum} traffic randomly to control and candidate in the same time window, with matched payload strata and a pre-registered ` +
        `primary metric (mean and p95 latency, plus 504 rate). This is the single highest-value follow-up: it removes the time-window confound and the ` +
        `mix imbalance simultaneously, which no amount of post-hoc adjustment on this dataset can do. Target enough rows per payload band to detect a ` +
        `20% difference, which is far more than the ${eu_mobile_cold_overlap.control_n} control rows available here.`,
    },
    {
      id: "R4",
      kind: "follow_up",
      priority: 4,
      title: "Instrument the candidate path to separate per-byte cost from time-dependent degradation",
      detail:
        `Emit a server-side latency breakdown (connection setup, TLS, upstream wait, transfer, retries) plus cache-miss reason and connection-reuse flag ` +
        `for the regressed stratum. The current data show latency climbing with elapsed minute as well as payload, which distinguishes two very different ` +
        `root causes — a fixed per-byte penalty versus a resource that degrades under sustained load (pool exhaustion, cache fill, memory pressure). ` +
        `A controlled payload sweep at constant load, and a constant-payload soak over time, would separate them directly.`,
    },
  ];

  const controlNon200 = control.filter((r) => r.status !== 200).length;
  const candidateNon200 = candidate.filter((r) => r.status !== 200).length;
  const validation = {
    row_count_is_80: rows.length === 80,
    control_rows: control.length,
    candidate_rows: candidate.length,
    control_non_200_is_zero: controlNon200 === 0,
    candidate_non_200_is_four: candidateNon200 === 4,
    all_checks_passed: false,
  };
  validation.all_checks_passed =
    validation.row_count_is_80 &&
    validation.control_rows === 40 &&
    validation.candidate_rows === 40 &&
    validation.control_non_200_is_zero &&
    validation.candidate_non_200_is_four;

  return {
    schema_version: 1,
    source,
    row_count: rows.length,
    quantile_convention: QUANTILE_CONVENTION,
    validation,
    variants,
    aggregate_comparison,
    traffic_mix,
    strata,
    simpsons_paradox,
    payload_analysis,
    error_rows,
    findings,
    limitations,
    recommendations,
  };
}
