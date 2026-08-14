"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Label,
  Pie,
  PieChart,
  XAxis,
  YAxis,
} from "recharts";
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import {
  PROVIDER_COLOR,
  PROVIDER_ORDER,
  PROVIDER_SHORT,
  type ProviderKey,
  type SpecRow,
} from "@/lib/data";

const providerConfig = {
  claude: { label: "Opus 5", color: PROVIDER_COLOR.claude },
  grok: { label: "Grok 4.6", color: PROVIDER_COLOR.grok },
  codex: { label: "GPT-5.6 Sol", color: PROVIDER_COLOR.codex },
} satisfies ChartConfig;

export function ScoreChart({ specs }: { specs: SpecRow[] }) {
  const rows = specs.map((spec) => ({
    spec: spec.id,
    claude: spec.triad.providers.claude.score,
    grok: spec.triad.providers.grok.score,
    codex: spec.triad.providers.codex.score,
  }));

  return (
    <ChartContainer
      config={providerConfig}
      className="h-[360px] w-full min-w-[720px] aspect-auto"
      initialDimension={{ width: 900, height: 360 }}
    >
      <BarChart data={rows} margin={{ top: 10, right: 8, left: -18, bottom: 4 }}>
        <CartesianGrid vertical={false} strokeDasharray="2 4" />
        <XAxis dataKey="spec" tickLine={false} axisLine={false} tickMargin={10} />
        <YAxis domain={[0, 100]} tickLine={false} axisLine={false} ticks={[0, 25, 50, 75, 100]} />
        <ChartTooltip cursor={{ fill: "rgba(122,122,255,.08)" }} content={<ChartTooltipContent />} />
        <ChartLegend content={<ChartLegendContent />} />
        <Bar dataKey="claude" fill="var(--color-claude)" radius={0} />
        <Bar dataKey="grok" fill="var(--color-grok)" radius={0} />
        <Bar dataKey="codex" fill="var(--color-codex)" radius={0} />
      </BarChart>
    </ChartContainer>
  );
}

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
    key === "ties" ? "#555" : PROVIDER_COLOR[key];
  const config = Object.fromEntries(
    tally.map((row) => [row.key, { label: row.key === "ties" ? "Ties" : PROVIDER_SHORT[row.key], color: color(row.key) }]),
  ) satisfies ChartConfig;
  const total = tally.reduce((sum, row) => sum + row.value, 0);

  return (
    <ChartContainer config={config} className="mx-auto aspect-square h-[210px]">
      <PieChart accessibilityLayer>
        <ChartTooltip content={<ChartTooltipContent hideLabel />} />
        <Pie data={tally} dataKey="value" nameKey="key" innerRadius={58} outerRadius={88} strokeWidth={0}>
          {tally.map((row) => <Cell key={row.key} fill={color(row.key)} />)}
          <Label
            content={({ viewBox }) => {
              if (!viewBox || !("cx" in viewBox) || !("cy" in viewBox)) return null;
              return (
                <text x={viewBox.cx} y={viewBox.cy} textAnchor="middle" dominantBaseline="middle">
                  <tspan x={viewBox.cx} y={viewBox.cy} className="fill-foreground font-mono text-2xl font-semibold">{center}</tspan>
                  <tspan x={viewBox.cx} y={(viewBox.cy ?? 0) + 20} className="fill-muted-foreground text-[10px] uppercase tracking-wider">{labels}</tspan>
                </text>
              );
            }}
          />
        </Pie>
      </PieChart>
    </ChartContainer>
  );
}

const readableRubric = (key: string) =>
  key
    .replace(/_/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());

export function RubricChart({ spec }: { spec: SpecRow }) {
  const categories = Object.keys(spec.triad.providers.claude.rubric);
  const rows = categories.map((category) => ({
    category: readableRubric(category),
    claude: spec.triad.providers.claude.rubric[category] ?? 0,
    grok: spec.triad.providers.grok.rubric[category] ?? 0,
    codex: spec.triad.providers.codex.rubric[category] ?? 0,
  }));

  return (
    <ChartContainer
      config={providerConfig}
      className="h-[460px] w-full aspect-auto"
      initialDimension={{ width: 900, height: 460 }}
    >
      <BarChart data={rows} layout="vertical" margin={{ left: 12, right: 12 }}>
        <CartesianGrid horizontal={false} strokeDasharray="2 4" />
        <XAxis type="number" tickLine={false} axisLine={false} />
        <YAxis
          dataKey="category"
          type="category"
          width={150}
          tickLine={false}
          axisLine={false}
          tick={{ fontSize: 10 }}
        />
        <ChartTooltip cursor={{ fill: "rgba(122,122,255,.08)" }} content={<ChartTooltipContent />} />
        <ChartLegend content={<ChartLegendContent />} />
        {PROVIDER_ORDER.map((provider) => (
          <Bar key={provider} dataKey={provider} fill={`var(--color-${provider})`} radius={0} />
        ))}
      </BarChart>
    </ChartContainer>
  );
}
