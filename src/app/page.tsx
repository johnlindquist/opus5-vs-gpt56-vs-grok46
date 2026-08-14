import Link from "next/link";
import {
  ArrowRight,
  Layers3,
  LockKeyhole,
  Play,
  Sliders,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScoreChart } from "@/components/battle-charts";
import { DecisionLab } from "@/components/decision-lab";
import { DemoShowcase } from "@/components/demo-showcase";
import { PairwiseArena } from "@/components/pairwise-arena";
import { ModelOverviewCards } from "@/components/model-overview-cards";
import { PairwiseDonutsSection } from "@/components/pairwise-donuts";
import { SpecificationMatrix } from "@/components/specification-matrix";
import { GlobalPostureBanner, MiniPostureSelector } from "@/components/mini-posture-selector";
import { ProviderIcon } from "@/components/provider-icon";
import {
  PROVIDER_COLOR,
  battleMetrics,
  data,
  showcaseItems,
} from "@/lib/data";

export default function Home() {
  return (
    <>
      {/* 1. HERO SECTION */}
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

          <h1 className="pixel-heading max-w-6xl text-4xl font-semibold text-balance sm:text-6xl lg:text-[5.2rem]">
            The frontier build benchmark:
            <br />
            <span className="text-foreground">Opus 5 vs Grok 4.6 vs GPT-5.6 Sol</span>
          </h1>

          <div className="mt-8 grid max-w-6xl gap-8 md:grid-cols-[1.35fr_.65fr] md:items-end">
            <p className="max-w-3xl text-base leading-7 text-muted-foreground sm:text-lg sm:leading-8">
              Twenty real-world applications built from scratch in clean, isolated environments. Every run was receipted, replay-tested, and blindly evaluated to measure true autonomous software engineering across Anthropic, xAI, and OpenAI.
            </p>
            <div className="flex flex-wrap gap-3 md:justify-end">
              <Link
                href="#decision-lab"
                className="inline-flex h-11 items-center gap-2 border border-foreground bg-foreground px-5 font-mono text-xs font-semibold uppercase tracking-wider text-background transition-opacity hover:opacity-90"
              >
                Set your priorities <ArrowRight className="size-4" />
              </Link>
              <Link
                href="#analytics"
                className="inline-flex h-11 items-center gap-2 border border-border bg-card px-5 font-mono text-xs uppercase tracking-wider text-foreground hover:border-foreground"
              >
                Score Analytics
              </Link>
              <Link
                href="#showcase"
                className="inline-flex h-11 items-center gap-2 border border-border bg-black px-5 font-mono text-xs uppercase tracking-wider text-muted-foreground hover:border-border/80 hover:text-foreground"
              >
                Artifact Gallery
              </Link>
            </div>
          </div>
        </div>

        {/* Global Posture Control Strip in Hero */}
        <GlobalPostureBanner />
      </section>

      {/* 2. DECISION LAB (CUSTOM PRIORITIES & RANKING) — Positioned directly above results */}
      <DecisionLab metrics={battleMetrics} />

      {/* 3. PAIRWISE BATTLE ARENA */}
      <PairwiseArena />

      {/* 4. INTERACTIVE BENCHMARK SUITE & TRIAD GRADEBOOK */}
      <section id="analytics" className="scroll-mt-20 mx-auto max-w-[1600px] px-4 py-16 sm:px-6 lg:px-8 lg:py-24">
        <div className="mb-10 flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
          <div>
            <div className="mega-label mb-2">Triad gradebook & analytics</div>
            <h2 className="pixel-heading text-3xl font-semibold sm:text-4xl">The complete scoring breakdown.</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
              Explore dynamic multi-metric evaluations across all 20 specs. Switch between the multi-metric rubric matrix, grouped score bars, and head-to-head point spreads.
            </p>
          </div>
          <MiniPostureSelector variant="bar" showLeader={true} showModeToggle={true} />
        </div>

        {/* 3 Model Overview Summary Cards */}
        <ModelOverviewCards />

        {/* The Interactive Chart Container */}
        <div className="mt-6 border border-border bg-card p-4 sm:p-6">
          <ScoreChart specs={data.specs} />
        </div>
      </section>

      {/* 5. ARTIFACT SIGNAL & GALLERY */}
      <DemoShowcase items={showcaseItems} />

      {/* 6. DONUT & METHODOLOGY BREAKDOWN */}
      <PairwiseDonutsSection />

      {/* 7. COMPLETE MATRIX SECTION */}
      <SpecificationMatrix specs={data.specs} />

      {/* 8. FOOTER CALLOUT */}
      <section className="mega-grid border-t border-border">
        <div className="mx-auto max-w-[1600px] px-4 py-20 sm:px-6 lg:px-8">
          <div className="grid gap-10 lg:grid-cols-[1fr_1fr] lg:items-center">
            <div>
              <div className="mega-label mb-3">Provenance & Artifacts</div>
              <h2 className="pixel-heading max-w-2xl text-3xl font-semibold sm:text-5xl">
                100% receipted. Completely reproducible.
              </h2>
              <p className="mt-5 max-w-xl text-sm leading-6 text-muted-foreground">
                Inspect every staged production artifact, complete rubric grade, evaluator rationale, execution transcript, and SHA-256 pinned specification prompt.
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
