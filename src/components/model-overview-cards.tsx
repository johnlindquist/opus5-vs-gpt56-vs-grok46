"use client";

import { usePosture } from "@/context/posture-context";
import { ProviderModel, ScoreBar } from "@/components/provider-result";
import { Badge } from "@/components/ui/badge";
import {
  PROVIDER_COLOR,
  PROVIDER_ORDER,
  PROVIDER_SHORT,
  averageScore,
  type ProviderKey,
} from "@/lib/data";
import { Trophy, Sparkles, TimerReset, BadgeDollarSign } from "lucide-react";
import { AnimatedNumber } from "@/components/animated-number";

export function ModelOverviewCards() {
  const { postureResult, displayName, displayBadge, viewMode, setViewMode } = usePosture();
  const isRawMode = viewMode === "raw";

  return (
    <div className="space-y-4">
      {/* 3 Model Overview Summary Cards */}
      <div className="grid gap-px border border-border bg-border md:grid-cols-3">
        {PROVIDER_ORDER.map((provider) => {
          const color = PROVIDER_COLOR[provider];
          const rawAvg = averageScore(provider);
          const postureScore = postureResult.providerScores[provider];
          const rankItem = postureResult.ranking.find((r) => r.provider === provider);
          const rank = rankItem?.rank ?? 1;
          const contributions = postureResult.providerContributions[provider];

          const displayScore = isRawMode ? rawAvg : postureScore;

          return (
            <div
              key={provider}
              className="relative bg-card p-6 transition-colors hover:bg-surface-1"
              style={{ borderTop: `3px solid ${color}` }}
            >
              <div className="flex items-start justify-between">
                <ProviderModel provider={provider} />
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
                        <Trophy className="size-3 text-amber-400" /> Rank #1
                      </span>
                    ) : (
                      `Rank #${rank}`
                    )}
                  </Badge>
                )}
              </div>

              <div className="my-6 flex items-end gap-2">
                <span className="font-mono text-5xl font-bold" style={{ color }}>
                  <AnimatedNumber value={displayScore} decimals={1} />
                </span>
                <span className="pb-1 font-mono text-xs text-muted-foreground">
                  {isRawMode ? "/ 100 raw avg" : "/ 100 posture score"}
                </span>
              </div>

              <ScoreBar provider={provider} score={Math.round(displayScore)} />

              {!isRawMode ? (
                <div className="mt-4 grid grid-cols-3 gap-1 border-t border-border/60 pt-3 font-mono text-[10px]">
                  <div className="bg-black/40 p-1.5 text-center">
                    <span className="block text-muted-foreground">Quality</span>
                    <span className="font-bold text-foreground">
                      <AnimatedNumber value={contributions.quality} decimals={1} />
                    </span>
                  </div>
                  <div className="bg-black/40 p-1.5 text-center">
                    <span className="block text-muted-foreground">Speed</span>
                    <span className="font-bold text-foreground">
                      <AnimatedNumber value={contributions.speed} decimals={1} />
                    </span>
                  </div>
                  <div className="bg-black/40 p-1.5 text-center">
                    <span className="block text-muted-foreground">Cost</span>
                    <span className="font-bold text-foreground">
                      <AnimatedNumber value={contributions.cost} decimals={1} />
                    </span>
                  </div>
                </div>
              ) : (
                <p className="mt-4 text-xs leading-5 text-muted-foreground">
                  Raw blind-triad average across all twenty specifications.
                </p>
              )}

              <div className="mt-3 flex items-center justify-between font-mono text-[10px] text-muted-foreground">
                <span>Raw grade: {rawAvg.toFixed(1)}/100</span>
                {!isRawMode && <span>Utility: {(postureScore / 100).toFixed(3)}</span>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
