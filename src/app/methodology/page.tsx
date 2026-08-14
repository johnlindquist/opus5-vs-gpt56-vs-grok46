import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowLeft,
  Box,
  CheckCircle2,
  Clock3,
  FileCheck2,
  Fingerprint,
  Network,
  Scale,
  ShieldCheck,
} from "lucide-react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { data } from "@/lib/data";

export const metadata: Metadata = {
  title: "Methodology",
  description: "The complete execution, validation, and blind grading protocol for the three-agent build battle.",
};

const steps = [
  {
    icon: Fingerprint,
    n: "01",
    title: "Freeze the work",
    body: "Each prompt was committed and SHA-256 identified before launch. All three arms receive the same specification bytes for a given product.",
  },
  {
    icon: Box,
    n: "02",
    title: "Start empty",
    body: "Every cell begins in its own clean workspace. Agents receive the prompt and may create files; they do not inherit another model’s solution.",
  },
  {
    icon: FileCheck2,
    n: "03",
    title: "Receipt the run",
    body: "Pinned model request, argv, timestamps, session identity, stdout/stderr transcript, exit state, artifact tree, and validation output are preserved per attempt.",
  },
  {
    icon: ShieldCheck,
    n: "04",
    title: "Replay the artifact",
    body: "The harness validates contract files, installs and builds where required, denies runtime network for modern apps, scans policy constraints, and exercises the shipped surface.",
  },
  {
    icon: Scale,
    n: "05",
    title: "Grade blind",
    body: "One independent frontier-model review receives the frozen spec and three redacted evidence bundles labeled Alpha, Beta, and Gamma. Provider identity is absent.",
  },
  {
    icon: CheckCircle2,
    n: "06",
    title: "Derive pairwise calls",
    body: "The structured category totals produce two pairwise decisions from the same review context: Opus–Grok and Grok–Sol. Equal totals are ties.",
  },
];

const legacyRubric = [
  ["Specification coverage", "25"],
  ["Correctness & robustness", "20"],
  ["Code quality & maintainability", "20"],
  ["Architecture & approach", "15"],
  ["Product craft & style", "10"],
  ["Verification honesty", "10"],
];

const modernShared = [
  ["Functional completeness", "20"],
  ["AI mock architecture", "15"],
  ["Interface coherence", "10"],
  ["Accessibility & resilience", "8"],
  ["Stack currency & engineering", "7"],
];

export default function MethodologyPage() {
  return (
    <>
      <section className="mega-grid border-b border-border">
        <div className="mx-auto max-w-[1200px] px-4 py-16 sm:px-6 sm:py-24 lg:px-8">
          <Link href="/" className="mb-10 inline-flex items-center gap-2 font-mono text-xs uppercase tracking-wider text-muted-foreground hover:text-foreground">
            <ArrowLeft className="size-4" /> Results
          </Link>
          <div className="mega-label mb-4 text-mega-blue-text">Protocol · Evidence · Limits</div>
          <h1 className="pixel-heading max-w-4xl text-4xl font-semibold text-balance sm:text-6xl">How the battle actually worked.</h1>
          <p className="mt-7 max-w-3xl text-base leading-7 text-muted-foreground sm:text-lg sm:leading-8">
            This was an artifact benchmark, not a vibes poll. The protocol separates what was frozen, what each harness observed, what a validator proved, and what one independent reviewer judged.
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-[1200px] px-4 py-16 sm:px-6 lg:px-8 lg:py-24">
        <div className="grid gap-px border border-border bg-border md:grid-cols-2 lg:grid-cols-3">
          {steps.map(({ icon: Icon, n, title, body }) => (
            <article key={n} className="bg-card p-6 sm:p-8">
              <div className="mb-10 flex items-center justify-between">
                <Icon className="size-5 text-mega-blue-text" />
                <span className="font-mono text-xs text-muted-foreground">{n} / 06</span>
              </div>
              <h2 className="text-lg font-semibold">{title}</h2>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">{body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="border-y border-border bg-[#050505]">
        <div className="mx-auto max-w-[1200px] px-4 py-16 sm:px-6 lg:px-8 lg:py-24">
          <div className="mb-10 max-w-3xl">
            <div className="mega-label mb-2">Three arms, two eras</div>
            <h2 className="pixel-heading text-3xl font-semibold sm:text-4xl">Comparable artifacts. Carefully scoped timing.</h2>
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <article className="border border-border bg-black p-6 sm:p-8">
              <div className="mb-6 flex items-center justify-between gap-3">
                <h3 className="text-xl font-semibold">Specs 01–10 · Legacy</h3>
                <Badge variant="outline" className="rounded-none font-mono text-[10px] uppercase">dependency-free</Badge>
              </div>
              <p className="text-sm leading-6 text-muted-foreground">
                Small games, visual instruments, and developer-analysis tasks designed to ship as direct-open local artifacts. The canonical matrix uses B2 rematches for 01, 02, and 08, then B/B3 for the rest. G-LEGACY ran later, sequentially, with the same frozen prompts and a four-hour cap.
              </p>
              <div className="mt-6 border-l-2 border-mega-blue-text pl-4 font-mono text-xs leading-5 text-muted-foreground">
                G-LEGACY: cursor-agent · cursor-grok-4.6-medium · clean workspace · one cell at a time
              </div>
            </article>
            <article className="border border-border bg-black p-6 sm:p-8">
              <div className="mb-6 flex items-center justify-between gap-3">
                <h3 className="text-xl font-semibold">Specs 11–20 · Modern</h3>
                <Badge variant="outline" className="rounded-none font-mono text-[10px] uppercase">dependency-bearing</Badge>
              </div>
              <p className="text-sm leading-6 text-muted-foreground">
                Modern AI UX applications with pinned lockfiles and browser-local mock AI. Builders may reach provider APIs and the package registry, but replayed production apps run with network access denied. D-MODERN and G-MODERN allow at most two concurrent sessions.
              </p>
              <div className="mt-6 border-l-2 border-mega-green pl-4 font-mono text-xs leading-5 text-muted-foreground">
                modern-static-v2 · bun@1.3.11 · install/build/runtime replay · zero runtime network
              </div>
            </article>
          </div>
          <div className="mt-4 flex items-start gap-4 border border-border bg-black p-5">
            <Clock3 className="mt-0.5 size-5 shrink-0 text-mega-blue-text" />
            <p className="text-sm leading-6 text-muted-foreground">
              <strong className="text-foreground">Timing rule:</strong> Condition G ran in August 2026, weeks after the canonical Opus–Sol battle. Host state and concurrency differ. Durations are preserved as provenance but never treated as cross-arm speed evidence or a grading dimension.
            </p>
          </div>
        </div>
      </section>

      <section id="grading" className="scroll-mt-20 mx-auto max-w-[1200px] px-4 py-16 sm:px-6 lg:px-8 lg:py-24">
        <div className="grid gap-10 lg:grid-cols-[.7fr_1.3fr]">
          <div>
            <div className="mega-label mb-2">Blind review contract</div>
            <h2 className="pixel-heading text-3xl font-semibold sm:text-4xl">One context. Three aliases. 100 points.</h2>
            <p className="mt-5 text-sm leading-6 text-muted-foreground">
              Every spec produces one triad receipt. Source, run evidence, the final response, and self-reported checks are bundled under Alpha/Beta/Gamma. Provider names, model names, durations, and token totals are redacted from the review input.
            </p>
            <p className="mt-4 text-sm leading-6 text-muted-foreground">
              The judge must emit strict JSON. Schema validation checks category maxima, exact sums, letter mapping, all three aliases, and era-specific rubric keys before a result is accepted.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <article className="border border-border bg-card p-6">
              <div className="mega-label mb-5">Legacy rubric · 01–10</div>
              <div className="space-y-3">
                {legacyRubric.map(([label, max]) => (
                  <div key={label} className="flex items-center justify-between gap-4 border-b border-border pb-2 text-xs last:border-0">
                    <span className="text-muted-foreground">{label}</span><span className="font-mono">{max}</span>
                  </div>
                ))}
              </div>
            </article>
            <article className="border border-border bg-card p-6">
              <div className="mega-label mb-5">Modern shared core · 11–20</div>
              <div className="space-y-3">
                {modernShared.map(([label, max]) => (
                  <div key={label} className="flex items-center justify-between gap-4 border-b border-border pb-2 text-xs last:border-0">
                    <span className="text-muted-foreground">{label}</span><span className="font-mono">{max}</span>
                  </div>
                ))}
              </div>
              <Separator className="my-4" />
              <p className="text-xs leading-5 text-muted-foreground">
                The remaining 40 points are track-specific: design-frontier scores frontier execution, technical fallbacks, and art direction; UX-complexity scores workflow depth, information architecture, and recovery.
              </p>
            </article>
          </div>
        </div>
      </section>

      <section className="border-y border-border bg-[#050505]">
        <div className="mx-auto max-w-[1200px] px-4 py-16 sm:px-6 lg:px-8 lg:py-24">
          <div className="mb-10 max-w-3xl">
            <div className="mega-label mb-2">Evidence taxonomy</div>
            <h2 className="pixel-heading text-3xl font-semibold sm:text-4xl">What each layer can prove.</h2>
          </div>
          <div className="overflow-hidden border border-border font-mono text-xs">
            {[
              ["Prompt SHA-256", "Exact task bytes; not whether the model understood them"],
              ["Model init receipt", "Requested and resolved model identity, session, and auth source"],
              ["Process receipt", "Start/end, exit signal, timeout, transcript, and attempt state"],
              ["Artifact tree hash", "Exact shipped files; not product quality by itself"],
              ["Replay validator", "Install/build/static/runtime contract checks actually exercised"],
              ["Blind triad grade", "One reviewer’s structured quality judgment, not objective truth"],
            ].map(([layer, proves]) => (
              <div key={layer} className="grid border-b border-border last:border-0 sm:grid-cols-[220px_1fr]">
                <div className="bg-surface-1 p-4 text-foreground">{layer}</div>
                <div className="p-4 text-muted-foreground">{proves}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-[1200px] px-4 py-16 sm:px-6 lg:px-8 lg:py-24">
        <div className="grid gap-10 lg:grid-cols-[.7fr_1.3fr]">
          <div>
            <div className="mega-label mb-2">Questions worth asking</div>
            <h2 className="pixel-heading text-3xl font-semibold sm:text-4xl">Limits and disclosures.</h2>
          </div>
          <Accordion multiple className="border-t border-border">
            <AccordionItem value="canonical" className="border-border">
              <AccordionTrigger className="text-left text-sm">Why doesn&apos;t Grok change the 19–1 result?</AccordionTrigger>
              <AccordionContent className="text-sm leading-6 text-muted-foreground">
                The canonical Opus–Sol matrix was already closed, policy-pinned, and hash-receipted. Condition G is an additive third arm run later. It contributes zero canonical results; this site reports separate Opus–Grok and Grok–Sol tallies.
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="judge" className="border-border">
              <AccordionTrigger className="text-left text-sm">Are these scores objective?</AccordionTrigger>
              <AccordionContent className="text-sm leading-6 text-muted-foreground">
                No. Letter grades and scores are one independent frontier-model reviewer&apos;s opinion for each spec. Blinding, shared context, strict rubrics, and schema checks reduce obvious bias and drift; they do not create a consensus or ground truth.
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="visual" className="border-border">
              <AccordionTrigger className="text-left text-sm">Did the judge directly use every app?</AccordionTrigger>
              <AccordionContent className="text-sm leading-6 text-muted-foreground">
                The evidence bundles contain source, receipts, self-reported checks, and available capture metadata. Some reviews explicitly note that visual or interaction claims were only source-backed when direct screenshots or executable evidence were absent. Each deep-dive page preserves that rationale and limitations text.
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="tokens" className="border-border">
              <AccordionTrigger className="text-left text-sm">Can token counts or durations compare efficiency?</AccordionTrigger>
              <AccordionContent className="text-sm leading-6 text-muted-foreground">
                Not across these arms. Providers report tokens with different tokenizers, and Condition G ran later under different host state and concurrency. Both are provenance signals only—not interchangeable units of work or clean speed evidence.
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="grok-cost" className="border-border">
              <AccordionTrigger className="text-left text-sm">Does Grok have a cost figure now?</AccordionTrigger>
              <AccordionContent className="text-sm leading-6 text-muted-foreground">
                Yes. Sol costs were already published-rate estimates, not invoices. Grok uses the same class of math: twenty Cursor Grok 4.6 Medium receipts sum to {data.grok_resource_summary?.pricing.list_rate_equivalent_usd ?? "33.296900"} USD at list rates, or {data.grok_resource_summary?.pricing.launch_discount_equivalent_usd ?? "16.648450"} USD at the 50% launch discount. The decision lab uses the list-rate total so the basis matches Sol. Auth was Cursor login / first-party pool, so neither figure is a cash invoice. Later-run time still stays out of the composite.
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="network" className="border-border">
              <AccordionTrigger className="text-left text-sm">What did “offline” mean for modern apps?</AccordionTrigger>
              <AccordionContent className="text-sm leading-6 text-muted-foreground">
                Builder sessions could reach provider APIs and npm. The submitted production artifact was replayed with runtime network denied. Results pages never embed or start submitted code; artifacts run only after an explicit new-tab launch. The demo host sends <code>connect-src &apos;none&apos;</code>, no AI credentials are deployed, and every AI-like interaction uses deterministic mock behavior rather than a live service.
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </div>
      </section>

      <section className="mega-grid border-t border-border">
        <div className="mx-auto max-w-[1200px] px-4 py-16 sm:px-6 lg:px-8">
          <div className="flex items-start gap-4 border border-mega-blue-text/60 bg-black p-6">
            <Network className="mt-1 size-5 shrink-0 text-mega-blue-text" />
            <div>
              <div className="font-medium">The site is an evidence navigator, not a replacement for the archive.</div>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                Each product page names its triad receipt, conditions, cell IDs, prompt hash, check assessment, and judge caveats. The playable copies are staged from those recorded artifacts.
              </p>
            </div>
          </div>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/#matrix" className="inline-flex h-11 items-center bg-mega-blue px-5 font-mono text-xs uppercase tracking-wider text-white hover:bg-mega-blue-text">Browse all 20 builds</Link>
            <Link href="/specs/01" className="inline-flex h-11 items-center border border-border bg-black px-5 font-mono text-xs uppercase tracking-wider hover:border-mega-blue-text">Open first deep dive</Link>
          </div>
        </div>
      </section>
    </>
  );
}
