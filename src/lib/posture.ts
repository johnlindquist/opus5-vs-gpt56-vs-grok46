import {
  PROVIDER_ORDER,
  data,
  type BattleMetrics,
  type ComparableProviderKey,
  type DecisionMetricKey,
  type ProviderKey,
  type SpecRow,
} from "@/lib/data";

export type WeightMap = Record<DecisionMetricKey, number>;

export interface PosturePreset {
  id: string;
  name: string;
  shortName: string;
  description: string;
  weights: WeightMap;
  badge: string;
}

export const POSTURE_METRIC_ORDER: DecisionMetricKey[] = [
  "quality",
  "speed",
  "cost",
];

export const POSTURE_PRESETS: PosturePreset[] = [
  {
    id: "balanced",
    name: "Balanced",
    shortName: "Balanced",
    description: "Treat quality as lead signal with equal efficiency pressure.",
    weights: { quality: 40, speed: 30, cost: 30 },
    badge: "40/30/30",
  },
  {
    id: "production",
    name: "Production quality",
    shortName: "Quality",
    description: "Favor artifact quality; keep time and cost in view.",
    weights: { quality: 90, speed: 5, cost: 5 },
    badge: "90/5/5",
  },
  {
    id: "rapid",
    name: "Rapid prototype",
    shortName: "Speed",
    description: "Prioritize elapsed build time without ignoring quality.",
    weights: { quality: 20, speed: 60, cost: 20 },
    badge: "20/60/20",
  },
  {
    id: "budget",
    name: "Budget",
    shortName: "Budget",
    description: "Make receipted spend the dominant consideration.",
    weights: { quality: 20, speed: 10, cost: 70 },
    badge: "20/10/70",
  },
  {
    id: "quality_cost",
    name: "Quality + cost",
    shortName: "Quality+Cost",
    description: "Zero the time weight and rank on quality and published-rate cost.",
    weights: { quality: 60, speed: 0, cost: 40 },
    badge: "60/0/40",
  },
  {
    id: "raw_quality",
    name: "Raw quality only",
    shortName: "Raw 100",
    description: "Pure 100% blind triad grade without efficiency weighting.",
    weights: { quality: 100, speed: 0, cost: 0 },
    badge: "100/0/0",
  },
];

export const DEFAULT_POSTURE_PRESET = POSTURE_PRESETS[0]; // Balanced (40/30/30)

export function normalizeWeights(weights: WeightMap): Record<DecisionMetricKey, number> {
  const total = POSTURE_METRIC_ORDER.reduce((sum, metric) => sum + (weights[metric] ?? 0), 0);
  if (total <= 0) {
    return { quality: 0, speed: 0, cost: 0 };
  }
  return {
    quality: (weights.quality ?? 0) / total,
    speed: (weights.speed ?? 0) / total,
    cost: (weights.cost ?? 0) / total,
  };
}

export function areWeightsEqual(left: WeightMap, right: WeightMap): boolean {
  return POSTURE_METRIC_ORDER.every(
    (metric) => (left[metric] ?? 0) === (right[metric] ?? 0),
  );
}

export function findMatchingPreset(weights: WeightMap): PosturePreset | null {
  return POSTURE_PRESETS.find((preset) => areWeightsEqual(weights, preset.weights)) ?? null;
}

export function getPostureDisplayName(weights: WeightMap): { name: string; shortName: string; badge: string; isPreset: boolean } {
  const match = findMatchingPreset(weights);
  if (match) {
    return {
      name: match.name,
      shortName: match.shortName,
      badge: match.badge,
      isPreset: true,
    };
  }
  const total = POSTURE_METRIC_ORDER.reduce((sum, m) => sum + (weights[m] ?? 0), 0);
  const n = normalizeWeights(weights);
  const badge = total > 0
    ? `${Math.round(n.quality * 100)}/${Math.round(n.speed * 100)}/${Math.round(n.cost * 100)}`
    : "0/0/0";
  return {
    name: `Custom (${badge})`,
    shortName: `Custom [${badge}]`,
    badge,
    isPreset: false,
  };
}

export interface SpecScoreBreakdown {
  specId: string;
  title: string;
  era: "legacy" | "modern";
  track: string | null;
  kind: string;
  scores: Record<ProviderKey, number>;
  rawQuality: Record<ProviderKey, number>;
  durations: Record<ProviderKey, number>;
  costs: Record<ProviderKey, number>;
  contributions: Record<ProviderKey, Record<DecisionMetricKey, number>>;
  utilities: Record<ProviderKey, Record<DecisionMetricKey, number>>;
  winner: ProviderKey | "tie";
  pairwiseWinners: {
    claude_vs_codex: ProviderKey | "tie";
    claude_vs_grok: ProviderKey | "tie";
    grok_vs_codex: ProviderKey | "tie";
  };
}

export interface AggregatePostureResult {
  weights: WeightMap;
  normalizedWeights: Record<DecisionMetricKey, number>;
  weightTotal: number;
  preset: PosturePreset | null;
  displayName: string;
  displayBadge: string;
  providerScores: Record<ProviderKey, number>;
  providerContributions: Record<ProviderKey, Record<DecisionMetricKey, number>>;
  providerUtilities: Record<ProviderKey, Record<DecisionMetricKey, number>>;
  ranking: Array<{
    provider: ProviderKey;
    score: number;
    rank: number;
    contributions: Record<DecisionMetricKey, number>;
  }>;
  leader: {
    provider: ProviderKey;
    score: number;
    leadMargin: number;
  };
  pairwiseTallies: {
    claude_vs_codex: { claude: number; codex: number; ties: number; claudeWinRate: number; codexWinRate: number };
    claude_vs_grok: { claude: number; grok: number; ties: number; claudeWinRate: number; grokWinRate: number };
    grok_vs_codex: { grok: number; codex: number; ties: number; grokWinRate: number; codexWinRate: number };
  };
  specBreakdowns: SpecScoreBreakdown[];
}

/**
 * Calculates per-spec utilities and posture composite scores for all 20 specs.
 */
export function calculateSpecBreakdowns(
  specs: SpecRow[],
  weights: WeightMap,
): SpecScoreBreakdown[] {
  const norm = normalizeWeights(weights);
  const totalWeight = POSTURE_METRIC_ORDER.reduce((s, m) => s + (weights[m] ?? 0), 0);

  return specs.map((spec) => {
    // Extract raw metrics for each provider
    const rawQuality: Record<ProviderKey, number> = {
      claude: spec.triad.providers.claude.score,
      grok: spec.triad.providers.grok.score,
      codex: spec.triad.providers.codex.score,
    };

    const durations: Record<ProviderKey, number> = {
      claude: spec.cells.claude?.duration_seconds ?? 0,
      grok: spec.cells.grok?.duration_seconds ?? 0,
      codex: spec.cells.codex?.duration_seconds ?? 0,
    };

    const costs: Record<ProviderKey, number> = {
      claude: Number(spec.cells.claude?.cost_usd ?? 0),
      grok: Number(spec.cells.grok?.cost_usd ?? 0),
      codex: Number(spec.cells.codex?.cost_usd ?? 0),
    };

    // Find best (fastest duration and cheapest cost) among providers with valid metrics
    const validDurations = PROVIDER_ORDER.map((p) => durations[p]).filter((d) => d > 0);
    const validCosts = PROVIDER_ORDER.map((p) => costs[p]).filter((c) => c > 0);

    const fastestDuration = validDurations.length > 0 ? Math.min(...validDurations) : 0;
    const cheapestCost = validCosts.length > 0 ? Math.min(...validCosts) : 0;

    const utilities: Record<ProviderKey, Record<DecisionMetricKey, number>> = {
      claude: { quality: 0, speed: 0, cost: 0 },
      grok: { quality: 0, speed: 0, cost: 0 },
      codex: { quality: 0, speed: 0, cost: 0 },
    };

    const contributions: Record<ProviderKey, Record<DecisionMetricKey, number>> = {
      claude: { quality: 0, speed: 0, cost: 0 },
      grok: { quality: 0, speed: 0, cost: 0 },
      codex: { quality: 0, speed: 0, cost: 0 },
    };

    const scores: Record<ProviderKey, number> = {
      claude: 0,
      grok: 0,
      codex: 0,
    };

    PROVIDER_ORDER.forEach((p) => {
      const uQ = rawQuality[p] / 100;
      const uS = durations[p] > 0 && fastestDuration > 0 ? fastestDuration / durations[p] : 0;
      const uC = costs[p] > 0 && cheapestCost > 0 ? cheapestCost / costs[p] : 0;

      utilities[p] = { quality: uQ, speed: uS, cost: uC };

      if (totalWeight > 0) {
        contributions[p] = {
          quality: norm.quality * uQ * 100,
          speed: norm.speed * uS * 100,
          cost: norm.cost * uC * 100,
        };
        scores[p] = contributions[p].quality + contributions[p].speed + contributions[p].cost;
      } else {
        contributions[p] = { quality: 0, speed: 0, cost: 0 };
        scores[p] = 0;
      }
    });

    // Determine spec pairwise winners
    const compare = (a: ProviderKey, b: ProviderKey): ProviderKey | "tie" => {
      const sA = Math.round(scores[a] * 10) / 10;
      const sB = Math.round(scores[b] * 10) / 10;
      if (sA > sB) return a;
      if (sB > sA) return b;
      return "tie";
    };

    const pairwiseWinners = {
      claude_vs_codex: compare("claude", "codex"),
      claude_vs_grok: compare("claude", "grok"),
      grok_vs_codex: compare("grok", "codex"),
    };

    // Overall spec winner
    const maxScore = Math.max(...PROVIDER_ORDER.map((p) => scores[p]));
    const topProviders = PROVIDER_ORDER.filter(
      (p) => Math.abs(scores[p] - maxScore) < 0.05,
    );
    const winner: ProviderKey | "tie" = topProviders.length === 1 ? topProviders[0] : "tie";

    return {
      specId: spec.id,
      title: spec.title,
      era: spec.era,
      track: spec.track,
      kind: spec.kind,
      scores,
      rawQuality,
      durations,
      costs,
      contributions,
      utilities,
      winner,
      pairwiseWinners,
    };
  });
}

/**
 * Calculates comprehensive posture result, matching Decision Lab aggregate math.
 */
export function calculatePostureResult(
  metrics: BattleMetrics,
  specs: SpecRow[],
  weights: WeightMap,
): AggregatePostureResult {
  const norm = normalizeWeights(weights);
  const weightTotal = POSTURE_METRIC_ORDER.reduce((s, m) => s + (weights[m] ?? 0), 0);
  const preset = findMatchingPreset(weights);
  const { name: displayName, badge: displayBadge } = getPostureDisplayName(weights);

  // Decision Lab aggregate calculation
  const providerScores: Record<ProviderKey, number> = { claude: 0, grok: 0, codex: 0 };
  const providerContributions: Record<ProviderKey, Record<DecisionMetricKey, number>> = {
    claude: { quality: 0, speed: 0, cost: 0 },
    grok: { quality: 0, speed: 0, cost: 0 },
    codex: { quality: 0, speed: 0, cost: 0 },
  };
  const providerUtilities: Record<ProviderKey, Record<DecisionMetricKey, number>> = {
    claude: { quality: 0, speed: 0, cost: 0 },
    grok: { quality: 0, speed: 0, cost: 0 },
    codex: { quality: 0, speed: 0, cost: 0 },
  };

  PROVIDER_ORDER.forEach((provider) => {
    const row = metrics.decision_lab.rows[provider];
    const uQ = row.quality.utility ?? 0;
    const uS = row.speed.utility ?? 0;
    const uC = row.cost.utility ?? 0;

    providerUtilities[provider] = { quality: uQ, speed: uS, cost: uC };

    if (weightTotal > 0) {
      const cQ = norm.quality * uQ * 100;
      const cS = norm.speed * uS * 100;
      const cC = norm.cost * uC * 100;
      providerContributions[provider] = { quality: cQ, speed: cS, cost: cC };
      providerScores[provider] = cQ + cS + cC;
    } else {
      providerContributions[provider] = { quality: 0, speed: 0, cost: 0 };
      providerScores[provider] = 0;
    }
  });

  // Ranking
  const sorted = [...PROVIDER_ORDER]
    .map((provider) => ({
      provider,
      score: providerScores[provider],
      contributions: providerContributions[provider],
    }))
    .sort((a, b) => b.score - a.score);

  const ranking = sorted.map((item, index) => ({
    ...item,
    rank: index + 1,
  }));

  const leaderProvider = ranking[0]?.provider ?? "claude";
  const leaderScore = ranking[0]?.score ?? 0;
  const runnerUpScore = ranking[1]?.score ?? 0;
  const leadMargin = Math.max(0, leaderScore - runnerUpScore);

  // Per-spec breakdowns & Pairwise tallies
  const specBreakdowns = calculateSpecBreakdowns(specs, weights);

  const pairwiseTallies = {
    claude_vs_codex: { claude: 0, codex: 0, ties: 0, claudeWinRate: 0, codexWinRate: 0 },
    claude_vs_grok: { claude: 0, grok: 0, ties: 0, claudeWinRate: 0, grokWinRate: 0 },
    grok_vs_codex: { grok: 0, codex: 0, ties: 0, grokWinRate: 0, codexWinRate: 0 },
  };

  specBreakdowns.forEach((breakdown) => {
    // Opus vs Sol
    const cvc = breakdown.pairwiseWinners.claude_vs_codex;
    if (cvc === "claude") pairwiseTallies.claude_vs_codex.claude += 1;
    else if (cvc === "codex") pairwiseTallies.claude_vs_codex.codex += 1;
    else pairwiseTallies.claude_vs_codex.ties += 1;

    // Opus vs Grok
    const cvg = breakdown.pairwiseWinners.claude_vs_grok;
    if (cvg === "claude") pairwiseTallies.claude_vs_grok.claude += 1;
    else if (cvg === "grok") pairwiseTallies.claude_vs_grok.grok += 1;
    else pairwiseTallies.claude_vs_grok.ties += 1;

    // Grok vs Sol
    const gvc = breakdown.pairwiseWinners.grok_vs_codex;
    if (gvc === "grok") pairwiseTallies.grok_vs_codex.grok += 1;
    else if (gvc === "codex") pairwiseTallies.grok_vs_codex.codex += 1;
    else pairwiseTallies.grok_vs_codex.ties += 1;
  });

  const totalSpecs = specBreakdowns.length || 20;
  pairwiseTallies.claude_vs_codex.claudeWinRate = Math.round(
    (pairwiseTallies.claude_vs_codex.claude / totalSpecs) * 100,
  );
  pairwiseTallies.claude_vs_codex.codexWinRate = Math.round(
    (pairwiseTallies.claude_vs_codex.codex / totalSpecs) * 100,
  );

  pairwiseTallies.claude_vs_grok.claudeWinRate = Math.round(
    (pairwiseTallies.claude_vs_grok.claude / totalSpecs) * 100,
  );
  pairwiseTallies.claude_vs_grok.grokWinRate = Math.round(
    (pairwiseTallies.claude_vs_grok.grok / totalSpecs) * 100,
  );

  pairwiseTallies.grok_vs_codex.grokWinRate = Math.round(
    (pairwiseTallies.grok_vs_codex.grok / totalSpecs) * 100,
  );
  pairwiseTallies.grok_vs_codex.codexWinRate = Math.round(
    (pairwiseTallies.grok_vs_codex.codex / totalSpecs) * 100,
  );

  return {
    weights,
    normalizedWeights: norm,
    weightTotal,
    preset,
    displayName,
    displayBadge,
    providerScores,
    providerContributions,
    providerUtilities,
    ranking,
    leader: {
      provider: leaderProvider,
      score: leaderScore,
      leadMargin,
    },
    pairwiseTallies,
    specBreakdowns,
  };
}
