"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  Area,
  AreaChart,
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
  LineChart as LineChartIcon,
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
import {
  PROVIDER_COLOR,
  PROVIDER_ORDER,
  PROVIDER_SHORT,
  artifactFailed,
  averageScore,
  eraLabel,
  type ProviderKey,
  type SpecRow,
} from "@/lib/data";

export const providerConfig = {
  claude: { label: "Opus 5", color: PROVIDER_COLOR.claude, icon: ClaudeChartIcon },
  grok: { label: "Grok 4.6", color: PROVIDER_COLOR.grok, icon: GrokChartIcon },
  codex: { label: "GPT-5.6 Sol", color: PROVIDER_COLOR.codex, icon: CodexChartIcon },
} satisfies ChartConfig;

type ChartMode = "bars" | "deltas" | "progression" | "heatmap";
type TrackFilter = "all" | "legacy" | "modern";
type SortOption = "id" | "claude" | "grok" | "codex" | "margin";

const readableRubric = (key: string) =>
  key
    .replace(/_/g, " ")
    .replace(/\w/g, (character) => character.toUpperCase());

// Custom Rich Glass Tooltip
function CustomBarTooltip({ active, payload, label, specs }: any) {
  if (!active || !payload || !payload.length) return null;
  const specId = label;
  const spec = specs.find((s: SpecRow) => s.id === specId);
  if (!spec) return null;

  return (
    <div className="z-50 min-w-[260px] border border-border/80 bg-black/95 p-3.5 shadow-2xl backdrop-blur-xl">
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

      <div className="mt-3 space-y-1.5">
        {PROVIDER_ORDER.map((provider) => {
          const grade = spec.triad.providers[provider];
          const failed = artifactFailed(spec, provider);
          const color = PROVIDER_COLOR[provider];
          return (
            <div
              key={provider}
              className="flex items-center justify-between gap-3 border-l-2 py-0.5 pl-2 text-xs"
              style={{ borderColor: color }}
            >
              <ProviderMark provider={provider} compact />
              <div className="flex items-center gap-2 font-mono">
                {failed && (
                  <span className="text-[9px] font-bold text-destructive uppercase">DNF</span>
                )}
                <span className="text-[10px] text-muted-foreground">Grade {grade.letter}</span>
                <span className="w-8 text-right font-bold" style={{ color }}>
                  {grade.score}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-3 flex items-center justify-between border-t border-border/60 pt-2 text-[10px] text-muted-foreground">
        <span>Pairwise:</span>
        <div className="flex items-center gap-1 font-mono text-foreground">
          <WinnerMark value={spec.pairwise.claude_vs_grok} />
          <span>/</span>
          <WinnerMark value={spec.pairwise.grok_vs_codex} />
        </div>
      </div>
    </div>
  );
}

// -------------------------------------------------------------
// Main Interactive Benchmark Suite
// -------------------------------------------------------------
export function ScoreChart({ specs }: { specs: SpecRow[] }) {
  const [mode, setMode] = useState<ChartMode>("bars");
  const [filter, setFilter] = useState<TrackFilter>("all");
  const [sort, setSort] = useState<SortOption>("id");
  const [selectedSpecId, setSelectedSpecId] = useState<string>("01");

  // Filtered & Sorted specs
  const processedSpecs = useMemo(() => {
    let result = [...specs];
    if (filter === "legacy") {
      result = result.filter((s) => s.era === "legacy");
    } else if (filter === "modern") {
      result = result.filter((s) => s.era === "modern");
    }

    if (sort === "claude") {
      result.sort((a, b) => b.triad.providers.claude.score - a.triad.providers.claude.score);
    } else if (sort === "grok") {
      result.sort((a, b) => b.triad.providers.grok.score - a.triad.providers.grok.score);
    } else if (sort === "codex") {
      result.sort((a, b) => b.triad.providers.codex.score - a.triad.providers.codex.score);
    } else if (sort === "margin") {
      result.sort((a, b) => {
        const marginA = Math.abs(a.triad.providers.claude.score - a.triad.providers.grok.score);
        const marginB = Math.abs(b.triad.providers.claude.score - b.triad.providers.grok.score);
        return marginB - marginA;
      });
    } else {
      result.sort((a, b) => Number(a.id) - Number(b.id));
    }
    return result;
  }, [specs, filter, sort]);

  // Rows for Recharts Bar view
  const barData = useMemo(() => {
    return processedSpecs.map((spec) => ({
      spec: spec.id,
      title: spec.title,
      claude: spec.triad.providers.claude.score,
      grok: spec.triad.providers.grok.score,
      codex: spec.triad.providers.codex.score,
      era: spec.era,
      kind: spec.track ?? spec.kind,
    }));
  }, [processedSpecs]);

  // Delta Rows (Opus vs Grok, Opus vs Sol, Grok vs Sol)
  const deltaData = useMemo(() => {
    return processedSpecs.map((spec) => ({
      spec: spec.id,
      title: spec.title,
      claudeVsGrok: spec.triad.providers.claude.score - spec.triad.providers.grok.score,
      claudeVsCodex: spec.triad.providers.claude.score - spec.triad.providers.codex.score,
      grokVsCodex: spec.triad.providers.grok.score - spec.triad.providers.codex.score,
    }));
  }, [processedSpecs]);

  // Cumulative Point Progression (Running totals across specs 01-20 in chronological order)
  const progressionData = useMemo(() => {
    let runningClaude = 0;
    let runningGrok = 0;
    let runningCodex = 0;
    return specs.map((spec) => {
      runningClaude += spec.triad.providers.claude.score;
      runningGrok += spec.triad.providers.grok.score;
      runningCodex += spec.triad.providers.codex.score;
      return {
        spec: spec.id,
        title: spec.title,
        claude: runningClaude,
        grok: runningGrok,
        codex: runningCodex,
      };
    });
  }, [specs]);

  const selectedSpec = specs.find((s) => s.id === selectedSpecId) ?? specs[0];
  const claudeAvg = averageScore("claude");
  const grokAvg = averageScore("grok");
  const codexAvg = averageScore("codex");

  return (
    <div className="space-y-6">
      {/* Top Header & Interactive Controls */}
      <div className="flex flex-col gap-4 border-b border-border/80 pb-5 lg:flex-row lg:items-center lg:justify-between">
        {/* Mode Buttons */}
        <div className="flex flex-wrap items-center gap-1.5 border border-border bg-black/80 p-1">
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
          <button
            type="button"
            onClick={() => setMode("progression")}
            className={`inline-flex items-center gap-2 px-3 py-1.5 font-mono text-xs font-semibold uppercase tracking-wider transition-colors ${
              mode === "progression"
                ? "bg-foreground text-background"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <LineChartIcon className="size-3.5" /> Trajectory
          </button>
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
        </div>

        {/* Filter & Sort Controls */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1 font-mono text-xs">
            <span className="mr-1 text-muted-foreground uppercase">Filter:</span>
            {(["all", "legacy", "modern"] as TrackFilter[]).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setFilter(t)}
                className={`border px-2 py-1 text-[11px] uppercase transition-colors ${
                  filter === t
                    ? "border-foreground bg-foreground/10 font-bold text-foreground"
                    : "border-border text-muted-foreground hover:border-border/80 hover:text-foreground"
                }`}
              >
                {t === "all" ? "All 20" : t === "legacy" ? "01–10 Local" : "11–20 AI UX"}
              </button>
            ))}
          </div>

          {mode === "bars" && (
            <div className="flex items-center gap-1 font-mono text-xs">
              <span className="mr-1 text-muted-foreground uppercase">Sort:</span>
              <select
                aria-label="Sort benchmark specifications"
                value={sort}
                onChange={(e) => setSort(e.target.value as SortOption)}
                className="border border-border bg-card px-2.5 py-1 text-[11px] text-foreground outline-none focus:border-foreground"
              >
                <option value="id">Spec ID (01-20)</option>
                <option value="claude">Opus Score (High)</option>
                <option value="grok">Grok Score (High)</option>
                <option value="codex">Sol Score (High)</option>
                <option value="margin">Widest Margin</option>
              </select>
            </div>
          )}
        </div>
      </div>

      {/* Model Performance Snapshot Pills */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {PROVIDER_ORDER.map((provider) => {
          const color = PROVIDER_COLOR[provider];
          const avg = averageScore(provider);
          const topSpecs = specs.filter((s) => {
            const sc = s.triad.providers[provider].score;
            return sc >= s.triad.providers.claude.score && sc >= s.triad.providers.grok.score && sc >= s.triad.providers.codex.score;
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
                    {topSpecs}/20 highest score
                  </p>
                </div>
              </div>
              <div className="text-right">
                <span className="font-mono text-xl font-bold" style={{ color }}>
                  {avg.toFixed(1)}
                </span>
                <span className="block font-mono text-[9px] text-muted-foreground uppercase">avg / 100</span>
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
              <Bar dataKey="claude" fill={PROVIDER_COLOR.claude} radius={[2, 2, 0, 0]} maxBarSize={16} />
              <Bar dataKey="grok" fill={PROVIDER_COLOR.grok} radius={[2, 2, 0, 0]} maxBarSize={16} />
              <Bar dataKey="codex" fill={PROVIDER_COLOR.codex} radius={[2, 2, 0, 0]} maxBarSize={16} />
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
        <div>
          <div className="mb-3 font-mono text-xs text-muted-foreground">
            Score differences on each spec. Bars above the zero baseline indicate how much Opus (Claude) outperformed Grok.
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
              <ReferenceLine y={0} stroke="#555" strokeWidth={1.5} />
              <ChartTooltip
                cursor={{ fill: "rgba(255,255,255,0.04)" }}
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const item = payload[0].payload;
                  return (
                    <div className="border border-border bg-black/95 p-3 font-mono text-xs shadow-xl">
                      <div className="font-bold text-foreground">Spec {item.spec} · {item.title}</div>
                      <div className="mt-2 space-y-1">
                        <div className="flex items-center justify-between gap-4">
                          <span style={{ color: PROVIDER_COLOR.claude }}>Opus vs Grok:</span>
                          <span className="font-bold">{item.claudeVsGrok > 0 ? `+${item.claudeVsGrok}` : item.claudeVsGrok} pts</span>
                        </div>
                        <div className="flex items-center justify-between gap-4">
                          <span style={{ color: PROVIDER_COLOR.claude }}>Opus vs Sol:</span>
                          <span className="font-bold">{item.claudeVsCodex > 0 ? `+${item.claudeVsCodex}` : item.claudeVsCodex} pts</span>
                        </div>
                        <div className="flex items-center justify-between gap-4">
                          <span style={{ color: PROVIDER_COLOR.grok }}>Grok vs Sol:</span>
                          <span className="font-bold">{item.grokVsCodex > 0 ? `+${item.grokVsCodex}` : item.grokVsCodex} pts</span>
                        </div>
                      </div>
                    </div>
                  );
                }}
              />
              <Bar
                dataKey="claudeVsGrok"
                name="Opus vs Grok margin"
                fill={PROVIDER_COLOR.claude}
                radius={[2, 2, 0, 0]}
              />
              <Bar
                dataKey="grokVsCodex"
                name="Grok vs Sol margin"
                fill={PROVIDER_COLOR.grok}
                radius={[2, 2, 0, 0]}
              />
            </BarChart>
          </ChartContainer>
        </div>
      )}

      {/* VIEW 3: Cumulative Progression Curve */}
      {mode === "progression" && (
        <div>
          <div className="mb-3 font-mono text-xs text-muted-foreground">
            Cumulative points earned from Spec 01 through Spec 20, illustrating performance trajectory and consistency.
          </div>
          <ChartContainer
            config={providerConfig}
            className="h-[360px] w-full min-w-[700px] aspect-auto"
            initialDimension={{ width: 900, height: 360 }}
          >
            <AreaChart data={progressionData} margin={{ top: 16, right: 12, left: -4, bottom: 6 }}>
              <defs>
                <linearGradient id="gradClaude" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={PROVIDER_COLOR.claude} stopOpacity={0.3} />
                  <stop offset="95%" stopColor={PROVIDER_COLOR.claude} stopOpacity={0.0} />
                </linearGradient>
                <linearGradient id="gradGrok" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={PROVIDER_COLOR.grok} stopOpacity={0.25} />
                  <stop offset="95%" stopColor={PROVIDER_COLOR.grok} stopOpacity={0.0} />
                </linearGradient>
                <linearGradient id="gradCodex" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={PROVIDER_COLOR.codex} stopOpacity={0.2} />
                  <stop offset="95%" stopColor={PROVIDER_COLOR.codex} stopOpacity={0.0} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} stroke="rgba(255,255,255,0.06)" strokeDasharray="3 3" />
              <XAxis dataKey="spec" tickLine={false} axisLine={{ stroke: "rgba(255,255,255,0.12)" }} tickMargin={8} />
              <YAxis tickLine={false} axisLine={{ stroke: "rgba(255,255,255,0.12)" }} />
              <ChartTooltip
                cursor={{ stroke: "rgba(255,255,255,0.2)" }}
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const item = payload[0].payload;
                  return (
                    <div className="border border-border bg-black/95 p-3 font-mono text-xs shadow-xl">
                      <div className="font-bold text-foreground">Through Spec {item.spec}</div>
                      <div className="mt-2 space-y-1">
                        <div className="flex justify-between gap-4" style={{ color: PROVIDER_COLOR.claude }}>
                          <span>Opus 5 Total:</span>
                          <span className="font-bold">{item.claude} pts</span>
                        </div>
                        <div className="flex justify-between gap-4" style={{ color: PROVIDER_COLOR.grok }}>
                          <span>Grok 4.6 Total:</span>
                          <span className="font-bold">{item.grok} pts</span>
                        </div>
                        <div className="flex justify-between gap-4" style={{ color: PROVIDER_COLOR.codex }}>
                          <span>Sol Total:</span>
                          <span className="font-bold">{item.codex} pts</span>
                        </div>
                      </div>
                    </div>
                  );
                }}
              />
              <ChartLegend content={<ChartLegendContent />} />
              <Area
                type="monotone"
                dataKey="claude"
                stroke={PROVIDER_COLOR.claude}
                strokeWidth={2.5}
                fillOpacity={1}
                fill="url(#gradClaude)"
              />
              <Area
                type="monotone"
                dataKey="grok"
                stroke={PROVIDER_COLOR.grok}
                strokeWidth={2}
                fillOpacity={1}
                fill="url(#gradGrok)"
              />
              <Area
                type="monotone"
                dataKey="codex"
                stroke={PROVIDER_COLOR.codex}
                strokeWidth={1.5}
                fillOpacity={1}
                fill="url(#gradCodex)"
              />
            </AreaChart>
          </ChartContainer>
        </div>
      )}

      {/* VIEW 4: Rubric Heatmap Grid */}
      {mode === "heatmap" && (
        <div className="space-y-3">
          <div className="grid grid-cols-[80px_1fr_repeat(3,90px)] border-b border-border bg-card p-3 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
            <span>Spec</span>
            <span>Title / Track</span>
            <span className="text-center"><ProviderMark provider="claude" compact /></span>
            <span className="text-center"><ProviderMark provider="grok" compact /></span>
            <span className="text-center"><ProviderMark provider="codex" compact /></span>
          </div>
          <div className="max-h-[480px] space-y-1 overflow-y-auto pr-1">
            {processedSpecs.map((spec) => {
              return (
                <div
                  key={spec.id}
                  onClick={() => setSelectedSpecId(spec.id)}
                  className={`grid cursor-pointer grid-cols-[80px_1fr_repeat(3,90px)] items-center border p-2.5 transition-colors ${
                    selectedSpecId === spec.id
                      ? "border-foreground bg-surface-1"
                      : "border-border/60 bg-black/40 hover:border-border hover:bg-black"
                  }`}
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
                    const failed = artifactFailed(spec, provider);
                    const color = PROVIDER_COLOR[provider];
                    return (
                      <div key={provider} className="text-center">
                        <div
                          className="inline-flex min-w-[54px] flex-col items-center justify-center border px-2 py-1 font-mono text-xs font-bold"
                          style={{
                            borderColor: `${color}40`,
                            backgroundColor: `${color}15`,
                            color: failed ? "#f43f5e" : color,
                          }}
                        >
                          <span>{grade.score}</span>
                          <span className="text-[8px] font-normal text-muted-foreground uppercase">
                            {failed ? "DNF" : `Gr ${grade.letter}`}
                          </span>
                        </div>
                      </div>
                    );
                  })}
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
              return (
                <div
                  key={provider}
                  className="border border-border/80 bg-black/60 p-3"
                  style={{ borderTop: `2px solid ${color}` }}
                >
                  <div className="flex items-center justify-between">
                    <ProviderMark provider={provider} compact />
                    <span className="font-mono text-xl font-bold" style={{ color }}>
                      {grade.score}
                    </span>
                  </div>
                  <div className="mt-2 flex items-center justify-between font-mono text-[10px] text-muted-foreground">
                    <span>Grade {grade.letter}</span>
                    <span>{failed ? "FAILED VALIDATOR" : cell.classification ?? grade.run_status}</span>
                  </div>
                  <div className="mt-2 h-1 w-full bg-border">
                    <div className="h-full" style={{ width: `${grade.score}%`, backgroundColor: color }} />
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
      {/* View Toggle */}
      <div className="flex items-center justify-between border-b border-border/80 pb-3">
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
        <div className="hidden font-mono text-[10px] text-muted-foreground sm:block">
          Blind Review Rubric Breakdown (100 Points Total)
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
              />
              <Radar
                name="Grok 4.6"
                dataKey="grok"
                stroke={PROVIDER_COLOR.grok}
                fill={PROVIDER_COLOR.grok}
                fillOpacity={0.22}
                strokeWidth={2}
              />
              <Radar
                name="GPT-5.6 Sol"
                dataKey="codex"
                stroke={PROVIDER_COLOR.codex}
                fill={PROVIDER_COLOR.codex}
                fillOpacity={0.2}
                strokeWidth={1.5}
              />
              <ChartLegend content={<ChartLegendContent />} />
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
