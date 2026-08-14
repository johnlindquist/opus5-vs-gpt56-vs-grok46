"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { usePosture } from "@/context/posture-context";
import { TallyDonut } from "@/components/battle-charts";
import { PairwiseMark as HeadToHeadMark } from "@/components/provider-icon";
import { MiniPostureSelector } from "@/components/mini-posture-selector";

export function HeadToHeadDonutsSection() {
  const { postureResult, displayName, displayBadge } = usePosture();
  const tallies = postureResult.pairwiseTallies;

  const claudeGrok = {
    claude: tallies.claude_vs_grok.claude,
    grok: tallies.claude_vs_grok.grok,
    ties: tallies.claude_vs_grok.ties,
  };

  const grokCodex = {
    grok: tallies.grok_vs_codex.grok,
    codex: tallies.grok_vs_codex.codex,
    ties: tallies.grok_vs_codex.ties,
  };

  return (
    <section className="border-y border-border bg-[#050505]">
      <div className="mx-auto grid max-w-[1600px] gap-8 px-4 py-16 sm:px-6 lg:grid-cols-[1fr_1.4fr] lg:px-8 lg:py-24">
        <div>
          <div className="mega-label mb-2">Evaluation protocol</div>
          <h2 className="pixel-heading text-3xl font-semibold sm:text-4xl">
            How the judging works.
          </h2>
          <p className="mt-5 max-w-xl text-sm leading-6 text-muted-foreground">
            Each specification was blindly evaluated in a single shared review context under anonymous Alpha, Beta, and Gamma aliases. Donut charts show the resulting head-to-head win distribution across all twenty briefs under your active{" "}
            <strong className="text-foreground">{displayName}</strong> posture ({displayBadge}).
          </p>

          <div className="mt-6">
            <MiniPostureSelector variant="inline" label="Posture" showLeader={false} />
          </div>

          <Link
            href="/methodology#grading"
            className="mt-7 inline-flex items-center gap-2 font-mono text-xs uppercase tracking-wider text-foreground hover:underline"
          >
            Inspect the grading contract <ArrowRight className="size-4" />
          </Link>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="border border-border bg-black p-4">
            <div className="mega-label flex justify-center pb-2">
              <HeadToHeadMark left="claude" right="grok" />
            </div>
            <TallyDonut
              tally={[
                { key: "claude", value: claudeGrok.claude },
                { key: "grok", value: claudeGrok.grok },
                ...(claudeGrok.ties > 0 ? [{ key: "ties" as const, value: claudeGrok.ties }] : []),
              ]}
              center={`${claudeGrok.claude}–${claudeGrok.grok}`}
              labels="wins"
            />
          </div>

          <div className="border border-border bg-black p-4">
            <div className="mega-label flex justify-center pb-2">
              <HeadToHeadMark left="grok" right="codex" />
            </div>
            <TallyDonut
              tally={[
                { key: "grok", value: grokCodex.grok },
                { key: "codex", value: grokCodex.codex },
                ...(grokCodex.ties > 0 ? [{ key: "ties" as const, value: grokCodex.ties }] : []),
              ]}
              center={`${grokCodex.grok}–${grokCodex.codex}`}
              labels="wins"
            />
          </div>
        </div>
      </div>
    </section>
  );
}

export const PairwiseDonutsSection = HeadToHeadDonutsSection;
