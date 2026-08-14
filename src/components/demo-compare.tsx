import { ExternalLink, Play } from "lucide-react";
import { ProviderMark } from "@/components/provider-result";
import { PROVIDER_ORDER, artifactFailed, type SpecRow } from "@/lib/data";
import { isolatedDemoUrl } from "@/lib/origins";

export function DemoCompare({ spec }: { spec: SpecRow }) {
  return (
    <section aria-labelledby="playable-heading">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="mega-label mb-2">Artifact inspection</div>
          <h2 id="playable-heading" className="pixel-heading text-2xl font-semibold sm:text-3xl">Inspect all three submitted artifacts</h2>
        </div>
        <p className="max-w-lg text-xs text-muted-foreground">
          Submitted code never loads on this page. Each byte-staged artifact
          starts only when you open it in a separate tab; recorded validator
          failures remain marked before launch.
        </p>
      </div>
      <div className="grid gap-3 xl:grid-cols-3">
        {PROVIDER_ORDER.map((provider) => {
          const demo = spec.demos[provider];
          const launchUrl = demo
            ? isolatedDemoUrl(demo.path.replace(/index\.html$/, ""))
            : null;
          const failed = artifactFailed(spec, provider);
          return (
            <article key={provider} className="overflow-hidden border border-border bg-card">
              <div className="flex h-12 items-center justify-between border-b border-border px-4">
                <ProviderMark provider={provider} />
                {launchUrl && (
                  <a
                    href={launchUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground hover:text-foreground"
                  >
                    Open full <ExternalLink className="size-3" />
                  </a>
                )}
              </div>
              {failed && (
                <div className="border-b border-destructive/60 bg-destructive/10 px-4 py-3 font-mono text-[10px] leading-4 uppercase tracking-wider text-red-300">
                  Recorded validation failed · staged for inspection, not represented as validated
                </div>
              )}
              {launchUrl ? (
                <div className="mega-grid relative grid aspect-[16/10] place-items-center overflow-hidden bg-[#080808] p-6 text-center">
                  <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-mega-blue to-transparent opacity-70" />
                  <div className="relative max-w-xs">
                    <Play className="mx-auto mb-4 size-6 text-mega-blue-text" />
                    <p className="font-mono text-xs font-semibold uppercase tracking-wider text-foreground">
                      Run on demand
                    </p>
                    <p className="mt-2 text-xs leading-5 text-muted-foreground">
                      Paused here to protect browser performance. Submitted code
                      runs only in a new tab.
                    </p>
                    <a
                      href={launchUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-5 inline-flex h-9 items-center gap-2 border border-mega-blue bg-mega-blue/10 px-4 font-mono text-[10px] font-semibold uppercase tracking-wider text-mega-blue-text hover:bg-mega-blue hover:text-white"
                    >
                      Open artifact <ExternalLink className="size-3" />
                    </a>
                  </div>
                </div>
              ) : (
                <div className="grid aspect-[16/10] place-items-center bg-[#080808] text-muted-foreground">
                  <div className="text-center">
                    <Play className="mx-auto mb-3 size-5" />
                    <p className="font-mono text-xs uppercase">No launchable demo</p>
                  </div>
                </div>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}
