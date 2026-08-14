import { Badge } from "@/components/ui/badge";
import { ProviderMark } from "@/components/provider-icon";
import {
  artifactFailed,
  PROVIDER_COLOR,
  PROVIDER_SHORT,
  data,
  formatDuration,
  type ProviderKey,
  type SpecRow,
} from "@/lib/data";

export { ProviderMark } from "@/components/provider-icon";

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
  const color = PROVIDER_COLOR[provider];
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <ProviderMark provider={provider} compact />
        <span className="font-mono text-sm font-semibold">{score}</span>
      </div>
      <div className="h-1.5 w-full bg-surface-1" aria-label={`${PROVIDER_SHORT[provider]} score ${score} out of 100`}>
        <div className="h-full transition-all duration-500" style={{ width: `${score}%`, backgroundColor: color }} />
      </div>
    </div>
  );
}

export function ProviderGradeCard({ spec, provider }: { spec: SpecRow; provider: ProviderKey }) {
  const grade = spec.triad.providers[provider];
  const cell = spec.cells[provider];
  const failed = artifactFailed(spec, provider);
  const color = PROVIDER_COLOR[provider];
  const winner =
    spec.pairwise.claude_vs_grok === provider || spec.pairwise.grok_vs_codex === provider;

  return (
    <article
      className="flex min-w-0 flex-col border border-border bg-card transition-colors hover:border-border/80"
      style={{ borderTop: `3px solid ${color}` }}
    >
      <div className="flex items-start justify-between gap-3 border-b border-border p-4">
        <ProviderModel provider={provider} />
        <div className="text-right">
          <div className="font-mono text-3xl font-bold" style={{ color }}>
            {grade.score}
          </div>
          <div className="mega-label">Grade {grade.letter}</div>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2 border-b border-border p-3 sm:p-4">
        {failed ? (
          <Badge className="rounded-none bg-destructive font-mono text-[10px] uppercase text-white">
            validation failed · DNF
          </Badge>
        ) : (
          <Badge variant="outline" className="rounded-none font-mono text-[10px] uppercase">
            {cell.classification ?? grade.run_status}
          </Badge>
        )}
        <Badge variant="outline" className="rounded-none font-mono text-[10px] uppercase">
          {formatDuration(cell.duration_seconds)}
        </Badge>
        {winner && (
          <Badge
            className="rounded-none font-mono text-[10px] font-semibold uppercase text-black"
            style={{ backgroundColor: color }}
          >
            head-to-head win
          </Badge>
        )}
      </div>
      <p className="flex-1 p-4 text-sm leading-6 text-muted-foreground">{grade.rationale}</p>
      <div className="grid grid-cols-2 border-t border-border text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
        <div className="border-r border-border p-3">
          Checks
          <br />
          <span className="text-foreground">{grade.checks_assessment}</span>
        </div>
        <div className="p-3">
          Cell
          <br />
          <span className="text-foreground">{cell.cell_id}</span>
        </div>
      </div>
    </article>
  );
}
