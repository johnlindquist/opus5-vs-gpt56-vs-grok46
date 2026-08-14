export const SCHEMA_VERSION = 1;

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

export const QUANTILE_CONVENTION =
  "Hyndman-Fan type 7 (R / Excel default): p-quantile is linearly interpolated at index p*(n-1) on the 0-based sorted sample. Empty samples yield null.";

export type VariantName = "control" | "candidate";

export type RequestRow = {
  request_id: string;
  variant: VariantName;
  minute: number;
  region: string;
  device: string;
  cache: string;
  payload_kb: number;
  latency_ms: number;
  status: number;
};

export type LatencyStats = {
  n: number;
  mean: number | null;
  median: number | null;
  p95: number | null;
  min: number | null;
  max: number | null;
};

export type VariantSummary = LatencyStats & {
  variant: VariantName;
  non_200_count: number;
  non_200_rate: number;
  status_200: LatencyStats;
};

export type MixShare = {
  key: string;
  control_n: number;
  control_share: number;
  candidate_n: number;
  candidate_share: number;
  share_delta: number;
};

export type StratumRow = {
  region: string;
  device: string;
  cache: string;
  key: string;
  control: VariantSummary;
  candidate: VariantSummary;
  mean_delta_all: number | null;
  mean_delta_200: number | null;
  candidate_vs_control: "faster" | "slower" | "tied" | "incomparable";
};

export type PayloadBin = {
  label: string;
  min_inclusive: number;
  max_exclusive: number | null;
};

export const PAYLOAD_BINS: PayloadBin[] = [
  { label: "0-99", min_inclusive: 0, max_exclusive: 100 },
  { label: "100-249", min_inclusive: 100, max_exclusive: 250 },
  { label: "250-499", min_inclusive: 250, max_exclusive: 500 },
  { label: "500-799", min_inclusive: 500, max_exclusive: 800 },
  { label: "800+", min_inclusive: 800, max_exclusive: null },
];

export type Finding = {
  id: string;
  kind: "fact" | "interpretation" | "recommendation";
  text: string;
};

export type AnalysisResult = {
  schema_version: number;
  source: string;
  row_count: number;
  quantile_convention: string;
  variants: Record<VariantName, VariantSummary>;
  traffic_mix: {
    region: MixShare[];
    device: MixShare[];
    cache: MixShare[];
    payload_range: MixShare[];
  };
  strata: StratumRow[];
  payload_analysis: {
    bins: Array<{
      label: string;
      control: VariantSummary;
      candidate: VariantSummary;
    }>;
    eu_mobile_cold: {
      control: VariantSummary;
      candidate: VariantSummary;
      comparable_payload_720_960: {
        control: VariantSummary;
        candidate: VariantSummary;
      };
      payload_latency_pairs: Array<{
        request_id: string;
        variant: VariantName;
        payload_kb: number;
        latency_ms: number;
        status: number;
      }>;
    };
    error_rows: RequestRow[];
  };
  findings: Finding[];
  limitations: string[];
  recommendations: string[];
};

export class AnalysisError extends Error {
  readonly exitCode: number;
  constructor(message: string, exitCode = 2) {
    super(message);
    this.name = "AnalysisError";
    this.exitCode = exitCode;
  }
}

function isVariant(value: string): value is VariantName {
  return value === "control" || value === "candidate";
}

function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      out.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  out.push(current);
  return out;
}

export function parseCsv(text: string): RequestRow[] {
  const normalized = text.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const lines = normalized.split("\n").filter((line, idx, arr) => {
    if (line.trim() === "" && idx === arr.length - 1) return false;
    return line.trim() !== "" || idx === 0;
  });
  const nonempty = lines.filter((line) => line.trim() !== "");
  if (nonempty.length === 0) {
    throw new AnalysisError("CSV is empty.");
  }

  const header = parseCsvLine(nonempty[0]).map((h) => h.trim());
  for (const col of REQUIRED_COLUMNS) {
    if (!header.includes(col)) {
      throw new AnalysisError(`Missing required column: ${col}`);
    }
  }

  const index = Object.fromEntries(header.map((h, i) => [h, i]));
  const rows: RequestRow[] = [];

  for (let i = 1; i < nonempty.length; i++) {
    const cells = parseCsvLine(nonempty[i]);
    if (cells.length !== header.length) {
      throw new AnalysisError(
        `Row ${i + 1} has ${cells.length} fields; expected ${header.length}.`,
      );
    }

    const variantRaw = cells[index.variant].trim();
    if (!isVariant(variantRaw)) {
      throw new AnalysisError(
        `Row ${i + 1} has invalid variant "${variantRaw}"; expected control or candidate.`,
      );
    }

    const minute = Number(cells[index.minute].trim());
    const payload_kb = Number(cells[index.payload_kb].trim());
    const latency_ms = Number(cells[index.latency_ms].trim());
    const status = Number(cells[index.status].trim());

    if (![minute, payload_kb, latency_ms, status].every((n) => Number.isFinite(n))) {
      throw new AnalysisError(`Row ${i + 1} contains a non-numeric required field.`);
    }

    rows.push({
      request_id: cells[index.request_id].trim(),
      variant: variantRaw,
      minute,
      region: cells[index.region].trim(),
      device: cells[index.device].trim(),
      cache: cells[index.cache].trim(),
      payload_kb,
      latency_ms,
      status,
    });
  }

  return rows;
}

export function round(value: number, digits: number): number {
  const f = 10 ** digits;
  return Math.round(value * f) / f;
}

export function quantile(sorted: number[], p: number): number | null {
  if (sorted.length === 0) return null;
  if (sorted.length === 1) return sorted[0];
  const h = p * (sorted.length - 1);
  const lo = Math.floor(h);
  const hi = Math.ceil(h);
  if (lo === hi) return sorted[lo];
  const w = h - lo;
  return sorted[lo] * (1 - w) + sorted[hi] * w;
}

export function latencyStats(values: number[]): LatencyStats {
  if (values.length === 0) {
    return { n: 0, mean: null, median: null, p95: null, min: null, max: null };
  }
  const sorted = [...values].sort((a, b) => a - b);
  const sum = sorted.reduce((acc, v) => acc + v, 0);
  return {
    n: sorted.length,
    mean: round(sum / sorted.length, 4),
    median: round(quantile(sorted, 0.5) as number, 4),
    p95: round(quantile(sorted, 0.95) as number, 4),
    min: sorted[0],
    max: sorted[sorted.length - 1],
  };
}

export function summarizeVariant(variant: VariantName, rows: RequestRow[]): VariantSummary {
  const all = rows.map((r) => r.latency_ms);
  const ok = rows.filter((r) => r.status === 200).map((r) => r.latency_ms);
  const non200 = rows.filter((r) => r.status !== 200).length;
  return {
    variant,
    ...latencyStats(all),
    non_200_count: non200,
    non_200_rate: rows.length === 0 ? 0 : round(non200 / rows.length, 6),
    status_200: latencyStats(ok),
  };
}

export function payloadBinLabel(payloadKb: number): string {
  for (const bin of PAYLOAD_BINS) {
    if (payloadKb >= bin.min_inclusive && (bin.max_exclusive === null || payloadKb < bin.max_exclusive)) {
      return bin.label;
    }
  }
  return PAYLOAD_BINS[PAYLOAD_BINS.length - 1].label;
}

function mixShares(
  control: RequestRow[],
  candidate: RequestRow[],
  keyFn: (row: RequestRow) => string,
  order: string[],
): MixShare[] {
  const count = (rows: RequestRow[]) => {
    const map = new Map<string, number>();
    for (const row of rows) {
      const k = keyFn(row);
      map.set(k, (map.get(k) ?? 0) + 1);
    }
    return map;
  };
  const cMap = count(control);
  const dMap = count(candidate);
  const keys = new Set<string>([...order, ...cMap.keys(), ...dMap.keys()]);
  const ordered = [...order.filter((k) => keys.has(k)), ...[...keys].filter((k) => !order.includes(k)).sort()];
  return ordered.map((key) => {
    const control_n = cMap.get(key) ?? 0;
    const candidate_n = dMap.get(key) ?? 0;
    const control_share = control.length === 0 ? 0 : round(control_n / control.length, 6);
    const candidate_share = candidate.length === 0 ? 0 : round(candidate_n / candidate.length, 6);
    return {
      key,
      control_n,
      control_share,
      candidate_n,
      candidate_share,
      share_delta: round(candidate_share - control_share, 6),
    };
  });
}

function stratumKey(row: Pick<RequestRow, "region" | "device" | "cache">): string {
  return `${row.region}|${row.device}|${row.cache}`;
}

function compareMeans(candidate: number | null, control: number | null): StratumRow["candidate_vs_control"] {
  if (candidate === null || control === null) return "incomparable";
  if (candidate < control) return "faster";
  if (candidate > control) return "slower";
  return "tied";
}

export function analyze(rows: RequestRow[], source: string): AnalysisResult {
  const control = rows.filter((r) => r.variant === "control");
  const candidate = rows.filter((r) => r.variant === "candidate");

  const variants: Record<VariantName, VariantSummary> = {
    control: summarizeVariant("control", control),
    candidate: summarizeVariant("candidate", candidate),
  };

  const regionOrder = ["us", "eu"];
  const deviceOrder = ["desktop", "mobile"];
  const cacheOrder = ["warm", "cold"];
  const payloadOrder = PAYLOAD_BINS.map((b) => b.label);

  const traffic_mix = {
    region: mixShares(control, candidate, (r) => r.region, regionOrder),
    device: mixShares(control, candidate, (r) => r.device, deviceOrder),
    cache: mixShares(control, candidate, (r) => r.cache, cacheOrder),
    payload_range: mixShares(control, candidate, (r) => payloadBinLabel(r.payload_kb), payloadOrder),
  };

  const stratumKeys = new Set(rows.map(stratumKey));
  const orderedStrata = [...stratumKeys].sort((a, b) => {
    const [ar, ad, ac] = a.split("|");
    const [br, bd, bc] = b.split("|");
    const regionCmp = regionOrder.indexOf(ar) - regionOrder.indexOf(br) || ar.localeCompare(br);
    if (regionCmp !== 0) return regionCmp;
    const deviceCmp = deviceOrder.indexOf(ad) - deviceOrder.indexOf(bd) || ad.localeCompare(bd);
    if (deviceCmp !== 0) return deviceCmp;
    return cacheOrder.indexOf(ac) - cacheOrder.indexOf(bc) || ac.localeCompare(bc);
  });

  const strata: StratumRow[] = orderedStrata.map((key) => {
    const [region, device, cache] = key.split("|");
    const cRows = control.filter((r) => stratumKey(r) === key);
    const dRows = candidate.filter((r) => stratumKey(r) === key);
    const cSum = summarizeVariant("control", cRows);
    const dSum = summarizeVariant("candidate", dRows);
    const mean_delta_all =
      dSum.mean === null || cSum.mean === null ? null : round(dSum.mean - cSum.mean, 4);
    const mean_delta_200 =
      dSum.status_200.mean === null || cSum.status_200.mean === null
        ? null
        : round(dSum.status_200.mean - cSum.status_200.mean, 4);
    return {
      region,
      device,
      cache,
      key,
      control: cSum,
      candidate: dSum,
      mean_delta_all,
      mean_delta_200,
      candidate_vs_control: compareMeans(dSum.mean, cSum.mean),
    };
  });

  const payload_bins = PAYLOAD_BINS.map((bin) => ({
    label: bin.label,
    control: summarizeVariant(
      "control",
      control.filter((r) => payloadBinLabel(r.payload_kb) === bin.label),
    ),
    candidate: summarizeVariant(
      "candidate",
      candidate.filter((r) => payloadBinLabel(r.payload_kb) === bin.label),
    ),
  }));

  const euMobileCold = (rs: RequestRow[]) =>
    rs.filter((r) => r.region === "eu" && r.device === "mobile" && r.cache === "cold");
  const comparablePayload = (rs: RequestRow[]) =>
    euMobileCold(rs).filter((r) => r.payload_kb >= 720 && r.payload_kb <= 960);

  const error_rows = rows
    .filter((r) => r.status !== 200)
    .sort((a, b) => a.request_id.localeCompare(b.request_id));

  const payload_analysis = {
    bins: payload_bins,
    eu_mobile_cold: {
      control: summarizeVariant("control", euMobileCold(control)),
      candidate: summarizeVariant("candidate", euMobileCold(candidate)),
      comparable_payload_720_960: {
        control: summarizeVariant("control", comparablePayload(control)),
        candidate: summarizeVariant("candidate", comparablePayload(candidate)),
      },
      payload_latency_pairs: euMobileCold(rows)
        .map((r) => ({
          request_id: r.request_id,
          variant: r.variant,
          payload_kb: r.payload_kb,
          latency_ms: r.latency_ms,
          status: r.status,
        }))
        .sort((a, b) => a.request_id.localeCompare(b.request_id)),
    },
    error_rows,
  };

  const comparableStrata = strata.filter((s) => s.candidate_vs_control !== "incomparable");
  const faster = comparableStrata.filter((s) => s.candidate_vs_control === "faster");
  const slower = comparableStrata.filter((s) => s.candidate_vs_control === "slower");
  const euMobile = strata.find((s) => s.key === "eu|mobile|cold");
  const mixEu = traffic_mix.region.find((m) => m.key === "eu");
  const mixMobile = traffic_mix.device.find((m) => m.key === "mobile");
  const mixCold = traffic_mix.cache.find((m) => m.key === "cold");
  const mixLarge = traffic_mix.payload_range.find((m) => m.key === "800+");

  const findings: Finding[] = [
    {
      id: "F1",
      kind: "fact",
      text: `All-row means: control ${variants.control.mean} ms (n=${variants.control.n}) vs candidate ${variants.candidate.mean} ms (n=${variants.candidate.n}). Candidate p95 ${variants.candidate.p95} vs control ${variants.control.p95}. Candidate non-200 rate ${variants.candidate.non_200_rate} (${variants.candidate.non_200_count}/${variants.candidate.n}); control ${variants.control.non_200_rate} (${variants.control.non_200_count}/${variants.control.n}).`,
    },
    {
      id: "F2",
      kind: "fact",
      text: `Traffic mix shifted toward slower cells. EU share ${mixEu?.control_share} control vs ${mixEu?.candidate_share} candidate; mobile ${mixMobile?.control_share} vs ${mixMobile?.candidate_share}; cold cache ${mixCold?.control_share} vs ${mixCold?.candidate_share}; payload 800+ ${mixLarge?.control_share} vs ${mixLarge?.candidate_share}.`,
    },
    {
      id: "F3",
      kind: "fact",
      text: `Within region×device×cache strata with both variants, candidate is faster in ${faster.length} stratum/strata (${faster.map((s) => s.key).join(", ") || "none"}) and slower in ${slower.length} (${slower.map((s) => s.key).join(", ") || "none"}).`,
    },
    {
      id: "F4",
      kind: "interpretation",
      text: `Aggregate ranking conceals a mix-plus-interaction pattern similar to Simpson’s paradox: candidate is faster in the three non-EU-mobile-cold strata, yet slower overall because candidate traffic is heavier in EU mobile cold and that stratum itself is slower.`,
    },
    {
      id: "F5",
      kind: "fact",
      text: `The materially worse interaction is candidate × EU × mobile × cold. Mean delta all-rows ${euMobile?.mean_delta_all} ms (control n=${euMobile?.control.n}, candidate n=${euMobile?.candidate.n}). All ${error_rows.length} non-200 rows are candidate 504s in that stratum: ${error_rows.map((r) => r.request_id).join(", ")}.`,
    },
    {
      id: "F6",
      kind: "interpretation",
      text: `Large cold EU mobile payloads are supported as the problem cell, not merely a mix artifact. At overlapping payloads 720–960 KB, candidate mean ${payload_analysis.eu_mobile_cold.comparable_payload_720_960.candidate.mean} ms (n=${payload_analysis.eu_mobile_cold.comparable_payload_720_960.candidate.n}) vs control ${payload_analysis.eu_mobile_cold.comparable_payload_720_960.control.mean} ms (n=${payload_analysis.eu_mobile_cold.comparable_payload_720_960.control.n}). Candidate also extends to 1040–1120 KB with the highest latencies and the 504s. This is association in a small observational cell, not a proven payload causal mechanism.`,
    },
  ];

  const limitations = [
    "Variants occupy disjoint time windows (control minutes 0–15, candidate 20–37), so period effects are confounded with variant.",
    "Assignment is not a concurrent randomized experiment; mix of region, device, cache, and payload is not balanced by design.",
    "EU mobile cold control has only 4 rows; candidate has 14. Small n makes p95 and interaction magnitude fragile.",
    "Cache state is collinear with device (desktop=warm, mobile=cold); region×device×cache strata cannot separate cache from device.",
    "Payload size is collinear with region and device (US desktop smallest, EU mobile largest), so payload effects are not independently identified.",
    "Four 504s are retained in latency statistics; failed requests may not be comparable to successful latency.",
    "No retries, upstream dependency, or concurrency traces are present; a single-path regression cannot be isolated from correlated load.",
    "Observational association must not be read as definitive causation of the candidate code path.",
  ];

  const recommendations = [
    "Do not continue an unguarded full rollout. Hold or exclude candidate on EU mobile cold (especially payloads ≥720 KB) until a concurrent stratified test reproduces or refutes the cell.",
    "Warm desktop US/EU and US mobile cold look faster for candidate in this file; those cells may continue only behind a region/device/payload guard, not as proof of global safety.",
    "Follow-up 1: run a concurrent randomized A/B with pre-registered strata and equalized mix, oversampling EU mobile cold large payloads.",
    "Follow-up 2: run a payload-size sweep on EU mobile with cache warm vs cold held separately to test whether size, cache, or their interaction drives the 504s and latency slope.",
  ];

  return {
    schema_version: SCHEMA_VERSION,
    source,
    row_count: rows.length,
    quantile_convention: QUANTILE_CONVENTION,
    variants,
    traffic_mix,
    strata,
    payload_analysis,
    findings,
    limitations,
    recommendations,
  };
}

export function stableStringify(value: unknown): string {
  return `${stringifyStable(value, 0)}\n`;
}

function stringifyStable(value: unknown, indent: number): string {
  const pad = "  ".repeat(indent);
  const inner = "  ".repeat(indent + 1);
  if (value === null) return "null";
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new AnalysisError("Non-finite number in JSON output.");
    }
    return Number.isInteger(value) ? String(value) : String(value);
  }
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "string") return JSON.stringify(value);
  if (Array.isArray(value)) {
    if (value.length === 0) return "[]";
    const parts = value.map((item) => `${inner}${stringifyStable(item, indent + 1)}`);
    return `[\n${parts.join(",\n")}\n${pad}]`;
  }
  if (typeof value === "object") {
    const keys = Object.keys(value as Record<string, unknown>);
    if (keys.length === 0) return "{}";
    const parts = keys.map(
      (k) => `${inner}${JSON.stringify(k)}: ${stringifyStable((value as Record<string, unknown>)[k], indent + 1)}`,
    );
    return `{\n${parts.join(",\n")}\n${pad}}`;
  }
  throw new AnalysisError(`Unsupported JSON value type: ${typeof value}`);
}

function pct(rate: number): string {
  return `${round(rate * 100, 2)}%`;
}

function fmt(n: number | null, digits = 2): string {
  if (n === null) return "n/a";
  return n.toFixed(digits);
}

function statsBlock(s: LatencyStats): string {
  return `n=${s.n}, mean=${fmt(s.mean)}, median=${fmt(s.median)}, p95=${fmt(s.p95)}, min=${fmt(s.min, 0)}, max=${fmt(s.max, 0)}`;
}

export function renderMarkdown(analysis: AnalysisResult): string {
  const c = analysis.variants.control;
  const d = analysis.variants.candidate;
  const mixTable = (title: string, rows: MixShare[]) => {
    const body = rows
      .map(
        (r) =>
          `| ${r.key} | ${r.control_n} | ${pct(r.control_share)} | ${r.candidate_n} | ${pct(r.candidate_share)} | ${pct(r.share_delta)} |`,
      )
      .join("\n");
    return `### ${title}\n\n| key | control n | control share | candidate n | candidate share | share delta |\n| --- | ---: | ---: | ---: | ---: | ---: |\n${body}`;
  };

  const stratumLines = analysis.strata
    .map((s) => {
      const delta = s.mean_delta_all === null ? "n/a" : `${s.mean_delta_all.toFixed(2)} ms`;
      return `| ${s.key} | ${s.control.n} | ${fmt(s.control.mean)} | ${s.candidate.n} | ${fmt(s.candidate.mean)} | ${delta} | ${s.candidate_vs_control} | ${s.control.non_200_count} | ${s.candidate.non_200_count} |`;
    })
    .join("\n");

  const errors = analysis.payload_analysis.error_rows
    .map(
      (r) =>
        `| ${r.request_id} | ${r.variant} | ${r.minute} | ${r.region} | ${r.device} | ${r.cache} | ${r.payload_kb} | ${r.latency_ms} | ${r.status} |`,
    )
    .join("\n");

  const findings = analysis.findings
    .map((f) => `- **${f.id} (${f.kind}):** ${f.text}`)
    .join("\n");
  const limits = analysis.limitations.map((t, i) => `${i + 1}. ${t}`).join("\n");
  const recs = analysis.recommendations.map((t, i) => `${i + 1}. ${t}`).join("\n");

  const eu = analysis.payload_analysis.eu_mobile_cold;

  return `# Latency Forensics — Candidate Rollout After Minute 20

## Executive conclusion

Candidate is **not broadly slower**. Aggregate latency looks worse because candidate traffic is skewed toward EU mobile cold requests with large payloads, and **that one interaction is materially worse**, including all four non-200 responses. Warm desktop and US mobile cold cells are faster for candidate in this file. This is an observational, time-split dataset; it does **not** prove the candidate path caused the EU mobile regression. The rollout should **not** continue unguarded.

Distinction of claims:

- **Computed fact:** numbers below are calculated from the 80 supplied rows.
- **Interpretation:** mix shift plus a single bad stratum explains the aggregate gap (Simpson-like).
- **Recommendation:** hold EU mobile cold large payloads; do not treat other cells as a license for full rollout.

## 1. Aggregate latency and error rates

Quantile convention: ${analysis.quantile_convention}

Non-200 requests are **retained** in all-row statistics. Status-200-only stats are reported separately.

| variant | n | mean | median | p95 | min | max | non-200 count | non-200 rate |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| control | ${c.n} | ${fmt(c.mean)} | ${fmt(c.median)} | ${fmt(c.p95)} | ${fmt(c.min, 0)} | ${fmt(c.max, 0)} | ${c.non_200_count} | ${pct(c.non_200_rate)} |
| candidate | ${d.n} | ${fmt(d.mean)} | ${fmt(d.median)} | ${fmt(d.p95)} | ${fmt(d.min, 0)} | ${fmt(d.max, 0)} | ${d.non_200_count} | ${pct(d.non_200_rate)} |

Status 200 only:

| variant | n | mean | median | p95 | min | max |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| control | ${c.status_200.n} | ${fmt(c.status_200.mean)} | ${fmt(c.status_200.median)} | ${fmt(c.status_200.p95)} | ${fmt(c.status_200.min, 0)} | ${fmt(c.status_200.max, 0)} |
| candidate | ${d.status_200.n} | ${fmt(d.status_200.mean)} | ${fmt(d.status_200.median)} | ${fmt(d.status_200.p95)} | ${fmt(d.status_200.min, 0)} | ${fmt(d.status_200.max, 0)} |

Source: \`${analysis.source}\`. Row count: ${analysis.row_count}.

## 2. Traffic mix

Candidate is heavier in EU, mobile, cold cache, and large payloads than control.

${mixTable("Region", analysis.traffic_mix.region)}

${mixTable("Device", analysis.traffic_mix.device)}

${mixTable("Cache", analysis.traffic_mix.cache)}

${mixTable("Payload range (KB)", analysis.traffic_mix.payload_range)}

## 3. Comparable strata (region × device × cache)

| stratum | control n | control mean | candidate n | candidate mean | mean delta (cand − ctrl) | candidate vs control | control non-200 | candidate non-200 |
| --- | ---: | ---: | ---: | ---: | ---: | --- | ---: | ---: |
${stratumLines}

Candidate is consistently **faster** in US desktop warm, EU desktop warm, and US mobile cold. It is **slower** only in EU mobile cold.

## 4. Mix effect similar to Simpson’s paradox

Yes. The aggregate comparison conceals stratum direction. Three of four strata favor candidate, but the overall mean and p95 favor control because candidate places more traffic in the slowest cell and that cell is worse under candidate.

Weighted intuition: control’s EU mobile cold share is ${eu.control.n}/${c.n}; candidate’s is ${eu.candidate.n}/${d.n}. Moving mass into a ~${fmt(eu.candidate.mean)} ms cell (vs control ~${fmt(eu.control.mean)} ms) dominates the remaining cells where candidate is tens of milliseconds faster.

## 5. Specific worse interaction

The candidate × **EU × mobile × cold** cell is the only materially worse interaction. All four 504s sit there. Payload bins 800+ and 500–799 are where candidate latency and errors concentrate.

## 6. Large cold EU mobile payloads

Evidence **supporting** the hypothesis:

- EU mobile cold candidate mean ${fmt(eu.candidate.mean)} ms (n=${eu.candidate.n}) vs control ${fmt(eu.control.mean)} ms (n=${eu.control.n}).
- Overlapping payloads 720–960 KB: candidate ${fmt(eu.comparable_payload_720_960.candidate.mean)} ms (n=${eu.comparable_payload_720_960.candidate.n}) vs control ${fmt(eu.comparable_payload_720_960.control.mean)} ms (n=${eu.comparable_payload_720_960.control.n}).
- Candidate unique larger payloads (1040, 1120 KB) include the highest latencies and 504s.
- Error rows: all candidate, all EU mobile cold.

Evidence **weakening** a simple “payload size alone” causal story:

- Control EU mobile cold n=4; overlapping comparison is small.
- Cache is collinear with mobile; no warm EU mobile rows exist.
- Time windows do not overlap.
- One candidate 1120 KB row (r079) is 986 ms / 200, so size does not map 1:1 onto latency or failure.

## 7. Limitations (no causal claim)

${limits}

## 8. Rollout action justified by this dataset alone

Hold unguarded rollout. Exclude or tightly cap candidate on EU mobile cold large payloads. Other strata may remain enabled only with an explicit guard. This file does not justify a global continue-or-kill based on the aggregate mean.

## 9. Two follow-up measurements

${recs}

## Error rows

| request_id | variant | minute | region | device | cache | payload_kb | latency_ms | status |
| --- | --- | ---: | --- | --- | --- | ---: | ---: | ---: |
${errors}

## Payload bins

${analysis.payload_analysis.bins
    .map(
      (b) =>
        `- **${b.label} KB:** control ${statsBlock(b.control)} (non-200 ${b.control.non_200_count}); candidate ${statsBlock(b.candidate)} (non-200 ${b.candidate.non_200_count})`,
    )
    .join("\n")}

## Findings

${findings}
`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function barGroup(rows: MixShare[], width: number, height: number): string {
  const n = rows.length;
  const gap = 16;
  const groupW = (width - gap * (n + 1)) / n;
  const barW = groupW / 2 - 4;
  const maxShare = Math.max(...rows.flatMap((r) => [r.control_share, r.candidate_share]), 0.01);
  const axisY = height - 28;
  const chartH = axisY - 16;
  const bars = rows
    .map((r, i) => {
      const x0 = gap + i * (groupW + gap);
      const hC = (r.control_share / maxShare) * chartH;
      const hD = (r.candidate_share / maxShare) * chartH;
      return `<g>
        <rect x="${x0}" y="${axisY - hC}" width="${barW}" height="${hC}" fill="#5b8def"/>
        <rect x="${x0 + barW + 6}" y="${axisY - hD}" width="${barW}" height="${hD}" fill="#e6a23c"/>
        <text x="${x0 + groupW / 2 - 4}" y="${height - 8}" text-anchor="middle" fill="#c8d0dc" font-size="12">${escapeHtml(r.key)}</text>
      </g>`;
    })
    .join("");
  return `<svg viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img">
    <rect width="${width}" height="${height}" fill="#141820"/>
    ${bars}
  </svg>`;
}

function scatterSvg(rows: RequestRow[], width: number, height: number): string {
  const padL = 48;
  const padR = 16;
  const padT = 16;
  const padB = 36;
  const xs = rows.map((r) => r.payload_kb);
  const ys = rows.map((r) => r.latency_ms);
  const minX = 0;
  const maxX = Math.max(...xs, 1);
  const minY = 0;
  const maxY = Math.max(...ys, 1) * 1.05;
  const xScale = (x: number) => padL + ((x - minX) / (maxX - minX)) * (width - padL - padR);
  const yScale = (y: number) => padT + (1 - (y - minY) / (maxY - minY)) * (height - padT - padB);
  const dots = rows
    .map((r) => {
      const fill = r.variant === "control" ? "#5b8def" : r.status === 200 ? "#e6a23c" : "#e85d4c";
      const rsize = r.status === 200 ? 5 : 7;
      return `<circle cx="${xScale(r.payload_kb).toFixed(1)}" cy="${yScale(r.latency_ms).toFixed(1)}" r="${rsize}" fill="${fill}" opacity="0.9"><title>${escapeHtml(r.request_id)} ${r.variant} ${r.payload_kb}KB ${r.latency_ms}ms status ${r.status}</title></circle>`;
    })
    .join("");
  return `<svg viewBox="0 0 ${width} ${height}" width="100%" height="${height}" role="img" aria-label="Payload versus latency">
    <rect width="${width}" height="${height}" fill="#141820"/>
    <line x1="${padL}" y1="${height - padB}" x2="${width - padR}" y2="${height - padB}" stroke="#3a4250"/>
    <line x1="${padL}" y1="${padT}" x2="${padL}" y2="${height - padB}" stroke="#3a4250"/>
    <text x="${width / 2}" y="${height - 8}" text-anchor="middle" fill="#c8d0dc" font-size="12">payload_kb</text>
    <text x="14" y="${height / 2}" fill="#c8d0dc" font-size="12" transform="rotate(-90 14 ${height / 2})">latency_ms</text>
    <text x="${padL}" y="${height - padB + 16}" fill="#8b95a5" font-size="11">${minX}</text>
    <text x="${width - padR}" y="${height - padB + 16}" text-anchor="end" fill="#8b95a5" font-size="11">${maxX}</text>
    <text x="${padL - 8}" y="${height - padB}" text-anchor="end" fill="#8b95a5" font-size="11">${minY}</text>
    <text x="${padL - 8}" y="${padT + 8}" text-anchor="end" fill="#8b95a5" font-size="11">${Math.round(maxY)}</text>
    ${dots}
  </svg>`;
}

export function renderHtml(analysis: AnalysisResult, allRows: RequestRow[]): string {
  const c = analysis.variants.control;
  const d = analysis.variants.candidate;
  const conclusion =
    "Candidate is not broadly slower. The aggregate regression is a mix shift plus one bad cell: EU mobile cold (large payloads), which also holds all four 504s. Hold unguarded rollout.";

  const stratumBars = (() => {
    const width = 760;
    const height = 220;
    const padL = 170;
    const padR = 24;
    const padT = 12;
    const padB = 28;
    const usable = height - padT - padB;
    const rowH = usable / analysis.strata.length;
    const maxMean = Math.max(
      ...analysis.strata.flatMap((s) => [s.control.mean ?? 0, s.candidate.mean ?? 0]),
      1,
    );
    const innerW = width - padL - padR;
    const barH = Math.min(14, rowH / 2 - 4);
    const groups = analysis.strata
      .map((s, i) => {
        const y = padT + i * rowH;
        const wC = ((s.control.mean ?? 0) / maxMean) * innerW;
        const wD = ((s.candidate.mean ?? 0) / maxMean) * innerW;
        return `<g>
          <text x="${padL - 8}" y="${y + rowH / 2 + 4}" text-anchor="end" fill="#c8d0dc" font-size="12">${escapeHtml(s.key)} (n ${s.control.n}/${s.candidate.n})</text>
          <rect x="${padL}" y="${y + 4}" width="${wC}" height="${barH}" fill="#5b8def"/>
          <rect x="${padL}" y="${y + 4 + barH + 4}" width="${wD}" height="${barH}" fill="#e6a23c"/>
        </g>`;
      })
      .join("");
    return `<svg viewBox="0 0 ${width} ${height}" width="100%" height="${height}" role="img">
      <rect width="${width}" height="${height}" fill="#141820"/>
      ${groups}
      <text x="${padL}" y="${height - 6}" fill="#8b95a5" font-size="11">mean latency_ms (blue control, gold candidate)</text>
    </svg>`;
  })();

  const mixSvgs = [
    ["Region", analysis.traffic_mix.region],
    ["Device", analysis.traffic_mix.device],
    ["Cache", analysis.traffic_mix.cache],
    ["Payload", analysis.traffic_mix.payload_range],
  ]
    .map(
      ([title, rows]) =>
        `<figure><figcaption>${escapeHtml(title as string)}</figcaption>${barGroup(rows as MixShare[], 280, 140)}</figure>`,
    )
    .join("");

  const kpi = (label: string, value: string, sub: string) =>
    `<div class="kpi"><div class="k-label">${escapeHtml(label)}</div><div class="k-value">${escapeHtml(value)}</div><div class="k-sub">${escapeHtml(sub)}</div></div>`;

  const errorTable = analysis.payload_analysis.error_rows
    .map(
      (r) =>
        `<tr><td>${escapeHtml(r.request_id)}</td><td>${r.minute}</td><td>${escapeHtml(r.region)}</td><td>${escapeHtml(r.device)}</td><td>${escapeHtml(r.cache)}</td><td>${r.payload_kb}</td><td>${r.latency_ms}</td><td>${r.status}</td></tr>`,
    )
    .join("");

  const stratumTable = analysis.strata
    .map((s) => {
      const cls = s.candidate_vs_control === "slower" ? "bad" : s.candidate_vs_control === "faster" ? "good" : "";
      return `<tr class="${cls}"><td>${escapeHtml(s.key)}</td><td>${s.control.n}</td><td>${fmt(s.control.mean)}</td><td>${s.candidate.n}</td><td>${fmt(s.candidate.mean)}</td><td>${s.mean_delta_all === null ? "n/a" : s.mean_delta_all.toFixed(1)}</td><td>${s.candidate_vs_control}</td></tr>`;
    })
    .join("");

  const findings = analysis.findings
    .map((f) => `<li><strong>${escapeHtml(f.id)} · ${escapeHtml(f.kind)}.</strong> ${escapeHtml(f.text)}</li>`)
    .join("");
  const limits = analysis.limitations.map((t) => `<li>${escapeHtml(t)}</li>`).join("");
  const recs = analysis.recommendations.map((t) => `<li>${escapeHtml(t)}</li>`).join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Latency Forensics — Rollout Regression</title>
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: #0b0d12; color: #e8edf5; font: 15px/1.45 "IBM Plex Sans", "Segoe UI", sans-serif; }
  .overview {
    width: 1600px; height: 900px; margin: 0 auto; padding: 28px 32px;
    background: linear-gradient(180deg, #12151c 0%, #0b0d12 100%);
    border-bottom: 1px solid #2a3140; display: grid;
    grid-template-columns: 1.15fr 0.85fr; grid-template-rows: auto auto 1fr;
    gap: 16px 24px;
  }
  h1 { font-size: 28px; margin: 0 0 6px; letter-spacing: -0.03em; }
  .eyebrow { text-transform: uppercase; letter-spacing: 0.14em; color: #8b95a5; font-size: 11px; font-weight: 700; }
  .verdict { font-size: 18px; color: #f3d39a; max-width: 72ch; }
  .kpis { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; grid-column: 1 / -1; }
  .kpi { background: #181c24; border: 1px solid #2a3140; padding: 12px 14px; border-radius: 8px; }
  .k-label { color: #8b95a5; font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em; }
  .k-value { font-size: 26px; font-weight: 650; margin: 4px 0 2px; }
  .k-sub { color: #a7b0be; font-size: 12px; }
  .panel { background: #141820; border: 1px solid #2a3140; border-radius: 8px; padding: 14px 16px; overflow: hidden; }
  h2 { margin: 0 0 8px; font-size: 15px; color: #d5dce8; }
  .legend span { display: inline-block; margin-right: 12px; font-size: 12px; color: #a7b0be; }
  .sw { display: inline-block; width: 10px; height: 10px; border-radius: 2px; margin-right: 4px; vertical-align: middle; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th, td { text-align: left; padding: 5px 6px; border-bottom: 1px solid #2a3140; }
  th { color: #8b95a5; font-weight: 600; }
  tr.bad td { color: #ff8a7a; }
  tr.good td { color: #8ee0b3; }
  .page { max-width: 1600px; margin: 0 auto; padding: 32px; }
  .mixes { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; }
  figure { margin: 0; }
  figcaption { font-size: 12px; color: #8b95a5; margin-bottom: 4px; }
  .two { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
  ol, ul { padding-left: 1.2rem; }
  li { margin: 0.4rem 0; }
  .tag { display: inline-block; padding: 2px 8px; border-radius: 999px; font-size: 11px; background: #3a2a16; color: #f3d39a; }
</style>
</head>
<body>
<section class="overview" id="overview">
  <div>
    <div class="eyebrow">Latency forensics · 80 requests · time-split rollout</div>
    <h1>Find the real regression</h1>
    <p class="verdict">${escapeHtml(conclusion)}</p>
  </div>
  <div class="panel">
    <h2>Call from this file</h2>
    <p><span class="tag">Recommendation</span> Hold unguarded rollout. Guard off EU × mobile × cold, especially ≥720 KB. Other strata look faster, not globally safe.</p>
    <p class="legend">
      <span><i class="sw" style="background:#5b8def"></i>control n=${c.n}</span>
      <span><i class="sw" style="background:#e6a23c"></i>candidate n=${d.n}</span>
      <span><i class="sw" style="background:#e85d4c"></i>non-200 n=${d.non_200_count}</span>
    </p>
  </div>
  <div class="kpis">
    ${kpi("Control mean", `${fmt(c.mean, 1)} ms`, `median ${fmt(c.median, 1)} · p95 ${fmt(c.p95, 1)} · err ${pct(c.non_200_rate)}`)}
    ${kpi("Candidate mean", `${fmt(d.mean, 1)} ms`, `median ${fmt(d.median, 1)} · p95 ${fmt(d.p95, 1)} · err ${pct(d.non_200_rate)}`)}
    ${kpi("EU mobile cold Δ", `${analysis.strata.find((s) => s.key === "eu|mobile|cold")?.mean_delta_all?.toFixed(0) ?? "n/a"} ms`, `control n=${analysis.payload_analysis.eu_mobile_cold.control.n} · candidate n=${analysis.payload_analysis.eu_mobile_cold.candidate.n}`)}
    ${kpi("Simpson-like mix", "3 strata faster", "1 stratum slower; that stratum is overweighted")}
  </div>
  <div class="panel">${stratumBars}</div>
  <div class="panel">${scatterSvg(allRows, 620, 280)}</div>
</section>

<main class="page">
  <h2>Aggregate comparison</h2>
  <p>All rows include non-200 latency. Quantiles use Hyndman-Fan type 7 (linear interpolation at p·(n−1)).</p>
  <table>
    <thead><tr><th>variant</th><th>n</th><th>mean</th><th>median</th><th>p95</th><th>min</th><th>max</th><th>non-200</th></tr></thead>
    <tbody>
      <tr><td>control</td><td>${c.n}</td><td>${fmt(c.mean)}</td><td>${fmt(c.median)}</td><td>${fmt(c.p95)}</td><td>${fmt(c.min, 0)}</td><td>${fmt(c.max, 0)}</td><td>${c.non_200_count} (${pct(c.non_200_rate)})</td></tr>
      <tr><td>candidate</td><td>${d.n}</td><td>${fmt(d.mean)}</td><td>${fmt(d.median)}</td><td>${fmt(d.p95)}</td><td>${fmt(d.min, 0)}</td><td>${fmt(d.max, 0)}</td><td>${d.non_200_count} (${pct(d.non_200_rate)})</td></tr>
    </tbody>
  </table>
  <p>Status 200 only — control ${statsBlock(c.status_200)}; candidate ${statsBlock(d.status_200)}.</p>

  <h2>Traffic mix</h2>
  <div class="mixes">${mixSvgs}</div>

  <h2>Stratum comparison</h2>
  <table>
    <thead><tr><th>stratum</th><th>ctrl n</th><th>ctrl mean</th><th>cand n</th><th>cand mean</th><th>Δ ms</th><th>direction</th></tr></thead>
    <tbody>${stratumTable}</tbody>
  </table>

  <h2>Payload versus latency</h2>
  <p>Blue = control, gold = candidate 200, red = candidate non-200. Large payloads cluster in EU mobile cold.</p>
  ${scatterSvg(allRows, 1200, 420)}

  <h2>Error rows</h2>
  <p>Exactly four non-200 rows, all candidate 504 in EU mobile cold.</p>
  <table>
    <thead><tr><th>id</th><th>minute</th><th>region</th><th>device</th><th>cache</th><th>payload_kb</th><th>latency_ms</th><th>status</th></tr></thead>
    <tbody>${errorTable}</tbody>
  </table>

  <div class="two">
    <div>
      <h2>Findings</h2>
      <ol>${findings}</ol>
    </div>
    <div>
      <h2>Limitations</h2>
      <ol>${limits}</ol>
      <h2>Recommendation</h2>
      <ol>${recs}</ol>
    </div>
  </div>
</main>
</body>
</html>
`;
}
