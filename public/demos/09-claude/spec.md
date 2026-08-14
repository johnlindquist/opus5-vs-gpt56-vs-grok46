# Latency Forensics — Find the Real Rollout Regression

Perform a reproducible engineering analysis of a small rollout dataset. Build the analysis code, tests, a written conclusion, structured output, and a standalone visual report.

You are working in an empty isolated directory. Build the complete analysis now. Do not merely describe an approach.

Use Bun 1.3-compatible TypeScript and only Bun/Node standard APIs. Do not install a package.

## Scenario

A candidate request path was enabled after minute 20. Its aggregate latency appears much worse than control. The team wants to know whether the candidate is broadly slower, whether traffic mix explains part of the difference, whether a specific interaction is responsible, and whether the rollout should continue. Your job is to analyze the supplied data without overstating causality.

## Required input

Create `data/requests.csv` with exactly this content:

```csv
request_id,variant,minute,region,device,cache,payload_kb,latency_ms,status
r001,control,0,us,desktop,warm,48,172,200
r002,control,1,us,desktop,warm,64,181,200
r003,control,2,us,desktop,warm,80,176,200
r004,control,3,us,desktop,warm,96,188,200
r005,control,4,us,desktop,warm,48,169,200
r006,control,5,us,desktop,warm,64,184,200
r007,control,6,us,desktop,warm,80,179,200
r008,control,7,us,desktop,warm,96,191,200
r009,control,8,us,desktop,warm,48,172,200
r010,control,9,us,desktop,warm,64,181,200
r011,control,10,us,desktop,warm,80,176,200
r012,control,11,us,desktop,warm,96,188,200
r013,control,12,us,desktop,warm,48,169,200
r014,control,13,us,desktop,warm,64,184,200
r015,control,14,us,desktop,warm,80,179,200
r016,control,15,us,desktop,warm,96,191,200
r017,control,4,eu,desktop,warm,160,226,200
r018,control,5,eu,desktop,warm,192,241,200
r019,control,6,eu,desktop,warm,224,233,200
r020,control,7,eu,desktop,warm,160,249,200
r021,control,8,eu,desktop,warm,192,238,200
r022,control,9,eu,desktop,warm,224,244,200
r023,control,10,eu,desktop,warm,160,226,200
r024,control,11,eu,desktop,warm,192,241,200
r025,control,12,eu,desktop,warm,224,233,200
r026,control,13,eu,desktop,warm,160,249,200
r027,control,14,eu,desktop,warm,192,238,200
r028,control,15,eu,desktop,warm,224,244,200
r029,control,8,us,mobile,cold,240,438,200
r030,control,9,us,mobile,cold,320,472,200
r031,control,10,us,mobile,cold,400,451,200
r032,control,11,us,mobile,cold,480,489,200
r033,control,12,us,mobile,cold,240,460,200
r034,control,13,us,mobile,cold,320,501,200
r035,control,14,us,mobile,cold,400,446,200
r036,control,15,us,mobile,cold,480,478,200
r037,control,12,eu,mobile,cold,720,742,200
r038,control,13,eu,mobile,cold,800,811,200
r039,control,14,eu,mobile,cold,880,786,200
r040,control,15,eu,mobile,cold,960,854,200
r041,candidate,20,us,desktop,warm,48,148,200
r042,candidate,21,us,desktop,warm,64,159,200
r043,candidate,22,us,desktop,warm,80,151,200
r044,candidate,23,us,desktop,warm,96,163,200
r045,candidate,24,us,desktop,warm,48,146,200
r046,candidate,25,us,desktop,warm,64,156,200
r047,candidate,26,us,desktop,warm,80,154,200
r048,candidate,27,us,desktop,warm,96,166,200
r049,candidate,20,eu,desktop,warm,160,198,200
r050,candidate,21,eu,desktop,warm,192,214,200
r051,candidate,22,eu,desktop,warm,224,205,200
r052,candidate,23,eu,desktop,warm,256,221,200
r053,candidate,24,eu,desktop,warm,160,202,200
r054,candidate,25,eu,desktop,warm,192,217,200
r055,candidate,26,eu,desktop,warm,224,209,200
r056,candidate,27,eu,desktop,warm,256,225,200
r057,candidate,22,us,mobile,cold,240,397,200
r058,candidate,23,us,mobile,cold,320,421,200
r059,candidate,24,us,mobile,cold,400,405,200
r060,candidate,25,us,mobile,cold,480,438,200
r061,candidate,26,us,mobile,cold,560,414,200
r062,candidate,27,us,mobile,cold,240,447,200
r063,candidate,28,us,mobile,cold,320,402,200
r064,candidate,29,us,mobile,cold,400,431,200
r065,candidate,30,us,mobile,cold,480,419,200
r066,candidate,31,us,mobile,cold,560,443,200
r067,candidate,24,eu,mobile,cold,720,902,200
r068,candidate,25,eu,mobile,cold,800,1018,200
r069,candidate,26,eu,mobile,cold,880,1136,200
r070,candidate,27,eu,mobile,cold,960,1264,504
r071,candidate,28,eu,mobile,cold,1040,1388,200
r072,candidate,29,eu,mobile,cold,1120,1512,504
r073,candidate,30,eu,mobile,cold,760,944,200
r074,candidate,31,eu,mobile,cold,720,1082,200
r075,candidate,32,eu,mobile,cold,800,1196,200
r076,candidate,33,eu,mobile,cold,880,1328,504
r077,candidate,34,eu,mobile,cold,960,1455,200
r078,candidate,35,eu,mobile,cold,1040,1584,504
r079,candidate,36,eu,mobile,cold,1120,986,200
r080,candidate,37,eu,mobile,cold,760,1242,200
```

## Required analysis questions

Answer all of these from computed results:

1. What are count, mean, median, p95, minimum, maximum, and non-200 rate for control and candidate?
2. How different is the traffic mix by region, device, cache state, and payload range?
3. Within comparable region × device × cache strata, is candidate consistently slower or faster?
4. Does aggregate comparison conceal a mix effect similar to Simpson’s paradox?
5. Is there a specific candidate interaction involving region, device, cache state, or payload size that is materially worse?
6. What evidence supports or weakens the hypothesis that large cold EU mobile payloads are the problem?
7. What data-quality or experimental-design limitations prevent a causal claim?
8. What rollout action is justified by this dataset alone?
9. What two follow-up measurements or experiments would most reduce uncertainty?

Do not treat observational association as definitive causation. Distinguish computed fact, interpretation, and recommendation.

## Required implementation

Create:

- `src/analyze.ts`: reusable parser and analysis library.
- `src/cli.ts`: CLI entrypoint.
- `data/requests.csv`: exact input.
- `out/analysis.json`: deterministic structured output.
- `analysis.md`: complete written analysis.
- `report.html`: standalone visual report.
- Tests using `bun:test`.
- `README.md`.

The command must be:

```sh
bun run src/cli.ts data/requests.csv \
  --json out/analysis.json \
  --markdown analysis.md \
  --html report.html
```

Invalid usage or malformed required columns must exit 2.

## Statistical rules

- State the quantile convention used.
- Do not silently discard non-200 requests.
- Compute latency statistics both including all rows and, where useful, for status 200 only.
- Use explicit deterministic grouping.
- Include sample sizes beside every grouped result.
- Do not calculate fake precision.
- You may use a simple bootstrap implemented locally, but it is optional and must be deterministic if included.
- Do not import a statistics library.

Validation checkpoints:

- There are exactly 80 rows.
- There are exactly 40 control and 40 candidate rows.
- Control has zero non-200 rows.
- Candidate has four non-200 rows.

## Structured output

`out/analysis.json` must include:

```json
{
  "schema_version": 1,
  "source": "data/requests.csv",
  "row_count": 80,
  "variants": {},
  "traffic_mix": {},
  "strata": [],
  "payload_analysis": {},
  "findings": [],
  "limitations": [],
  "recommendations": []
}
```

Populate every section with computed values and stable ordering.

## Visual report

`report.html` must open directly from disk and include:

- A clear executive conclusion.
- Aggregate comparison.
- Traffic-mix comparison.
- Stratum comparison.
- Payload-versus-latency visualization.
- Error rows.
- Findings, limitations, and recommendation.
- Inline SVG, Canvas, or HTML/CSS charts without a library.
- Exact sample sizes and readable labels.
- No external assets.
- A strong 1600×900 overview suitable for screenshot capture.

## Tests

At minimum, test:

- CSV parsing and required columns.
- Exact row and variant counts.
- Quantile behavior.
- Error-rate computation.
- Stable grouping order.
- Known aggregate means within a small tolerance.
- Identification of the four candidate error rows.
- JSON determinism.
- CLI exit 2 for invalid input.
- HTML and Markdown generation.

Run the tests and the real analysis command before finishing.

## Non-negotiable delivery contract

Work only inside the current directory. Do not inspect, read, or write parent or sibling directories. Do not use the network except for the model session already in progress. Do not install packages. Do not create a deployment, publish anything, push anything, initialize Git, or leave a server or background process running. Do not create symlinks. Use only local files and built-in browser, Bun, or Node APIs.

Before finishing, create `battle-result.json` with exactly this shape:

```json
{
  "schema_version": 1,
  "status": "complete",
  "title": "Latency Forensics — Find the Real Rollout Regression",
  "kind": "dev",
  "entrypoint": "report.html",
  "artifacts": [
    "report.html",
    "analysis.md",
    "out/analysis.json",
    "src/analyze.ts",
    "src/cli.ts",
    "data/requests.csv",
    "README.md"
  ],
  "checks": [
    {
      "name": "test suite",
      "command": "bun test",
      "status": "passed",
      "details": "All analysis tests passed."
    },
    {
      "name": "reproducible analysis",
      "command": "bun run src/cli.ts data/requests.csv --json out/analysis.json --markdown analysis.md --html report.html",
      "status": "passed",
      "details": "The supplied dataset produced JSON, Markdown, and HTML outputs."
    }
  ],
  "summary": "A concise description of the completed analysis and its conclusion.",
  "known_issues": []
}
```

List every important local file in artifacts. Every recorded check must be one you actually ran. If any required acceptance item remains unmet, set status to incomplete, mark the relevant check failed or not_run, and describe the issue honestly.
