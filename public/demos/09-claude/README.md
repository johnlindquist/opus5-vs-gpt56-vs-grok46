# Latency Forensics — Find the Real Rollout Regression

A reproducible analysis of an 80-request rollout dataset, asking whether a candidate request
path should keep rolling out. Written in TypeScript for Bun 1.3, using only Bun/Node built-ins.
**No dependencies, no network, no statistics library, no charting library.**

## The short answer

The candidate is **not broadly slower**. It is *faster* than control in 3 of 4 comparable
`region / device / cache` strata. The aggregate looks 90.9% worse only because the candidate arm
carries 3.5× control's share of the slowest stratum — a traffic-mix artefact with the shape of
Simpson's paradox.

But the mix is not the whole story. One interaction, **`eu / mobile / cold`**, is genuinely
regressed: 798.3 ms (n=4) → 1216.9 ms (n=14), +52.4%. All four non-200 responses in the dataset
are candidate rows in that stratum, and the gap survives payload matching (+44.9% restricted to
the 720–960 KB range both arms exercised).

**Recommendation:** hold the rollout for `eu / mobile / cold`, continue elsewhere behind
per-stratum guardrails. The arms ran in disjoint time windows, so this is association, not cause.

Full reasoning is in [`analysis.md`](analysis.md); the visual version is [`report.html`](report.html).

## Run it

```sh
bun run src/cli.ts data/requests.csv \
  --json out/analysis.json \
  --markdown analysis.md \
  --html report.html
```

```sh
bun test
```

Then open `report.html` directly from disk — it is fully standalone.

## Layout

| Path | What it is |
|---|---|
| `data/requests.csv` | The input: 80 rows, 40 control / 40 candidate. |
| `src/analyze.ts` | Parser, statistics, and analysis library. Pure functions, no I/O. |
| `src/render.ts` | Markdown and standalone-HTML renderers. |
| `src/cli.ts` | CLI entrypoint and argument parsing. |
| `tests/analyze.test.ts` | 83 tests covering parsing, statistics, grouping, determinism, rendering, and CLI exit codes. |
| `out/analysis.json` | Deterministic structured output (schema version 1). |
| `analysis.md` | The written analysis, answering all nine required questions. |
| `report.html` | Standalone visual report with a 1600×900 screenshot-ready overview. |

## CLI contract

```
bun run src/cli.ts <input.csv> [--json <path>] [--markdown <path>] [--html <path>]
```

Exit codes: **0** success, **2** invalid usage or malformed input. Exit 2 covers a missing or
unreadable input file, an unknown option, an option missing its value, more than one positional
argument, a CSV missing any required column, a short row, and a non-numeric value in a numeric
column. Output paths' parent directories are created as needed.

Required columns: `request_id, variant, minute, region, device, cache, payload_kb, latency_ms, status`.

## Statistical conventions

- **Quantiles** use linear interpolation between the two nearest order statistics of the sorted
  sample — `h = (n-1)q`, the "type 7" convention used by R's default `quantile()` and
  `numpy.percentile`. Median is q=0.5, p95 is q=0.95. **At these sample sizes p95 is barely
  distinguishable from the maximum** and is reported as a tail indicator, not a population estimate.
- **Non-200 rows are never silently discarded.** They are kept in the all-rows statistics *and*
  reported separately, and a `status_200_only` view is computed alongside. This matters: filtering
  to status 200 would shrink the candidate mean from 604.7 ms to 513.9 ms while deleting the only
  evidence that one arm produced failures.
- **Grouping is explicit.** Stratum keys and payload-bucket edges are declared in code and
  enumerated in a fixed order, so results never depend on row order in the file. A test asserts
  that reversing the input produces byte-identical JSON.
- **Sample sizes accompany every grouped result**, in the JSON, the Markdown, and the charts.
- **Precision is bounded by the data.** Source latencies are whole milliseconds, so statistics are
  reported to one decimal place and shares to four. No further precision is claimed.
- **One optional bootstrap**, implemented locally: a percentile bootstrap of the payload-matched
  mean difference, seeded LCG (seed 20240917, 5000 iterations), with both samples sorted before
  resampling so the interval is a function of the data rather than of file order.

## Determinism

Identical input produces byte-identical `out/analysis.json`. Guaranteed by: fixed key order from
object literals, declared grouping order, fixed rounding, `-0` normalised to `0`, a seeded PRNG
with sorted inputs, and no clock or `Math.random()` anywhere in the analysis path. Three tests
cover this, including one that reverses the input row order.

## Reading the output honestly

The analysis labels every claim as **computed fact**, **interpretation**, or **recommendation**,
and the JSON `findings` carry an explicit `kind` and `confidence`. The central caveat is recorded
in `limitations` and repeated in both reports: control ran minutes 0–15 and candidate ran minutes
20–37, so the variant is perfectly confounded with time. Nothing in this dataset can separate
"the candidate path is slower" from "conditions changed after minute 20". The recommended action
is scoped to what observational evidence can actually support.
