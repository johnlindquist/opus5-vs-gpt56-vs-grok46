"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ChevronRight, ArrowUpDown } from "lucide-react";
import { usePosture } from "@/context/posture-context";
import { ProviderMark, WinnerMark } from "@/components/provider-icon";
import { MiniPostureSelector } from "@/components/mini-posture-selector";
import { RunThisPrompt } from "@/components/run-this-prompt";
import {
  PROVIDER_COLOR,
  PROVIDER_ORDER,
  PROVIDER_SHORT,
  artifactFailed,
  eraLabel,
  type ProviderKey,
  type SpecRow,
} from "@/lib/data";

type MatrixSort = "id" | "claude" | "grok" | "codex" | "winner";

export function SpecificationMatrix({ specs }: { specs: SpecRow[] }) {
  const { postureResult, viewMode, setViewMode, displayName, displayBadge } = usePosture();
  const isRawMode = viewMode === "raw";

  const [sort, setSort] = useState<MatrixSort>("id");

  const specMap = useMemo(() => {
    return new Map(postureResult.specBreakdowns.map((b) => [b.specId, b]));
  }, [postureResult]);

  const filteredSpecs = useMemo(() => {
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
    } else {
      result.sort((a, b) => Number(a.id) - Number(b.id));
    }

    return result;
  }, [specs, sort, isRawMode, specMap]);

  return (
    <section id="matrix" className="scroll-mt-20 mx-auto max-w-[1600px] px-4 py-16 sm:px-6 lg:px-8 lg:py-24">
      <div className="mb-8 flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
        <div>
          <div className="mega-label mb-2">Specification matrix</div>
          <h2 className="pixel-heading text-3xl font-semibold sm:text-4xl">
            Compare all 20 builds side-by-side.
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Every specification scored across Quality, Duration, and Cost under your active{" "}
            <strong className="text-foreground">{displayName}</strong> posture ({displayBadge}). Click any column header or sort option to reorder the benchmark directory.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <MiniPostureSelector variant="inline" label="Posture" showLeader={false} />


          <div className="flex items-center border border-border bg-black p-0.5 font-mono text-[10px]">
            <button
              type="button"
              onClick={() => setViewMode("posture")}
              className={`px-2 py-1 uppercase transition-colors ${
                !isRawMode ? "bg-foreground text-background font-bold" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Posture Scores
            </button>
            <button
              type="button"
              onClick={() => setViewMode("raw")}
              className={`px-2 py-1 uppercase transition-colors ${
                isRawMode ? "bg-foreground text-background font-bold" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Raw Grades
            </button>
          </div>
        </div>
      </div>

      <div className="overflow-hidden border border-border">
        <div className="hidden grid-cols-[70px_minmax(240px,1fr)_repeat(3,100px)_160px_88px] border-b border-border bg-surface-1 px-4 py-3 font-mono text-[10px] uppercase tracking-wider text-muted-foreground md:grid">
          <span>Spec</span>
          <span>Product</span>
          <button
            type="button"
            onClick={() => setSort(sort === "claude" ? "id" : "claude")}
            className="inline-flex items-center gap-1 hover:text-foreground text-left"
          >
            <ProviderMark provider="claude" compact />
            <ArrowUpDown className="size-2.5" />
          </button>
          <button
            type="button"
            onClick={() => setSort(sort === "grok" ? "id" : "grok")}
            className="inline-flex items-center gap-1 hover:text-foreground text-left"
          >
            <ProviderMark provider="grok" compact />
            <ArrowUpDown className="size-2.5" />
          </button>
          <button
            type="button"
            onClick={() => setSort(sort === "codex" ? "id" : "codex")}
            className="inline-flex items-center gap-1 hover:text-foreground text-left"
          >
            <ProviderMark provider="codex" compact />
            <ArrowUpDown className="size-2.5" />
          </button>
          <span>{isRawMode ? "Head-to-head Calls" : "Posture Winner"}</span>
          <span className="text-right">Action</span>
        </div>

        {filteredSpecs.map((spec) => {
          const breakdown = specMap.get(spec.id);

          return (
            <div
              key={spec.id}
              className="group relative grid gap-4 border-b border-border bg-card p-4 transition-colors last:border-b-0 hover:bg-surface-1 md:grid-cols-[70px_minmax(240px,1fr)_repeat(3,100px)_160px_88px] md:items-center md:gap-0"
            >
              <Link
                href={`/specs/${spec.id}`}
                aria-label={`Open spec ${spec.id}: ${spec.title}`}
                className="absolute inset-0 z-0"
              />
              <div className="font-mono text-lg font-bold text-foreground">{spec.id}</div>
              <div className="min-w-0 pr-5">
                <div className="truncate text-sm font-semibold text-foreground group-hover:underline">
                  {spec.title}
                </div>
                <div className="mt-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                  {eraLabel(spec.era)} · {spec.track ?? spec.kind}
                </div>
              </div>

              {PROVIDER_ORDER.map((provider) => {
                const failed = artifactFailed(spec, provider);
                const grade = spec.triad.providers[provider];
                const score = isRawMode
                  ? grade.score
                  : (breakdown?.scores[provider] ?? grade.score);
                const color = PROVIDER_COLOR[provider];

                return (
                  <div key={provider} className="flex items-center justify-between gap-3 md:block">
                    <span className="mega-label md:hidden">
                      <ProviderMark provider={provider} compact />
                    </span>
                    <div>
                      <span
                        className="font-mono text-lg font-bold"
                        style={{ color: failed ? "#f43f5e" : color }}
                      >
                        {typeof score === "number" ? score.toFixed(1) : score}
                      </span>
                      {!isRawMode && (
                        <span className="ml-1.5 font-mono text-[9px] text-muted-foreground">
                          (Gr {grade.letter})
                        </span>
                      )}
                    </div>
                    {failed && (
                      <span className="ml-2 font-mono text-[9px] font-bold uppercase text-destructive md:ml-0 md:block">
                        DNF
                      </span>
                    )}
                  </div>
                );
              })}

              <div className="text-xs leading-5 text-muted-foreground">
                {isRawMode ? (
                  <span className="inline-flex flex-wrap items-center gap-1 font-mono text-foreground">
                    <WinnerMark value={spec.pairwise.claude_vs_grok} />
                    <span className="text-muted-foreground">/</span>
                    <WinnerMark value={spec.pairwise.grok_vs_codex} />
                  </span>
                ) : (
                  breakdown && (
                    <span className="inline-flex items-center gap-1.5 font-mono text-xs font-bold uppercase">
                      {breakdown.winner !== "tie" ? (
                        <span style={{ color: PROVIDER_COLOR[breakdown.winner] }}>
                          ★ {PROVIDER_SHORT[breakdown.winner]} Leads
                        </span>
                      ) : (
                        <span className="text-muted-foreground">Tie</span>
                      )}
                    </span>
                  )
                )}
              </div>

              <div className="relative z-10 flex items-center justify-end gap-2">
                <RunThisPrompt spec={spec} variant="icon" />
                <ChevronRight className="hidden size-4 text-muted-foreground transition-transform group-hover:translate-x-1 group-hover:text-foreground md:block" />
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
