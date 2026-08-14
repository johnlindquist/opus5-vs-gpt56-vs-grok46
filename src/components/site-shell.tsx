import Link from "next/link";
import { ArrowUpRight, Braces } from "lucide-react";
import { ProviderIcon } from "@/components/provider-icon";
import { PROVIDER_ORDER } from "@/lib/data";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-50 border-b border-border/80 bg-black/90 backdrop-blur-xl">
      <div className="mx-auto flex h-14 max-w-[1600px] items-center justify-between px-4 sm:px-6 lg:px-8">
        <Link href="/" className="group flex items-center gap-3" aria-label="Battle results home">
          <span className="flex items-center gap-1 border border-border bg-black px-1.5 py-1 transition-transform group-hover:-translate-y-0.5">
            {PROVIDER_ORDER.map((provider) => (
              <ProviderIcon key={provider} provider={provider} className="size-3.5" />
            ))}
          </span>
          <span className="hidden font-mono text-xs tracking-[0.08em] text-foreground uppercase sm:inline">
            Frontier Build Battle
          </span>
        </Link>
        <nav className="flex items-center gap-1 text-xs font-medium" aria-label="Primary navigation">
          <Link className="px-3 py-2 text-muted-foreground transition-colors hover:text-foreground" href="/#matrix">
            Results
          </Link>
          <Link className="px-3 py-2 text-muted-foreground transition-colors hover:text-foreground" href="/methodology">
            Methodology
          </Link>
          <a
            className="ml-1 inline-flex items-center gap-1 border border-border px-3 py-2 text-foreground transition-colors hover:border-border hover:text-foreground"
            href="https://mega.dev/"
            target="_blank"
            rel="noreferrer"
          >
            mega.dev <ArrowUpRight className="size-3" aria-hidden="true" />
          </a>
        </nav>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="border-t border-border bg-[#050505]">
      <div className="mx-auto grid max-w-[1600px] gap-8 px-4 py-12 sm:px-6 md:grid-cols-2 lg:px-8">
        <div>
          <div className="mb-3 flex items-center gap-2 font-mono text-xs tracking-[0.08em] uppercase">
            <Braces className="size-4 text-foreground" /> Receipted benchmark
          </div>
          <p className="max-w-xl text-sm text-muted-foreground">
            Frozen prompts, isolated workspaces, model receipts, replay validation, blind grading, and playable artifacts. Letter grades are one frontier-model reviewer&apos;s opinion—not objective measurements or consensus.
          </p>
        </div>
        <div className="flex items-end justify-start gap-5 font-mono text-xs text-muted-foreground md:justify-end">
          <Link href="/methodology" className="hover:text-foreground">How it worked</Link>
          <Link href="/#matrix" className="hover:text-foreground">All 20 specs</Link>
          <a href="https://mega.dev/" target="_blank" rel="noreferrer" className="hover:text-foreground">mega.dev</a>
        </div>
      </div>
    </footer>
  );
}
