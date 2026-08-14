/**
 * Export site data from the opus5-vs-gpt56-battle evidence archive.
 *
 * Reads only receipted, staged sources (never raw run workspaces):
 *   - verification/final-results/final-results.json  (canonical matchups/cells)
 *   - verification/grok/grok-results.json            (Condition G projection)
 *   - verification/grades/<NN>-G-TRIAD.json          (blind triad reviews)
 *   - verification/conditions.json                   (condition registry)
 *   - site/slideshow/demos + verification/here-now/demo-manifest.json (staged canonical demos)
 *   - site/grok-demos + verification/grok/demo-manifest.json          (staged grok demos)
 *   - specs/*.md and verification/specs/*.md         (frozen prompts)
 *
 * Emits src/data/battle.json, copies staged demos into public/demos/, and
 * writes a mechanical static-preview capture manifest into public/showcase/.
 */
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

const BATTLE = path.join(process.env.HOME ?? "", "dev", "opus5-vs-gpt56-battle");
const SITE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const PROVIDER_KEYS = ["claude", "grok", "codex"] as const;
const COMPARABLE_PROVIDER_KEYS = ["claude", "codex"] as const;
const DECISION_PROVIDER_KEYS = ["claude", "grok", "codex"] as const;
const SPEED_COMPARABLE_KEYS = ["claude", "codex"] as const;
const COST_COMPARABLE_KEYS = ["claude", "grok", "codex"] as const;
type ProviderKey = (typeof PROVIDER_KEYS)[number];
type ComparableProviderKey = (typeof COMPARABLE_PROVIDER_KEYS)[number];
type DecisionProviderKey = (typeof DECISION_PROVIDER_KEYS)[number];

interface GradeCell {
  score?: number;
  letter?: string;
}
interface CanonicalMatchup {
  spec_id: string;
  condition_id: string;
  left_cell: string;
  right_cell: string;
  effective_grades?: Record<string, GradeCell>;
}
interface FinalResultsDoc {
  matchups: { canonical: CanonicalMatchup[] };
  cells: Record<
    string,
    {
      duration_wall_seconds?: number;
      classification?: string;
      output_tokens?: number;
      cost?: { cost_usd?: string; source?: string };
    }
  >;
  tallies: { combined: unknown; legacy: unknown; modern: unknown };
}
interface TriadArtifact {
  alias: string;
  run_status: string;
  score_total: number;
  letter_grade: string;
  rubric: Record<string, number>;
  checks_assessment: string;
  evaluability?: string;
  rationale: string;
}
interface TriadReceipt {
  status: string;
  alias_mapping: Record<string, string>;
  result: {
    artifacts: TriadArtifact[];
    comparative_note: string;
    limitations: string[];
    schema_version: string;
  };
}
interface GrokRow {
  spec_id: string;
  condition: string;
  duration_seconds: number | null;
  classification: string | null;
  verdict: string | null;
  session_id: string | null;
  reported_model: string | null;
  pairwise: Record<string, string>;
  cost_equivalents?: {
    list_rate_equivalent_usd: string;
    launch_discount_equivalent_usd: string;
  };
  usage?: {
    input: number;
    cache_read: number;
    cache_write: number;
    output: number;
  };
}
interface GrokResultsDoc {
  schema_version?: string;
  specs: GrokRow[];
  tallies: Record<string, unknown> & {
    claude_vs_grok: unknown;
    grok_vs_codex: unknown;
  };
  disclosures: string[];
  resource_summary?: {
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
  };
}
interface ConditionsDoc {
  conditions: Record<string, unknown>;
  grade_disclosure_line: string;
  methodology_statements: string[];
}
interface GrokDemoManifestDoc {
  demos: Array<{
    spec_id: string;
    staged: boolean;
    entry?: string;
    verdict?: string | null;
  }>;
}
interface HereNowManifestDoc {
  cells: Array<{ cell_id: string; entry: string }>;
}
interface LegacySpecRow {
  id: string;
  slug: string;
  title: string;
  kind: string;
  file: string;
}
interface ModernFamilyDoc {
  specs: Array<{ id: string; slug?: string; title?: string; track: string; file?: string }>;
}
interface ExportedCell {
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
}
interface ExportedDemo {
  path: string;
  bytes: number;
  verdict?: string | null;
}
interface ExportedTriadGrade {
  alias: string;
  run_status: string;
  score: number;
  letter: string;
  rubric: Record<string, number>;
  checks_assessment: string;
  evaluability: string | null;
  rationale: string;
}
interface ExportedSpec {
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
    providers: Record<ProviderKey, ExportedTriadGrade>;
    comparative_note: string;
    limitations: string[];
    schema: string;
  };
  pairwise: Record<string, string>;
  canonical_winner: string;
  cells: Record<ProviderKey, ExportedCell>;
  demos: Partial<Record<ProviderKey, ExportedDemo>>;
}
interface ProviderAggregate {
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
interface ShowcaseSelection {
  spec_id: string;
  provider: ProviderKey;
  slot: "feature" | "support";
  label: string;
  object_position: string;
}

function readJson<T>(relative: string): T {
  // Trusted local receipts already schema-validated upstream in the battle
  // repo; the cast is the documented boundary.
  return JSON.parse(fs.readFileSync(path.join(BATTLE, relative), "utf8")) as T;
}

function sha256File(file: string): string {
  return createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

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

const finalResults = readJson<FinalResultsDoc>("verification/final-results/final-results.json");
const grokResults = readJson<GrokResultsDoc>("verification/grok/grok-results.json");
const conditions = readJson<ConditionsDoc>("verification/conditions.json");
const grokDemoManifest = readJson<GrokDemoManifestDoc>("verification/grok/demo-manifest.json");
const hereNowManifest = readJson<HereNowManifestDoc>("verification/here-now/demo-manifest.json");
const legacyManifest = readJson<LegacySpecRow[]>("specs/manifest.json");
const modernFamily = readJson<ModernFamilyDoc>("verification/specs/modern-ai-ux-v1.json");

const canonicalEntryByCell: Record<string, string> = {};
for (const cell of hereNowManifest.cells) {
  canonicalEntryByCell[cell.cell_id] = cell.entry;
}

interface SpecMeta {
  id: string;
  slug: string;
  title: string;
  kind: string;
  track?: string;
  file: string;
  era: "legacy" | "modern";
}

const specMeta: SpecMeta[] = [
  ...legacyManifest.map((row) => ({ ...row, era: "legacy" as const })),
  ...modernFamily.specs.map((row) => ({
    id: row.id,
    slug: row.slug ?? path.basename(row.file ?? `${row.id}`, ".md").replace(/^\d\d-/, ""),
    title: row.title ?? "",
    kind: row.track,
    track: row.track,
    file: `verification/specs/${row.id}-${row.slug ?? ""}.md`,
    era: "modern" as const,
  })),
];

// Modern family registry rows may carry their own file/slug fields; resolve
// the actual frozen spec path by globbing the directory once.
const modernSpecDir = path.join(BATTLE, "verification", "specs");
const modernSpecFiles = fs
  .readdirSync(modernSpecDir)
  .filter((name) => /^\d\d-.*\.md$/.test(name));
for (const meta of specMeta) {
  if (meta.era !== "modern") continue;
  const match = modernSpecFiles.find((name) => name.startsWith(`${meta.id}-`));
  if (!match) throw new Error(`no frozen spec file for ${meta.id}`);
  meta.file = `verification/specs/${match}`;
  meta.slug = match.replace(/^\d\d-/, "").replace(/\.md$/, "");
  const heading = fs
    .readFileSync(path.join(BATTLE, meta.file), "utf8")
    .match(/^#\s+(.+)$/m)?.[1];
  if (!heading) throw new Error(`no title heading in frozen spec ${meta.file}`);
  meta.title = heading;
}

const canonicalBySpec: Record<string, CanonicalMatchup> = {};
for (const matchup of finalResults.matchups.canonical) {
  canonicalBySpec[matchup.spec_id] = matchup;
}
const grokBySpec: Record<string, GrokRow> = {};
for (const row of grokResults.specs) {
  grokBySpec[row.spec_id] = row;
}

function providerOfTarget(target: string): ProviderKey {
  if (target.includes("-claude-")) return "claude";
  if (target.includes("-grok-")) return "grok";
  if (target.includes("-codex-")) return "codex";
  throw new Error(`unmappable alias target ${target}`);
}

function copyDemoDir(sourceDir: string, destDir: string): number {
  fs.rmSync(destDir, { recursive: true, force: true });
  fs.cpSync(sourceDir, destDir, { recursive: true });
  let bytes = 0;
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else bytes += fs.statSync(full).size;
    }
  };
  walk(destDir);
  return bytes;
}

const demosPublic = path.join(SITE, "public", "demos");
fs.mkdirSync(demosPublic, { recursive: true });

const specs: ExportedSpec[] = [];
for (const meta of specMeta) {
  const canonical = canonicalBySpec[meta.id];
  const grokRow = grokBySpec[meta.id];
  if (!canonical || !grokRow) throw new Error(`missing sources for spec ${meta.id}`);
  const triad = readJson<TriadReceipt>(`verification/grades/${meta.id}-G-TRIAD.json`);
  if (triad.status !== "valid") throw new Error(`triad receipt not valid for ${meta.id}`);

  const triadByProvider = {} as Record<ProviderKey, ExportedTriadGrade>;
  for (const artifact of triad.result.artifacts) {
    const target = triad.alias_mapping[artifact.alias];
    triadByProvider[providerOfTarget(target)] = {
      alias: artifact.alias,
      run_status: artifact.run_status,
      score: artifact.score_total,
      letter: artifact.letter_grade,
      rubric: artifact.rubric,
      checks_assessment: artifact.checks_assessment,
      evaluability: artifact.evaluability ?? null,
      rationale: artifact.rationale,
    };
  }
  for (const provider of PROVIDER_KEYS) {
    if (!triadByProvider[provider]) {
      throw new Error(`triad receipt ${meta.id} does not map ${provider}`);
    }
  }

  const cells = {} as Record<ProviderKey, ExportedCell>;
  for (const side of ["left_cell", "right_cell"] as const) {
    const cellId = canonical[side];
    const cell = finalResults.cells[cellId];
    if (!cell) throw new Error(`canonical cell missing from final results: ${cellId}`);
    cells[cellId.includes("claude") ? "claude" : "codex"] = {
      cell_id: cellId,
      condition: canonical.condition_id,
      duration_seconds: cell.duration_wall_seconds ?? null,
      classification: cell.classification ?? null,
      cost_usd: cell.cost?.cost_usd ?? null,
      cost_source: cell.cost?.source ?? null,
      output_tokens: cell.output_tokens ?? null,
      canonical_score: canonical.effective_grades?.[cellId]?.score ?? null,
      canonical_letter: canonical.effective_grades?.[cellId]?.letter ?? null,
    };
  }
  cells.grok = {
    cell_id: `${meta.id}-grok-g`,
    condition: grokRow.condition,
    duration_seconds: grokRow.duration_seconds,
    classification: grokRow.classification,
    verdict: grokRow.verdict,
    session_id: grokRow.session_id,
    reported_model: grokRow.reported_model,
    cost_usd: grokRow.cost_equivalents?.list_rate_equivalent_usd ?? null,
    cost_source: grokRow.cost_equivalents
      ? "cursor-grok-4.6-list-rate-equivalent"
      : "cursor-subscription (no per-run receipt)",
    output_tokens: grokRow.usage?.output ?? null,
  };

  // Staged demos -> public/demos
  const demos: Partial<Record<ProviderKey, ExportedDemo>> = {};
  for (const key of COMPARABLE_PROVIDER_KEYS) {
    const cellId = cells[key].cell_id;
    const source = path.join(BATTLE, "site", "slideshow", "demos", cellId);
    if (fs.existsSync(source)) {
      const bytes = copyDemoDir(source, path.join(demosPublic, cellId));
      demos[key] = {
        path: `/demos/${cellId}/${canonicalEntryByCell[cellId] ?? "index.html"}`,
        bytes,
      };
    }
  }
  const grokDemo = grokDemoManifest.demos.find((row) => row.spec_id === meta.id);
  if (grokDemo?.staged) {
    const dirName = `${meta.id}-grok-g`;
    const source = path.join(BATTLE, "site", "grok-demos", dirName);
    const bytes = copyDemoDir(source, path.join(demosPublic, dirName));
    demos.grok = {
      path: `/demos/${dirName}/${path.basename(grokDemo.entry ?? "index.html")}`,
      bytes,
      verdict: grokDemo.verdict,
    };
  }

  const specPath = path.join(BATTLE, meta.file);
  specs.push({
    id: meta.id,
    slug: meta.slug,
    title: meta.title,
    kind: meta.kind,
    track: meta.track ?? null,
    era: meta.era,
    spec_sha256: sha256File(specPath),
    spec_markdown: fs.readFileSync(specPath, "utf8"),
    conditions: {
      claude: canonical.condition_id,
      codex: canonical.condition_id,
      grok: grokRow.condition,
    },
    triad: {
      receipt: `verification/grades/${meta.id}-G-TRIAD.json`,
      alias_mapping: triad.alias_mapping,
      providers: triadByProvider,
      comparative_note: triad.result.comparative_note,
      limitations: triad.result.limitations,
      schema: triad.result.schema_version,
    },
    pairwise: grokRow.pairwise,
    canonical_winner:
      (canonical.effective_grades?.[canonical.left_cell]?.score ?? 0) ===
      (canonical.effective_grades?.[canonical.right_cell]?.score ?? 0)
        ? "tie"
        : (canonical.effective_grades?.[canonical.left_cell]?.score ?? 0) >
            (canonical.effective_grades?.[canonical.right_cell]?.score ?? 0)
          ? "claude"
          : "codex",
    cells,
    demos,
  });
}

function aggregateProvider(provider: ProviderKey): ProviderAggregate {
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

const aggregates = Object.fromEntries(
  PROVIDER_KEYS.map((provider) => [provider, aggregateProvider(provider)]),
) as Record<ProviderKey, ProviderAggregate>;

for (const provider of SPEED_COMPARABLE_KEYS) {
  const aggregate = aggregates[provider];
  if (
    aggregate.quality_receipts !== specs.length ||
    aggregate.duration_receipts !== specs.length ||
    aggregate.total_duration_seconds === null
  ) {
    throw new Error(
      `decision-lab speed comparability requires ${specs.length}/${specs.length} quality and duration receipts for ${provider}`,
    );
  }
}
for (const provider of COST_COMPARABLE_KEYS) {
  const aggregate = aggregates[provider];
  if (aggregate.quality_receipts !== specs.length || aggregate.cost_receipts !== specs.length || aggregate.total_cost_usd === null) {
    throw new Error(
      `decision-lab cost comparability requires ${specs.length}/${specs.length} quality and cost receipts for ${provider}`,
    );
  }
}

const fastestComparableSeconds = Math.min(
  ...SPEED_COMPARABLE_KEYS.map(
    (provider) => aggregates[provider].total_duration_seconds as number,
  ),
);
const cheapestComparableCost = Math.min(
  ...COST_COMPARABLE_KEYS.map(
    (provider) => aggregates[provider].total_cost_usd as number,
  ),
);

const decisionRows = Object.fromEntries(
  DECISION_PROVIDER_KEYS.map((provider) => {
    const aggregate = aggregates[provider];
    const duration = aggregate.total_duration_seconds;
    const cost = aggregate.total_cost_usd as number;
    const speedComparable = (SPEED_COMPARABLE_KEYS as readonly string[]).includes(provider);
    return [
      provider,
      {
        provider,
        quality: {
          value: aggregate.mean_score,
          utility: round(aggregate.mean_score / 100, 6),
          unit: "blind-grade points out of 100",
        },
        speed: {
          value: duration,
          utility:
            speedComparable && duration
              ? round(fastestComparableSeconds / duration, 6)
              : null,
          unit: speedComparable
            ? "recorded canonical wall seconds"
            : "later-run wall seconds (provenance only)",
        },
        cost: {
          value: cost,
          utility: round(cheapestComparableCost / cost, 6),
          unit:
            provider === "claude"
              ? "provider-receipt USD"
              : provider === "codex"
                ? "published-rate estimate USD"
                : "list-rate equivalent USD",
        },
      },
    ];
  }),
) as Record<DecisionProviderKey, unknown>;

const metrics = {
  schema_version: "battle-metrics-v1",
  generated_from: {
    quality: "verification/grades/<NN>-G-TRIAD.json",
    canonical_cells: "verification/final-results/final-results.json",
    grok_projection: "verification/grok/grok-results.json",
  },
  providers: aggregates,
  decision_lab: {
    comparable_providers: DECISION_PROVIDER_KEYS,
    rows: decisionRows,
    formula: {
      quality_utility: "fresh blind-triad mean score / 100",
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
        "Quality and cost now include all three arms. Cost uses Anthropic provider receipts for Opus and published-rate math for Sol and Grok. Speed still compares only the canonical Opus and Sol matrix.",
      grok_cost_exclusion:
        "Sol was already a published-rate estimate, not an invoice. Grok list-rate equivalents ($2 / $0.50 / $6 per million) are the same class of math and now enter cost utility. The 50% launch-discount total is disclosed but unused in the composite, matching Sol's standard-rate basis.",
      grok_speed_exclusion:
        "Condition G ran later under different host state and concurrency, so Grok durations remain provenance only and are excluded from controlled speed weighting.",
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

const showcaseSelections: ShowcaseSelection[] = [
  {
    spec_id: "01",
    provider: "claude",
    slot: "feature",
    label: "Emergent system",
    object_position: "center center",
  },
  {
    spec_id: "05",
    provider: "grok",
    slot: "support",
    label: "Logic puzzle",
    object_position: "center center",
  },
  {
    spec_id: "08",
    provider: "codex",
    slot: "support",
    label: "Developer tool",
    object_position: "center top",
  },
  {
    spec_id: "11",
    provider: "claude",
    slot: "support",
    label: "AI creative workflow",
    object_position: "center top",
  },
  {
    spec_id: "16",
    provider: "grok",
    slot: "support",
    label: "Content operations",
    object_position: "center top",
  },
  {
    spec_id: "20",
    provider: "codex",
    slot: "support",
    label: "Production planning",
    object_position: "center top",
  },
];

const showcase = showcaseSelections.map((selection) => {
  const spec = specs.find((row) => row.id === selection.spec_id);
  if (!spec) throw new Error(`showcase spec does not exist: ${selection.spec_id}`);
  const demo = spec.demos[selection.provider];
  if (!demo) {
    throw new Error(
      `showcase selection is not staged: ${selection.spec_id}/${selection.provider}`,
    );
  }
  const filename = `${selection.spec_id}-${selection.provider}.webp`;
  return {
    spec_id: spec.id,
    provider: selection.provider,
    provider_label:
      selection.provider === "claude"
        ? "Opus 5"
        : selection.provider === "grok"
          ? "Grok 4.6"
          : "Sol",
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
    alt: `Static preview of ${spec.title} by ${
      selection.provider === "claude"
        ? "Opus 5"
        : selection.provider === "grok"
          ? "Grok 4.6"
          : "Sol"
    }`,
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
  };
});

const providers = {
  claude: { label: "Claude Opus 5", model: "claude-opus-5", effort: "medium", harness: "Claude Code" },
  codex: { label: "GPT-5.6 Sol", model: "gpt-5.6-sol", effort: "medium", harness: "Codex CLI" },
  grok: { label: "Grok 4.6", model: "cursor-grok-4.6-medium", effort: "medium", harness: "Cursor Agent CLI" },
};

const generatedAt = new Date().toISOString();
const data = {
  generated_at: generatedAt,
  providers,
  tallies: {
    canonical: finalResults.tallies.combined,
    canonical_legacy: finalResults.tallies.legacy,
    canonical_modern: finalResults.tallies.modern,
    claude_vs_grok: grokResults.tallies.claude_vs_grok,
    grok_vs_codex: grokResults.tallies.grok_vs_codex,
  },
  disclosures: grokResults.disclosures,
  grok_resource_summary: grokResults.resource_summary ?? null,
  conditions: conditions.conditions,
  grade_disclosure_line: conditions.grade_disclosure_line,
  methodology_statements: conditions.methodology_statements,
  metrics,
  showcase,
  specs,
};

const outPath = path.join(SITE, "src", "data", "battle.json");
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(data, null, 1));

const showcasePublic = path.join(SITE, "public", "showcase");
fs.mkdirSync(showcasePublic, { recursive: true });
const captureManifestPath = path.join(showcasePublic, "capture-manifest.json");
fs.writeFileSync(
  captureManifestPath,
  `${JSON.stringify(
    {
      schema_version: "showcase-capture-v1",
      generated_at: generatedAt,
      rule:
        "Open each staged_demo_path on the configured demo origin, make no interaction, capture the exact viewport, and write the named WebP. The landing page reads only preview_path.",
      items: showcase,
    },
    null,
    2,
  )}\n`,
);

const demoDirs = fs.readdirSync(demosPublic).length;
console.log(
  `wrote ${path.relative(SITE, outPath)} (${(fs.statSync(outPath).size / 1024).toFixed(0)} KiB), ${specs.length} specs, ${demoDirs} demo dirs, ${showcase.length} showcase capture targets`,
);
