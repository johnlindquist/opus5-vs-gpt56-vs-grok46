"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowUpRight, ImageOff, MousePointer2 } from "lucide-react";
import { ProviderMark } from "@/components/provider-icon";
import { PROVIDER_COLOR } from "@/lib/data";
import { RunThisPrompt } from "@/components/run-this-prompt";
import {
  eraLabel,
  specById,
  type ShowcaseItem,
} from "@/lib/data";

interface DemoShowcaseProps {
  items: ShowcaseItem[];
}

function ShowcaseCard({
  item,
  featured,
  failed,
  onImageError,
}: {
  item: ShowcaseItem;
  featured: boolean;
  failed: boolean;
  onImageError: () => void;
}) {
  const spec = specById(item.spec_id);
  return (
    <article className="group relative flex min-w-0 flex-col overflow-hidden border border-border bg-card">
    <Link
      href={item.deep_dive_path}
      aria-label={`Open spec ${item.spec_id}: ${item.title}, featuring the ${item.provider_label} artifact`}
      className="flex min-w-0 flex-1 flex-col outline-none transition-colors focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-mega-blue-text/40"
    >
      <div
        className={`showcase-frame relative overflow-hidden bg-[#080808] ${
          featured ? "aspect-[16/10] lg:min-h-[430px]" : "aspect-[16/10]"
        }`}
      >
        {!failed ? (
          <img
            src={item.preview_path}
            alt={item.alt}
            width={item.capture.viewport_width}
            height={item.capture.viewport_height}
            loading={featured ? "eager" : "lazy"}
            fetchPriority={featured ? "high" : "auto"}
            decoding="async"
            onError={onImageError}
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.015]"
            style={{ objectPosition: item.object_position }}
          />
        ) : (
          <div className="showcase-fallback absolute inset-0 grid place-items-center p-6 text-center">
            <div className="max-w-sm">
              <ImageOff className="mx-auto size-6 text-foreground" aria-hidden="true" />
              <p className="mt-4 font-mono text-xs font-semibold uppercase tracking-wider text-foreground">
                Preview capture pending
              </p>
              <p className="mt-2 text-xs leading-5 text-muted-foreground">{item.fallback}</p>
              <dl className="mt-5 grid grid-cols-2 gap-px border border-border bg-border text-left font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
                <div className="bg-black p-3">
                  <dt>Target file</dt>
                  <dd className="mt-1 break-all text-foreground">{item.filename}</dd>
                </div>
                <div className="bg-black p-3">
                  <dt>Capture</dt>
                  <dd className="mt-1 text-foreground">{item.capture.aspect_ratio} · no interaction</dd>
                </div>
              </dl>
            </div>
          </div>
        )}
        <div className="showcase-scanline pointer-events-none absolute inset-0" aria-hidden="true" />
        <div className="absolute inset-x-0 top-0 flex items-center justify-between gap-3 bg-gradient-to-b from-black/90 to-transparent p-4">
          <span className="border border-white/20 bg-black/80 px-2 py-1 font-mono text-[9px] uppercase tracking-wider text-white">
            Static preview
          </span>
          <span className="border border-white/20 bg-black/80 px-2 py-1 font-mono text-[9px] uppercase tracking-wider text-white">
            Spec {item.spec_id}
          </span>
        </div>
      </div>

      <div className={`flex flex-1 flex-col ${featured ? "p-5 sm:p-6" : "p-4 sm:p-5"}`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
            <ProviderMark provider={item.provider} compact />
            <span>· {item.label}</span>
          </div>
          <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
            {eraLabel(item.era)} · {item.kind}
          </span>
        </div>
        <h3 className={`mt-4 font-semibold leading-tight ${featured ? "text-2xl sm:text-3xl" : "text-lg"}`}>
          {item.title}
        </h3>
        <div className="mt-auto flex items-end justify-between gap-4 pt-6">
          <div>
            <div className="mega-label">Blind triad score</div>
            <div className="mt-1 font-mono text-2xl font-bold tabular-nums" style={{ color: PROVIDER_COLOR[item.provider] }}>{item.score}</div>
          </div>
          <span className="inline-flex items-center gap-2 font-mono text-[10px] font-semibold uppercase tracking-wider text-foreground transition-colors group-hover:text-white">
            Open deep dive <ArrowUpRight className="size-3.5" aria-hidden="true" />
          </span>
        </div>
      </div>
    </Link>
    <RunThisPrompt spec={spec} variant="strip" />
    </article>
  );
}

export function DemoShowcase({ items }: DemoShowcaseProps) {
  const [failedImages, setFailedImages] = useState<Record<string, boolean>>({});
  const featured = items.find((item) => item.slot === "feature") ?? items[0];
  const support = items.filter((item) => item !== featured);

  return (
    <section
      id="showcase"
      aria-labelledby="showcase-heading"
      className="scroll-mt-20 border-b border-border bg-black"
    >
      <div className="mx-auto max-w-[1600px] px-4 py-14 sm:px-6 lg:px-8 lg:py-20">
        <div className="grid gap-7 lg:grid-cols-[.72fr_1.28fr] lg:items-end">
          <div>
            <div className="mega-label mb-3 text-foreground">Artifact Gallery</div>
            <h2 id="showcase-heading" className="pixel-heading text-3xl font-semibold sm:text-5xl">
              Interactive demo gallery.
            </h2>
          </div>
          <div className="lg:justify-self-end">
            <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
              Representative captures and interactive previews across local instruments, developer tools, and AI workflows. Each card links directly to its receipted deep dive.
            </p>
            <div className="mt-4 flex items-center gap-2 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
              <MousePointer2 className="size-3.5 text-foreground" aria-hidden="true" />
              Static captures · Sandboxed preview
            </div>
          </div>
        </div>

        {items.length > 0 ? (
          <div className="mt-9 grid gap-3 lg:grid-cols-[1.18fr_.82fr] lg:items-stretch">
            {featured && (
              <ShowcaseCard
                item={featured}
                featured
                failed={failedImages[featured.preview_path] === true}
                onImageError={() =>
                  setFailedImages((current) => ({ ...current, [featured.preview_path]: true }))
                }
              />
            )}
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-2">
              {support.map((item) => (
                <ShowcaseCard
                  key={`${item.spec_id}-${item.provider}`}
                  item={item}
                  featured={false}
                  failed={failedImages[item.preview_path] === true}
                  onImageError={() =>
                    setFailedImages((current) => ({ ...current, [item.preview_path]: true }))
                  }
                />
              ))}
            </div>
          </div>
        ) : (
          <div className="showcase-fallback mt-9 grid min-h-72 place-items-center border border-border p-8 text-center">
            <div>
              <ImageOff className="mx-auto size-6 text-foreground" aria-hidden="true" />
              <p className="mt-4 font-mono text-xs uppercase tracking-wider text-muted-foreground">
                Exported showcase metadata is unavailable
              </p>
            </div>
          </div>
        )}

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border border-border bg-[#050505] px-4 py-3 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          <span>Capture contract: 1440 × 900 · WebP quality 88 · no interaction · 16:10</span>
          <span>Artifact execution remains explicit, isolated, and new-tab only on deep dives</span>
        </div>
      </div>
    </section>
  );
}
