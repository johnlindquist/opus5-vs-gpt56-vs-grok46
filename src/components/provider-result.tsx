import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  artifactFailed,
  PROVIDER_COLOR,
  PROVIDER_SHORT,
  data,
  formatDuration,
  type ProviderKey,
  type SpecRow,
} from "@/lib/data";

export function ProviderMark({ provider, compact = false }: { provider: ProviderKey; compact?: boolean }) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      <span
        className="size-2 shrink-0"
        style={{ backgroundColor: PROVIDER_COLOR[provider] }}
        aria-hidden="true"
      />
      <span className={cn("truncate font-medium", compact ? "text-xs" : "text-sm")}>{PROVIDER_SHORT[provider]}</span>
    </div>
  );
}

export function ProviderModel({ provider }: { provider: ProviderKey }) {
  const model = data.providers[provider];
  return (
    <div className="space-y-1">
      <ProviderMark provider={provider} />
      <p className="font-mono text-[10px] leading-4 text-muted-foreground">{model.model}</p>
      <p className="font-mono text-[10px] leading-4 text-muted-foreground">{model.harness} · {model.effort} effort</p>
    </div>
  );
}

export function ScoreBar({ provider, score }: { provider: ProviderKey; score: number }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <ProviderMark provider={provider} compact />
        <span className="font-mono text-sm font-semibold">{score}</span>
      </div>
      <div className="h-1.5 bg-surface-1" aria-label={`${PROVIDER_SHORT[provider]} score ${score} out of 100`}>
        <div className="h-full" style={{ width: `${score}%`, backgroundColor: PROVIDER_COLOR[provider] }} />
      </div>
    </div>
  );
}

export function ProviderGradeCard({ spec, provider }: { spec: SpecRow; provider: ProviderKey }) {
  const grade = spec.triad.providers[provider];
  const cell = spec.cells[provider];
  const failed = artifactFailed(spec, provider);
  const winner =
    spec.pairwise.claude_vs_grok === provider || spec.pairwise.grok_vs_codex === provider;

  return (
    <article className="flex min-w-0 flex-col border border-border bg-card">
      <div className="flex items-start justify-between gap-3 border-b border-border p-4">
        <ProviderModel provider={provider} />
        <div className="text-right">
          <div className="font-mono text-3xl font-semibold" style={{ color: PROVIDER_COLOR[provider] }}>
            {grade.score}
          </div>
          <div className="mega-label">Grade {grade.letter}</div>
        </div>
      </div>
      <div className="flex flex-wrap gap-2 border-b border-border p-4">
        {failed ? (
          <Badge className="rounded-none bg-destructive font-mono text-[10px] uppercase text-white">validation failed · DNF</Badge>
        ) : (
          <Badge variant="outline" className="rounded-none font-mono text-[10px] uppercase">{cell.classification ?? grade.run_status}</Badge>
        )}
        <Badge variant="outline" className="rounded-none font-mono text-[10px] uppercase">{formatDuration(cell.duration_seconds)}</Badge>
        {winner && <Badge className="rounded-none bg-mega-blue text-white font-mono text-[10px] uppercase">pairwise win</Badge>}
      </div>
      <p className="flex-1 p-4 text-sm leading-6 text-muted-foreground">{grade.rationale}</p>
      <div className="grid grid-cols-2 border-t border-border text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
        <div className="border-r border-border p-3">Checks<br /><span className="text-foreground">{grade.checks_assessment}</span></div>
        <div className="p-3">Condition<br /><span className="text-foreground">{cell.condition}</span></div>
      </div>
    </article>
  );
}
