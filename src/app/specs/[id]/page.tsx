import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ExternalLink,
  FileJson2,
  Hash,
  Minus,
  Trophy,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { RubricChart } from "@/components/battle-charts";
import { SpecPostureCards } from "@/components/spec-posture-cards";
import { MiniPostureSelector } from "@/components/mini-posture-selector";
import { DemoCompare } from "@/components/demo-compare";
import { PairwiseMark, WinnerMark } from "@/components/provider-icon";
import { ProviderGradeCard, ProviderMark } from "@/components/provider-result";
import { RunThisPrompt } from "@/components/run-this-prompt";
import {
  PROVIDER_ORDER,
  data,
  eraLabel,
  formatDuration,
} from "@/lib/data";

export function generateStaticParams() {
  return data.specs.map((spec) => ({ id: spec.id }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const spec = data.specs.find((row) => row.id === id);
  if (!spec) return { title: "Spec not found" };
  return {
    title: `${spec.id} · ${spec.title}`,
    description: `Compare the Opus 5, Grok 4.6, and GPT-5.6 Sol builds for ${spec.title}.`,
  };
}


export default async function SpecPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const specIndex = data.specs.findIndex((row) => row.id === id);
  if (specIndex === -1) notFound();
  const spec = data.specs[specIndex];
  const previous = data.specs[specIndex - 1];
  const next = data.specs[specIndex + 1];

  return (
    <>
      <section className="mega-grid border-b border-border">
        <div className="mx-auto max-w-[1600px] px-4 py-12 sm:px-6 sm:py-16 lg:px-8">
          <div className="mb-9 flex flex-wrap items-center justify-between gap-4">
            <Link href="/#matrix" className="inline-flex items-center gap-2 font-mono text-xs uppercase tracking-wider text-muted-foreground hover:text-foreground">
              <ArrowLeft className="size-4" /> All results
            </Link>
            <MiniPostureSelector variant="compact" showLeader={false} />
          </div>
          <div className="grid gap-8 lg:grid-cols-[1fr_auto] lg:items-end">
            <div>
              <div className="mega-label mb-3 text-mega-blue-text">Spec {spec.id} · {eraLabel(spec.era)} · {spec.track ?? spec.kind}</div>
              <h1 className="pixel-heading max-w-5xl text-4xl font-semibold text-balance sm:text-6xl">{spec.title}</h1>
              <div className="mt-6 flex flex-wrap items-center gap-2">
                <Badge variant="outline" className="rounded-none font-mono text-[10px] uppercase">Frozen prompt</Badge>
                <Badge variant="outline" className="rounded-none font-mono text-[10px] uppercase">3 blind aliases</Badge>
                <Badge variant="outline" className="rounded-none font-mono text-[10px] uppercase">100-point rubric</Badge>
              </div>
            </div>
            <div className="grid min-w-[300px] grid-cols-2 border border-border bg-black">
              <div className="border-r border-border p-4">
                <div className="mega-label"><PairwiseMark left="claude" right="grok" /></div>
                <div className="mt-2 flex items-center gap-2 font-mono text-sm">
                  <Trophy className="size-4 text-muted-foreground" />
                  <WinnerMark value={spec.pairwise.claude_vs_grok} />
                </div>
              </div>
              <div className="p-4">
                <div className="mega-label"><PairwiseMark left="grok" right="codex" /></div>
                <div className="mt-2 flex items-center gap-2 font-mono text-sm">
                  <Trophy className="size-4 text-muted-foreground" />
                  <WinnerMark value={spec.pairwise.grok_vs_codex} />
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <SpecPostureCards spec={spec} />

      <section className="border-y border-border bg-[#050505]">
        <div className="mx-auto max-w-[1600px] px-4 py-14 sm:px-6 lg:px-8 lg:py-20">
          <DemoCompare spec={spec} />
          <div className="mt-10">
            <RunThisPrompt spec={spec} variant="panel" />
          </div>
        </div>
      </section>

      <section className="mx-auto grid max-w-[1600px] gap-8 px-4 py-14 sm:px-6 lg:grid-cols-[1.2fr_.8fr] lg:px-8 lg:py-20">
        <article className="border border-border bg-card p-4 sm:p-6">
          <div className="mb-6">
            <div className="mega-label mb-2">Category comparison</div>
            <h2 className="pixel-heading text-2xl font-semibold sm:text-3xl">Rubric score breakdown.</h2>
          </div>
          <div className="overflow-x-auto">
            <div className="min-w-[650px]"><RubricChart spec={spec} /></div>
          </div>
        </article>
        <article className="flex flex-col border border-border bg-card p-6">
          <div className="mega-label mb-5">Judge&apos;s comparative note</div>
          <blockquote className="flex-1 text-base leading-7 text-foreground">“{spec.triad.comparative_note}”</blockquote>
          {spec.triad.limitations.length > 0 && (
            <div className="mt-8 border-t border-border pt-5">
              <div className="mega-label mb-3">Review limitations</div>
              <ul className="space-y-3 text-xs leading-5 text-muted-foreground">
                {spec.triad.limitations.map((limitation) => (
                  <li key={limitation} className="flex gap-2"><Minus className="mt-1 size-3 shrink-0" />{limitation}</li>
                ))}
              </ul>
            </div>
          )}
        </article>
      </section>

      <section className="border-y border-border bg-[#050505]">
        <div className="mx-auto max-w-[1600px] px-4 py-14 sm:px-6 lg:px-8 lg:py-20">
          <div className="mb-7">
            <div className="mega-label mb-2">Run receipts</div>
            <h2 className="pixel-heading text-2xl font-semibold sm:text-3xl">Run execution receipts.</h2>
          </div>
          <div className="grid gap-px border border-border bg-border lg:grid-cols-3">
            {PROVIDER_ORDER.map((provider) => {
              const cell = spec.cells[provider];
              return (
                <article key={provider} className="bg-black p-6">
                  <ProviderMark provider={provider} />
                  <dl className="mt-6 space-y-3 font-mono text-[11px]">
                    <div className="flex items-start justify-between gap-3"><dt className="text-muted-foreground">Cell</dt><dd className="text-right">{cell.cell_id}</dd></div>
                    <div className="flex items-start justify-between gap-3"><dt className="text-muted-foreground">Outcome</dt><dd>{cell.classification ?? cell.verdict ?? "—"}</dd></div>
                    <div className="flex items-start justify-between gap-3"><dt className="text-muted-foreground">Duration</dt><dd>{formatDuration(cell.duration_seconds)}</dd></div>
                    <div className="flex items-start justify-between gap-3">
                      <dt className="text-muted-foreground">Cost</dt>
                      <dd className="text-right">
                        {cell.cost_usd ? `$${Number(cell.cost_usd).toFixed(2)}` : "unavailable"}
                        {cell.cost_source?.includes("list-rate-equivalent") ? (
                          <div className="mt-1 text-[10px] text-muted-foreground">list-rate equivalent</div>
                        ) : cell.cost_source === "provider-receipt" ? (
                          <div className="mt-1 text-[10px] text-muted-foreground">provider receipt</div>
                        ) : cell.cost_source ? (
                          <div className="mt-1 text-[10px] text-muted-foreground">published-rate estimate</div>
                        ) : null}
                      </dd>
                    </div>
                    {cell.reported_model && <div className="flex items-start justify-between gap-3"><dt className="text-muted-foreground">Resolved</dt><dd className="max-w-[180px] text-right">{cell.reported_model}</dd></div>}
                  </dl>
                </article>
              );
            })}
          </div>
          <p className="mt-4 text-xs leading-5 text-muted-foreground">
            Grok, Opus, and Sol durations enter the decision-lab time weight as summed recorded wall seconds. Grok ran on the same machine after the August 13 reboot. Each spec was run once through each agent&apos;s main tool, so provider load and time of day remain in the clocks. Grok and Sol costs are published token-rate math, not invoices; both enter the cost composite. Opus costs are Anthropic provider receipts.
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-[1600px] px-4 py-14 sm:px-6 lg:px-8 lg:py-20">
        <div className="grid gap-6 lg:grid-cols-[.7fr_1.3fr]">
          <div>
            <div className="mega-label mb-2">Frozen input</div>
            <h2 className="pixel-heading text-2xl font-semibold sm:text-3xl">Frozen specification prompt.</h2>
            <div className="mt-5 space-y-3 font-mono text-[10px] leading-5 text-muted-foreground">
              <div className="flex items-start gap-2"><Hash className="mt-0.5 size-3 shrink-0" /><span className="break-all">{spec.spec_sha256}</span></div>
              <div className="flex items-start gap-2"><FileJson2 className="mt-0.5 size-3 shrink-0" /><span>{spec.triad.receipt}</span></div>
              <div className="flex items-start gap-2"><Check className="mt-0.5 size-3 shrink-0" /><span>{spec.triad.schema}</span></div>
            </div>
          </div>
          <RunThisPrompt spec={spec} variant="panel" />
        </div>
      </section>

      <section className="mega-grid border-t border-border">
        <div className="mx-auto flex max-w-[1600px] flex-col gap-3 px-4 py-12 sm:px-6 sm:flex-row sm:justify-between lg:px-8">
          {previous ? (
            <Link href={`/specs/${previous.id}`} className="group flex min-w-0 items-center gap-3 border border-border bg-black p-4 hover:border-mega-blue-text sm:w-[48%]">
              <ArrowLeft className="size-4 shrink-0 transition-transform group-hover:-translate-x-1" />
              <span className="min-w-0"><span className="mega-label">Previous · {previous.id}</span><span className="block truncate text-sm">{previous.title}</span></span>
            </Link>
          ) : <span />}
          {next ? (
            <Link href={`/specs/${next.id}`} className="group flex min-w-0 items-center justify-end gap-3 border border-border bg-black p-4 text-right hover:border-mega-blue-text sm:w-[48%]">
              <span className="min-w-0"><span className="mega-label">Next · {next.id}</span><span className="block truncate text-sm">{next.title}</span></span>
              <ArrowRight className="size-4 shrink-0 transition-transform group-hover:translate-x-1" />
            </Link>
          ) : <Link href="/" className="flex items-center gap-2 border border-border bg-black p-4 text-sm hover:border-mega-blue-text">Back to overview <ExternalLink className="size-4" /></Link>}
        </div>
      </section>
    </>
  );
}
