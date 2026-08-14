"use client";

import { useLayoutEffect, useRef, useEffect, useState } from "react";
import { ProviderMark } from "@/components/provider-icon";
import { AnimatedNumber } from "@/components/animated-number";
import {
  PROVIDER_COLOR,
  type ComparableProviderKey,
  type DecisionMetricKey,
} from "@/lib/data";
import { Trophy, TrendingUp, TrendingDown, Minus, Sparkles, TimerReset, BadgeDollarSign } from "lucide-react";

interface RankedResultItem {
  provider: ComparableProviderKey;
  stableIndex: number;
  score: number | null;
  contributions: Record<DecisionMetricKey, number | null>;
}

interface RankedCardsGridProps {
  ranking: RankedResultItem[];
  metricOrder: DecisionMetricKey[];
  metricMeta: Record<
    DecisionMetricKey,
    {
      label: string;
      shortLabel: string;
      description: string;
      icon: typeof Sparkles;
    }
  >;
}

export function RankedCardsGrid({
  ranking,
  metricOrder,
  metricMeta,
}: RankedCardsGridProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<Map<string, HTMLElement>>(new Map());
  const prevRectsRef = useRef<Map<string, DOMRect>>(new Map());
  const prevRanksRef = useRef<Map<string, number>>(new Map());
  const [rankDeltas, setRankDeltas] = useState<Record<string, number>>({});

  // Compute rank changes
  useEffect(() => {
    const newDeltas: Record<string, number> = {};
    ranking.forEach((item, index) => {
      const currentRank = index + 1;
      const prevRank = prevRanksRef.current.get(item.provider);
      if (prevRank !== undefined) {
        newDeltas[item.provider] = prevRank - currentRank; // Positive = climbed, negative = dropped
      }
      prevRanksRef.current.set(item.provider, currentRank);
    });
    setRankDeltas(newDeltas);
  }, [ranking]);

  // FLIP Layout Animation
  useLayoutEffect(() => {
    const cards = cardRefs.current;
    const prevRects = prevRectsRef.current;

    // Invert & Play
    cards.forEach((cardEl, providerKey) => {
      if (!cardEl) return;
      const currentRect = cardEl.getBoundingClientRect();
      const prevRect = prevRects.get(providerKey);

      if (prevRect) {
        const deltaX = prevRect.left - currentRect.left;
        const deltaY = prevRect.top - currentRect.top;

        if (Math.abs(deltaX) > 0.5 || Math.abs(deltaY) > 0.5) {
          // Invert: position element at its previous coordinates
          cardEl.style.transform = `translate3d(${deltaX}px, ${deltaY}px, 0)`;
          cardEl.style.transition = "none";
          cardEl.style.zIndex = "20";

          // Force reflow
          void cardEl.offsetHeight;

          // Play: animate to final coordinate (0, 0)
          requestAnimationFrame(() => {
            cardEl.style.transition =
              "transform 650ms cubic-bezier(0.22, 1, 0.36, 1), box-shadow 650ms ease-out, border-color 650ms ease-out";
            cardEl.style.transform = "translate3d(0, 0, 0)";
            cardEl.style.zIndex = "1";
          });
        }
      }

      // Record new rect
      prevRects.set(providerKey, currentRect);
    });
  }, [ranking]);

  const setCardRef = (key: string) => (el: HTMLElement | null) => {
    if (el) {
      cardRefs.current.set(key, el);
    } else {
      cardRefs.current.delete(key);
    }
  };

  return (
    <div
      ref={containerRef}
      className="mt-7 grid gap-3 lg:grid-cols-3 relative"
      aria-live="polite"
      aria-atomic="true"
    >
      {ranking.map((result, index) => {
        const rank = index + 1;
        const delta = rankDeltas[result.provider] ?? 0;
        const color = PROVIDER_COLOR[result.provider];
        const isLeader = rank === 1;

        return (
          <article
            key={result.provider}
            ref={setCardRef(result.provider)}
            className={`relative flex flex-col justify-between overflow-hidden border bg-black p-5 transition-colors ${
              isLeader
                ? "border-foreground/80 shadow-[0_0_25px_rgba(255,255,255,0.06)]"
                : "border-border hover:border-border/80"
            }`}
            style={{
              willChange: "transform",
            }}
          >
            {/* Top progress bar */}
            <div
              className="absolute inset-x-0 top-0 h-1 origin-left transition-transform duration-500 ease-out"
              style={{
                backgroundColor: color,
                transform: `scaleX(${result.score === null ? 0 : result.score / 100})`,
              }}
              aria-hidden="true"
            />

            <div>
              {/* Header row: Rank + Provider + Score */}
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span
                      className={`mega-label whitespace-nowrap ${
                        isLeader ? "text-foreground font-bold" : "text-muted-foreground"
                      }`}
                    >
                      {isLeader ? (
                        <span className="inline-flex items-center gap-1 text-amber-300">
                          <Trophy className="size-3" /> Rank 1 · Leader
                        </span>
                      ) : (
                        `Rank ${rank}`
                      )}
                    </span>

                    {/* Rank change badge */}
                    {delta !== 0 && (
                      <span
                        className={`inline-flex items-center gap-0.5 px-1.5 py-0.2 font-mono text-[9px] font-bold ${
                          delta > 0
                            ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
                            : "bg-rose-500/15 text-rose-400 border border-rose-500/30"
                        }`}
                        title={
                          delta > 0
                            ? `Climbed ${delta} ${delta === 1 ? "position" : "positions"}`
                            : `Dropped ${Math.abs(delta)} ${Math.abs(delta) === 1 ? "position" : "positions"}`
                        }
                      >
                        {delta > 0 ? (
                          <>
                            <TrendingUp className="size-2.5" /> +{delta}
                          </>
                        ) : (
                          <>
                            <TrendingDown className="size-2.5" /> {delta}
                          </>
                        )}
                      </span>
                    )}
                  </div>

                  <div className="mt-2 text-base font-semibold">
                    <ProviderMark provider={result.provider} />
                  </div>
                </div>

                <div className="shrink-0 text-right">
                  <div
                    className="font-mono text-4xl font-semibold tabular-nums"
                    style={{ color: isLeader ? color : undefined }}
                  >
                    {result.score === null ? (
                      "—"
                    ) : (
                      <AnimatedNumber value={result.score} decimals={1} />
                    )}
                  </div>
                  <div className="mega-label whitespace-nowrap">weighted utility / 100</div>
                </div>
              </div>
            </div>

            {/* Metric breakdown grid: Quality, Speed, Cost */}
            <div className="mt-6 grid grid-cols-3 gap-px bg-border">
              {metricOrder.map((metric) => {
                const contribution = result.contributions[metric];
                return (
                  <div key={metric} className="bg-card p-3">
                    <div className="mega-label">{metricMeta[metric].shortLabel}</div>
                    <div className="mt-1 font-mono text-sm tabular-nums">
                      {contribution === null ? (
                        "n/a"
                      ) : (
                        <AnimatedNumber value={contribution} decimals={1} />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </article>
        );
      })}
    </div>
  );
}
