import battle from "@/data/battle.json";

export type ProviderKey = "claude" | "grok" | "codex";
export type ComparableProviderKey = ProviderKey;
export type DecisionMetricKey = "quality" | "speed" | "cost";

export interface TriadGrade {
  alias: string;
  run_status: string;
  score: number;
  letter: string;
  rubric: Record<string, number>;
  checks_assessment: string;
  evaluability: string | null;
  rationale: string;
}

export interface LaunchSubstitution {
  token: string;
  kind: "frozen_spec_bytes" | "portable_workspace_path" | "portable_archive_path";
  source: string;
}

export interface LaunchWrapper {
  argv_receipt: string;
  command: string;
  display: string;
  substitutions: LaunchSubstitution[];
  session_id: string | null;
  spec_path: string;
  prompt_sha256: string;
}

export interface CellReceipt {
  cell_id: string;
  condition: string;
  duration_seconds: number | null;
  classification: string | null;
  verdict?: string | null;
  session_id?: string | null;
  reported_model?: string | null;
  cost_usd: string | null;
  cost_source: string | null;
  output_tokens?: number | null;
  canonical_score?: number | null;
  canonical_letter?: string | null;
  launch?: LaunchWrapper;
}

export interface DemoRef {
  path: string;
  bytes: number;
  verdict?: string | null;
}

export interface SpecRow {
  id: string;
  slug: string;
  title: string;
  kind: string;
  track: string | null;
  era: "legacy" | "modern";
  spec_sha256: string;
  spec_markdown: string;
  conditions: Record<ProviderKey, string>;
  triad: {
    receipt: string;
    alias_mapping: Record<string, string>;
    providers: Record<ProviderKey, TriadGrade>;
    comparative_note: string;
    limitations: string[];
    schema: string;
  };
  pairwise: { claude_vs_grok: string; grok_vs_codex: string };
  canonical_winner: string;
  cells: Record<ProviderKey, CellReceipt>;
  demos: Partial<Record<ProviderKey, DemoRef>>;
}

export interface Tally {
  claude?: number;
  codex?: number;
  grok?: number;
  ties: number;
  pending?: number;
}

export interface ProviderAggregate {
  mean_score: number;
  total_points: number;
  quality_receipts: number;
  complete_runs: number;
  artifact_count: number;
  total_duration_seconds: number | null;
  median_duration_seconds: number | null;
  duration_receipts: number;
  total_cost_usd: number | null;
  cost_receipts: number;
}

export interface DecisionMetricValue {
  value: number | null;
  utility: number | null;
  unit: string;
}

export interface DecisionProviderRow {
  provider: ComparableProviderKey;
  quality: DecisionMetricValue;
  speed: DecisionMetricValue;
  cost: DecisionMetricValue;
}

export interface BattleMetrics {
  schema_version: string;
  generated_from: {
    quality: string;
    canonical_cells: string;
    grok_projection: string;
  };
  providers: Record<ProviderKey, ProviderAggregate>;
  decision_lab: {
    comparable_providers: ComparableProviderKey[];
    rows: Record<ComparableProviderKey, DecisionProviderRow>;
    formula: {
      quality_utility: string;
      speed_utility: string;
      cost_utility: string;
      total: string;
      monotonicity: string;
      display_precision: string;
    };
    comparability: {
      scope: string;
      grok_cost_exclusion: string;
      grok_speed_exclusion: string;
      speed_variability: string;
      missing_values: string;
    };
  };
  turn_count_exclusion: {
    status: string;
    reason: string;
    units: Record<ProviderKey, string>;
  };
}

export interface ShowcaseItem {
  spec_id: string;
  provider: ProviderKey;
  provider_label: string;
  title: string;
  era: "legacy" | "modern";
  kind: string;
  score: number;
  cell_id: string;
  deep_dive_path: string;
  staged_demo_path: string;
  preview_path: string;
  filename: string;
  slot: "feature" | "support";
  label: string;
  alt: string;
  object_position: string;
  fallback: string;
  capture: {
    source_origin: string;
    viewport_width: number;
    viewport_height: number;
    device_scale_factor: number;
    aspect_ratio: string;
    format: string;
    quality: number;
    interaction: string;
    ready_selector: string;
    ready_selector_optional: boolean;
    wait_after_ready_ms: number;
    full_page: boolean;
  };
}

export interface BattleData {
  generated_at: string;
  providers: Record<
    ProviderKey,
    { label: string; model: string; effort: string; harness: string }
  >;
  tallies: {
    canonical: Tally;
    canonical_legacy: Tally;
    canonical_modern: Tally;
    claude_vs_grok: Tally;
    grok_vs_codex: Tally;
  };
  disclosures: string[];
  grok_resource_summary?: {
    api_key_source: string;
    reported_model: string;
    pricing: {
      list_rate_equivalent_usd: string;
      launch_discount_equivalent_usd: string;
      billing_disclosure: string;
      basis: string;
    };
    tokens: {
      input: number;
      cache_read: number;
      cache_write: number;
      output: number;
    };
    timing: {
      summed_runtime_seconds: number;
      elapsed_campaign_seconds: number;
    };
  } | null;
  conditions: Record<string, Record<string, unknown>>;
  grade_disclosure_line: string;
  methodology_statements: string[];
  metrics?: BattleMetrics;
  showcase?: ShowcaseItem[];
  specs: SpecRow[];
}

// battle.json is generated by scripts/export-data.ts from receipted sources;
// the cast is the single typed boundary over that generated file.
export const data = battle as unknown as BattleData;

export const PROVIDER_ORDER: ProviderKey[] = ["claude", "grok", "codex"];
export const COMPARABLE_PROVIDER_ORDER: ComparableProviderKey[] = ["claude", "grok", "codex"];
export const SPEED_COMPARABLE_ORDER: ProviderKey[] = ["claude", "grok", "codex"];

export const PROVIDER_COLOR: Record<ProviderKey, string> = {
  claude: "#D97757", // Anthropic Claude Coral / Warm Terracotta
  grok: "#818CF8",   // xAI Grok Electric Indigo / Cyber Blue
  codex: "#10A37F",  // OpenAI Emerald / Teal
};

export const PROVIDER_SHORT: Record<ProviderKey, string> = {
  claude: "Opus 5",
  grok: "Grok 4.6",
  codex: "Sol",
};

function round(value: number, places: number): number {
  const scale = 10 ** places;
  return Math.round((value + Number.EPSILON) * scale) / scale;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const midpoint = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[midpoint - 1] + sorted[midpoint]) / 2
    : sorted[midpoint];
}

function isCompleteRun(status: string): boolean {
  return status === "complete" || status === "completed";
}

function aggregateProvider(provider: ProviderKey, specs: SpecRow[]): ProviderAggregate {
  const scores = specs
    .map((spec) => spec.triad.providers[provider].score)
    .filter((score) => Number.isFinite(score));
  const durations = specs
    .map((spec) => spec.cells[provider].duration_seconds)
    .filter((seconds): seconds is number => seconds !== null && Number.isFinite(seconds));
  const costs = specs
    .map((spec) => spec.cells[provider].cost_usd)
    .filter((value): value is string => value !== null)
    .map(Number)
    .filter((value) => Number.isFinite(value));
  const totalPoints = scores.reduce((sum, score) => sum + score, 0);
  const totalDuration = durations.reduce((sum, seconds) => sum + seconds, 0);
  const totalCost = costs.reduce((sum, value) => sum + value, 0);

  return {
    mean_score: scores.length === 0 ? 0 : round(totalPoints / scores.length, 4),
    total_points: totalPoints,
    quality_receipts: scores.length,
    complete_runs: specs.filter((spec) => isCompleteRun(spec.triad.providers[provider].run_status)).length,
    artifact_count: specs.length,
    total_duration_seconds: durations.length === 0 ? null : round(totalDuration, 6),
    median_duration_seconds: durations.length === 0 ? null : round(median(durations) ?? 0, 6),
    duration_receipts: durations.length,
    total_cost_usd: costs.length === 0 ? null : round(totalCost, 6),
    cost_receipts: costs.length,
  };
}

function utility(numerator: number | null, denominator: number | null): number | null {
  if (
    numerator === null ||
    denominator === null ||
    !Number.isFinite(numerator) ||
    !Number.isFinite(denominator) ||
    denominator <= 0
  ) {
    return null;
  }
  return round(numerator / denominator, 6);
}

function deriveBattleMetrics(specs: SpecRow[]): BattleMetrics {
  const providers = Object.fromEntries(
    PROVIDER_ORDER.map((provider) => [provider, aggregateProvider(provider, specs)]),
  ) as Record<ProviderKey, ProviderAggregate>;
  const comparableDurations = SPEED_COMPARABLE_ORDER.map(
    (provider) => providers[provider].total_duration_seconds,
  ).filter((value): value is number => value !== null);
  const comparableCosts = COMPARABLE_PROVIDER_ORDER.map(
    (provider) => providers[provider].total_cost_usd,
  ).filter((value): value is number => value !== null);
  const fastest = comparableDurations.length === SPEED_COMPARABLE_ORDER.length
    ? Math.min(...comparableDurations)
    : null;
  const cheapest = comparableCosts.length === COMPARABLE_PROVIDER_ORDER.length
    ? Math.min(...comparableCosts)
    : null;
  const rows = Object.fromEntries(
    COMPARABLE_PROVIDER_ORDER.map((provider) => {
      const aggregate = providers[provider];
      return [
        provider,
        {
          provider,
          quality: {
            value: aggregate.quality_receipts === specs.length ? aggregate.mean_score : null,
            utility:
              aggregate.quality_receipts === specs.length
                ? utility(aggregate.mean_score, 100)
                : null,
            unit: "blind-grade points out of 100",
          },
          speed: {
            value:
              aggregate.duration_receipts === specs.length
                ? aggregate.total_duration_seconds
                : null,
            utility:
              SPEED_COMPARABLE_ORDER.includes(provider) &&
              aggregate.duration_receipts === specs.length
                ? utility(fastest, aggregate.total_duration_seconds)
                : null,
            unit: SPEED_COMPARABLE_ORDER.includes(provider)
              ? "recorded wall seconds"
              : "recorded wall seconds",
          },
          cost: {
            value:
              aggregate.cost_receipts === specs.length
                ? aggregate.total_cost_usd
                : null,
            utility:
              aggregate.cost_receipts === specs.length
                ? utility(cheapest, aggregate.total_cost_usd)
                : null,
            unit:
              provider === "claude"
                ? "provider-receipt USD"
                : provider === "codex"
                  ? "published-rate estimate USD"
                  : "list-rate equivalent USD",
          },
        } satisfies DecisionProviderRow,
      ];
    }),
  ) as Record<ComparableProviderKey, DecisionProviderRow>;

  return {
    schema_version: "battle-metrics-v1",
    generated_from: {
      quality: "verification/grades/<NN>-G-TRIAD.json",
      canonical_cells: "verification/final-results/final-results.json",
      grok_projection: "verification/grok/grok-results.json",
    },
    providers,
    decision_lab: {
      comparable_providers: COMPARABLE_PROVIDER_ORDER,
      rows,
      formula: {
        quality_utility: "blind-triad mean score / 100",
        speed_utility: "fastest comparable total wall time / provider total wall time",
        cost_utility: "cheapest published-rate or receipted cost / provider cost",
        total: "sum(normalized weight × metric utility) × 100",
        monotonicity:
          "Higher quality never lowers quality utility; lower comparable time or cost never lowers its utility.",
        display_precision:
          "Raw source values stay available; utilities are exported to six decimals and composite scores display to one decimal.",
      },
      comparability: {
        scope:
          "Quality, time, and cost include all three agents. Cost uses Anthropic provider receipts for Opus and published-rate math for Sol and Grok. Time uses each agent's summed recorded wall seconds from twenty session receipts.",
        grok_cost_exclusion:
          "Sol costs are published-rate estimates, not invoices. Grok list-rate equivalents ($2 / $0.50 / $6 per million) use the same class of math and enter cost utility. The 50% launch-discount total is disclosed but unused in the composite, matching Sol's standard-rate basis.",
        grok_speed_exclusion:
          "Grok ran on the same machine after the August 13 reboot, through cursor-agent. Specs 01–10 were sequential; 11–20 ran two at a time. Decision Lab time utility uses the 15,432.818s summed session runtime. Campaign elapsed 10,678.278s is overlap disclosure only and is not the ranking input.",
        speed_variability:
          "Each agent ran each spec once through its main programming tool. Wall times move with provider load and time of day. Treat the ranking as a single-run observation, not a repeated-trial speed estimate.",
        missing_values:
          "A missing source value remains unavailable. It is never converted to zero, one, or best-in-class utility.",
      },
    },
    turn_count_exclusion: {
      status: "audited-and-excluded",
      reason:
        "Harness-native turn signals are different instrumentation units and cannot be combined into an efficiency ranking.",
      units: {
        claude: "Claude Code provider receipt num_turns",
        codex: "Codex CLI narrative codex blocks",
        grok: "Cursor Agent distinct model_call_id values",
      },
    },
  };
}

const showcaseSelections: Array<{
  spec_id: string;
  provider: ProviderKey;
  slot: "feature" | "support";
  label: string;
  object_position: string;
}> = [
  { spec_id: "01", provider: "claude", slot: "feature", label: "Emergent system", object_position: "center center" },
  { spec_id: "05", provider: "grok", slot: "support", label: "Logic puzzle", object_position: "center center" },
  { spec_id: "08", provider: "codex", slot: "support", label: "Developer tool", object_position: "center top" },
  { spec_id: "11", provider: "claude", slot: "support", label: "AI creative workflow", object_position: "center top" },
  { spec_id: "16", provider: "grok", slot: "support", label: "Content operations", object_position: "center top" },
  { spec_id: "20", provider: "codex", slot: "support", label: "Production planning", object_position: "center top" },
];

function deriveShowcase(specs: SpecRow[]): ShowcaseItem[] {
  return showcaseSelections.flatMap((selection) => {
    const spec = specs.find((row) => row.id === selection.spec_id);
    const demo = spec?.demos[selection.provider];
    if (!spec || !demo) return [];
    const filename = `${selection.spec_id}-${selection.provider}.webp`;
    return [
      {
        spec_id: spec.id,
        provider: selection.provider,
        provider_label: PROVIDER_SHORT[selection.provider],
        title: spec.title,
        era: spec.era,
        kind: spec.track ?? spec.kind,
        score: spec.triad.providers[selection.provider].score,
        cell_id: spec.cells[selection.provider].cell_id,
        deep_dive_path: `/specs/${spec.id}`,
        staged_demo_path: demo.path,
        preview_path: `/showcase/${filename}`,
        filename,
        slot: selection.slot,
        label: selection.label,
        alt: `Static preview of ${spec.title} by ${PROVIDER_SHORT[selection.provider]}`,
        object_position: selection.object_position,
        fallback:
          "Preview capture pending. The deep-dive link and receipted artifact metadata remain available without loading submitted code.",
        capture: {
          source_origin: "configured demo origin",
          viewport_width: 1440,
          viewport_height: 900,
          device_scale_factor: 1,
          aspect_ratio: "16:10",
          format: "webp",
          quality: 88,
          interaction: "none",
          ready_selector: "html[data-battle-ready='true']",
          ready_selector_optional: true,
          wait_after_ready_ms: 1200,
          full_page: false,
        },
      },
    ];
  });
}

export const battleMetrics: BattleMetrics = data.metrics ?? deriveBattleMetrics(data.specs);
export const showcaseItems: ShowcaseItem[] = data.showcase ?? deriveShowcase(data.specs);

export function specById(id: string): SpecRow {
  const spec = data.specs.find((row) => row.id === id);
  if (!spec) throw new Error(`unknown spec ${id}`);
  return spec;
}

export function eraLabel(era: "legacy" | "modern"): string {
  return era === "legacy" ? "local artifacts" : "AI UX";
}

export function averageScore(provider: ProviderKey, era?: "legacy" | "modern"): number {
  const rows = data.specs.filter((row) => (era ? row.era === era : true));
  const scores = rows.map((row) => row.triad.providers[provider].score);
  return scores.reduce((sum, value) => sum + value, 0) / scores.length;
}

export function artifactFailed(spec: SpecRow, provider: ProviderKey): boolean {
  const cell = spec.cells[provider];
  return (
    cell.verdict === "failed" ||
    cell.classification?.includes("failed") === true ||
    spec.triad.providers[provider].run_status === "dnf"
  );
}

export function formatDuration(seconds: number | null): string {
  if (seconds === null) return "—";
  const minutes = Math.floor(seconds / 60);
  const rest = Math.round(seconds % 60);
  return `${minutes}m ${rest.toString().padStart(2, "0")}s`;
}
