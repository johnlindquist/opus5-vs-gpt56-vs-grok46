"use client";

import { useMemo, useState, type CSSProperties } from "react";
import {
  BadgeDollarSign,
  ChevronDown,
  Gauge,
  Scale,
  Sparkles,
  TimerReset,
} from "lucide-react";
import { ProviderMark } from "@/components/provider-icon";
import {
  PROVIDER_COLOR,
  PROVIDER_ORDER,
  PROVIDER_SHORT,
  data,
  type BattleMetrics,
  type ComparableProviderKey,
  type DecisionMetricKey,
} from "@/lib/data";

interface DecisionLabProps {
  metrics: BattleMetrics;
}

type WeightMap = Record<DecisionMetricKey, number>;

const metricOrder: DecisionMetricKey[] = ["quality", "speed", "cost"];

const metricMeta: Record<
  DecisionMetricKey,
  {
    label: string;
    shortLabel: string;
    description: string;
    icon: typeof Sparkles;
  }
> = {
  quality: {
    label: "Shipped-artifact quality",
    shortLabel: "Quality",
    description: "Blind-triad mean grade across all twenty briefs.",
    icon: Sparkles,
  },
  speed: {
    label: "Comparable build time",
    shortLabel: "Time",
    description: "Total recorded wall time across twenty sessions; lower is better. Single-run clocks, so load and time of day remain in the number.",
    icon: TimerReset,
  },
  cost: {
    label: "Published-rate / receipted cost",
    shortLabel: "Cost",
    description: "Opus uses Anthropic receipts; Sol and Grok use published token-rate math. Lower is better.",
    icon: BadgeDollarSign,
  },
};

const presets: Array<{ name: string; description: string; weights: WeightMap }> = [
  {
    name: "Production quality",
    description: "Favor artifact quality; keep time and cost in view.",
    weights: { quality: 90, speed: 5, cost: 5 },
  },
  {
    name: "Balanced",
    description: "Treat quality as the lead signal with equal efficiency pressure.",
    weights: { quality: 40, speed: 30, cost: 30 },
  },
  {
    name: "Rapid prototype",
    description: "Prioritize elapsed build time without ignoring quality.",
    weights: { quality: 20, speed: 60, cost: 20 },
  },
  {
    name: "Budget",
    description: "Make receipted spend the dominant consideration.",
    weights: { quality: 20, speed: 10, cost: 70 },
  },
  {
    name: "Quality + cost",
    description: "Zero the time weight and rank on quality and published-rate cost.",
    weights: { quality: 60, speed: 0, cost: 40 },
  },
];

function formatRawValue(metric: DecisionMetricKey, value: number | null): string {
  if (value === null) return "Unavailable";
  if (metric === "quality") return `${value.toFixed(2)} / 100`;
  if (metric === "speed") {
    return `${value.toLocaleString(undefined, {
      minimumFractionDigits: 3,
      maximumFractionDigits: 3,
    })} s`;
  }
  return `$${value.toFixed(6)}`;
}

function coverageLabel(
  metrics: BattleMetrics,
  provider: ComparableProviderKey,
  metric: DecisionMetricKey,
): string {
  const aggregate = metrics.providers[provider];
  if (metric === "quality") {
    return `${aggregate.quality_receipts}/${aggregate.artifact_count} triad grades`;
  }
  if (metric === "speed") {
    return `${aggregate.duration_receipts}/${aggregate.artifact_count} recorded durations`;
  }
  if (provider === "grok") {
    return `${aggregate.cost_receipts}/${aggregate.artifact_count} list-rate equivalents`;
  }
  if (provider === "codex") {
    return `${aggregate.cost_receipts}/${aggregate.artifact_count} published-rate estimates`;
  }
  return `${aggregate.cost_receipts}/${aggregate.artifact_count} provider receipts`;
}

function sameWeights(left: WeightMap, right: WeightMap): boolean {
  return metricOrder.every((metric) => left[metric] === right[metric]);
}

export function DecisionLab({ metrics }: DecisionLabProps) {
  const [weights, setWeights] = useState<WeightMap>(presets[1].weights);
  const weightTotal = metricOrder.reduce((sum, metric) => sum + weights[metric], 0);
  const normalizedWeights = Object.fromEntries(
    metricOrder.map((metric) => [
      metric,
      weightTotal === 0 ? 0 : weights[metric] / weightTotal,
    ]),
  ) as Record<DecisionMetricKey, number>;

  const ranking = useMemo(() => {
    if (weightTotal === 0) return [];

    return metrics.decision_lab.comparable_providers
      .map((provider, stableIndex) => {
        const row = metrics.decision_lab.rows[provider];
        const contributions = Object.fromEntries(
          metricOrder.map((metric) => {
            const utility = row[metric].utility;
            const weighted =
              normalizedWeights[metric] === 0
                ? 0
                : utility === null
                  ? null
                  : normalizedWeights[metric] * utility * 100;
            return [metric, weighted];
          }),
        ) as Record<DecisionMetricKey, number | null>;
        const missingWeightedMetric = metricOrder.some(
          (metric) => normalizedWeights[metric] > 0 && contributions[metric] === null,
        );
        const score = missingWeightedMetric
          ? null
          : metricOrder.reduce(
              (sum, metric) => sum + (contributions[metric] ?? 0),
              0,
            );
        return { provider, stableIndex, score, contributions };
      })
      .sort((left, right) => {
        if (left.score === null && right.score === null) {
          return left.stableIndex - right.stableIndex;
        }
        if (left.score === null) return 1;
        if (right.score === null) return -1;
        return right.score - left.score || left.stableIndex - right.stableIndex;
      });
  }, [metrics, normalizedWeights, weightTotal]);

  const activePreset = presets.find((preset) => sameWeights(weights, preset.weights));
  const leader = ranking[0];
  const runnerUp = ranking[1];
  const lead =
    leader && runnerUp && leader.score !== null && runnerUp.score !== null
      ? leader.score - runnerUp.score
      : null;

  const updateWeight = (metric: DecisionMetricKey, value: number) => {
    setWeights((current) => ({ ...current, [metric]: value }));
  };

  return (
    <section
      id="decision-lab"
      aria-labelledby="decision-lab-heading"
      className="scroll-mt-20 border-y border-border bg-[#050505]"
    >
      <div className="mx-auto max-w-[1600px] px-4 py-16 sm:px-6 lg:px-8 lg:py-24">
        <div className="grid gap-8 xl:grid-cols-[.72fr_1.28fr] xl:items-end">
          <div>
            <div className="mega-label mb-3 text-foreground">Interactive decision lab</div>
            <h2
              id="decision-lab-heading"
              className="pixel-heading max-w-3xl text-3xl font-semibold sm:text-5xl"
            >
              Your priorities. A different answer.
            </h2>
          </div>
          <p className="max-w-3xl text-sm leading-6 text-muted-foreground xl:justify-self-end">
            Weight quality, recorded build time, and published-rate cost. Quality,
            time, and cost include all three agents. The Quality + cost preset
            zeros the time weight.
          </p>
        </div>

        <div className="mt-10 grid gap-px border border-border bg-border xl:grid-cols-[minmax(0,.9fr)_minmax(0,1.1fr)]">
          <div className="bg-black p-5 sm:p-7 lg:p-8">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="mega-label">01 · Choose a posture</div>
                <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
                  Presets set all three controls. Manual changes remain visible as
                  raw importance points and are normalized before scoring.
                </p>
              </div>
              <div className="border border-border bg-card px-3 py-2 text-right">
                <div className="font-mono text-xl font-semibold tabular-nums">
                  {weightTotal}
                </div>
                <div className="mega-label">raw weight total</div>
              </div>
            </div>

            <div className="mt-6 grid gap-2 sm:grid-cols-2">
              {presets.map((preset) => {
                const active = activePreset?.name === preset.name;
                return (
                  <button
                    key={preset.name}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setWeights(preset.weights)}
                    className="group border border-border bg-card p-4 text-left outline-none transition-colors hover:border-border focus-visible:border-border focus-visible:ring-2 focus-visible:ring-mega-blue-text/40 aria-pressed:border-border aria-pressed:bg-card"
                  >
                    <span className="flex items-center justify-between gap-3">
                      <span className="font-mono text-xs font-semibold uppercase tracking-wider">
                        {preset.name}
                      </span>
                      <span
                        className="size-2 bg-border group-aria-pressed:bg-mega-blue-text"
                        aria-hidden="true"
                      />
                    </span>
                    <span className="mt-2 block text-xs leading-5 text-muted-foreground">
                      {preset.description}
                    </span>
                    <span className="mt-3 block font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                      {preset.weights.quality} / {preset.weights.speed} / {preset.weights.cost}
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="mt-8 space-y-7">
              {metricOrder.map((metric) => {
                const meta = metricMeta[metric];
                const Icon = meta.icon;
                const normalized = normalizedWeights[metric] * 100;
                return (
                  <div key={metric}>
                    <div className="mb-3 flex items-start justify-between gap-4">
                      <label htmlFor={`decision-${metric}`} className="flex min-w-0 gap-3">
                        <span className="grid size-8 shrink-0 place-items-center border border-border bg-card">
                          <Icon className="size-4 text-foreground" aria-hidden="true" />
                        </span>
                        <span>
                          <span className="block text-sm font-medium">{meta.label}</span>
                          <span
                            id={`decision-${metric}-description`}
                            className="mt-1 block text-xs leading-5 text-muted-foreground"
                          >
                            {meta.description}
                          </span>
                        </span>
                      </label>
                      <output
                        htmlFor={`decision-${metric}`}
                        className="shrink-0 text-right font-mono tabular-nums"
                        aria-live="off"
                      >
                        <span className="block text-xl font-semibold">{weights[metric]}</span>
                        <span className="mega-label">{normalized.toFixed(1)}% normalized</span>
                      </output>
                    </div>
                    <input
                      id={`decision-${metric}`}
                      type="range"
                      min="0"
                      max="100"
                      step="5"
                      value={weights[metric]}
                      aria-describedby={`decision-${metric}-description`}
                      aria-valuetext={`${weights[metric]} raw importance points; ${normalized.toFixed(1)} percent after normalization`}
                      onChange={(event) => updateWeight(metric, Number(event.currentTarget.value))}
                      className="decision-range w-full"
                      style={{ "--decision-progress": `${weights[metric]}%` } as CSSProperties}
                    />
                  </div>
                );
              })}
            </div>

            {weightTotal === 0 && (
              <p role="alert" className="mt-6 border border-destructive/60 bg-destructive/10 p-4 text-sm leading-6 text-red-200">
                At least one weight must be above zero. No ranking is produced while
                every priority is zero.
              </p>
            )}
          </div>

          <div className="bg-card p-5 sm:p-7 lg:p-8">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="mega-label">02 · Read the recomputed result</div>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
                  Utilities are ratios, not grades. The best comparable time and cost
                  receive 1.000000; slower or more expensive values remain positive
                  fractions. Quality keeps its direct score-to-100 meaning.
                </p>
              </div>
              <Scale className="size-5 text-foreground" aria-hidden="true" />
            </div>

            <div className="mt-7 grid gap-3 lg:grid-cols-3" aria-live="polite" aria-atomic="true">
              {ranking.length > 0 ? (
                ranking.map((result, index) => (
                  <article
                    key={result.provider}
                    className="relative overflow-hidden border border-border bg-black p-5"
                  >
                    <div
                      className="absolute inset-x-0 top-0 h-1 origin-left"
                      style={{
                        backgroundColor: PROVIDER_COLOR[result.provider],
                        transform: `scaleX(${result.score === null ? 0 : result.score / 100})`,
                      }}
                      aria-hidden="true"
                    />
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <div className="mega-label">Rank {index + 1}</div>
                        <div className="mt-2 text-base font-semibold">
                          <ProviderMark provider={result.provider} />
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-mono text-4xl font-semibold tabular-nums">
                          {result.score === null ? "—" : result.score.toFixed(1)}
                        </div>
                        <div className="mega-label">weighted utility / 100</div>
                      </div>
                    </div>
                    <div className="mt-6 grid grid-cols-3 gap-px bg-border">
                      {metricOrder.map((metric) => {
                        const contribution = result.contributions[metric];
                        return (
                          <div key={metric} className="bg-card p-3">
                            <div className="mega-label">{metricMeta[metric].shortLabel}</div>
                            <div className="mt-1 font-mono text-sm tabular-nums">
                              {contribution === null ? "n/a" : contribution.toFixed(1)}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    {result.provider === "grok" &&
                    data.grok_resource_summary?.timing ? (
                      <div className="mt-px bg-card p-3">
                        <div className="mega-label">Campaign elapsed · overlap, not the ranking input</div>
                        <p className="mt-2 font-mono text-sm tabular-nums whitespace-nowrap">
                          {formatRawValue(
                            "speed",
                            data.grok_resource_summary.timing.elapsed_campaign_seconds,
                          )}
                        </p>
                      </div>
                    ) : null}
                  </article>
                ))
              ) : (
                <div className="col-span-full grid min-h-48 place-items-center border border-border bg-black p-8 text-center">
                  <div>
                    <Gauge className="mx-auto size-6 text-muted-foreground" aria-hidden="true" />
                    <p className="mt-3 font-mono text-xs uppercase tracking-wider text-muted-foreground">
                      Waiting for a non-zero priority
                    </p>
                  </div>
                </div>
              )}
            </div>

            <div className="mt-4 border-l-2 border-border bg-black p-4" aria-live="polite">
              {leader && leader.score !== null ? (
                <p className="text-sm leading-6">
                  <strong><ProviderMark provider={leader.provider} compact className="align-middle" /></strong> leads this weighting
                  {lead === null ? "." : ` by ${lead.toFixed(1)} utility points.`}
                  <span className="text-muted-foreground">
                    {activePreset ? ` Active preset: ${activePreset.name}.` : " Manual weighting is active."}
                  </span>
                </p>
              ) : (
                <p className="text-sm leading-6 text-muted-foreground">
                  The selected weights cannot produce a complete comparable score.
                </p>
              )}
            </div>

            <details className="group mt-6 border border-border bg-black">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 p-4 font-mono text-xs uppercase tracking-wider outline-none hover:bg-surface-1 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-mega-blue-text/50">
                Exact inputs, normalization, and contributions
                <ChevronDown className="size-4 transition-transform group-open:rotate-180" aria-hidden="true" />
              </summary>
              <div className="border-t border-border p-4 sm:p-5">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[760px] border-collapse text-left text-xs">
                    <caption className="sr-only">
                      Exact decision-lab source values, receipt coverage, utilities,
                      normalized weights, and weighted contributions.
                    </caption>
                    <thead className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                      <tr className="border-b border-border">
                        <th className="p-3 font-normal">Provider / metric</th>
                        <th className="p-3 font-normal">Source value</th>
                        <th className="p-3 font-normal">Coverage</th>
                        <th className="p-3 font-normal">Utility</th>
                        <th className="p-3 font-normal">Normalized weight</th>
                        <th className="p-3 text-right font-normal">Contribution</th>
                      </tr>
                    </thead>
                    <tbody>
                      {metrics.decision_lab.comparable_providers.flatMap((provider) => {
                        const row = metrics.decision_lab.rows[provider];
                        const result = ranking.find((item) => item.provider === provider);
                        return metricOrder.map((metric, metricIndex) => (
                          <tr key={`${provider}-${metric}`} className="border-b border-border last:border-0">
                            <th className="p-3 font-normal">
                              <span className="flex items-center gap-2">
                                {metricIndex === 0 ? (
                                  <ProviderMark provider={provider} compact />
                                ) : (
                                  <span className="size-3" aria-hidden="true" />
                                )}
                                <span>
                                  {metricIndex === 0 ? " · " : ""}
                                  {metricMeta[metric].shortLabel}
                                </span>
                              </span>
                            </th>
                            <td className="p-3 font-mono tabular-nums">
                              {formatRawValue(metric, row[metric].value)}
                            </td>
                            <td className="p-3 text-muted-foreground">
                              {coverageLabel(metrics, provider, metric)}
                            </td>
                            <td className="p-3 font-mono tabular-nums">
                              {row[metric].utility === null
                                ? "unavailable"
                                : row[metric].utility!.toFixed(6)}
                            </td>
                            <td className="p-3 font-mono tabular-nums">
                              {(normalizedWeights[metric] * 100).toFixed(1)}%
                            </td>
                            <td className="p-3 text-right font-mono tabular-nums">
                              {result?.contributions[metric] === null || result === undefined
                                ? "unavailable"
                                : result.contributions[metric]!.toFixed(3)}
                            </td>
                          </tr>
                        ));
                      })}
                    </tbody>
                  </table>
                </div>

                <div className="mt-5 grid gap-3 text-xs leading-5 text-muted-foreground sm:grid-cols-2">
                  <p className="border border-border p-4">
                    <strong className="text-foreground">Quality:</strong>{" "}
                    {metrics.decision_lab.formula.quality_utility}.
                  </p>
                  <p className="border border-border p-4">
                    <strong className="text-foreground">Time:</strong>{" "}
                    {metrics.decision_lab.formula.speed_utility}.
                  </p>
                  <p className="border border-border p-4">
                    <strong className="text-foreground">Cost:</strong>{" "}
                    {metrics.decision_lab.formula.cost_utility}.
                  </p>
                  <p className="border border-border p-4">
                    <strong className="text-foreground">Composite:</strong>{" "}
                    {metrics.decision_lab.formula.total}.
                  </p>
                </div>
                <p className="mt-4 font-mono text-[10px] leading-5 uppercase tracking-wider text-muted-foreground">
                  Sources: {metrics.generated_from.quality}; {metrics.generated_from.canonical_cells}; {metrics.generated_from.grok_projection}.
                </p>
              </div>
            </details>
          </div>
        </div>

        <div className="mt-10 grid gap-6 xl:grid-cols-[1.15fr_.85fr]">
          <div>
            <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
              <div>
                <div className="mega-label">Three-provider quality context</div>
                <h3 className="pixel-heading mt-2 text-2xl font-semibold sm:text-3xl">
                  Quality, time, and cost include all three agents.
                </h3>
              </div>
              <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                Blind triad · 20 specs
              </span>
            </div>
            <div className="grid gap-px border border-border bg-border sm:grid-cols-3">
              {PROVIDER_ORDER.map((provider) => {
                const aggregate = metrics.providers[provider];
                return (
                  <article key={provider} className="bg-black p-5">
                    <div className="flex items-center justify-between gap-3">
                      <ProviderMark provider={provider} />
                      <span className="font-mono text-2xl font-semibold tabular-nums">
                        {aggregate.mean_score.toFixed(1)}
                      </span>
                    </div>
                    <div className="mt-5 h-1.5 bg-surface-1" aria-hidden="true">
                      <div
                        className="h-full"
                        style={{
                          width: `${aggregate.mean_score}%`,
                          backgroundColor: PROVIDER_COLOR[provider],
                        }}
                      />
                    </div>
                    <dl className="mt-5 grid grid-cols-2 gap-3 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                      <div>
                        <dt>Total points</dt>
                        <dd className="mt-1 text-sm text-foreground">{aggregate.total_points.toLocaleString()}</dd>
                      </div>
                      <div>
                        <dt>Complete</dt>
                        <dd className="mt-1 text-sm text-foreground">
                          {aggregate.complete_runs}/{aggregate.artifact_count}
                        </dd>
                      </div>
                    </dl>
                  </article>
                );
              })}
            </div>
          </div>

          <aside className="border border-border bg-black p-5 sm:p-6" aria-labelledby="decision-limits-heading">
            <div className="mega-label">Comparability scope</div>
            <h3 id="decision-limits-heading" className="mt-2 text-xl font-semibold">
              Comparability & scope boundaries.
            </h3>
            <div className="mt-6 space-y-5 text-sm leading-6 text-muted-foreground">
              <p>
                <strong className="text-foreground">Grok cost:</strong>{" "}
                {metrics.decision_lab.comparability.grok_cost_exclusion}
              </p>
              <p>
                <strong className="text-foreground">Grok speed:</strong>{" "}
                {metrics.decision_lab.comparability.grok_speed_exclusion}
              </p>
              <p>
                <strong className="text-foreground">Time variability:</strong>{" "}
                {metrics.decision_lab.comparability.speed_variability}
              </p>
              <p>
                <strong className="text-foreground">Missing data:</strong>{" "}
                {metrics.decision_lab.comparability.missing_values}
              </p>
              <div className="border-t border-border pt-5">
                <p>
                  <strong className="text-foreground">Turn counts were audited, then excluded.</strong>{" "}
                  {metrics.turn_count_exclusion.reason}
                </p>
                <ul className="mt-3 space-y-2 font-mono text-[10px] uppercase tracking-wider">
                  <li className="flex items-center gap-2"><ProviderMark provider="claude" compact /> · {metrics.turn_count_exclusion.units.claude}</li>
                  <li className="flex items-center gap-2"><ProviderMark provider="codex" compact /> · {metrics.turn_count_exclusion.units.codex}</li>
                  <li className="flex items-center gap-2"><ProviderMark provider="grok" compact /> · {metrics.turn_count_exclusion.units.grok}</li>
                </ul>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </section>
  );
}
