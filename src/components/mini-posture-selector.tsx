"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import {
  ChevronDown,
  ChevronRight,
  Gauge,
  RotateCcw,
  Sliders,
  Sparkles,
  TimerReset,
  BadgeDollarSign,
  Trophy,
  Check,
} from "lucide-react";
import { usePosture } from "@/context/posture-context";
import {
  POSTURE_METRIC_ORDER,
  POSTURE_PRESETS,
  type PosturePreset,
} from "@/lib/posture";
import { PROVIDER_COLOR, PROVIDER_SHORT, type DecisionMetricKey } from "@/lib/data";

const metricIcons: Record<DecisionMetricKey, typeof Sparkles> = {
  quality: Sparkles,
  speed: TimerReset,
  cost: BadgeDollarSign,
};

const metricColors: Record<DecisionMetricKey, string> = {
  quality: "#D97757", // Coral
  speed: "#818CF8",   // Indigo
  cost: "#10A37F",    // Emerald
};

/**
 * A mini 3-color segmented bar displaying the proportional weight share
 * of Quality (Coral), Speed (Indigo), and Cost (Emerald).
 */
export function PostureWeightBar({
  className = "h-1.5 w-16",
}: {
  className?: string;
}) {
  const { normalizedWeights, weightTotal } = usePosture();

  if (weightTotal === 0) {
    return <div className={`${className} bg-border`} />;
  }

  const q = normalizedWeights.quality * 100;
  const s = normalizedWeights.speed * 100;
  const c = normalizedWeights.cost * 100;

  return (
    <div className={`flex overflow-hidden bg-border ${className}`} title={`Quality: ${q.toFixed(0)}% · Speed: ${s.toFixed(0)}% · Cost: ${c.toFixed(0)}%`}>
      {q > 0 && <div style={{ width: `${q}%`, backgroundColor: metricColors.quality }} />}
      {s > 0 && <div style={{ width: `${s}%`, backgroundColor: metricColors.speed }} />}
      {c > 0 && <div style={{ width: `${c}%`, backgroundColor: metricColors.cost }} />}
    </div>
  );
}

/**
 * A small badge/chip indicating the current #1 model and score under the active posture.
 */
export function PostureLeaderChip({
  className = "",
}: {
  className?: string;
}) {
  const { postureResult } = usePosture();
  const leader = postureResult.leader;
  const color = PROVIDER_COLOR[leader.provider];

  return (
    <div className={`inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider ${className}`}>
      <span className="text-muted-foreground">Leader:</span>
      <span
        className="inline-flex items-center gap-1 font-bold"
        style={{ color }}
      >
        <Trophy className="size-3" />
        {PROVIDER_SHORT[leader.provider]} ({leader.score.toFixed(1)} pts)
      </span>
    </div>
  );
}

interface MiniPostureSelectorProps {
  /**
   * Layout variant:
   * - "inline": horizontal preset buttons + active badge (default)
   * - "compact": single clickable dropdown pill opening a popover
   * - "bar": a rich toolbar strip with presets, sliders popover, and view mode toggle
   */
  variant?: "inline" | "compact" | "bar";
  label?: string;
  showLeader?: boolean;
  showWeightBar?: boolean;
  showModeToggle?: boolean;
  className?: string;
}

export function MiniPostureSelector({
  variant = "inline",
  label = "Posture:",
  showLeader = true,
  showWeightBar = true,
  showModeToggle = false,
  className = "",
}: MiniPostureSelectorProps) {
  const {
    weights,
    preset,
    activePresetId,
    displayName,
    displayBadge,
    isPreset,
    selectPreset,
    setMetricWeight,
    postureResult,
    viewMode,
    setViewMode,
  } = usePosture();

  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [isOpen]);

  // Quick Preset Click
  const handlePresetClick = (p: PosturePreset) => {
    selectPreset(p);
  };

  /* ------------------------------------------------------------- */
  /* VARIANT: COMPACT DROPDOWN PILL                                 */
  /* ------------------------------------------------------------- */
  if (variant === "compact") {
    return (
      <div ref={dropdownRef} className={`relative inline-block ${className}`}>
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          aria-expanded={isOpen}
          aria-haspopup="dialog"
          aria-label={`Active posture: ${displayName}. Click to change.`}
          className="inline-flex items-center gap-2 border border-border bg-card px-2.5 py-1 text-left font-mono text-[11px] text-foreground transition-colors hover:border-foreground/60 focus-visible:ring-1 focus-visible:ring-foreground"
        >
          {showWeightBar && <PostureWeightBar className="h-1.5 w-8" />}
          <span className="font-semibold text-foreground">{preset ? preset.shortName : "Custom"}</span>
          <span className="text-muted-foreground">[{displayBadge}]</span>
          <ChevronDown className={`size-3 text-muted-foreground transition-transform ${isOpen ? "rotate-180" : ""}`} />
        </button>

        {isOpen && (
          <div className="absolute right-0 z-50 mt-1.5 w-72 border border-border bg-black/95 p-3 shadow-2xl backdrop-blur-xl">
            <div className="flex items-center justify-between border-b border-border pb-2">
              <span className="mega-label">Select posture preset</span>
              <Link
                href="/#decision-lab"
                onClick={() => setIsOpen(false)}
                className="font-mono text-[10px] text-muted-foreground underline hover:text-foreground"
              >
                Sliders →
              </Link>
            </div>

            <div className="mt-2 space-y-1">
              {POSTURE_PRESETS.map((p) => {
                const active = activePresetId === p.id;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => {
                      handlePresetClick(p);
                      setIsOpen(false);
                    }}
                    className={`flex w-full items-center justify-between border p-2 text-left font-mono text-xs transition-colors ${
                      active
                        ? "border-foreground bg-surface-1 font-bold text-foreground"
                        : "border-transparent bg-transparent text-muted-foreground hover:border-border hover:bg-card hover:text-foreground"
                    }`}
                  >
                    <div>
                      <div className="flex items-center gap-1.5">
                        {active && <Check className="size-3 text-foreground" />}
                        <span>{p.name}</span>
                      </div>
                      <p className="mt-0.5 text-[10px] text-muted-foreground">{p.badge}</p>
                    </div>
                    <span className="text-[10px] text-muted-foreground">
                      {p.weights.quality}/{p.weights.speed}/{p.weights.cost}
                    </span>
                  </button>
                );
              })}
            </div>

            {showLeader && (
              <div className="mt-3 border-t border-border pt-2.5">
                <PostureLeaderChip />
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  /* ------------------------------------------------------------- */
  /* VARIANT: BAR / RICH STRIP                                      */
  /* ------------------------------------------------------------- */
  if (variant === "bar") {
    return (
      <div className={`flex flex-wrap items-center justify-between gap-3 border border-border bg-card p-3 sm:p-4 ${className}`}>
        <div className="flex flex-wrap items-center gap-3">
          {label && (
            <span className="flex items-center gap-1.5 font-mono text-xs font-semibold text-foreground uppercase tracking-wider">
              <Sliders className="size-3.5 text-muted-foreground" />
              {label}
            </span>
          )}

          {showWeightBar && <PostureWeightBar className="h-2 w-14" />}

          {/* Quick Preset Buttons */}
          <div className="flex flex-wrap items-center gap-1">
            {POSTURE_PRESETS.map((p) => {
              const active = activePresetId === p.id;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => handlePresetClick(p)}
                  className={`border px-2.5 py-1 font-mono text-[11px] uppercase transition-colors ${
                    active
                      ? "border-foreground bg-foreground font-bold text-background"
                      : "border-border bg-card text-muted-foreground hover:border-foreground/50 hover:text-foreground"
                  }`}
                  title={`${p.name} (${p.description}) — Quality: ${p.weights.quality} / Speed: ${p.weights.speed} / Cost: ${p.weights.cost}`}
                >
                  {p.shortName}
                </button>
              );
            })}
          </div>

          <span className="font-mono text-xs text-muted-foreground">
            [{displayBadge}]
          </span>
        </div>

        <div className="flex items-center gap-3">
          {showLeader && <PostureLeaderChip />}

          {showModeToggle && (
            <div className="flex items-center border border-border bg-black p-0.5 font-mono text-[10px]">
              <button
                type="button"
                onClick={() => setViewMode("posture")}
                className={`px-2 py-0.5 uppercase transition-colors ${
                  viewMode === "posture" ? "bg-foreground text-background font-bold" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Posture Score
              </button>
              <button
                type="button"
                onClick={() => setViewMode("raw")}
                className={`px-2 py-0.5 uppercase transition-colors ${
                  viewMode === "raw" ? "bg-foreground text-background font-bold" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Raw Grade
              </button>
            </div>
          )}

          <Link
            href="/#decision-lab"
            className="inline-flex items-center gap-1 font-mono text-[11px] uppercase text-muted-foreground hover:text-foreground hover:underline"
          >
            Tuning <ChevronRight className="size-3" />
          </Link>
        </div>
      </div>
    );
  }

  /* ------------------------------------------------------------- */
  /* VARIANT: INLINE (Default)                                      */
  /* ------------------------------------------------------------- */
  return (
    <div className={`flex flex-wrap items-center gap-2 font-mono text-xs ${className}`}>
      {label && (
        <span className="flex items-center gap-1 font-semibold text-muted-foreground uppercase tracking-wider text-[11px]">
          <Gauge className="size-3 text-muted-foreground" />
          {label}
        </span>
      )}

      {showWeightBar && <PostureWeightBar className="h-1.5 w-10" />}

      {/* Preset Pill Buttons */}
      <div className="flex flex-wrap items-center gap-1">
        {POSTURE_PRESETS.map((p) => {
          const active = activePresetId === p.id;
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => handlePresetClick(p)}
              className={`border px-2 py-0.5 text-[10px] uppercase transition-colors ${
                active
                  ? "border-foreground bg-foreground font-bold text-background"
                  : "border-border bg-card text-muted-foreground hover:border-foreground/50 hover:text-foreground"
              }`}
              title={`${p.name} — Q:${p.weights.quality} S:${p.weights.speed} C:${p.weights.cost}`}
            >
              {p.shortName}
            </button>
          );
        })}
      </div>

      <span className="text-[10px] text-muted-foreground font-mono">
        [{displayBadge}]
      </span>

      {showLeader && (
        <span className="hidden sm:inline-block">
          <PostureLeaderChip />
        </span>
      )}
    </div>
  );
}

/**
 * A persistent top or hero-level banner highlighting the active posture.
 */
export function GlobalPostureBanner() {
  const { displayName, displayBadge, postureResult, selectPreset, activePresetId } = usePosture();
  const leader = postureResult.leader;

  return (
    <div className="border-b border-border/80 bg-black/90 px-4 py-2.5">
      <div className="mx-auto flex max-w-[1600px] flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex flex-wrap items-center gap-2.5">
          <span className="flex items-center gap-1.5 font-mono text-[11px] font-semibold text-foreground uppercase tracking-wider">
            <Sliders className="size-3 text-mega-blue-text" /> Active Posture:
          </span>
          <span className="font-mono text-xs font-bold text-foreground">
            {displayName}
          </span>
          <PostureWeightBar className="h-1.5 w-12" />

          {/* Quick presets buttons */}
          <div className="hidden items-center gap-1 sm:flex">
            {POSTURE_PRESETS.map((p) => {
              const active = activePresetId === p.id;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => selectPreset(p)}
                  className={`border px-2 py-0.5 font-mono text-[10px] uppercase transition-colors ${
                    active
                      ? "border-foreground bg-foreground font-bold text-background"
                      : "border-border bg-card text-muted-foreground hover:border-border/80 hover:text-foreground"
                  }`}
                >
                  {p.shortName}
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5 font-mono text-[11px]">
            <span className="text-muted-foreground">#1 Leader:</span>
            <span
              className="font-bold"
              style={{ color: PROVIDER_COLOR[leader.provider] }}
            >
              {PROVIDER_SHORT[leader.provider]} ({leader.score.toFixed(1)} / 100)
            </span>
          </div>

          <Link
            href="/#decision-lab"
            className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground underline hover:text-foreground"
          >
            Tune in Decision Lab →
          </Link>
        </div>
      </div>
    </div>
  );
}
