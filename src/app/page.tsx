import Link from "next/link";
import {
  ArrowRight,
  ChevronRight,
  Layers3,
  LockKeyhole,
  Play,
  Scale,
  Sparkles,
  Trophy,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { ScoreChart, TallyDonut } from "@/components/battle-charts";
import { DecisionLab } from "@/components/decision-lab";
import { DemoShowcase } from "@/components/demo-showcase";
import {
  PairwiseMark,
  ProviderIcon,
  ProviderMark,
  WinnerMark,
} from "@/components/provider-icon";
import { ProviderModel, ScoreBar } from "@/components/provider-result";
import { RunThisPrompt } from "@/components/run-this-prompt";
import {
  PROVIDER_COLOR,
  PROVIDER_ORDER,
  PROVIDER_SHORT,
  averageScore,
  artifactFailed,
  battleMetrics,
  data,
  eraLabel,
  showcaseItems,
  type ProviderKey,
} from "@/lib/data";

const resultCopy: Record<ProviderKey, string> = {
  claude: "Most consistent: 18 pairwise wins against Grok and 19 against Sol.",
  grok: "A strong middle: 14 wins against Sol, one win and one tie against Claude.",
  codex: "Won six of the twenty pairwise reviews against Grok; the remaining fourteen went to Grok.",
};

export default function Home() {
  const opusSol = data.tallies.canonical;
  const claudeGrok = data.tallies.claude_vs_grok;
  const grokCodex = data.tallies.grok_vs_codex;

  return (
    <>
      {/* HERO SECTION */}
      <section className="mega-grid border-b border-border">
        <div className="mx-auto max-w-[1600px] px-4 py-16 sm:px-6 sm:py-24 lg:px-8 lg:py-32">
          {/* Tri-Brand Identity Header */}
          <div className="mb-6 flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2 border border-border bg-black/80 px-3 py-1.5 font-mono text-xs">
              <span className="flex items-center gap-1.5">
                <ProviderIcon provider="claude" className="size-3.5" />
                <span style={{ color: PROVIDER_COLOR.claude }}>Anthropic Opus 5</span>
              </span>
              <span className="text-muted-foreground">vs</span>
              <span className="flex items-center gap-1.5">
                <ProviderIcon provider="grok" className="size-3.5" />
                <span style={{ color: PROVIDER_COLOR.grok }}>xAI Grok 4.6</span>
              </span>
              <span className="text-muted-foreground">vs</span>
              <span className="flex items-center gap-1.5">
                <ProviderIcon provider="codex" className="size-3.5" />
                <span style={{ color: PROVIDER_COLOR.codex }}>OpenAI GPT-5.6 Sol</span>
              </span>
            </div>
            <Badge variant="outline" className="rounded-none border-border font-mono text-[10px] uppercase text-muted-foreground">
              20 Frozen Specifications
            </Badge>
          </div>

          <h1 className="pixel-heading max-w-6xl text-4xl font-semibold text-balance sm:text-6xl lg:text-[5.4rem]">
            Three frontier agents.
            <br />
            <span className="text-foreground">Same build briefs.</span>
          </h1>

          <div className="mt-8 grid max-w-6xl gap-8 md:grid-cols-[1.35fr_.65fr] md:items-end">
            <p className="max-w-3xl text-base leading-7 text-muted-foreground sm:text-lg sm:leading-8">
              Claude Opus 5, Grok 4.6, and GPT-5.6 Sol built the same twenty products in isolated workspaces. Every run was receipted, each artifact was replay-checked and blindly reviewed in one three-way context, and all submitted bytes are staged here.
            </p>
            <div className="flex flex-wrap gap-3 md:justify-end">
              <Link
                href="#showcase"
                className="inline-flex h-11 items-center gap-2 border border-foreground bg-foreground px-5 font-mono text-xs font-semibold uppercase tracking-wider text-background transition-opacity hover:opacity-90"
              >
                Explore artifacts <ArrowRight className="size-4" />
              </Link>
              <Link
                href="#analytics"
                className="inline-flex h-11 items-center gap-2 border border-border bg-card px-5 font-mono text-xs uppercase tracking-wider text-foreground hover:border-foreground"
              >
                Interactive Charts
              </Link>
              <Link
                href="/methodology"
                className="inline-flex h-11 items-center gap-2 border border-border bg-black px-5 font-mono text-xs uppercase tracking-wider text-muted-foreground hover:border-border/80 hover:text-foreground"
              >
                How it worked
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ARTIFACT SHOWCASE */}
      <DemoShowcase items={showcaseItems} />

      {/* PAIRWISE ARENA */}
      <section className="border-b border-border bg-[#050505]">
        <div className="mx-auto max-w-[1600px] px-4 py-14 sm:px-6 lg:px-8">
          <div className="mb-8 flex flex-wrap items-end justify-between gap-5">
            <div>
              <div className="mega-label mb-2">Pairwise battle arena</div>
              <h2 className="pixel-heading text-3xl font-semibold sm:text-4xl">Three pairwise head-to-head views.</h2>
            </div>
            <Badge variant="outline" className="rounded-none border-border px-3 py-1 font-mono text-[10px] uppercase text-muted-foreground">
              Blind Review Decisions · 20 Specs
            </Badge>
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            {/* Matchup 1: Opus vs Sol */}
            <Card
              className="corner-marks relative rounded-none border-border bg-black p-6 transition-colors hover:border-border/80"
              style={{ borderTop: `3px solid ${PROVIDER_COLOR.claude}` }}
            >
              <span className="cm" />
              <div className="mb-5 flex items-center justify-between">
                <PairwiseMark left="claude" right="codex" className="font-mono text-xs font-semibold" />
                <span className="font-mono text-[10px] text-muted-foreground uppercase">95% Win Rate</span>
              </div>
              <div className="flex items-baseline gap-4">
                <strong className="font-mono text-6xl font-bold" style={{ color: PROVIDER_COLOR.claude }}>
                  {opusSol.claude}
                </strong>
                <span className="font-mono text-2xl text-muted-foreground">–</span>
                <strong className="font-mono text-4xl font-semibold" style={{ color: PROVIDER_COLOR.codex }}>
                  {opusSol.codex}
                </strong>
              </div>

              {/* Win Share Visual Bar */}
              <div className="mt-5 space-y-1.5">
                <div className="flex h-2 w-full overflow-hidden bg-border">
                  <div style={{ width: "95%", backgroundColor: PROVIDER_COLOR.claude }} />
                  <div style={{ width: "5%", backgroundColor: PROVIDER_COLOR.codex }} />
                </div>
                <div className="flex justify-between font-mono text-[10px] text-muted-foreground">
                  <span style={{ color: PROVIDER_COLOR.claude }}>Opus: 19 wins (95%)</span>
                  <span style={{ color: PROVIDER_COLOR.codex }}>Sol: 1 win (5%)</span>
                </div>
              </div>

              <p className="mt-4 text-xs leading-5 text-muted-foreground">
                Pairwise wins derived from the same twenty briefs and the same blind review receipts.
              </p>
            </Card>

            {/* Matchup 2: Opus vs Grok */}
            <Card
              className="rounded-none border-border bg-black p-6 transition-colors hover:border-border/80"
              style={{ borderTop: `3px solid ${PROVIDER_COLOR.claude}` }}
            >
              <div className="mb-5 flex items-center justify-between">
                <PairwiseMark left="claude" right="grok" className="font-mono text-xs font-semibold" />
                <span className="font-mono text-[10px] text-muted-foreground uppercase">90% Win Rate</span>
              </div>
              <div className="flex items-baseline gap-4">
                <strong className="font-mono text-6xl font-bold" style={{ color: PROVIDER_COLOR.claude }}>
                  {claudeGrok.claude}
                </strong>
                <span className="font-mono text-2xl text-muted-foreground">–</span>
                <strong className="font-mono text-4xl font-semibold" style={{ color: PROVIDER_COLOR.grok }}>
                  {claudeGrok.grok}
                </strong>
                <span className="font-mono text-xs text-muted-foreground">+ {claudeGrok.ties} tie</span>
              </div>

              {/* Win Share Visual Bar */}
              <div className="mt-5 space-y-1.5">
                <div className="flex h-2 w-full overflow-hidden bg-border">
                  <div style={{ width: "90%", backgroundColor: PROVIDER_COLOR.claude }} />
                  <div style={{ width: "5%", backgroundColor: "#555" }} />
                  <div style={{ width: "5%", backgroundColor: PROVIDER_COLOR.grok }} />
                </div>
                <div className="flex justify-between font-mono text-[10px] text-muted-foreground">
                  <span style={{ color: PROVIDER_COLOR.claude }}>Opus: 18 (90%)</span>
                  <span>1 Tie (5%)</span>
                  <span style={{ color: PROVIDER_COLOR.grok }}>Grok: 1 (5%)</span>
                </div>
              </div>

              <p className="mt-4 text-xs leading-5 text-muted-foreground">
                One blind review context per spec. Both pairwise decisions come directly from that receipt.
              </p>
            </Card>

            {/* Matchup 3: Grok vs Sol */}
            <Card
              className="rounded-none border-border bg-black p-6 transition-colors hover:border-border/80"
              style={{ borderTop: `3px solid ${PROVIDER_COLOR.grok}` }}
            >
              <div className="mb-5 flex items-center justify-between">
                <PairwiseMark left="grok" right="codex" className="font-mono text-xs font-semibold" />
                <span className="font-mono text-[10px] text-muted-foreground uppercase">70% Win Rate</span>
              </div>
              <div className="flex items-baseline gap-4">
                <strong className="font-mono text-6xl font-bold" style={{ color: PROVIDER_COLOR.grok }}>
                  {grokCodex.grok}
                </strong>
                <span className="font-mono text-2xl text-muted-foreground">–</span>
                <strong className="font-mono text-4xl font-semibold" style={{ color: PROVIDER_COLOR.codex }}>
                  {grokCodex.codex}
                </strong>
              </div>

              {/* Win Share Visual Bar */}
              <div className="mt-5 space-y-1.5">
                <div className="flex h-2 w-full overflow-hidden bg-border">
                  <div style={{ width: "70%", backgroundColor: PROVIDER_COLOR.grok }} />
                  <div style={{ width: "30%", backgroundColor: PROVIDER_COLOR.codex }} />
                </div>
                <div className="flex justify-between font-mono text-[10px] text-muted-foreground">
                  <span style={{ color: PROVIDER_COLOR.grok }}>Grok: 14 (70%)</span>
                  <span style={{ color: PROVIDER_COLOR.codex }}>Sol: 6 (30%)</span>
                </div>
              </div>

              <p className="mt-4 text-xs leading-5 text-muted-foreground">
                Grok won 14 specs in the blind reviews, with Sol taking 6 specs in local artifacts and AI UX.
              </p>
            </Card>
          </div>
        </div>
      </section>

      {/* DECISION LAB (CUSTOM RANKINGS) */}
      <DecisionLab metrics={battleMetrics} />

      {/* INTERACTIVE BENCHMARK SUITE & TRIAD GRADEBOOK */}
      <section id="analytics" className="scroll-mt-20 mx-auto max-w-[1600px] px-4 py-16 sm:px-6 lg:px-8 lg:py-24">
        <div className="mb-10 grid gap-6 lg:grid-cols-[.7fr_1.3fr] lg:items-end">
          <div>
            <div className="mega-label mb-2">Triad gradebook & analytics</div>
            <h2 className="pixel-heading text-3xl font-semibold sm:text-4xl">Explore every score & trajectory.</h2>
          </div>
          <p className="max-w-3xl text-sm leading-6 text-muted-foreground lg:justify-self-end">
            Scores below are from the blind triad receipts, where all three artifacts were judged together against the frozen specification. Switch between grouped bars, pairwise spread, point progression, and the rubric matrix.
          </p>
        </div>

        {/* 3 Model Overview Summary Cards */}
        <div className="grid gap-px border border-border bg-border md:grid-cols-3">
          {PROVIDER_ORDER.map((provider) => {
            const color = PROVIDER_COLOR[provider];
            const avg = averageScore(provider);
            return (
              <div
                key={provider}
                className="bg-card p-6 transition-colors hover:bg-surface-1"
                style={{ borderTop: `3px solid ${color}` }}
              >
                <ProviderModel provider={provider} />
                <div className="my-8 flex items-end gap-2">
                  <span className="font-mono text-5xl font-bold" style={{ color }}>
                    {avg.toFixed(1)}
                  </span>
                  <span className="pb-1 font-mono text-xs text-muted-foreground">/ 100 avg</span>
                </div>
                <ScoreBar provider={provider} score={Math.round(avg)} />
                <p className="mt-5 text-xs leading-5 text-muted-foreground">{resultCopy[provider]}</p>
              </div>
            );
          })}
        </div>

        {/* The Interactive Chart Container */}
        <div className="mt-6 border border-border bg-card p-4 sm:p-6">
          <ScoreChart specs={data.specs} />
        </div>
      </section>

      {/* DONUT & METHODOLOGY BREAKDOWN */}
      <section className="border-y border-border bg-[#050505]">
        <div className="mx-auto grid max-w-[1600px] gap-8 px-4 py-16 sm:px-6 lg:grid-cols-[1fr_1.4fr] lg:px-8 lg:py-24">
          <div>
            <div className="mega-label mb-2">What the wins mean</div>
            <h2 className="pixel-heading text-3xl font-semibold sm:text-4xl">Pairwise calls, not a merged podium.</h2>
            <p className="mt-5 max-w-xl text-sm leading-6 text-muted-foreground">
              A single reviewer scored Alpha, Beta, and Gamma without provider identity. Higher total wins each pair; equal totals tie. The same context avoids score drift between separate reviews.
            </p>
            <Link
              href="/methodology#grading"
              className="mt-7 inline-flex items-center gap-2 font-mono text-xs uppercase tracking-wider text-foreground hover:underline"
            >
              Inspect the grading contract <ArrowRight className="size-4" />
            </Link>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="border border-border bg-black p-4">
              <div className="mega-label flex justify-center pb-2"><PairwiseMark left="claude" right="grok" /></div>
              <TallyDonut
                tally={[
                  { key: "claude", value: claudeGrok.claude ?? 0 },
                  { key: "grok", value: claudeGrok.grok ?? 0 },
                  { key: "ties", value: claudeGrok.ties },
                ]}
                center={`${claudeGrok.claude}–${claudeGrok.grok}`}
                labels="wins"
              />
            </div>
            <div className="border border-border bg-black p-4">
              <div className="mega-label flex justify-center pb-2"><PairwiseMark left="grok" right="codex" /></div>
              <TallyDonut
                tally={[
                  { key: "grok", value: grokCodex.grok ?? 0 },
                  { key: "codex", value: grokCodex.codex ?? 0 },
                ]}
                center={`${grokCodex.grok}–${grokCodex.codex}`}
                labels="wins"
              />
            </div>
          </div>
        </div>
      </section>

      {/* COMPLETE MATRIX SECTION */}
      <section id="matrix" className="scroll-mt-20 mx-auto max-w-[1600px] px-4 py-16 sm:px-6 lg:px-8 lg:py-24">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-5">
          <div>
            <div className="mega-label mb-2">The complete matrix</div>
            <h2 className="pixel-heading text-3xl font-semibold sm:text-4xl">Dig into every build.</h2>
          </div>
          <div className="flex gap-4 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
            <ProviderMark provider="claude" compact />
            <ProviderMark provider="grok" compact />
            <ProviderMark provider="codex" compact />
          </div>
        </div>

        <div className="overflow-hidden border border-border">
          <div className="hidden grid-cols-[70px_minmax(240px,1fr)_repeat(3,90px)_160px_88px] border-b border-border bg-surface-1 px-4 py-3 font-mono text-[10px] uppercase tracking-wider text-muted-foreground md:grid">
            <span>Spec</span>
            <span>Product</span>
            <span className="inline-flex items-center"><ProviderMark provider="claude" compact /></span>
            <span className="inline-flex items-center"><ProviderMark provider="grok" compact /></span>
            <span className="inline-flex items-center"><ProviderMark provider="codex" compact /></span>
            <span>Pairwise Calls</span>
            <span className="text-right">Action</span>
          </div>
          {data.specs.map((spec) => (
            <div
              key={spec.id}
              className="group relative grid gap-4 border-b border-border bg-card p-4 transition-colors last:border-b-0 hover:bg-surface-1 md:grid-cols-[70px_minmax(240px,1fr)_repeat(3,90px)_160px_88px] md:items-center md:gap-0"
            >
              <Link
                href={`/specs/${spec.id}`}
                aria-label={`Open spec ${spec.id}: ${spec.title}`}
                className="absolute inset-0 z-0"
              />
              <div className="font-mono text-lg font-bold text-foreground">{spec.id}</div>
              <div className="min-w-0 pr-5">
                <div className="truncate text-sm font-semibold text-foreground group-hover:underline">{spec.title}</div>
                <div className="mt-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                  {eraLabel(spec.era)} · {spec.track ?? spec.kind}
                </div>
              </div>
              {PROVIDER_ORDER.map((provider) => {
                const failed = artifactFailed(spec, provider);
                const score = spec.triad.providers[provider].score;
                const color = PROVIDER_COLOR[provider];
                return (
                  <div key={provider} className="flex items-center justify-between gap-3 md:block">
                    <span className="mega-label md:hidden"><ProviderMark provider={provider} compact /></span>
                    <span
                      className="font-mono text-lg font-bold"
                      style={{ color: failed ? "#f43f5e" : color }}
                    >
                      {score}
                    </span>
                    {failed && (
                      <span className="ml-2 font-mono text-[9px] font-bold uppercase text-destructive md:ml-0 md:block">
                        DNF
                      </span>
                    )}
                  </div>
                );
              })}
              <div className="text-xs leading-5 text-muted-foreground">
                <span className="inline-flex flex-wrap items-center gap-1 font-mono text-foreground">
                  <WinnerMark value={spec.pairwise.claude_vs_grok} />
                  <span className="text-muted-foreground">/</span>
                  <WinnerMark value={spec.pairwise.grok_vs_codex} />
                </span>
              </div>
              <div className="relative z-10 flex items-center justify-end gap-2">
                <RunThisPrompt spec={spec} variant="icon" />
                <ChevronRight className="hidden size-4 text-muted-foreground transition-transform group-hover:translate-x-1 group-hover:text-foreground md:block" />
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* FOOTER CALLOUT */}
      <section className="mega-grid border-t border-border">
        <div className="mx-auto max-w-[1600px] px-4 py-20 sm:px-6 lg:px-8">
          <div className="grid gap-10 lg:grid-cols-[1fr_1fr] lg:items-center">
            <div>
              <div className="mega-label mb-3">Evidence before conclusion</div>
              <h2 className="pixel-heading max-w-2xl text-3xl font-semibold sm:text-5xl">
                Don&apos;t trust the chart. Open the work.
              </h2>
              <p className="mt-5 max-w-xl text-sm leading-6 text-muted-foreground">
                Each deep dive puts all three staged artifacts, full rubric scores, judge rationales, receipt metadata, validator status, and the frozen prompt on one page.
              </p>
            </div>
            <div className="grid gap-px border border-border bg-border sm:grid-cols-3">
              {[
                [Play, "60", "staged artifacts"],
                [LockKeyhole, "20", "blind triad receipts"],
                [Layers3, "3", "frontier models"],
              ].map(([Icon, value, label]) => (
                <div key={String(label)} className="bg-black p-6">
                  <Icon className="mb-7 size-5 text-muted-foreground" />
                  <div className="font-mono text-3xl font-bold">{String(value)}</div>
                  <div className="mega-label mt-1">{String(label)}</div>
                </div>
              ))}
            </div>
          </div>
          <Separator className="my-12" />
          <Link
            href="/specs/01"
            className="inline-flex items-center gap-2 font-mono text-xs uppercase tracking-wider text-foreground hover:underline"
          >
            Start with Signal Garden <ArrowRight className="size-4" />
          </Link>
        </div>
      </section>
    </>
  );
}
