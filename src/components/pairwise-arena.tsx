"use client";

import { usePosture } from "@/context/posture-context";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PairwiseMark as HeadToHeadMark } from "@/components/provider-icon";
import { AnimatedNumber } from "@/components/animated-number";
import { MiniPostureSelector } from "@/components/mini-posture-selector";
import { PROVIDER_COLOR } from "@/lib/data";

export function HeadToHeadArena() {
  const { postureResult, displayName, displayBadge } = usePosture();
  const tallies = postureResult.pairwiseTallies;

  const opusSol = {
    left: tallies.claude_vs_codex.claude,
    right: tallies.claude_vs_codex.codex,
    ties: tallies.claude_vs_codex.ties,
    leftPct: tallies.claude_vs_codex.claudeWinRate,
    rightPct: tallies.claude_vs_codex.codexWinRate,
  };

  const claudeGrok = {
    left: tallies.claude_vs_grok.claude,
    right: tallies.claude_vs_grok.grok,
    ties: tallies.claude_vs_grok.ties,
    leftPct: tallies.claude_vs_grok.claudeWinRate,
    rightPct: tallies.claude_vs_grok.grokWinRate,
  };

  const grokCodex = {
    left: tallies.grok_vs_codex.grok,
    right: tallies.grok_vs_codex.codex,
    ties: tallies.grok_vs_codex.ties,
    leftPct: tallies.grok_vs_codex.grokWinRate,
    rightPct: tallies.grok_vs_codex.codexWinRate,
  };

  return (
    <section className="border-b border-border bg-[#050505]">
      <div className="mx-auto max-w-[1600px] px-4 py-14 sm:px-6 lg:px-8">
        <div className="mb-8 flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
          <div>
            <div className="mega-label mb-2">Head-to-head arena</div>
            <h2 className="pixel-heading text-3xl font-semibold sm:text-4xl">
              Head-to-head match-ups.
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Direct head-to-head records across all twenty specifications, calculated under your active{" "}
              <strong className="text-foreground">{displayName}</strong> posture [{displayBadge}].
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <MiniPostureSelector variant="inline" label="Posture" showLeader={false} />
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          {/* Matchup 1: Opus vs Sol */}
          <Card
            className="corner-marks relative flex flex-col justify-between rounded-none border-border bg-black p-6 min-h-[250px] transition-colors hover:border-border/80"
            style={{
              borderTop: `3px solid ${
                opusSol.left >= opusSol.right ? PROVIDER_COLOR.claude : PROVIDER_COLOR.codex
              }`,
            }}
          >
            <span className="cm" />
            <div className="mb-5 flex items-center justify-between">
              <HeadToHeadMark left="claude" right="codex" className="font-mono text-xs font-semibold" />
              <Badge variant="outline" className="rounded-none font-mono text-[10px] uppercase text-muted-foreground">
                {opusSol.left >= opusSol.right
                  ? `Opus leads (${opusSol.leftPct}%)`
                  : `Sol leads (${opusSol.rightPct}%)`}
              </Badge>
            </div>
            <div className="flex items-baseline gap-4">
              <strong className="font-mono text-6xl font-bold" style={{ color: PROVIDER_COLOR.claude }}>
                <AnimatedNumber value={opusSol.left} decimals={0} />
              </strong>
              <span className="font-mono text-2xl text-muted-foreground">–</span>
              <strong className="font-mono text-4xl font-semibold" style={{ color: PROVIDER_COLOR.codex }}>
                <AnimatedNumber value={opusSol.right} decimals={0} />
              </strong>
              {opusSol.ties > 0 && (
                <span className="font-mono text-xs text-muted-foreground">
                  + <AnimatedNumber value={opusSol.ties} decimals={0} /> {opusSol.ties === 1 ? "tie" : "ties"}
                </span>
              )}
            </div>

            {/* Win Share Visual Bar */}
            <div className="mt-5 space-y-1.5">
              <div className="flex h-2 w-full overflow-hidden bg-border">
                <div
                  className="transition-all duration-500 ease-out"
                  style={{ width: `${Math.max(2, opusSol.leftPct)}%`, backgroundColor: PROVIDER_COLOR.claude }}
                />
                {opusSol.ties > 0 && (
                  <div
                    className="transition-all duration-500 ease-out"
                    style={{ width: `${(opusSol.ties / 20) * 100}%`, backgroundColor: "#555" }}
                  />
                )}
                <div
                  className="transition-all duration-500 ease-out"
                  style={{ width: `${Math.max(2, opusSol.rightPct)}%`, backgroundColor: PROVIDER_COLOR.codex }}
                />
              </div>
              <div className="flex justify-between font-mono text-[10px] text-muted-foreground">
                <span style={{ color: PROVIDER_COLOR.claude }}>
                  Opus: <AnimatedNumber value={opusSol.left} decimals={0} /> ({opusSol.leftPct}%)
                </span>
                {opusSol.ties > 0 && <span>{opusSol.ties} Tie</span>}
                <span style={{ color: PROVIDER_COLOR.codex }}>
                  Sol: <AnimatedNumber value={opusSol.right} decimals={0} /> ({opusSol.rightPct}%)
                </span>
              </div>
            </div>

            <p className="mt-4 text-xs leading-5 text-muted-foreground min-h-[40px]">
              Direct match-up outcomes calculated by weighting quality, speed, and cost under the {displayName} posture.
            </p>
          </Card>

          {/* Matchup 2: Opus vs Grok */}
          <Card
            className="rounded-none flex flex-col justify-between border-border bg-black p-6 min-h-[250px] transition-colors hover:border-border/80"
            style={{
              borderTop: `3px solid ${
                claudeGrok.left >= claudeGrok.right ? PROVIDER_COLOR.claude : PROVIDER_COLOR.grok
              }`,
            }}
          >
            <div className="mb-5 flex items-center justify-between">
              <HeadToHeadMark left="claude" right="grok" className="font-mono text-xs font-semibold" />
              <Badge variant="outline" className="rounded-none font-mono text-[10px] uppercase text-muted-foreground">
                {claudeGrok.left >= claudeGrok.right
                  ? `Opus leads (${claudeGrok.leftPct}%)`
                  : `Grok leads (${claudeGrok.rightPct}%)`}
              </Badge>
            </div>
            <div className="flex items-baseline gap-4">
              <strong className="font-mono text-6xl font-bold" style={{ color: PROVIDER_COLOR.claude }}>
                <AnimatedNumber value={claudeGrok.left} decimals={0} />
              </strong>
              <span className="font-mono text-2xl text-muted-foreground">–</span>
              <strong className="font-mono text-4xl font-semibold" style={{ color: PROVIDER_COLOR.grok }}>
                <AnimatedNumber value={claudeGrok.right} decimals={0} />
              </strong>
              {claudeGrok.ties > 0 && (
                <span className="font-mono text-xs text-muted-foreground">
                  + <AnimatedNumber value={claudeGrok.ties} decimals={0} /> {claudeGrok.ties === 1 ? "tie" : "ties"}
                </span>
              )}
            </div>

            {/* Win Share Visual Bar */}
            <div className="mt-5 space-y-1.5">
              <div className="flex h-2 w-full overflow-hidden bg-border">
                <div
                  className="transition-all duration-500 ease-out"
                  style={{ width: `${Math.max(2, claudeGrok.leftPct)}%`, backgroundColor: PROVIDER_COLOR.claude }}
                />
                {claudeGrok.ties > 0 && (
                  <div
                    className="transition-all duration-500 ease-out"
                    style={{ width: `${(claudeGrok.ties / 20) * 100}%`, backgroundColor: "#555" }}
                  />
                )}
                <div
                  className="transition-all duration-500 ease-out"
                  style={{ width: `${Math.max(2, claudeGrok.rightPct)}%`, backgroundColor: PROVIDER_COLOR.grok }}
                />
              </div>
              <div className="flex justify-between font-mono text-[10px] text-muted-foreground">
                <span style={{ color: PROVIDER_COLOR.claude }}>
                  Opus: <AnimatedNumber value={claudeGrok.left} decimals={0} /> ({claudeGrok.leftPct}%)
                </span>
                {claudeGrok.ties > 0 && <span>{claudeGrok.ties} Tie</span>}
                <span style={{ color: PROVIDER_COLOR.grok }}>
                  Grok: <AnimatedNumber value={claudeGrok.right} decimals={0} /> ({claudeGrok.rightPct}%)
                </span>
              </div>
            </div>

            <p className="mt-4 text-xs leading-5 text-muted-foreground min-h-[40px]">
              Direct match-up outcomes calculated by weighting quality, speed, and cost under the {displayName} posture.
            </p>
          </Card>

          {/* Matchup 3: Grok vs Sol */}
          <Card
            className="rounded-none flex flex-col justify-between border-border bg-black p-6 min-h-[250px] transition-colors hover:border-border/80"
            style={{
              borderTop: `3px solid ${
                grokCodex.left >= grokCodex.right ? PROVIDER_COLOR.grok : PROVIDER_COLOR.codex
              }`,
            }}
          >
            <div className="mb-5 flex items-center justify-between">
              <HeadToHeadMark left="grok" right="codex" className="font-mono text-xs font-semibold" />
              <Badge variant="outline" className="rounded-none font-mono text-[10px] uppercase text-muted-foreground">
                {grokCodex.left >= grokCodex.right
                  ? `Grok leads (${grokCodex.leftPct}%)`
                  : `Sol leads (${grokCodex.rightPct}%)`}
              </Badge>
            </div>
            <div className="flex items-baseline gap-4">
              <strong className="font-mono text-6xl font-bold" style={{ color: PROVIDER_COLOR.grok }}>
                <AnimatedNumber value={grokCodex.left} decimals={0} />
              </strong>
              <span className="font-mono text-2xl text-muted-foreground">–</span>
              <strong className="font-mono text-4xl font-semibold" style={{ color: PROVIDER_COLOR.codex }}>
                <AnimatedNumber value={grokCodex.right} decimals={0} />
              </strong>
              {grokCodex.ties > 0 && (
                <span className="font-mono text-xs text-muted-foreground">
                  + <AnimatedNumber value={grokCodex.ties} decimals={0} /> {grokCodex.ties === 1 ? "tie" : "ties"}
                </span>
              )}
            </div>

            {/* Win Share Visual Bar */}
            <div className="mt-5 space-y-1.5">
              <div className="flex h-2 w-full overflow-hidden bg-border">
                <div
                  className="transition-all duration-500 ease-out"
                  style={{ width: `${Math.max(2, grokCodex.leftPct)}%`, backgroundColor: PROVIDER_COLOR.grok }}
                />
                {grokCodex.ties > 0 && (
                  <div
                    className="transition-all duration-500 ease-out"
                    style={{ width: `${(grokCodex.ties / 20) * 100}%`, backgroundColor: "#555" }}
                  />
                )}
                <div
                  className="transition-all duration-500 ease-out"
                  style={{ width: `${Math.max(2, grokCodex.rightPct)}%`, backgroundColor: PROVIDER_COLOR.codex }}
                />
              </div>
              <div className="flex justify-between font-mono text-[10px] text-muted-foreground">
                <span style={{ color: PROVIDER_COLOR.grok }}>
                  Grok: <AnimatedNumber value={grokCodex.left} decimals={0} /> ({grokCodex.leftPct}%)
                </span>
                {grokCodex.ties > 0 && <span>{grokCodex.ties} Tie</span>}
                <span style={{ color: PROVIDER_COLOR.codex }}>
                  Sol: <AnimatedNumber value={grokCodex.right} decimals={0} /> ({grokCodex.rightPct}%)
                </span>
              </div>
            </div>

            <p className="mt-4 text-xs leading-5 text-muted-foreground min-h-[40px]">
              Direct match-up outcomes calculated by weighting quality, speed, and cost under the {displayName} posture.
            </p>
          </Card>
        </div>
      </div>
    </section>
  );
}

// Keep export alias for any consumer
export const PairwiseArena = HeadToHeadArena;
