"use client";

import { usePosture } from "@/context/posture-context";
import { MiniPostureSelector } from "@/components/mini-posture-selector";
import { ProviderMark } from "@/components/provider-icon";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  PROVIDER_COLOR,
  PROVIDER_ORDER,
  PROVIDER_SHORT,
  artifactFailed,
  formatDuration,
  type ProviderKey,
  type SpecRow,
} from "@/lib/data";
import { Trophy, Clock, DollarSign, Award } from "lucide-react";

export function SpecPostureCards({ spec }: { spec: SpecRow }) {
  const { postureResult, viewMode, setViewMode, displayName, displayBadge } = usePosture();
  const isRawMode = viewMode === "raw";

  const breakdown = postureResult.specBreakdowns.find((s) => s.specId === spec.id);

  return (
    <section className="mx-auto max-w-[1600px] px-4 py-14 sm:px-6 lg:px-8 lg:py-20">
      <div className="mb-6 flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
        <div>
          <div className="mega-label mb-2">Blind triad grade & posture evaluation</div>
          <h2 className="pixel-heading text-2xl font-semibold sm:text-3xl">
            Three artifacts, one review context.
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Three artifacts evaluated blind in a single review context and scored under active posture weights.
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
              Posture Score
            </button>
            <button
              type="button"
              onClick={() => setViewMode("raw")}
              className={`px-2 py-1 uppercase transition-colors ${
                isRawMode ? "bg-foreground text-background font-bold" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Raw Grade
            </button>
          </div>
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        {PROVIDER_ORDER.map((provider) => {
          const grade = spec.triad.providers[provider];
          const cell = spec.cells[provider];
          const color = PROVIDER_COLOR[provider];
          const failed = artifactFailed(spec, provider);

          const score = isRawMode
            ? grade.score
            : (breakdown?.scores[provider] ?? grade.score);

          const duration = breakdown?.durations[provider] ?? (cell?.duration_seconds ?? 0);
          const cost = breakdown?.costs[provider] ?? Number(cell?.cost_usd ?? 0);
          const contributions = breakdown?.contributions[provider];

          // Spec rank under posture
          let rank = 1;
          if (breakdown) {
            const myScore = breakdown.scores[provider];
            const higher = PROVIDER_ORDER.filter(
              (p) => p !== provider && breakdown.scores[p] > myScore,
            ).length;
            rank = higher + 1;
          }

          return (
            <Card
              key={provider}
              className="relative flex flex-col justify-between rounded-none border-border bg-card p-6 transition-colors hover:border-border/80"
              style={{ borderTop: `3px solid ${color}` }}
            >
              <div>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <ProviderMark provider={provider} />
                    <div className="mt-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                      Alias: {grade.alias} · {failed ? "FAILED" : grade.run_status}
                    </div>
                  </div>
                  {!isRawMode && (
                    <Badge
                      variant="outline"
                      className={`rounded-none font-mono text-[10px] uppercase ${
                        rank === 1
                          ? "border-amber-400/60 bg-amber-400/10 text-amber-300 font-bold"
                          : "border-border text-muted-foreground"
                      }`}
                    >
                      {rank === 1 ? (
                        <span className="flex items-center gap-1">
                          <Trophy className="size-3 text-amber-400" /> Lead
                        </span>
                      ) : (
                        `#${rank}`
                      )}
                    </Badge>
                  )}
                </div>

                <div className="my-6 flex items-baseline gap-3">
                  <span className="font-mono text-5xl font-bold" style={{ color: failed ? "#f43f5e" : color }}>
                    {typeof score === "number" ? score.toFixed(1) : score}
                  </span>
                  <span className="font-mono text-xs text-muted-foreground">
                    {isRawMode ? `/ 100 raw` : `/ 100 posture`}
                  </span>
                  <span className="ml-auto font-mono text-xs text-muted-foreground">
                    Grade <strong className="text-foreground">{grade.letter}</strong>
                  </span>
                </div>

                {/* Metric breakdown */}
                <div className="grid grid-cols-3 gap-1 border-y border-border/60 py-3 font-mono text-[10px]">
                  <div className="text-center">
                    <span className="block text-muted-foreground">Quality</span>
                    <span className="font-bold text-foreground">{grade.score}</span>
                  </div>
                  <div className="text-center">
                    <span className="block text-muted-foreground">Duration</span>
                    <span className="font-bold text-foreground">{formatDuration(duration)}</span>
                  </div>
                  <div className="text-center">
                    <span className="block text-muted-foreground">Cost</span>
                    <span className="font-bold text-foreground">
                      {cost > 0 ? `$${cost.toFixed(2)}` : "—"}
                    </span>
                  </div>
                </div>

                {!isRawMode && contributions && (
                  <div className="mt-2 flex justify-between font-mono text-[9px] text-muted-foreground">
                    <span>Q-pts: {contributions.quality.toFixed(1)}</span>
                    <span>S-pts: {contributions.speed.toFixed(1)}</span>
                    <span>C-pts: {contributions.cost.toFixed(1)}</span>
                  </div>
                )}

                <div className="mt-4">
                  <div className="mega-label mb-1">Evaluator rationale</div>
                  <p className="text-xs leading-5 text-muted-foreground line-clamp-4 hover:line-clamp-none">
                    {grade.rationale}
                  </p>
                </div>
              </div>

              <div className="mt-6 border-t border-border/60 pt-3 flex items-center justify-between font-mono text-[10px] text-muted-foreground">
                <span>Checks: {grade.checks_assessment ?? "unreported"}</span>
                <span>Cell: {cell?.cell_id ?? "—"}</span>
              </div>
            </Card>
          );
        })}
      </div>
    </section>
  );
}
