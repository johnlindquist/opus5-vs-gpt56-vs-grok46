# Latency Forensics — Find the Real Rollout Regression

Source: `data/requests.csv` · 80 rows · schema version 1

Every number below is computed by `src/analyze.ts` from the source CSV. Sections are labelled
**Computed fact**, **Interpretation**, or **Recommendation** so the boundary between what the data
say and what we infer stays explicit.

## Executive conclusion

The candidate is **not broadly slower**. It is faster than control in 3 of 4 comparable strata. The aggregate looks +90.9% worse because the candidate arm carries 3.5× the share of the slowest stratum (`eu / mobile / cold`) that control does. That is a traffic-mix artefact.

But the mix is **not the whole story**. One interaction — `eu / mobile / cold` — is genuinely worse: 798.3 ms (n=4) → 1216.9 ms (n=14), +52.4%. All 4 non-200 responses in the dataset are candidate rows inside that stratum. The gap survives payload matching.

**Recommended action:** hold the rollout for `eu / mobile / cold` — particularly large cold-cache payloads — and continue the ramp elsewhere behind per-stratum guardrails. This is observational data from disjoint time windows; it justifies a targeted hold, not a causal claim and not a full rollback.

## Method and conventions

- **Quantiles.** Quantiles use linear interpolation between the two nearest order statistics of the ascending-sorted sample (h = (n-1)q; the 'type 7' convention used by R's default quantile() and numpy.percentile). Median is the q=0.5 quantile, p95 is q=0.95. With small n, p95 is close to the sample maximum and should be read as a tail indicator, not a stable population estimate.
- **Non-200 rows are retained.** They are included in the all-rows statistics *and* reported separately. Dropping them would systematically remove the slowest observations and flatter the candidate.
- **Two views of latency.** `all rows` and `status 200 only` are both computed. Where they diverge, the divergence is itself a finding.
- **Grouping is explicit and deterministic.** Strata are `region / device / cache`, enumerated in alphabetical key order; payload buckets have fixed edges declared in code, so ordering never depends on row order in the file.
- **Precision.** Latencies are whole milliseconds in the source, so statistics are reported to one decimal place and shares to four. No further precision is claimed.
- **Bootstrap.** One optional deterministic percentile bootstrap (seeded LCG, seed 20240917, 5000 iterations) on the payload-matched stratum difference. No statistics library is imported.

### Validation checkpoints

| Check | Expected | Actual | Result |
|---|---|---|---|
| Total rows | 80 | 80 | pass |
| Control rows | 40 | 40 | pass |
| Candidate rows | 40 | 40 | pass |
| Control non-200 | 0 | 0 | pass |
| Candidate non-200 | 4 | 4 | pass |

## 1. Aggregate statistics by variant

**Computed fact.**

All rows (non-200 included):

| Variant | n | Mean ms | Median ms | p95 ms | Min ms | Max ms |
|---|---|---|---|---|---|---|
| control | 40 | 316.8 | 235.5 | 787.2 | 169 | 854 |
| candidate | 40 | 604.7 | 416.5 | 1457.9 | 146 | 1584 |

Status 200 only:

| Variant | n | Mean ms | Median ms | p95 ms | Min ms | Max ms |
|---|---|---|---|---|---|---|
| control | 40 | 316.8 | 235.5 | 787.2 | 169 | 854 |
| candidate | 36 | 513.9 | 403.5 | 1278.5 | 146 | 1455 |

| Variant | n | Non-200 count | Non-200 rate |
|---|---|---|---|
| control | 40 | 0 | 0.0% |
| candidate | 40 | 4 | 10.0% |

Aggregate deltas: mean 287.9 ms (+90.9%), median 181 ms (+76.9%), p95 670.7 ms (+85.2%).

**Interpretation.** Read this table as a description of two *different populations of requests*, not as a treatment effect. Section 2 shows why.

## 2. Traffic mix

**Computed fact.** Shares are within-variant (each variant's column sums to 100%).

### Region

| Value | Control n | Control share | Candidate n | Candidate share | Share delta |
|---|---|---|---|---|---|
| eu | 16 | 40.0% | 22 | 55.0% | +15.0 pp |
| us | 24 | 60.0% | 18 | 45.0% | -15.0 pp |

### Device

| Value | Control n | Control share | Candidate n | Candidate share | Share delta |
|---|---|---|---|---|---|
| desktop | 28 | 70.0% | 16 | 40.0% | -30.0 pp |
| mobile | 12 | 30.0% | 24 | 60.0% | +30.0 pp |

### Cache

| Value | Control n | Control share | Candidate n | Candidate share | Share delta |
|---|---|---|---|---|---|
| cold | 12 | 30.0% | 24 | 60.0% | +30.0 pp |
| warm | 28 | 70.0% | 16 | 40.0% | -30.0 pp |

### Payload range

| Value | Control n | Control share | Candidate n | Candidate share | Share delta |
|---|---|---|---|---|---|
| 0-128 KB | 16 | 40.0% | 8 | 20.0% | -20.0 pp |
| 129-256 KB | 14 | 35.0% | 10 | 25.0% | -10.0 pp |
| 257-512 KB | 6 | 15.0% | 6 | 15.0% | 0.0 pp |
| 513-1024 KB | 4 | 10.0% | 12 | 30.0% | +20.0 pp |
| 1025+ KB | 0 | 0.0% | 4 | 10.0% | +10.0 pp |

**Interpretation.** The mix difference is large and it all points the same way: the candidate arm is loaded with heavier, colder, more distant, larger-payload traffic. The slowest stratum by control mean, `eu / mobile / cold`, is 35.0% of candidate rows against 10.0% of control rows. An aggregate mean over these two arms is mostly measuring that imbalance.

## 3. Within-stratum comparison

**Computed fact.** Strata are `region / device / cache`. Sample sizes are shown for every cell.

| Stratum | Control n | Control mean | Control median | Control p95 | Candidate n | Candidate mean | Candidate median | Candidate p95 | Mean delta | Direction |
|---|---|---|---|---|---|---|---|---|---|---|
| eu / desktop / warm | 12 | 238.5 | 239.5 | 249 | 8 | 211.4 | 211.5 | 223.6 | -27.1 ms (-11.4%) | candidate faster |
| eu / mobile / cold | 4 | 798.3 | 798.5 | 847.6 | 14 | 1216.9 | 1219 | 1537.2 | 418.6 ms (+52.4%) | candidate slower |
| us / desktop / warm | 16 | 180 | 180 | 191 | 8 | 155.4 | 155 | 165 | -24.6 ms (-13.7%) | candidate faster |
| us / mobile / cold | 8 | 466.9 | 466 | 496.8 | 10 | 421.7 | 420 | 445.2 | -45.2 ms (-9.7%) | candidate faster |

**Computed fact.** Candidate is faster in 3 of 4 comparable strata and slower in 1. The answer to "is candidate consistently slower or faster?" is **neither** — it is consistently *faster* except in one stratum, where it is much worse.

## 4. Does the aggregate conceal a mix effect?

**Computed fact.**

- Aggregate direction: candidate slower (+90.9%).
- Per-stratum direction: candidate faster in 3/4 strata.
- Candidate mean standardised to the **control** traffic mix (direct standardisation): **331.6 ms**, against a control mean of 316.8 ms and an *observed* candidate mean of 604.7 ms.

**Interpretation.**

Yes — the aggregate conceals a mix effect with the shape of Simpson's paradox: the pooled comparison points one way while the majority of stratum-level comparisons point the other. Standardising the candidate's per-stratum means onto the control mix removes most of the apparent regression (604.7 → 331.6 ms).

It is worth being precise about what standardisation does *not* show. The adjusted figure is still above the control mean, and that residual is real: it is the one badly regressed stratum leaking through. So this is not a pure paradox where the aggregate is entirely artefactual — it is a mix artefact **plus** a genuine localised regression, and separating the two is the whole job here. Reporting only "it's Simpson's paradox, ship it" would be as wrong as reporting only the aggregate.

## 5. Is a specific interaction responsible?

**Computed fact.** Yes, and it is isolated to one cell.

`eu / mobile / cold`: control 798.3 ms mean / 798.5 ms median / 847.6 ms p95 (n=4); candidate 1216.9 ms mean / 1219 ms median / 1537.2 ms p95 (n=14). Delta 418.6 ms (+52.4%). Candidate max in this stratum is 1584 ms against a control max of 854 ms.

Every other stratum improves: `eu / desktop / warm` -11.4%, `us / desktop / warm` -13.7%, `us / mobile / cold` -9.7%.

**Interpretation.** The regression is an *interaction*, not a main effect. It requires the conjunction of EU region, mobile device, cold cache, and large payload. No single one of those factors predicts the slowdown on its own — EU desktop warm improves, US mobile cold improves. That pattern is what makes an aggregate dashboard so misleading here, and it is also what makes the fix likely to be narrow rather than architectural.

## 6. Evidence on the "large cold EU mobile payloads" hypothesis

**Supporting evidence (computed fact):**

- The regression is confined to exactly that stratum; the other three improve.
- All 4 non-200 rows (status 504) are in it: r070 @ 960 KB, 1264 ms; r072 @ 1120 KB, 1512 ms; r076 @ 880 KB, 1328 ms; r078 @ 1040 KB, 1584 ms. Control has zero.
- Within candidate `eu / mobile / cold`, latency rises 0.909 ms per KB (r=0.6), a steeper per-byte cost than control's 0.389 ms per KB.
- Payload-matched comparison, restricted to the 720–960 KB range present in both arms: control 798.3 ms (n=4) vs candidate 1156.7 ms (n=10), 358.5 ms (+44.9%). Deterministic bootstrap 95% interval on that difference: [245.5, 471.4] ms.

**Weakening evidence (computed fact):**

- Payload is only a **partial** explanation even within the stratum. The candidate payload correlation is r=0.6 (n=14), so payload accounts for roughly 36% of the variance — the majority is unexplained by payload size.
- Elapsed time is a competing, non-zero correlate: 18.301 ms per **minute** (r=0.352, n=14). It fits worse than payload, but minute and payload are partly collinear in this arm, so neither slope is cleanly identified and a "system degrades across the rollout window" story cannot be ruled out.
- The relationship is not monotone in payload. r078 (1040 KB, minute 35) took 1584 ms while r079 (1120 KB, minute 36) took 986 ms — a *larger* payload that was substantially *faster*. A strictly per-byte cost model does not predict that; a resource that saturates and then recovers does.
- Candidate payloads reach 1024+ KB where control stops at 960 KB, so part of the raw candidate tail has no control counterpart at all and is pure extrapolation.
- The comparison rests on 4 payload-matched control rows. That is a very thin base for a claim about a production path.

**Interpretation.** The hypothesis is *directionally supported but incompletely specified*. "Large cold EU mobile payloads are slower under the candidate" is well supported — it survives payload matching, so it is not merely that the candidate got sent bigger requests. What is **not** established is that payload size is the mechanism. Elapsed time in the rollout window fits the data equally well, and the two are confounded by design here. Treat "large payload" as the best available *marker* for the affected traffic, not as the identified cause.

### Payload bucket detail

| Payload bucket | Control n | Control mean | Candidate n | Candidate mean | Delta |
|---|---|---|---|---|---|
| 0-128 KB | 16 | 180 | 8 | 155.4 | -13.7% |
| 129-256 KB | 14 | 268.6 | 10 | 253.5 | -5.6% |
| 257-512 KB | 6 | 472.8 | 6 | 419.3 | -11.3% |
| 513-1024 KB | 4 | 798.3 | 12 | 1035.3 | +29.7% |
| 1025+ KB | 0 | — | 4 | 1367.5 | — (no overlap) |

### Non-200 rows

| Request | Variant | Minute | Stratum | Payload KB | Latency ms | Status |
|---|---|---|---|---|---|---|
| r070 | candidate | 27 | eu / mobile / cold | 960 | 1264 | 504 |
| r072 | candidate | 29 | eu / mobile / cold | 1120 | 1512 | 504 |
| r076 | candidate | 33 | eu / mobile / cold | 880 | 1328 | 504 |
| r078 | candidate | 35 | eu / mobile / cold | 1040 | 1584 | 504 |

Note: a 504 latency records how long the request took to give up, not how long a completed request took. These values are retained in the all-rows statistics but should not be read as service times.

## 7. Limitations that prevent a causal claim

1. Not a randomised experiment. The arms ran in disjoint time windows (control minutes 0-15, candidate minutes 20-37), so any change in load, upstream health, or network conditions between windows is fully confounded with the variant.
2. Traffic was not balanced across arms. Region, device, cache state, and payload distribution all differ, so the aggregate comparison is not interpretable as a treatment effect without standardisation.
3. Sample sizes are tiny. The regressed stratum has only 4 control rows against 14 candidate rows; the payload-matched comparison rests on 4 control observations. Interval estimates are correspondingly wide.
4. p95 on samples this small is barely distinguishable from the maximum. Treat every p95 in this report as a tail indicator, not an estimate of a population 95th percentile.
5. Payload ranges do not fully overlap. Candidate reaches 1120 KB in the regressed stratum while control stops at 960 KB, so part of the raw candidate tail is extrapolation beyond anything control ever exercised.
6. Cache state is observed, not assigned. 'cold' is plausibly downstream of the variant itself (a new path may miss cache more often), which would make it a mediator rather than a confounder; controlling for it could mask a real effect.
7. Non-200 rows carry a latency value, but a 504 latency is a timeout artefact rather than a completed-request measurement. They are retained in the all-rows statistics and also reported separately, because dropping them would systematically remove the slowest observations.
8. No per-request context: no upstream service attribution, connection reuse flag, retry indicator, or concurrency measure. The mechanism behind the regression cannot be identified from these nine columns.
9. One dataset, one run. There is no replication and no pre-registered hypothesis, so the specific interaction identified here was found by searching the data and deserves confirmatory testing.

**Interpretation.** The decisive limitation is the first one. Control ran minutes 0–15 and candidate ran minutes 20–37; the variant is perfectly confounded with time. Every association reported above is observational. Nothing in this dataset can distinguish "the candidate code path is slower" from "the system was under different conditions after minute 20" — and the within-candidate time trend is exactly what you would expect from the latter.

## 8. Justified rollout action

**Recommendation.**

### Hold the rollout for eu / mobile / cold; continue elsewhere behind a guarded ramp

The data justify a targeted hold, not a full rollback. Exclude eu / mobile / cold (and specifically large cold-cache payloads) from the candidate path until the regression is understood, while allowing the candidate to continue in the three strata where it is measurably faster (eu / desktop / warm; us / desktop / warm; us / mobile / cold). This is the strongest action supported by observational data with confounded time windows: it stops the observed harm without discarding a change that looks beneficial everywhere else. A full rollback would be over-reading a stratum holding just 4 control and 14 candidate rows; a full ramp would ignore a 100% error concentration.

### Add a stratum-level guardrail before any further ramp

Aggregate dashboards produced exactly the wrong headline here: they said "candidate is broadly slower" when it is faster for 3 of 4 strata. Gate the ramp on per-stratum latency and error rate with sample sizes shown, not on a single pooled mean.

**What is *not* justified by this dataset alone:** a full rollback (three of four strata improve, some materially), a claim that the candidate causes 504s (four errors, no control counterfactual in the same time window), or a public performance claim in either direction.

## 9. Two follow-ups that would most reduce uncertainty

**Recommendation.**

### Run a properly randomised, concurrent A/B restricted to the suspect stratum

Assign eu / mobile / cold traffic randomly to control and candidate in the same time window, with matched payload strata and a pre-registered primary metric (mean and p95 latency, plus 504 rate). This is the single highest-value follow-up: it removes the time-window confound and the mix imbalance simultaneously, which no amount of post-hoc adjustment on this dataset can do. Target enough rows per payload band to detect a 20% difference, which is far more than the 4 control rows available here.

### Instrument the candidate path to separate per-byte cost from time-dependent degradation

Emit a server-side latency breakdown (connection setup, TLS, upstream wait, transfer, retries) plus cache-miss reason and connection-reuse flag for the regressed stratum. The current data show latency climbing with elapsed minute as well as payload, which distinguishes two very different root causes — a fixed per-byte penalty versus a resource that degrades under sustained load (pool exhaustion, cache fill, memory pressure). A controlled payload sweep at constant load, and a constant-payload soak over time, would separate them directly.

## Appendix — findings register

### F1 · Aggregate latency is 90.9% higher for candidate, but the arms are not comparable in aggregate

*computed fact · confidence: high*

Control mean 316.8 ms (n=40); candidate mean 604.7 ms (n=40). Median 235.5 -> 416.5 ms; p95 787.2 -> 1457.9 ms. The two arms draw from very different traffic mixes, so this difference is not an effect estimate.

Evidence:

- control all-rows mean=316.8 ms, n=40
- candidate all-rows mean=604.7 ms, n=40
- mean delta=287.9 ms (90.9%)

### F2 · Traffic mix differs sharply between arms

*computed fact · confidence: high*

The slowest stratum (eu / mobile / cold) is 35% of candidate traffic but only 10% of control traffic — a 3.5x over-representation. Region, device, cache state, and payload distribution all shift in the same direction.

Evidence:

- region eu: control 16 (40%) vs candidate 22 (55%)
- region us: control 24 (60%) vs candidate 18 (45%)
- cache cold: control 12 vs candidate 24
- cache warm: control 28 vs candidate 16

### F3 · Candidate is faster in 3 of 4 comparable strata

*computed fact · confidence: high*

eu / desktop / warm: control 238.5 ms (n=12) vs candidate 211.4 ms (n=8), -11.4%; eu / mobile / cold: control 798.3 ms (n=4) vs candidate 1216.9 ms (n=14), +52.4%; us / desktop / warm: control 180 ms (n=16) vs candidate 155.4 ms (n=8), -13.7%; us / mobile / cold: control 466.9 ms (n=8) vs candidate 421.7 ms (n=10), -9.7%

Evidence:

- eu / desktop / warm: candidate_faster, delta -27.1 ms, n=12/8
- eu / mobile / cold: candidate_slower, delta 418.6 ms, n=4/14
- us / desktop / warm: candidate_faster, delta -24.6 ms, n=16/8
- us / mobile / cold: candidate_faster, delta -45.2 ms, n=8/10

### F4 · The aggregate comparison conceals a mix effect (Simpson's-paradox-shaped reversal)

*interpretation · confidence: high*

Aggregate says candidate is 90.9% slower, but candidate is faster in 3 of 4 comparable strata. The candidate arm carries a much larger share of the slowest stratum (eu / mobile / cold: 35% of candidate rows vs 10% of control rows), so the aggregate is dominated by mix, not by a broad slowdown. This is a Simpson's-paradox-shaped reversal: mix-adjusting removes most but not all of the gap, because one stratum has a genuine regression.

Evidence:

- strata where candidate is faster: 3/4
- candidate mean standardised to the control mix: 331.6 ms vs control 316.8 ms
- observed (unstandardised) candidate mean: 604.7 ms

### F5 · A single interaction is responsible: eu / mobile / cold

*computed fact · confidence: high*

In eu / mobile / cold, control mean is 798.3 ms (n=4) and candidate mean is 1216.9 ms (n=14), 52.4% higher. Candidate p95 in this stratum is 1537.2 ms. Every other stratum improves. All 4 non-200 rows fall in this stratum.

Evidence:

- eu / mobile / cold control mean=798.3 ms (n=4)
- eu / mobile / cold candidate mean=1216.9 ms (n=14)
- delta=418.6 ms (52.4%)
- candidate p95 in stratum=1537.2 ms

### F6 · All 4 non-200 rows are candidate rows inside the regressed stratum

*computed fact · confidence: high*

Control error rate is 0% (0 of 40). Candidate error rate is 10% (4 of 40), and every error is a status 504 in eu / mobile / cold. Error-row latencies (1264, 1512, 1328, 1584 ms) sit in the upper tail, consistent with a timeout ceiling being approached.

Evidence:

- r070: candidate, minute 27, eu / mobile / cold, 960 KB, 1264 ms, status 504
- r072: candidate, minute 29, eu / mobile / cold, 1120 KB, 1512 ms, status 504
- r076: candidate, minute 33, eu / mobile / cold, 880 KB, 1328 ms, status 504
- r078: candidate, minute 35, eu / mobile / cold, 1040 KB, 1584 ms, status 504

### F7 · Payload size alone does not explain the regression

*interpretation · confidence: moderate*

Restricting both arms to the overlapping payload range (720-960 KB) inside eu / mobile / cold still leaves candidate 358.5 ms higher (44.9%), on n=4 control and n=10 candidate rows. Bootstrap 95% interval for that payload-matched difference: 245.5 to 471.4 ms. So candidate carrying larger payloads is a contributing factor, not the whole story — something in the candidate path is worse at equal payload.

Evidence:

- payload-matched control mean=798.3 ms (n=4)
- payload-matched candidate mean=1156.7 ms (n=10)
- bootstrap 95% CI: [245.5, 471.4] ms, seed=20240917, iterations=5000

### F8 · Payload is the strongest single correlate in the regressed stratum, but it explains only a minority of the variance

*interpretation · confidence: low*

Within candidate eu / mobile / cold, latency rises 0.909 ms per KB (r=0.6, n=14) — roughly 2.3x control's 0.389 ms per KB, which is real support for a per-byte cost. But r=0.6 means payload accounts for only about 36% of the variance in this stratum; elapsed minute is a weaker but non-zero correlate (18.301 ms per minute, r=0.352), and the two are partly collinear so neither slope is cleanly identified. A strictly monotone per-byte model is also directly contradicted by the data: r078 (1040 KB, minute 35) took 1584 ms while r079 (1120 KB, minute 36) took 986 ms — a larger payload that was substantially faster. Control's slopes in this stratum rest on only 4 rows, where payload and minute are perfectly collinear (identical r=0.857), so the control baseline slope is barely estimable. Conclusion: payload marks the affected traffic well, but the mechanism is not established and something else is moving too.

Evidence:

- eu / mobile / cold — control vs payload_kb: slope=0.389, r=0.857, n=4
- eu / mobile / cold — control vs minute: slope=31.1, r=0.857, n=4
- eu / mobile / cold — candidate vs payload_kb: slope=0.909, r=0.6, n=14
- eu / mobile / cold — candidate vs minute: slope=18.301, r=0.352, n=14

### F9 · Excluding non-200 rows would understate candidate latency by a large margin

*computed fact · confidence: high*

Candidate all-rows mean is 604.7 ms; status-200-only mean is 513.9 ms — a 90.8 ms gap, because the four 504s are among the slowest observations. Control is unaffected (316.8 ms either way, zero non-200 rows). A pipeline that silently filtered to status 200 would shrink the apparent candidate regression while removing evidence that only the candidate arm produced failures. Both views are reported here for that reason.

Evidence:

- candidate all-rows mean=604.7 ms (n=40), p95=1457.9 ms
- candidate status-200-only mean=513.9 ms (n=36), p95=1278.5 ms
- control identical under both views: mean=316.8 ms (n=40)

## Reproducing this analysis

```sh
bun run src/cli.ts data/requests.csv \
  --json out/analysis.json \
  --markdown analysis.md \
  --html report.html
```

Output is deterministic: identical input produces byte-identical JSON.
