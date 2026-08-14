import Link from "next/link";
import {
  ArrowRight,
  ChevronRight,
  Layers3,
  LockKeyhole,
  Play,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { ScoreChart, TallyDonut } from "@/components/battle-charts";
import { DecisionLab } from "@/components/decision-lab";
import { DemoShowcase } from "@/components/demo-showcase";
import { ProviderModel, ScoreBar } from "@/components/provider-result";
import { RunThisPrompt } from "@/components/run-this-prompt";
import {
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

function winnerLabel(value: string) {
  if (value === "tie") return "Tie";
  return PROVIDER_SHORT[value as ProviderKey] ?? value;
}

export default function Home() {
  const opusSol = data.tallies.canonical;
  const claudeGrok = data.tallies.claude_vs_grok;
  const grokCodex = data.tallies.grok_vs_codex;

  return (
    <>
      <section className="mega-grid border-b border-border">
        <div className="mx-auto max-w-[1600px] px-4 py-16 sm:px-6 sm:py-24 lg:px-8 lg:py-32">
          <div className="mega-label mb-6 flex items-center gap-3 text-mega-blue-text">
            <span className="h-px w-8 bg-mega-blue-text" /> 20 frozen specifications
          </div>
          <h1 className="pixel-heading max-w-6xl text-4xl font-semibold text-balance sm:text-6xl lg:text-[5.4rem]">
            Three frontier agents.
            <br />
            <span className="text-mega-blue-text">Same build briefs.</span>
          </h1>
          <div className="mt-8 grid max-w-6xl gap-8 md:grid-cols-[1.35fr_.65fr] md:items-end">
            <p className="max-w-3xl text-base leading-7 text-muted-foreground sm:text-lg sm:leading-8">
              Claude Opus 5, Grok 4.6, and GPT-5.6 Sol built the same twenty products in isolated workspaces. Every run was receipted, each artifact was replay-checked and blindly reviewed in one three-way context, and all submitted bytes are staged here. Two Grok artifacts failed their recorded validator and are explicitly marked.
            </p>
            <div className="flex flex-wrap gap-3 md:justify-end">
              <Link href="#showcase" className="inline-flex h-11 items-center gap-2 bg-mega-blue px-5 font-mono text-xs font-semibold uppercase tracking-wider text-white hover:bg-mega-blue-text">
                Explore artifacts <ArrowRight className="size-4" />
              </Link>
              <Link href="#decision-lab" className="inline-flex h-11 items-center gap-2 border border-mega-blue-text bg-mega-blue/10 px-5 font-mono text-xs uppercase tracking-wider text-mega-blue-text hover:bg-mega-blue hover:text-white">
                Build your ranking
              </Link>
              <Link href="/methodology" className="inline-flex h-11 items-center gap-2 border border-border bg-black px-5 font-mono text-xs uppercase tracking-wider hover:border-mega-blue-text">
                How it worked
              </Link>
            </div>
          </div>
        </div>
      </section>

      <DemoShowcase items={showcaseItems} />

      <section className="border-b border-border bg-[#050505]">
        <div className="mx-auto max-w-[1600px] px-4 py-14 sm:px-6 lg:px-8">
          <div className="mb-8 flex flex-wrap items-end justify-between gap-5">
            <div>
              <div className="mega-label mb-2">Pairwise tallies</div>
              <h2 className="pixel-heading text-3xl font-semibold sm:text-4xl">Three views of the same twenty briefs.</h2>
            </div>
            <Badge variant="outline" className="rounded-none border-mega-blue-text px-3 py-1 font-mono text-[10px] uppercase text-mega-blue-text">
              No cross-agent speed claims
            </Badge>
          </div>
          <div className="grid gap-3 lg:grid-cols-3">
            <Card className="corner-marks relative rounded-none border-border bg-black p-6">
              <span className="cm" />
              <div className="mega-label mb-6">Opus vs Sol</div>
              <div className="flex items-end gap-4">
                <strong className="font-mono text-6xl font-semibold text-mega-blue-text">{opusSol.claude}</strong>
                <span className="pb-2 font-mono text-2xl text-muted-foreground">–</span>
                <strong className="font-mono text-4xl font-semibold">{opusSol.codex}</strong>
              </div>
              <p className="mt-5 text-sm leading-6 text-muted-foreground">Pairwise wins from the same twenty briefs and the same blind reviews.</p>
            </Card>
            <Card className="rounded-none border-border bg-black p-6">
              <div className="mega-label mb-6">Opus vs Grok</div>
              <div className="flex items-end gap-4">
                <strong className="font-mono text-6xl font-semibold text-mega-blue-text">{claudeGrok.claude}</strong>
                <span className="pb-2 font-mono text-2xl text-muted-foreground">–</span>
                <strong className="font-mono text-4xl font-semibold text-mega-green">{claudeGrok.grok}</strong>
                <span className="pb-2 font-mono text-xs text-muted-foreground">+ {claudeGrok.ties} tie</span>
              </div>
              <p className="mt-5 text-sm leading-6 text-muted-foreground">One blind review context per spec. Both pairwise decisions come from that same receipt.</p>
            </Card>
            <Card className="rounded-none border-border bg-black p-6">
              <div className="mega-label mb-6">Grok vs Sol</div>
              <div className="flex items-end gap-4">
                <strong className="font-mono text-6xl font-semibold text-mega-green">{grokCodex.grok}</strong>
                <span className="pb-2 font-mono text-2xl text-muted-foreground">–</span>
                <strong className="font-mono text-4xl font-semibold">{grokCodex.codex}</strong>
              </div>
              <p className="mt-5 text-sm leading-6 text-muted-foreground">Pairwise wins from the same twenty briefs and the same blind reviews.</p>
            </Card>
          </div>
        </div>
      </section>

      <DecisionLab metrics={battleMetrics} />

      <section className="mx-auto max-w-[1600px] px-4 py-16 sm:px-6 lg:px-8 lg:py-24">
        <div className="mb-10 grid gap-6 lg:grid-cols-[.7fr_1.3fr] lg:items-end">
          <div>
            <div className="mega-label mb-2">Triad gradebook</div>
            <h2 className="pixel-heading text-3xl font-semibold sm:text-4xl">Score every shipped artifact.</h2>
          </div>
          <p className="max-w-3xl text-sm leading-6 text-muted-foreground lg:justify-self-end">
            Scores below are from the blind triad receipts, where all three artifacts were judged together against the frozen specification. They support artifact comparison—not claims about model intelligence in general.
          </p>
        </div>

        <div className="grid gap-px border border-border bg-border md:grid-cols-3">
          {PROVIDER_ORDER.map((provider) => (
            <div key={provider} className="bg-card p-6">
              <ProviderModel provider={provider} />
              <div className="my-8 flex items-end gap-2">
                <span className="font-mono text-5xl font-semibold">{averageScore(provider).toFixed(1)}</span>
                <span className="pb-1 font-mono text-xs text-muted-foreground">/ 100 avg</span>
              </div>
              <ScoreBar provider={provider} score={Math.round(averageScore(provider))} />
              <p className="mt-5 text-xs leading-5 text-muted-foreground">{resultCopy[provider]}</p>
            </div>
          ))}
        </div>

        <div className="mt-4 border border-border bg-card p-3 sm:p-6">
          <div className="mb-4 flex items-center justify-between gap-4">
            <div>
              <div className="mega-label">Scores by spec</div>
              <p className="mt-1 text-xs text-muted-foreground">01–10 local artifacts · 11–20 AI UX</p>
            </div>
            <span className="hidden font-mono text-[10px] uppercase tracking-wider text-muted-foreground sm:block">One receipt per group of three</span>
          </div>
          <div className="overflow-x-auto pb-2"><ScoreChart specs={data.specs} /></div>
          <p className="mt-4 border-l-2 border-destructive pl-4 text-xs leading-5 text-muted-foreground">
            Grok cells 14 and 19 are inspectable DNF artifacts whose recorded modern validator failed. Their blind artifact-quality scores remain visible but never change the failed run status.
          </p>
        </div>
      </section>

      <section className="border-y border-border bg-[#050505]">
        <div className="mx-auto grid max-w-[1600px] gap-8 px-4 py-16 sm:px-6 lg:grid-cols-[1fr_1.4fr] lg:px-8 lg:py-24">
          <div>
            <div className="mega-label mb-2">What the wins mean</div>
            <h2 className="pixel-heading text-3xl font-semibold sm:text-4xl">Pairwise calls, not a merged podium.</h2>
            <p className="mt-5 max-w-xl text-sm leading-6 text-muted-foreground">
              A single judge scored Alpha, Beta, and Gamma without provider identity. Higher total wins each pair; equal totals tie. The same context avoids score drift between separate reviews.
            </p>
            <Link href="/methodology#grading" className="mt-7 inline-flex items-center gap-2 font-mono text-xs uppercase tracking-wider text-mega-blue-text hover:text-white">
              Inspect the grading contract <ArrowRight className="size-4" />
            </Link>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="border border-border bg-black p-4">
              <div className="mega-label text-center">Opus vs Grok</div>
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
              <div className="mega-label text-center">Grok vs Sol</div>
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

      <section id="matrix" className="scroll-mt-20 mx-auto max-w-[1600px] px-4 py-16 sm:px-6 lg:px-8 lg:py-24">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-5">
          <div>
            <div className="mega-label mb-2">The complete matrix</div>
            <h2 className="pixel-heading text-3xl font-semibold sm:text-4xl">Dig into every build.</h2>
          </div>
          <div className="flex gap-4 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
            <span><i className="mr-1 inline-block size-2 bg-mega-blue-text" /> Opus</span>
            <span><i className="mr-1 inline-block size-2 bg-mega-green" /> Grok</span>
            <span><i className="mr-1 inline-block size-2 bg-mega-offwhite" /> Sol</span>
          </div>
        </div>
        <p className="mb-4 border border-destructive/50 bg-destructive/10 p-3 font-mono text-[10px] leading-5 uppercase tracking-wider text-red-300">
          Disclosure: Grok 14 and Grok 19 are staged for inspection despite recorded validation failures. Both are marked FAILED below and on their deep-dive pages.
        </p>

        <div className="overflow-hidden border border-border">
          <div className="hidden grid-cols-[70px_minmax(240px,1fr)_repeat(3,88px)_150px_88px] border-b border-border bg-surface-1 px-4 py-3 font-mono text-[10px] uppercase tracking-wider text-muted-foreground md:grid">
            <span>Spec</span><span>Product</span><span>Opus</span><span>Grok</span><span>Sol</span><span>Pairwise</span><span>Prompt</span>
          </div>
          {data.specs.map((spec) => (
            <div
              key={spec.id}
              className="group relative grid gap-4 border-b border-border bg-card p-4 transition-colors last:border-b-0 hover:bg-surface-1 md:grid-cols-[70px_minmax(240px,1fr)_repeat(3,88px)_150px_88px] md:items-center md:gap-0"
            >
              <Link
                href={`/specs/${spec.id}`}
                aria-label={`Open spec ${spec.id}: ${spec.title}`}
                className="absolute inset-0 z-0"
              />
              <div className="font-mono text-lg font-semibold text-mega-blue-text">{spec.id}</div>
              <div className="min-w-0 pr-5">
                <div className="truncate text-sm font-medium">{spec.title}</div>
                <div className="mt-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{eraLabel(spec.era)} · {spec.track ?? spec.kind}</div>
              </div>
              {PROVIDER_ORDER.map((provider) => {
                const failed = artifactFailed(spec, provider);
                return (
                  <div key={provider} className="flex items-center justify-between gap-3 md:block">
                    <span className="mega-label md:hidden">{PROVIDER_SHORT[provider]}</span>
                    <span className="font-mono text-xl font-semibold">{spec.triad.providers[provider].score}</span>
                    {failed && <span className="ml-2 font-mono text-[9px] font-semibold uppercase text-destructive md:ml-0 md:block">failed</span>}
                  </div>
                );
              })}
              <div className="text-xs leading-5 text-muted-foreground">
                <span className="text-foreground">{winnerLabel(spec.pairwise.claude_vs_grok)}</span> / {winnerLabel(spec.pairwise.grok_vs_codex)}
              </div>
              <div className="relative z-10 flex items-center justify-end gap-2">
                <RunThisPrompt spec={spec} variant="icon" />
                <ChevronRight className="hidden size-4 text-muted-foreground transition-transform group-hover:translate-x-1 group-hover:text-foreground md:block" />
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="mega-grid border-t border-border">
        <div className="mx-auto max-w-[1600px] px-4 py-20 sm:px-6 lg:px-8">
          <div className="grid gap-10 lg:grid-cols-[1fr_1fr] lg:items-center">
            <div>
              <div className="mega-label mb-3 text-mega-blue-text">Evidence before conclusion</div>
              <h2 className="pixel-heading max-w-2xl text-3xl font-semibold sm:text-5xl">Don&apos;t trust the chart. Open the work.</h2>
              <p className="mt-5 max-w-xl text-sm leading-6 text-muted-foreground">Each deep dive puts all three staged artifacts, full rubric scores, judge rationales, receipt metadata, validator status, and the frozen prompt on one page.</p>
            </div>
            <div className="grid gap-px border border-border bg-border sm:grid-cols-3">
              {[
                [Play, "60", "staged artifacts"],
                [LockKeyhole, "20", "blind triad receipts"],
                [Layers3, "3", "providers"],
              ].map(([Icon, value, label]) => (
                <div key={String(label)} className="bg-black p-6">
                  <Icon className="mb-7 size-5 text-mega-blue-text" />
                  <div className="font-mono text-3xl font-semibold">{String(value)}</div>
                  <div className="mega-label mt-1">{String(label)}</div>
                </div>
              ))}
            </div>
          </div>
          <Separator className="my-12" />
          <Link href="/specs/01" className="inline-flex items-center gap-2 font-mono text-xs uppercase tracking-wider text-mega-blue-text hover:text-white">
            Start with Signal Garden <ArrowRight className="size-4" />
          </Link>
        </div>
      </section>
    </>
  );
}
