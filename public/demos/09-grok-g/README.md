# Latency Forensics

Reproducible analysis of a time-split control vs candidate request-path rollout.

## Run

```sh
bun run src/cli.ts data/requests.csv \
  --json out/analysis.json \
  --markdown analysis.md \
  --html report.html
```

```sh
bun test
```

Invalid usage or a CSV missing required columns exits `2`.

## Layout

- `data/requests.csv` — frozen 80-row input
- `src/analyze.ts` — parser, statistics, Markdown/HTML renderers
- `src/cli.ts` — CLI entrypoint
- `src/analyze.test.ts` — `bun:test` coverage
- `out/analysis.json` — structured result
- `analysis.md` — written analysis
- `report.html` — standalone visual report (open from disk)

No packages are installed. Statistics use Hyndman-Fan type 7 quantiles. Non-200 rows are retained in all-row latency stats.

## Conclusion in one line

Candidate is not broadly slower; the aggregate gap is a mix shift plus a worse EU × mobile × cold (large payload) cell that also contains all four 504s. Do not continue an unguarded rollout.
