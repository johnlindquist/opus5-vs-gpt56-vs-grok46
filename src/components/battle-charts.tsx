"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Label,
  Pie,
  PieChart,
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ReferenceLine,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from "recharts";
import {
  ArrowRight,
  BarChart3,
  CheckCircle2,
  ChevronRight,
  Flame,
  Grid,
  Layers,
  Sparkles,
  TrendingUp,
  Trophy,
  XCircle,
} from "lucide-react";
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import {
  ClaudeChartIcon,
  CodexChartIcon,
  GrokChartIcon,
  PairwiseMark,
  ProviderIcon,
  ProviderMark,
  WinnerMark,
} from "@/components/provider-icon";
import { Badge } from "@/components/ui/badge";
import { usePosture } from "@/context/posture-context";
import { MiniPostureSelector } from "@/components/mini-posture-selector";
import {
  PROVIDER_COLOR,
  PROVIDER_ORDER,
  PROVIDER_SHORT,
  artifactFailed,
  averageScore,
  eraLabel,
  formatDuration,
  type ProviderKey,
  type SpecRow,
} from "@/lib/data";
export const providerConfig = {
  claude: { label: "Opus 5", color: PROVIDER_COLOR.claude, icon: ClaudeChartIcon },
  grok: { label: "Grok 4.6", color: PROVIDER_COLOR.grok, icon: GrokChartIcon },
  codex: { label: "GPT-5.6 Sol", color: PROVIDER_COLOR.codex, icon: CodexChartIcon },
} satisfies ChartConfig;
type SpreadMatchup = "claude_vs_grok" | "claude_vs_codex" | "grok_vs_codex" | "all";
type ChartMode = "heatmap" | "bars" | "deltas";
type SortOption =
  | "id"
  | "winner"
  | "claude"
  | "grok"
  | "codex"
  | "fastest"
  | "cheapest"
  | "margin";

const readableRubric = (key: string) =>
  key
    .replace(/_/g, " ")
    .replace(/\w/g, (character) => character.toUpperCase());

interface CustomBarTooltipProps {
  active?: boolean;
  payload?: Array<{ payload: unknown; value?: number; dataKey?: string }>;
  label?: string | number;
  specs: SpecRow[];
}

// Custom Rich Glass Tooltip with Posture Support
function CustomBarTooltip({ active, payload, label, specs }: CustomBarTooltipProps) {
  if (!active || !payload || !payload.length) return null;
  const specId = String(label);
  const spec = specs.find((s: SpecRow) => s.id === specId);
  if (!spec) return null;

  // eslint-disable-next-line react-hooks/rules-of-hooks
  const { postureResult, viewMode, displayName, displayBadge } = usePosture();
  const isRawMode = viewMode === "raw";
  const breakdown = postureResult.specBreakdowns.find((s) => s.specId === specId);

  return (
    <div className="z-50 min-w-[280px] border border-border/80 bg-black/95 p-3.5 shadow-2xl backdrop-blur-xl">
      <div className="flex items-center justify-between border-b border-border/60 pb-2">
        <div>
          <span className="font-mono text-xs font-bold text-foreground">Spec {spec.id}</span>
          <span className="ml-2 font-mono text-[10px] text-muted-foreground uppercase">
            {eraLabel(spec.era)}
          </span>
        </div>
        <Badge variant="outline" className="h-5 rounded-none px-1.5 font-mono text-[9px] uppercase">
          {spec.track ?? spec.kind}
        </Badge>
      </div>
      <div className="mt-1 truncate text-xs font-semibold text-foreground">{spec.title}</div>

      {!isRawMode && (
        <div className="mt-1 font-mono text-[10px] text-muted-foreground">
          Posture: {displayName} [{displayBadge}]
        </div>
      )}

      <div className="mt-3 space-y-1.5">
        {PROVIDER_ORDER.map((provider) => {
          const grade = spec.triad.providers[provider];
          const failed = artifactFailed(spec, provider);
          const color = PROVIDER_COLOR[provider];
          const score = isRawMode
            ? grade.score
            : (breakdown?.scores[provider] ?? grade.score);
          const duration = breakdown?.durations[provider] ?? 0;
          const cost = breakdown?.costs[provider] ?? 0;

          return (
            <div
              key={provider}
              className="flex items-center justify-between gap-3 border-l-2 py-1 pl-2 text-xs"
              style={{ borderColor: color }}
            >
              <div>
                <ProviderMark provider={provider} compact />
                {!isRawMode && (
                  <div className="font-mono text-[9px] text-muted-foreground">
                    Gr {grade.letter} · {duration > 0 ? `${duration.toFixed(0)}s` : "—"} · ${cost.toFixed(2)}
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2 font-mono">
                {failed && (
                  <span className="text-[9px] font-bold text-destructive uppercase">DNF</span>
                )}
                {isRawMode && (
                  <span className="text-[10px] text-muted-foreground">Grade {grade.letter}</span>
                )}
                <span className="w-10 text-right font-bold text-sm" style={{ color }}>
                  {typeof score === "number" ? score.toFixed(1) : score}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-3 flex items-center justify-between border-t border-border/60 pt-2 text-[10px] text-muted-foreground">
        <span>{isRawMode ? "Raw pairwise:" : "Posture winner:"}</span>
        <div className="flex items-center gap-1 font-mono text-foreground">
          {isRawMode ? (
            <>
              <WinnerMark value={spec.pairwise.claude_vs_grok} />
              <span>/</span>
              <WinnerMark value={spec.pairwise.grok_vs_codex} />
            </>
          ) : (
            breakdown && (
              <span className="font-bold uppercase" style={{ color: breakdown.winner !== "tie" ? PROVIDER_COLOR[breakdown.winner] : undefined }}>
                {breakdown.winner === "tie" ? "Tie" : PROVIDER_SHORT[breakdown.winner]}
              </span>
            )
          )}
        </div>
      </div>
    </div>
  );
}

// -------------------------------------------------------------
// Main Interactive Benchmark Suite
// -------------------------------------------------------------
export function ScoreChart({ specs }: { specs: SpecRow[] }) {
  const { postureResult, viewMode, setViewMode, displayName, displayBadge } = usePosture();
  const isRawMode = viewMode === "raw";

  const [mode, setMode] = useState<ChartMode>("heatmap");
  const [spreadMatchup, setSpreadMatchup] = useState<SpreadMatchup>("claude_vs_grok");
  const [sort, setSort] = useState<SortOption>("id");
  const [selectedSpecId, setSelectedSpecId] = useState<string>("01");

  // Map specs to include posture breakdown
  const specMap = useMemo(() => {
    return new Map(postureResult.specBreakdowns.map((b) => [b.specId, b]));
  }, [postureResult]);

  // Sorted specs
  const processedSpecs = useMemo(() => {
    const result = [...specs];
    if (sort === "claude") {
      result.sort((a, b) => {
        const scA = isRawMode ? a.triad.providers.claude.score : (specMap.get(a.id)?.scores.claude ?? 0);
        const scB = isRawMode ? b.triad.providers.claude.score : (specMap.get(b.id)?.scores.claude ?? 0);
        return scB - scA;
      });
    } else if (sort === "grok") {
      result.sort((a, b) => {
        const scA = isRawMode ? a.triad.providers.grok.score : (specMap.get(a.id)?.scores.grok ?? 0);
        const scB = isRawMode ? b.triad.providers.grok.score : (specMap.get(b.id)?.scores.grok ?? 0);
        return scB - scA;
      });
    } else if (sort === "codex") {
      result.sort((a, b) => {
        const scA = isRawMode ? a.triad.providers.codex.score : (specMap.get(a.id)?.scores.codex ?? 0);
        const scB = isRawMode ? b.triad.providers.codex.score : (specMap.get(b.id)?.scores.codex ?? 0);
        return scB - scA;
      });
    } else if (sort === "winner") {
      result.sort((a, b) => {
        const bA = specMap.get(a.id);
        const bB = specMap.get(b.id);
        const order: Record<string, number> = { claude: 1, grok: 2, codex: 3, tie: 4 };
        const wA = order[bA?.winner ?? "tie"] ?? 5;
        const wB = order[bB?.winner ?? "tie"] ?? 5;
        return wA - wB || Number(a.id) - Number(b.id);
      });
    } else if (sort === "fastest") {
      result.sort((a, b) => {
        const durA = Math.min(
          a.cells.claude?.duration_seconds ?? Infinity,
          a.cells.grok?.duration_seconds ?? Infinity,
          a.cells.codex?.duration_seconds ?? Infinity,
        );
        const durB = Math.min(
          b.cells.claude?.duration_seconds ?? Infinity,
          b.cells.grok?.duration_seconds ?? Infinity,
          b.cells.codex?.duration_seconds ?? Infinity,
        );
        return durA - durB;
      });
    } else if (sort === "cheapest") {
      result.sort((a, b) => {
        const costA = Math.min(
          Number(a.cells.claude?.cost_usd ?? Infinity),
          Number(a.cells.grok?.cost_usd ?? Infinity),
          Number(a.cells.codex?.cost_usd ?? Infinity),
        );
        const costB = Math.min(
          Number(b.cells.claude?.cost_usd ?? Infinity),
          Number(b.cells.grok?.cost_usd ?? Infinity),
          Number(b.cells.codex?.cost_usd ?? Infinity),
        );
        return costA - costB;
      });
    } else if (sort === "margin") {
      result.sort((a, b) => {
        const scA1 = isRawMode ? a.triad.providers.claude.score : (specMap.get(a.id)?.scores.claude ?? 0);
        const scA2 = isRawMode ? a.triad.providers.grok.score : (specMap.get(a.id)?.scores.grok ?? 0);
        const scB1 = isRawMode ? b.triad.providers.claude.score : (specMap.get(b.id)?.scores.claude ?? 0);
        const scB2 = isRawMode ? b.triad.providers.grok.score : (specMap.get(b.id)?.scores.grok ?? 0);
        return Math.abs(scB1 - scB2) - Math.abs(scA1 - scA2);
      });
    } else {
      result.sort((a, b) => Number(a.id) - Number(b.id));
    }
    return result;
  }, [specs, sort, isRawMode, specMap]);

  // Rows for Recharts Bar view
  const barData = useMemo(() => {
    return processedSpecs.map((spec) => {
      const b = specMap.get(spec.id);
      return {
        spec: spec.id,
        title: spec.title,
        claude: isRawMode ? spec.triad.providers.claude.score : Number((b?.scores.claude ?? 0).toFixed(1)),
        grok: isRawMode ? spec.triad.providers.grok.score : Number((b?.scores.grok ?? 0).toFixed(1)),
        codex: isRawMode ? spec.triad.providers.codex.score : Number((b?.scores.codex ?? 0).toFixed(1)),
        era: spec.era,
        kind: spec.track ?? spec.kind,
      };
    });
  }, [processedSpecs, isRawMode, specMap]);

  // Delta Rows (Opus vs Grok, Opus vs Sol, Grok vs Sol)
  const deltaData = useMemo(() => {
    return processedSpecs.map((spec) => {
      const b = specMap.get(spec.id);
      const c = isRawMode ? spec.triad.providers.claude.score : (b?.scores.claude ?? 0);
      const g = isRawMode ? spec.triad.providers.grok.score : (b?.scores.grok ?? 0);
      const s = isRawMode ? spec.triad.providers.codex.score : (b?.scores.codex ?? 0);
      return {
        spec: spec.id,
        title: spec.title,
        claudeVsGrok: Number((c - g).toFixed(1)),
        claudeVsCodex: Number((c - s).toFixed(1)),
        grokVsCodex: Number((g - s).toFixed(1)),
        claude: Number(c.toFixed(1)),
        grok: Number(g.toFixed(1)),
        codex: Number(s.toFixed(1)),
      };
    });
  }, [processedSpecs, isRawMode, specMap]);

  const selectedSpec = specs.find((s) => s.id === selectedSpecId) ?? specs[0];
  const selectedBreakdown = specMap.get(selectedSpec.id);

  const claudeAvg = isRawMode ? averageScore("claude") : postureResult.providerScores.claude;
  const grokAvg = isRawMode ? averageScore("grok") : postureResult.providerScores.grok;
  const codexAvg = isRawMode ? averageScore("codex") : postureResult.providerScores.codex;
  return (
    <div className="space-y-6">
      {/* Top Header & Interactive Controls */}
      <div className="flex flex-col gap-4 border-b border-border/80 pb-5 lg:flex-row lg:items-center lg:justify-between">
        {/* Mode Buttons (Rubric Matrix first on the left) */}
        <div className="flex flex-wrap items-center gap-1.5 border border-border bg-black/80 p-1">
          <button
            type="button"
            onClick={() => setMode("heatmap")}
            className={`inline-flex items-center gap-2 px-3 py-1.5 font-mono text-xs font-semibold uppercase tracking-wider transition-colors ${
              mode === "heatmap"
                ? "bg-foreground text-background"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Grid className="size-3.5" /> Rubric Matrix
          </button>
          <button
            type="button"
            onClick={() => setMode("bars")}
            className={`inline-flex items-center gap-2 px-3 py-1.5 font-mono text-xs font-semibold uppercase tracking-wider transition-colors ${
              mode === "bars"
                ? "bg-foreground text-background"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <BarChart3 className="size-3.5" /> Grouped Scores
          </button>
          <button
            type="button"
            onClick={() => setMode("deltas")}
            className={`inline-flex items-center gap-2 px-3 py-1.5 font-mono text-xs font-semibold uppercase tracking-wider transition-colors ${
              mode === "deltas"
                ? "bg-foreground text-background"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <TrendingUp className="size-3.5" /> Point Spread
          </button>
        </div>

        {/* Sort & Mini Posture Controls */}
        <div className="flex flex-wrap items-center gap-3">
          <MiniPostureSelector variant="compact" showLeader={false} />

          <div className="flex items-center gap-1 font-mono text-xs">
            <span className="mr-1 text-muted-foreground uppercase">Sort:</span>
            <select
              aria-label="Sort benchmark specifications"
              value={sort}
              onChange={(e) => setSort(e.target.value as SortOption)}
              className="border border-border bg-card px-2.5 py-1 text-[11px] text-foreground outline-none focus:border-foreground"
            >
              <option value="id">Spec ID (01-20)</option>
              <option value="winner">Posture Winner</option>
              <option value="claude">Opus Score (High → Low)</option>
              <option value="grok">Grok Score (High → Low)</option>
              <option value="codex">Sol Score (High → Low)</option>
              <option value="fastest">Fastest Build Time</option>
              <option value="cheapest">Lowest Spend</option>
              <option value="margin">Widest Margin</option>
            </select>
          </div>
        </div>
      </div>

      {/* Model Performance Snapshot Pills */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {PROVIDER_ORDER.map((provider) => {
          const color = PROVIDER_COLOR[provider];
          const avg = isRawMode ? averageScore(provider) : postureResult.providerScores[provider];
          const topSpecs = specs.filter((s) => {
            const b = specMap.get(s.id);
            const sc = isRawMode ? s.triad.providers[provider].score : (b?.scores[provider] ?? 0);
            const scC = isRawMode ? s.triad.providers.claude.score : (b?.scores.claude ?? 0);
            const scG = isRawMode ? s.triad.providers.grok.score : (b?.scores.grok ?? 0);
            const scS = isRawMode ? s.triad.providers.codex.score : (b?.scores.codex ?? 0);
            return sc >= scC && sc >= scG && sc >= scS;
          }).length;
          return (
            <div
              key={provider}
              className="flex items-center justify-between border border-border bg-black/60 p-3"
              style={{ borderLeft: `3px solid ${color}` }}
            >
              <div className="flex items-center gap-2.5">
                <ProviderIcon provider={provider} className="size-4" />
                <div>
                  <span className="font-semibold text-xs text-foreground">{PROVIDER_SHORT[provider]}</span>
                  <p className="font-mono text-[10px] text-muted-foreground">
                    {topSpecs}/20 highest {isRawMode ? "raw grade" : "posture score"}
                  </p>
                </div>
              </div>
              <div className="text-right">
                <span className="font-mono text-xl font-bold" style={{ color }}>
                  {avg.toFixed(1)}
                </span>
                <span className="block font-mono text-[9px] text-muted-foreground uppercase">
                  {isRawMode ? "raw avg / 100" : "posture avg / 100"}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* VIEW 1: Grouped Bars */}
      {mode === "bars" && (
        <div className="relative">
          <ChartContainer
            config={providerConfig}
            className="h-[380px] w-full min-w-[700px] aspect-auto"
            initialDimension={{ width: 900, height: 380 }}
          >
            <BarChart
              data={barData}
              margin={{ top: 18, right: 12, left: -14, bottom: 6 }}
              onClick={(e) => {
                if (e && e.activeLabel) {
                  setSelectedSpecId(String(e.activeLabel));
                }
              }}
            >
              <CartesianGrid vertical={false} stroke="rgba(255,255,255,0.06)" strokeDasharray="3 3" />
              <XAxis
                dataKey="spec"
                tickLine={false}
                axisLine={{ stroke: "rgba(255,255,255,0.12)" }}
                tick={{ fill: "#8e8e93", fontSize: 11, fontFamily: "monospace" }}
                tickMargin={8}
              />
              <YAxis
                domain={[0, 100]}
                tickLine={false}
                axisLine={{ stroke: "rgba(255,255,255,0.12)" }}
                ticks={[0, 25, 50, 75, 100]}
                tick={{ fill: "#8e8e93", fontSize: 10, fontFamily: "monospace" }}
              />
              <ReferenceLine
                y={claudeAvg}
                stroke={PROVIDER_COLOR.claude}
                strokeDasharray="4 4"
                strokeOpacity={0.45}
              />
              <ReferenceLine
                y={grokAvg}
                stroke={PROVIDER_COLOR.grok}
                strokeDasharray="4 4"
                strokeOpacity={0.45}
              />
              <ReferenceLine
                y={codexAvg}
                stroke={PROVIDER_COLOR.codex}
                strokeDasharray="4 4"
                strokeOpacity={0.45}
              />
              <ChartTooltip
                cursor={{ fill: "rgba(255,255,255,0.04)" }}
                content={<CustomBarTooltip specs={specs} />}
              />
              <ChartLegend content={<ChartLegendContent />} />
              <Bar dataKey="claude" fill={PROVIDER_COLOR.claude} radius={[2, 2, 0, 0]} maxBarSize={16} isAnimationActive={true} animationDuration={600} animationEasing="ease-out" />
              <Bar dataKey="grok" fill={PROVIDER_COLOR.grok} radius={[2, 2, 0, 0]} maxBarSize={16} isAnimationActive={true} animationDuration={600} animationEasing="ease-out" />
              <Bar dataKey="codex" fill={PROVIDER_COLOR.codex} radius={[2, 2, 0, 0]} maxBarSize={16} isAnimationActive={true} animationDuration={600} animationEasing="ease-out" />
            </BarChart>
          </ChartContainer>
          <div className="mt-2 flex items-center justify-between font-mono text-[10px] text-muted-foreground">
            <span>Dashed lines show overall provider averages across all 20 benchmarks</span>
            <span>Click any spec bar to inspect below</span>
          </div>
        </div>
      )}

      {/* VIEW 2: Win Margins & Deltas */}
      {mode === "deltas" && (
        <div className="space-y-4">
          {/* Matchup Sub-Selector Bar & Legend */}
          <div className="flex flex-col justify-between gap-3 border border-border bg-black/60 p-3 sm:flex-row sm:items-center">
            <div className="flex items-center gap-1 font-mono text-xs">
              <span className="mr-1 text-muted-foreground uppercase">Matchup:</span>
              {(
                [
                  { id: "claude_vs_grok", label: "Opus vs Grok" },
                  { id: "claude_vs_codex", label: "Opus vs Sol" },
                  { id: "grok_vs_codex", label: "Grok vs Sol" },
                  { id: "all", label: "All 3 Matchups" },
                ] as const
              ).map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setSpreadMatchup(m.id)}
                  className={`border px-2.5 py-1 text-[11px] uppercase transition-colors ${
                    spreadMatchup === m.id
                      ? "border-foreground bg-foreground font-bold text-background"
                      : "border-border bg-card text-muted-foreground hover:border-border/80 hover:text-foreground"
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>

            {/* Dynamic Color Key Legend */}
            <div className="flex flex-wrap items-center gap-3 font-mono text-[10px] text-muted-foreground">
              {spreadMatchup === "claude_vs_grok" && (
                <>
                  <span className="flex items-center gap-1.5">
                    <span className="inline-block size-2" style={{ backgroundColor: PROVIDER_COLOR.claude }} />
                    <span style={{ color: PROVIDER_COLOR.claude }} className="font-bold">▲ Above 0: Opus leads</span>
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="inline-block size-2" style={{ backgroundColor: PROVIDER_COLOR.grok }} />
                    <span style={{ color: PROVIDER_COLOR.grok }} className="font-bold">▼ Below 0: Grok leads</span>
                  </span>
                </>
              )}
              {spreadMatchup === "claude_vs_codex" && (
                <>
                  <span className="flex items-center gap-1.5">
                    <span className="inline-block size-2" style={{ backgroundColor: PROVIDER_COLOR.claude }} />
                    <span style={{ color: PROVIDER_COLOR.claude }} className="font-bold">▲ Above 0: Opus leads</span>
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="inline-block size-2" style={{ backgroundColor: PROVIDER_COLOR.codex }} />
                    <span style={{ color: PROVIDER_COLOR.codex }} className="font-bold">▼ Below 0: Sol leads</span>
                  </span>
                </>
              )}
              {spreadMatchup === "grok_vs_codex" && (
                <>
                  <span className="flex items-center gap-1.5">
                    <span className="inline-block size-2" style={{ backgroundColor: PROVIDER_COLOR.grok }} />
                    <span style={{ color: PROVIDER_COLOR.grok }} className="font-bold">▲ Above 0: Grok leads</span>
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="inline-block size-2" style={{ backgroundColor: PROVIDER_COLOR.codex }} />
                    <span style={{ color: PROVIDER_COLOR.codex }} className="font-bold">▼ Below 0: Sol leads</span>
                  </span>
                </>
              )}
              {spreadMatchup === "all" && (
                <>
                  <span className="flex items-center gap-1">
                    <span className="inline-block size-2" style={{ backgroundColor: PROVIDER_COLOR.claude }} />
                    <span>Opus vs Grok</span>
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="inline-block size-2" style={{ backgroundColor: PROVIDER_COLOR.codex }} />
                    <span>Opus vs Sol</span>
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="inline-block size-2" style={{ backgroundColor: PROVIDER_COLOR.grok }} />
                    <span>Grok vs Sol</span>
                  </span>
                </>
              )}
            </div>
          </div>

          <ChartContainer
            config={providerConfig}
            className="h-[360px] w-full min-w-[700px] aspect-auto"
            initialDimension={{ width: 900, height: 360 }}
          >
            <BarChart data={deltaData} margin={{ top: 16, right: 12, left: -14, bottom: 6 }}>
              <CartesianGrid vertical={false} stroke="rgba(255,255,255,0.06)" strokeDasharray="3 3" />
              <XAxis dataKey="spec" tickLine={false} axisLine={{ stroke: "rgba(255,255,255,0.12)" }} tickMargin={8} />
              <YAxis tickLine={false} axisLine={{ stroke: "rgba(255,255,255,0.12)" }} />
              <ReferenceLine y={0} stroke="#666" strokeWidth={1.5} />
              <ChartTooltip
                cursor={{ fill: "rgba(255,255,255,0.04)" }}
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const item = payload[0].payload;
                  const dCvG = item.claudeVsGrok;
                  const dCvS = item.claudeVsCodex;
                  const dGvS = item.grokVsCodex;

                  return (
                    <div className="border border-border bg-black/95 p-3.5 font-mono text-xs shadow-2xl backdrop-blur-xl">
                      <div className="border-b border-border/60 pb-2">
                        <div className="font-bold text-foreground">Spec {item.spec} · {item.title}</div>
                        <div className="mt-1 flex items-center gap-2 text-[10px] text-muted-foreground">
                          <span>Opus: <strong className="text-foreground">{item.claude}</strong></span>
                          <span>·</span>
                          <span>Grok: <strong className="text-foreground">{item.grok}</strong></span>
                          <span>·</span>
                          <span>Sol: <strong className="text-foreground">{item.codex}</strong></span>
                        </div>
                      </div>

                      <div className="mt-3 space-y-2">
                        {/* Opus vs Grok */}
                        <div className="flex items-center justify-between gap-4">
                          <span className="text-muted-foreground">Opus vs Grok:</span>
                          <span
                            className="font-bold"
                            style={{
                              color:
                                dCvG > 0
                                  ? PROVIDER_COLOR.claude
                                  : dCvG < 0
                                    ? PROVIDER_COLOR.grok
                                    : "#888",
                            }}
                          >
                            {dCvG > 0 ? `+${dCvG} (Opus leads)` : dCvG < 0 ? `${dCvG} (Grok leads)` : "Tie (0 pts)"}
                          </span>
                        </div>

                        {/* Opus vs Sol */}
                        <div className="flex items-center justify-between gap-4">
                          <span className="text-muted-foreground">Opus vs Sol:</span>
                          <span
                            className="font-bold"
                            style={{
                              color:
                                dCvS > 0
                                  ? PROVIDER_COLOR.claude
                                  : dCvS < 0
                                    ? PROVIDER_COLOR.codex
                                    : "#888",
                            }}
                          >
                            {dCvS > 0 ? `+${dCvS} (Opus leads)` : dCvS < 0 ? `${dCvS} (Sol leads)` : "Tie (0 pts)"}
                          </span>
                        </div>

                        {/* Grok vs Sol */}
                        <div className="flex items-center justify-between gap-4">
                          <span className="text-muted-foreground">Grok vs Sol:</span>
                          <span
                            className="font-bold"
                            style={{
                              color:
                                dGvS > 0
                                  ? PROVIDER_COLOR.grok
                                  : dGvS < 0
                                    ? PROVIDER_COLOR.codex
                                    : "#888",
                            }}
                          >
                            {dGvS > 0 ? `+${dGvS} (Grok leads)` : dGvS < 0 ? `${dGvS} (Sol leads)` : "Tie (0 pts)"}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                }}
              />

              {/* Specific Matchup Bars with Dynamic Winner-Attributed Colors */}
              {spreadMatchup === "claude_vs_grok" && (
                <Bar
                  dataKey="claudeVsGrok"
                  name="Opus vs Grok Margin"
                  radius={[2, 2, 2, 2]}
                  isAnimationActive={true}
                  animationDuration={600}
                  animationEasing="ease-out"
                >
                  {deltaData.map((entry) => {
                    const isClaude = entry.claudeVsGrok >= 0;
                    return (
                      <Cell
                        key={entry.spec}
                        fill={isClaude ? PROVIDER_COLOR.claude : PROVIDER_COLOR.grok}
                      />
                    );
                  })}
                </Bar>
              )}

              {spreadMatchup === "claude_vs_codex" && (
                <Bar
                  dataKey="claudeVsCodex"
                  name="Opus vs Sol Margin"
                  radius={[2, 2, 2, 2]}
                  isAnimationActive={true}
                  animationDuration={600}
                  animationEasing="ease-out"
                >
                  {deltaData.map((entry) => {
                    const isClaude = entry.claudeVsCodex >= 0;
                    return (
                      <Cell
                        key={entry.spec}
                        fill={isClaude ? PROVIDER_COLOR.claude : PROVIDER_COLOR.codex}
                      />
                    );
                  })}
                </Bar>
              )}

              {spreadMatchup === "grok_vs_codex" && (
                <Bar
                  dataKey="grokVsCodex"
                  name="Grok vs Sol Margin"
                  radius={[2, 2, 2, 2]}
                  isAnimationActive={true}
                  animationDuration={600}
                  animationEasing="ease-out"
                >
                  {deltaData.map((entry) => {
                    const isGrok = entry.grokVsCodex >= 0;
                    return (
                      <Cell
                        key={entry.spec}
                        fill={isGrok ? PROVIDER_COLOR.grok : PROVIDER_COLOR.codex}
                      />
                    );
                  })}
                </Bar>
              )}

              {spreadMatchup === "all" && (
                <>
                  <Bar
                    dataKey="claudeVsGrok"
                    name="Opus vs Grok"
                    fill={PROVIDER_COLOR.claude}
                    radius={[2, 2, 0, 0]}
                    isAnimationActive={true}
                    animationDuration={600}
                    animationEasing="ease-out"
                  />
                  <Bar
                    dataKey="claudeVsCodex"
                    name="Opus vs Sol"
                    fill={PROVIDER_COLOR.codex}
                    radius={[2, 2, 0, 0]}
                    isAnimationActive={true}
                    animationDuration={600}
                    animationEasing="ease-out"
                  />
                  <Bar
                    dataKey="grokVsCodex"
                    name="Grok vs Sol"
                    fill={PROVIDER_COLOR.grok}
                    radius={[2, 2, 0, 0]}
                    isAnimationActive={true}
                    animationDuration={600}
                    animationEasing="ease-out"
                  />
                </>
              )}
            </BarChart>
          </ChartContainer>
        </div>
      )}
      {/* VIEW: Rubric Matrix with Multi-Metric Stats (Duration & Cost) */}
      {mode === "heatmap" && (
        <div className="space-y-3">
          <div className="hidden grid-cols-[60px_minmax(180px,1.2fr)_repeat(3,minmax(140px,1fr))_110px] border-b border-border bg-card p-3 font-mono text-[10px] uppercase tracking-wider text-muted-foreground md:grid md:items-center">
            <button type="button" onClick={() => setSort(sort === "id" ? "margin" : "id")} className="hover:text-foreground text-left">
              Spec
            </button>
            <span>Title / Track</span>
            <button type="button" onClick={() => setSort(sort === "claude" ? "id" : "claude")} className="text-center hover:text-foreground">
              <ProviderMark provider="claude" compact />
            </button>
            <button type="button" onClick={() => setSort(sort === "grok" ? "id" : "grok")} className="text-center hover:text-foreground">
              <ProviderMark provider="grok" compact />
            </button>
            <button type="button" onClick={() => setSort(sort === "codex" ? "id" : "codex")} className="text-center hover:text-foreground">
              <ProviderMark provider="codex" compact />
            </button>
            <button type="button" onClick={() => setSort(sort === "winner" ? "id" : "winner")} className="text-right md:text-left hover:text-foreground">
              Winner
            </button>
          </div>
          <div className="max-h-[560px] space-y-1.5 overflow-y-auto pr-1">
            {processedSpecs.map((spec) => {
              const b = specMap.get(spec.id);
              return (
                <div
                  key={spec.id}
                  onClick={() => setSelectedSpecId(spec.id)}
                  className={`grid cursor-pointer gap-2 border p-3 transition-colors ${
                    selectedSpecId === spec.id
                      ? "border-foreground bg-surface-1"
                      : "border-border/60 bg-black/40 hover:border-border hover:bg-black"
                  } grid-cols-1 md:grid-cols-[60px_minmax(180px,1.2fr)_repeat(3,minmax(140px,1fr))_110px] md:items-center`}
                >
                  <span className="font-mono text-sm font-bold text-foreground">Spec {spec.id}</span>
                  <div className="min-w-0 pr-3">
                    <span className="block truncate text-xs font-medium text-foreground">{spec.title}</span>
                    <span className="font-mono text-[9px] text-muted-foreground uppercase">
                      {eraLabel(spec.era)} · {spec.track ?? spec.kind}
                    </span>
                  </div>
                  {PROVIDER_ORDER.map((provider) => {
                    const grade = spec.triad.providers[provider];
                    const cell = spec.cells[provider];
                    const failed = artifactFailed(spec, provider);
                    const color = PROVIDER_COLOR[provider];
                    const score = isRawMode ? grade.score : (b?.scores[provider] ?? grade.score);
                    const duration = b?.durations[provider] ?? (cell?.duration_seconds ?? 0);
                    const cost = b?.costs[provider] ?? Number(cell?.cost_usd ?? 0);

                    return (
                      <div
                        key={provider}
                        className="flex items-center justify-between gap-2 border border-border/60 bg-black/60 p-2 md:flex-col md:items-start"
                        style={{ borderLeft: `2px solid ${color}` }}
                      >
                        <div className="flex w-full items-center justify-between">
                          <span className="mega-label md:hidden">
                            <ProviderMark provider={provider} compact />
                          </span>
                          <span
                            className="font-mono text-xs font-bold"
                            style={{ color: failed ? "#f43f5e" : color }}
                          >
                            {typeof score === "number" ? score.toFixed(1) : score}
                            <span className="ml-1 text-[9px] font-normal text-muted-foreground">
                              ({failed ? "DNF" : `Gr ${grade.letter}`})
                            </span>
                          </span>
                        </div>
                        <div className="flex w-full items-center justify-between border-t border-border/40 pt-1 font-mono text-[9px] text-muted-foreground">
                          <span>{duration > 0 ? formatDuration(duration) : "—"}</span>
                          <span>{cost > 0 ? `$${cost.toFixed(2)}` : "—"}</span>
                        </div>
                      </div>
                    );
                  })}
                  <div className="font-mono text-[10px] text-right md:text-left">
                    {b && b.winner !== "tie" ? (
                      <span className="font-bold uppercase" style={{ color: PROVIDER_COLOR[b.winner] }}>
                        ★ {PROVIDER_SHORT[b.winner]}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">Tie</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Interactive Spec Inspector Detail Card */}
      {selectedSpec && (
        <div className="border border-border bg-card p-4 sm:p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <span className="grid size-9 place-items-center border border-border bg-black font-mono text-base font-bold text-foreground">
                {selectedSpec.id}
              </span>
              <div>
                <h4 className="text-sm font-semibold text-foreground">{selectedSpec.title}</h4>
                <p className="font-mono text-[10px] text-muted-foreground uppercase">
                  {eraLabel(selectedSpec.era)} · {selectedSpec.track ?? selectedSpec.kind}
                </p>
              </div>
            </div>
            <Link
              href={`/specs/${selectedSpec.id}`}
              className="inline-flex items-center gap-1.5 border border-border bg-black px-3 py-1.5 font-mono text-xs uppercase tracking-wider text-foreground hover:border-foreground"
            >
              Open Full Spec Deep Dive <ChevronRight className="size-3.5" />
            </Link>
          </div>
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
            {PROVIDER_ORDER.map((provider) => {
              const grade = selectedSpec.triad.providers[provider];
              const cell = selectedSpec.cells[provider];
              const color = PROVIDER_COLOR[provider];
              const failed = artifactFailed(selectedSpec, provider);
              const score = isRawMode ? grade.score : (selectedBreakdown?.scores[provider] ?? grade.score);
              const duration = selectedBreakdown?.durations[provider] ?? (cell?.duration_seconds ?? 0);
              const cost = selectedBreakdown?.costs[provider] ?? Number(cell?.cost_usd ?? 0);

              return (
                <div
                  key={provider}
                  className="border border-border/80 bg-black/60 p-3"
                  style={{ borderTop: `2px solid ${color}` }}
                >
                  <div className="flex items-center justify-between">
                    <ProviderMark provider={provider} compact />
                    <span className="font-mono text-xl font-bold" style={{ color }}>
                      {typeof score === "number" ? score.toFixed(1) : score}
                    </span>
                  </div>
                  <div className="mt-2 flex items-center justify-between font-mono text-[10px] text-muted-foreground">
                    <span>Grade {grade.letter}</span>
                    <span>{duration > 0 ? `${duration.toFixed(0)}s` : "—"} · ${cost.toFixed(2)}</span>
                  </div>
                  <div className="mt-2 h-1 w-full bg-border">
                    <div className="h-full" style={{ width: `${Math.min(100, Math.max(0, Number(score)))}%`, backgroundColor: color }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// -------------------------------------------------------------
// Pairwise Donut Chart
// -------------------------------------------------------------
export function TallyDonut({
  tally,
  labels,
  center,
}: {
  tally: Array<{ key: ProviderKey | "ties"; value: number }>;
  labels: string;
  center: string;
}) {
  const color = (key: ProviderKey | "ties") =>
    key === "ties" ? "#444" : PROVIDER_COLOR[key];

  const config = Object.fromEntries(
    tally.map((row) => [
      row.key,
      {
        label: row.key === "ties" ? "Ties" : PROVIDER_SHORT[row.key],
        color: color(row.key),
        icon:
          row.key === "claude"
            ? ClaudeChartIcon
            : row.key === "grok"
              ? GrokChartIcon
              : row.key === "codex"
                ? CodexChartIcon
                : undefined,
      },
    ]),
  ) satisfies ChartConfig;

  return (
    <ChartContainer config={config} className="mx-auto aspect-square h-[210px]">
      <PieChart accessibilityLayer>
        <ChartTooltip content={<ChartTooltipContent hideLabel />} />
        <Pie
          data={tally}
          dataKey="value"
          nameKey="key"
          innerRadius={60}
          outerRadius={88}
          paddingAngle={3}
          stroke="none"
        >
          {tally.map((row) => (
            <Cell key={row.key} fill={color(row.key)} />
          ))}
          <Label
            content={({ viewBox }) => {
              if (!viewBox || !("cx" in viewBox) || !("cy" in viewBox)) return null;
              return (
                <text x={viewBox.cx} y={viewBox.cy} textAnchor="middle" dominantBaseline="middle">
                  <tspan
                    x={viewBox.cx}
                    y={viewBox.cy}
                    className="fill-foreground font-mono text-2xl font-bold"
                  >
                    {center}
                  </tspan>
                  <tspan
                    x={viewBox.cx}
                    y={(viewBox.cy ?? 0) + 20}
                    className="fill-muted-foreground font-mono text-[10px] uppercase tracking-wider"
                  >
                    {labels}
                  </tspan>
                </text>
              );
            }}
          />
        </Pie>
      </PieChart>
    </ChartContainer>
  );
}

// -------------------------------------------------------------
// Interactive 6-Axis Rubric Radar & Breakdown (for Spec Detail Page)
// -------------------------------------------------------------
export function RubricChart({ spec }: { spec: SpecRow }) {
  const [view, setView] = useState<"radar" | "bars">("radar");
  const categories = Object.keys(spec.triad.providers.claude.rubric);

  const radarData = useMemo(() => {
    return categories.map((cat) => {
      const name = readableRubric(cat);
      const claude = spec.triad.providers.claude.rubric[cat] ?? 0;
      const grok = spec.triad.providers.grok.rubric[cat] ?? 0;
      const codex = spec.triad.providers.codex.rubric[cat] ?? 0;
      return {
        category: name,
        claude,
        grok,
        codex,
        fullMark: 25,
      };
    });
  }, [spec, categories]);

  const barRows = useMemo(() => {
    return categories.map((category) => ({
      category: readableRubric(category),
      claude: spec.triad.providers.claude.rubric[category] ?? 0,
      grok: spec.triad.providers.grok.rubric[category] ?? 0,
      codex: spec.triad.providers.codex.rubric[category] ?? 0,
    }));
  }, [spec, categories]);

  return (
    <div className="space-y-4">
      {/* View Toggle & Mini Posture Selector */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/80 pb-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setView("radar")}
            className={`border px-3 py-1 font-mono text-xs font-semibold uppercase transition-colors ${
              view === "radar"
                ? "border-foreground bg-foreground/10 text-foreground"
                : "border-border text-muted-foreground hover:text-foreground"
            }`}
          >
            6-Axis Radar
          </button>
          <button
            type="button"
            onClick={() => setView("bars")}
            className={`border px-3 py-1 font-mono text-xs font-semibold uppercase transition-colors ${
              view === "bars"
                ? "border-foreground bg-foreground/10 text-foreground"
                : "border-border text-muted-foreground hover:text-foreground"
            }`}
          >
            Category Bars
          </button>
        </div>
        <div className="flex items-center gap-2">
          <MiniPostureSelector variant="compact" showLeader={false} />
          <div className="hidden font-mono text-[10px] text-muted-foreground sm:block">
            Blind Review Rubric Breakdown (100 Points Total)
          </div>
        </div>
      </div>
      {view === "radar" ? (
        <div className="relative py-2">
          <ChartContainer
            config={providerConfig}
            className="mx-auto h-[380px] w-full max-w-[640px] aspect-square"
            initialDimension={{ width: 540, height: 380 }}
          >
            <RadarChart data={radarData} margin={{ top: 20, right: 30, bottom: 20, left: 30 }}>
              <PolarGrid stroke="rgba(255,255,255,0.1)" strokeDasharray="3 3" />
              <PolarAngleAxis
                dataKey="category"
                tick={{ fill: "#8e8e93", fontSize: 10, fontFamily: "monospace" }}
              />
              <PolarRadiusAxis
                angle={30}
                domain={[0, 25]}
                tick={{ fill: "#555", fontSize: 9 }}
                axisLine={false}
              />
              <Radar
                name="Opus 5"
                dataKey="claude"
                stroke={PROVIDER_COLOR.claude}
                fill={PROVIDER_COLOR.claude}
                fillOpacity={0.28}
                strokeWidth={2}
                isAnimationActive={true}
                animationDuration={600}
                animationEasing="ease-out"
              />
              <Radar
                name="Grok 4.6"
                dataKey="grok"
                stroke={PROVIDER_COLOR.grok}
                fill={PROVIDER_COLOR.grok}
                fillOpacity={0.22}
                strokeWidth={2}
                isAnimationActive={true}
                animationDuration={600}
                animationEasing="ease-out"
              />
              <Radar
                name="GPT-5.6 Sol"
                dataKey="codex"
                stroke={PROVIDER_COLOR.codex}
                fill={PROVIDER_COLOR.codex}
                fillOpacity={0.2}
                strokeWidth={1.5}
                isAnimationActive={true}
                animationDuration={600}
                animationEasing="ease-out"
              />
              <ChartTooltip content={<ChartTooltipContent />} />
            </RadarChart>
          </ChartContainer>
        </div>
      ) : (
        <ChartContainer
          config={providerConfig}
          className="h-[420px] w-full aspect-auto"
          initialDimension={{ width: 900, height: 420 }}
        >
          <BarChart data={barRows} layout="vertical" margin={{ left: 24, right: 12, top: 12, bottom: 12 }}>
            <CartesianGrid horizontal={false} stroke="rgba(255,255,255,0.06)" strokeDasharray="2 4" />
            <XAxis type="number" tickLine={false} axisLine={{ stroke: "rgba(255,255,255,0.12)" }} />
            <YAxis
              dataKey="category"
              type="category"
              width={160}
              tickLine={false}
              axisLine={{ stroke: "rgba(255,255,255,0.12)" }}
              tick={{ fill: "#8e8e93", fontSize: 11, fontFamily: "monospace" }}
            />
            <ChartTooltip content={<ChartTooltipContent />} />
            <ChartLegend content={<ChartLegendContent />} />
            {PROVIDER_ORDER.map((provider) => (
              <Bar
                key={provider}
                dataKey={provider}
                fill={PROVIDER_COLOR[provider]}
                radius={[0, 2, 2, 0]}
              />
            ))}
          </BarChart>
        </ChartContainer>
      )}
    </div>
  );
}
