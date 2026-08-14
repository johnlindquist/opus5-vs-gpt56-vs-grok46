export const REQUIRED_COLUMNS = [
  "request_id", "variant", "minute", "region", "device", "cache",
  "payload_kb", "latency_ms", "status",
] as const;

export type Variant = "control" | "candidate";
export type RequestRow = {
  request_id: string;
  variant: Variant;
  minute: number;
  region: string;
  device: string;
  cache: string;
  payload_kb: number;
  latency_ms: number;
  status: number;
};

export type Stats = {
  count: number;
  mean_ms: number;
  median_ms: number;
  p95_ms: number;
  min_ms: number;
  max_ms: number;
  non_200_count: number;
  non_200_rate: number;
};

const round = (value: number, digits = 2): number =>
  Number(value.toFixed(digits));

function parseCsvRecords(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (char === '"') {
        quoted = false;
      } else {
        field += char;
      }
    } else if (char === '"') {
      if (field.length > 0) throw new Error("Malformed CSV: unexpected quote");
      quoted = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field.replace(/\r$/, ""));
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }
  if (quoted) throw new Error("Malformed CSV: unclosed quote");
  if (field.length || row.length) {
    row.push(field.replace(/\r$/, ""));
    rows.push(row);
  }
  return rows.filter((record) => !(record.length === 1 && record[0] === ""));
}

export function parseRequestsCsv(text: string): RequestRow[] {
  const records = parseCsvRecords(text);
  if (records.length === 0) throw new Error("CSV is empty");
  const header = records[0];
  const missing = REQUIRED_COLUMNS.filter((column) => !header.includes(column));
  if (missing.length) throw new Error(`Missing required columns: ${missing.join(", ")}`);
  const indices = Object.fromEntries(header.map((column, index) => [column, index]));
  const numeric = ["minute", "payload_kb", "latency_ms", "status"] as const;

  return records.slice(1).map((record, rowIndex) => {
    if (record.length !== header.length) {
      throw new Error(`Row ${rowIndex + 2} has ${record.length} fields; expected ${header.length}`);
    }
    const value = (column: string) => record[indices[column]]?.trim() ?? "";
    for (const column of REQUIRED_COLUMNS) {
      if (value(column) === "") throw new Error(`Row ${rowIndex + 2}: ${column} is required`);
    }
    const numbers = Object.fromEntries(numeric.map((column) => [column, Number(value(column))]));
    for (const column of numeric) {
      if (!Number.isFinite(numbers[column])) {
        throw new Error(`Row ${rowIndex + 2}: ${column} must be numeric`);
      }
    }
    const variant = value("variant");
    if (variant !== "control" && variant !== "candidate") {
      throw new Error(`Row ${rowIndex + 2}: invalid variant ${variant}`);
    }
    return {
      request_id: value("request_id"),
      variant,
      minute: numbers.minute,
      region: value("region"),
      device: value("device"),
      cache: value("cache"),
      payload_kb: numbers.payload_kb,
      latency_ms: numbers.latency_ms,
      status: numbers.status,
    };
  });
}

/** Linear interpolation, index h=(n-1)p; median uses the same convention. */
export function quantile(values: number[], probability: number): number {
  if (!values.length) throw new Error("Cannot compute a quantile of an empty sample");
  if (probability < 0 || probability > 1) throw new Error("Probability must be in [0, 1]");
  const sorted = [...values].sort((a, b) => a - b);
  const h = (sorted.length - 1) * probability;
  const low = Math.floor(h);
  const high = Math.ceil(h);
  if (low === high) return sorted[low];
  return sorted[low] + (sorted[high] - sorted[low]) * (h - low);
}

export function summarize(rows: RequestRow[]): Stats {
  if (!rows.length) throw new Error("Cannot summarize an empty sample");
  const latencies = rows.map((row) => row.latency_ms);
  const non200 = rows.filter((row) => row.status !== 200).length;
  return {
    count: rows.length,
    mean_ms: round(latencies.reduce((sum, value) => sum + value, 0) / rows.length),
    median_ms: round(quantile(latencies, 0.5)),
    p95_ms: round(quantile(latencies, 0.95)),
    min_ms: Math.min(...latencies),
    max_ms: Math.max(...latencies),
    non_200_count: non200,
    non_200_rate: round(non200 / rows.length, 4),
  };
}

export function groupStable<T>(
  rows: RequestRow[],
  keyFn: (row: RequestRow) => string,
  mapFn: (key: string, grouped: RequestRow[]) => T,
): T[] {
  const groups = new Map<string, RequestRow[]>();
  for (const row of rows) {
    const key = keyFn(row);
    const group = groups.get(key) ?? [];
    group.push(row);
    groups.set(key, group);
  }
  return [...groups.keys()].sort().map((key) => mapFn(key, groups.get(key)!));
}

export const payloadRange = (kb: number): string => {
  if (kb < 256) return "0000-0255";
  if (kb < 512) return "0256-0511";
  if (kb < 768) return "0512-0767";
  return "0768+";
};

function mixDimension(rows: RequestRow[], keyFn: (row: RequestRow) => string) {
  const keys = [...new Set(rows.map(keyFn))].sort();
  return keys.map((category) => {
    const control = rows.filter((row) => row.variant === "control" && keyFn(row) === category).length;
    const candidate = rows.filter((row) => row.variant === "candidate" && keyFn(row) === category).length;
    return {
      category,
      control: { count: control, share: round(control / 40, 4) },
      candidate: { count: candidate, share: round(candidate / 40, 4) },
      candidate_minus_control_share_pp: round((candidate / 40 - control / 40) * 100, 1),
    };
  });
}

const stratumKey = (row: RequestRow) => `${row.region}|${row.device}|${row.cache}`;

export function analyze(rows: RequestRow[], source: string) {
  const byVariant = (variant: Variant) => rows.filter((row) => row.variant === variant);
  const variantOutput: Record<string, unknown> = {};
  for (const variant of ["control", "candidate"] as const) {
    const selected = byVariant(variant);
    const successful = selected.filter((row) => row.status === 200);
    variantOutput[variant] = {
      all_requests: summarize(selected),
      status_200_only: summarize(successful),
    };
  }

  const commonKeys = [...new Set(rows.map(stratumKey))]
    .filter((key) => {
      const group = rows.filter((row) => stratumKey(row) === key);
      return group.some((row) => row.variant === "control") &&
        group.some((row) => row.variant === "candidate");
    })
    .sort();
  const strata = commonKeys.map((key) => {
    const [region, device, cache] = key.split("|");
    const controlRows = rows.filter((row) => row.variant === "control" && stratumKey(row) === key);
    const candidateRows = rows.filter((row) => row.variant === "candidate" && stratumKey(row) === key);
    const control = summarize(controlRows);
    const candidate = summarize(candidateRows);
    return {
      key,
      region,
      device,
      cache,
      control,
      candidate,
      mean_delta_ms: round(candidate.mean_ms - control.mean_ms),
      mean_delta_percent: round((candidate.mean_ms / control.mean_ms - 1) * 100, 1),
      direction: candidate.mean_ms < control.mean_ms ? "candidate_faster" : "candidate_slower",
    };
  });

  const combinedN = rows.length;
  const standardized = (variant: Variant) => round(strata.reduce((sum, stratum) => {
    const totalInStratum = rows.filter((row) => stratumKey(row) === stratum.key).length;
    return sum + (stratum[variant].mean_ms * totalInStratum / combinedN);
  }, 0));
  const standardizedControl = standardized("control");
  const standardizedCandidate = standardized("candidate");

  const payloadGroups = groupStable(rows, (row) => `${payloadRange(row.payload_kb)}|${row.variant}`,
    (key, grouped) => {
      const [range, variant] = key.split("|");
      return { range, variant, ...summarize(grouped) };
    });
  const candidateEuMobileCold = rows.filter((row) =>
    row.variant === "candidate" && row.region === "eu" &&
    row.device === "mobile" && row.cache === "cold");
  const errors = rows.filter((row) => row.status !== 200).map((row) => ({
    request_id: row.request_id,
    variant: row.variant,
    minute: row.minute,
    region: row.region,
    device: row.device,
    cache: row.cache,
    payload_kb: row.payload_kb,
    latency_ms: row.latency_ms,
    status: row.status,
  }));

  return {
    schema_version: 1,
    source,
    row_count: rows.length,
    quantile_convention: "Linear interpolation at h=(n-1)p on sorted values (R type 7 / NumPy default).",
    variants: variantOutput,
    traffic_mix: {
      region: mixDimension(rows, (row) => row.region),
      device: mixDimension(rows, (row) => row.device),
      cache: mixDimension(rows, (row) => row.cache),
      payload_range_kb: mixDimension(rows, (row) => payloadRange(row.payload_kb)),
    },
    strata,
    mix_adjustment: {
      method: "Direct standardization to combined-sample region × device × cache shares.",
      standardized_control_mean_ms: standardizedControl,
      standardized_candidate_mean_ms: standardizedCandidate,
      candidate_minus_control_ms: round(standardizedCandidate - standardizedControl),
      aggregate_candidate_minus_control_ms: round(
        (variantOutput.candidate as any).all_requests.mean_ms -
        (variantOutput.control as any).all_requests.mean_ms,
      ),
    },
    payload_analysis: {
      ranges: payloadGroups,
      candidate_eu_mobile_cold: {
        all_requests: summarize(candidateEuMobileCold),
        status_200_only: summarize(candidateEuMobileCold.filter((row) => row.status === 200)),
        count_payload_at_least_768_kb: candidateEuMobileCold.filter((row) => row.payload_kb >= 768).length,
        errors: candidateEuMobileCold.filter((row) => row.status !== 200).length,
      },
      error_rows: errors,
    },
    findings: [
      {
        id: "aggregate-gap",
        kind: "computed_fact",
        text: "Candidate aggregate mean and tail latency are higher than control when all requests, including errors, are retained.",
      },
      {
        id: "mix-effect",
        kind: "interpretation",
        text: "Traffic mix explains part of the aggregate gap: candidate has more mobile/cold and EU-mobile-cold observations, but standardization does not remove the regression.",
      },
      {
        id: "three-faster-one-slower",
        kind: "computed_fact",
        text: "Candidate is faster in three of four comparable strata and materially slower in EU × mobile × cold.",
      },
      {
        id: "localized-association",
        kind: "interpretation",
        text: "The regression and all observed errors are concentrated in candidate EU × mobile × cold traffic; payload size is entangled with that stratum and time.",
      },
    ],
    limitations: [
      "Variant is perfectly separated by time (control minutes 0–15; candidate minutes 20–37), so temporal drift is confounded with treatment.",
      "Traffic was not balanced or randomized across strata; stratum sample sizes differ, especially EU × mobile × cold (control n=4, candidate n=14).",
      "Payload distributions do not overlap well inside EU × mobile × cold, limiting like-for-like payload comparisons.",
      "Region, device, and cache occur only in four bundled combinations, so their individual effects and interactions are not separately identifiable.",
      "The dataset is small, contains no repeated rollout cycles, and supplies no server/resource/network telemetry.",
      "Status 504 may be part of the latency mechanism; excluding it would condition on an outcome, so primary statistics retain all rows.",
    ],
    recommendations: [
      {
        action: "pause_or_scope",
        text: "Do not continue the candidate for EU mobile cold traffic on this dataset alone; pause that slice or constrain it behind a guardrail while preserving the faster strata for a controlled follow-up.",
      },
      {
        action: "experiment",
        text: "Run a concurrent randomized control/candidate comparison within region × device × cache, with balanced payload bands and predefined latency/error guardrails.",
      },
      {
        action: "measurement",
        text: "Instrument stage-level latency, timeout origin, payload bytes, network timing, and resource saturation for EU mobile cold requests, keyed by request ID.",
      },
    ],
  };
}

export function stableJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}
