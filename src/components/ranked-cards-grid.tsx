"use client";

import { useLayoutEffect, useRef } from "react";
import { ProviderMark } from "@/components/provider-icon";
import { AnimatedNumber } from "@/components/animated-number";
import {
  PROVIDER_COLOR,
  type ComparableProviderKey,
  type DecisionMetricKey,
} from "@/lib/data";
import { Sparkles, TimerReset, BadgeDollarSign } from "lucide-react";

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

  // FLIP Layout Animation (Strictly locked to X axis)
  useLayoutEffect(() => {
    const cards = cardRefs.current;
    const prevRects = prevRectsRef.current;
    const containerWidth = containerRef.current?.getBoundingClientRect().width || 1200;

    // Invert & Play
    cards.forEach((cardEl, providerKey) => {
      if (!cardEl) return;
      const currentRect = cardEl.getBoundingClientRect();
      const prevRect = prevRects.get(providerKey);

      if (prevRect) {
        const deltaX = prevRect.left - currentRect.left;
        const clampedDeltaX = Math.max(-containerWidth, Math.min(containerWidth, deltaX));

        if (Math.abs(clampedDeltaX) > 0.5) {
          // Invert: position element at its previous horizontal coordinate ONLY (deltaY = 0)
          cardEl.style.transform = `translate3d(${clampedDeltaX}px, 0px, 0)`;
          cardEl.style.transition = "none";
          cardEl.style.zIndex = "20";

          // Force reflow
          void cardEl.offsetHeight;

          // Play: animate to final coordinate (0, 0)
          requestAnimationFrame(() => {
            cardEl.style.transition =
              "transform 600ms cubic-bezier(0.25, 1, 0.5, 1), box-shadow 600ms ease-out, border-color 600ms ease-out";
            cardEl.style.transform = "translate3d(0px, 0px, 0)";
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
        const color = PROVIDER_COLOR[result.provider];
        const isLeader = index === 0;

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
              {/* Clean Provider & Score Row */}
              <div className="flex items-center justify-between gap-3 pt-1">
                <div className="min-w-0">
                  <ProviderMark provider={result.provider} />
                </div>
                <div className="shrink-0 text-right font-mono text-5xl font-bold tabular-nums tracking-tight">
                  {result.score === null ? (
                    "—"
                  ) : (
                    <span style={{ color: isLeader ? color : "#ffffff" }}>
                      <AnimatedNumber value={result.score} decimals={1} />
                    </span>
                  )}
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
