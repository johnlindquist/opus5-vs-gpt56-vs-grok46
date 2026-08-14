"use client";

import { useState } from "react";
import { Check, Copy, Hash, Terminal } from "lucide-react";
import { PROVIDER_SHORT, type SpecRow } from "@/lib/data";

type Variant = "icon" | "strip" | "panel";

async function copyExactPrompt(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.left = "-9999px";
    document.body.appendChild(area);
    area.select();
    document.execCommand("copy");
    area.remove();
  }
}

export function RunThisPrompt({
  spec,
  variant = "strip",
}: {
  spec: SpecRow;
  variant?: Variant;
}) {
  const [copied, setCopied] = useState(false);

  async function onCopy(event?: React.MouseEvent) {
    event?.preventDefault();
    event?.stopPropagation();
    await copyExactPrompt(spec.spec_markdown);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  const buttonLabel = copied ? "Copied exact prompt" : "Copy exact prompt";
  const aria = `Copy the exact frozen prompt used for spec ${spec.id}`;

  if (variant === "icon") {
    return (
      <button
        type="button"
        onClick={onCopy}
        aria-label={aria}
        title="Run this benchmark yourself — copy the exact frozen prompt"
        className="relative z-10 inline-flex size-8 items-center justify-center border border-border bg-black text-muted-foreground hover:border-mega-blue-text hover:text-foreground"
      >
        {copied ? <Check className="size-3.5 text-mega-green" /> : <Copy className="size-3.5" />}
      </button>
    );
  }

  if (variant === "strip") {
    return (
      <div className="flex items-center justify-between gap-3 border-t border-border bg-[#050505] px-4 py-3">
        <div className="min-w-0">
          <div className="mega-label text-mega-blue-text">Run this benchmark yourself</div>
          <p className="mt-1 truncate font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
            Exact frozen prompt · SHA {spec.spec_sha256.slice(0, 12)}
          </p>
        </div>
        <button
          type="button"
          onClick={onCopy}
          aria-label={aria}
          className="inline-flex shrink-0 items-center gap-2 border border-border bg-black px-3 py-2 font-mono text-[10px] uppercase tracking-wider text-foreground hover:border-mega-blue-text"
        >
          {copied ? <Check className="size-3.5 text-mega-green" /> : <Copy className="size-3.5" />}
          {buttonLabel}
        </button>
      </div>
    );
  }

  return (
    <section aria-labelledby={`run-prompt-${spec.id}`}>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="mega-label mb-2 text-mega-blue-text">Run this benchmark yourself</div>
          <h2 id={`run-prompt-${spec.id}`} className="pixel-heading text-2xl font-semibold sm:text-3xl">
            Paste the exact brief the agents received.
          </h2>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground">
            {PROVIDER_SHORT.claude}, {PROVIDER_SHORT.grok}, and {PROVIDER_SHORT.codex} each
            got these same specification bytes in an empty isolated workspace. The copy
            button puts that prompt on the clipboard with no added instructions.
          </p>
        </div>
        <button
          type="button"
          onClick={onCopy}
          aria-label={aria}
          className="inline-flex items-center gap-2 border border-mega-blue-text bg-mega-blue/10 px-4 py-3 font-mono text-[10px] uppercase tracking-wider text-mega-blue-text hover:bg-mega-blue hover:text-white"
        >
          {copied ? <Check className="size-4" /> : <Terminal className="size-4" />}
          {buttonLabel}
        </button>
      </div>
      <div className="border border-border bg-black">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          <span className="inline-flex items-center gap-2">
            <Hash className="size-3" />
            <span className="break-all">{spec.spec_sha256}</span>
          </span>
          <span>
            Spec {spec.id} · {spec.era} · {spec.spec_markdown.length.toLocaleString()} characters
          </span>
        </div>
        <pre className="max-h-[520px] overflow-auto whitespace-pre-wrap p-5 font-mono text-[11px] leading-5 text-muted-foreground">
          {spec.spec_markdown}
        </pre>
      </div>
    </section>
  );
}
