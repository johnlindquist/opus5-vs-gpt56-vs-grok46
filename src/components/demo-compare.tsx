import { ExternalLink, Play } from "lucide-react";
import { ProviderMark } from "@/components/provider-result";
import {
  PROVIDER_ORDER,
  PROVIDER_SHORT,
  artifactFailed,
  type SpecRow,
} from "@/lib/data";
import { isolatedDemoUrl } from "@/lib/origins";

export function DemoCompare({ spec }: { spec: SpecRow }) {
  return (
    <section aria-labelledby="playable-heading">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="mega-label mb-2">Artifact inspection</div>
          <h2 id="playable-heading" className="pixel-heading text-2xl font-semibold sm:text-3xl">Inspect all three submitted artifacts</h2>
        </div>
        <p className="max-w-lg text-xs leading-5 text-muted-foreground">
          Static first-view captures make every artifact comparable at a
          glance without loading submitted code. Open any capture to run the
          staged artifact on its isolated demo origin.
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
                <a
                  href={launchUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`Open ${spec.title} by ${PROVIDER_SHORT[provider]} in a new tab`}
                  className="group relative block aspect-[16/10] overflow-hidden bg-[#080808] outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-mega-blue-text"
                >
                  <img
                    src={`/previews/${spec.cells[provider].cell_id}.webp`}
                    alt={`Static first-view capture of ${spec.title} by ${PROVIDER_SHORT[provider]}`}
                    width={1440}
                    height={900}
                    loading="lazy"
                    decoding="async"
                    className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.015] group-focus-visible:scale-[1.015]"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-80 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100" />
                  <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-4 p-4">
                    <div>
                      <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-white/60">
                        Captured first view
                      </p>
                      <p className="mt-1 font-mono text-xs font-semibold uppercase tracking-wider text-white">
                        Open artifact
                      </p>
                    </div>
                    <span className="grid size-9 shrink-0 place-items-center border border-white/40 bg-black/50 text-white transition-colors group-hover:border-mega-blue group-hover:bg-mega-blue group-focus-visible:border-mega-blue group-focus-visible:bg-mega-blue">
                      <ExternalLink className="size-4" />
                    </span>
                  </div>
                </a>
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
