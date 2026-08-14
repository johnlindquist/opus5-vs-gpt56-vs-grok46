# Latency Forensics — Candidate Rollout After Minute 20

## Executive conclusion

Candidate is **not broadly slower**. Aggregate latency looks worse because candidate traffic is skewed toward EU mobile cold requests with large payloads, and **that one interaction is materially worse**, including all four non-200 responses. Warm desktop and US mobile cold cells are faster for candidate in this file. This is an observational, time-split dataset; it does **not** prove the candidate path caused the EU mobile regression. The rollout should **not** continue unguarded.

Distinction of claims:

- **Computed fact:** numbers below are calculated from the 80 supplied rows.
- **Interpretation:** mix shift plus a single bad stratum explains the aggregate gap (Simpson-like).
- **Recommendation:** hold EU mobile cold large payloads; do not treat other cells as a license for full rollout.

## 1. Aggregate latency and error rates

Quantile convention: Hyndman-Fan type 7 (R / Excel default): p-quantile is linearly interpolated at index p*(n-1) on the 0-based sorted sample. Empty samples yield null.

Non-200 requests are **retained** in all-row statistics. Status-200-only stats are reported separately.

| variant | n | mean | median | p95 | min | max | non-200 count | non-200 rate |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| control | 40 | 316.75 | 235.50 | 787.25 | 169 | 854 | 0 | 0% |
| candidate | 40 | 604.70 | 416.50 | 1457.85 | 146 | 1584 | 4 | 10% |

Status 200 only:

| variant | n | mean | median | p95 | min | max |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| control | 40 | 316.75 | 235.50 | 787.25 | 169 | 854 |
| candidate | 36 | 513.89 | 403.50 | 1278.50 | 146 | 1455 |

Source: `data/requests.csv`. Row count: 80.

## 2. Traffic mix

Candidate is heavier in EU, mobile, cold cache, and large payloads than control.

### Region

| key | control n | control share | candidate n | candidate share | share delta |
| --- | ---: | ---: | ---: | ---: | ---: |
| us | 24 | 60% | 18 | 45% | -15% |
| eu | 16 | 40% | 22 | 55% | 15% |

### Device

| key | control n | control share | candidate n | candidate share | share delta |
| --- | ---: | ---: | ---: | ---: | ---: |
| desktop | 28 | 70% | 16 | 40% | -30% |
| mobile | 12 | 30% | 24 | 60% | 30% |

### Cache

| key | control n | control share | candidate n | candidate share | share delta |
| --- | ---: | ---: | ---: | ---: | ---: |
| warm | 28 | 70% | 16 | 40% | -30% |
| cold | 12 | 30% | 24 | 60% | 30% |

### Payload range (KB)

| key | control n | control share | candidate n | candidate share | share delta |
| --- | ---: | ---: | ---: | ---: | ---: |
| 0-99 | 16 | 40% | 8 | 20% | -20% |
| 100-249 | 14 | 35% | 8 | 20% | -15% |
| 250-499 | 6 | 15% | 8 | 20% | 5% |
| 500-799 | 1 | 2.5% | 6 | 15% | 12.5% |
| 800+ | 3 | 7.5% | 10 | 25% | 17.5% |

## 3. Comparable strata (region × device × cache)

| stratum | control n | control mean | candidate n | candidate mean | mean delta (cand − ctrl) | candidate vs control | control non-200 | candidate non-200 |
| --- | ---: | ---: | ---: | ---: | ---: | --- | ---: | ---: |
| us|desktop|warm | 16 | 180.00 | 8 | 155.38 | -24.63 ms | faster | 0 | 0 |
| us|mobile|cold | 8 | 466.88 | 10 | 421.70 | -45.17 ms | faster | 0 | 0 |
| eu|desktop|warm | 12 | 238.50 | 8 | 211.38 | -27.13 ms | faster | 0 | 0 |
| eu|mobile|cold | 4 | 798.25 | 14 | 1216.93 | 418.68 ms | slower | 0 | 4 |

Candidate is consistently **faster** in US desktop warm, EU desktop warm, and US mobile cold. It is **slower** only in EU mobile cold.

## 4. Mix effect similar to Simpson’s paradox

Yes. The aggregate comparison conceals stratum direction. Three of four strata favor candidate, but the overall mean and p95 favor control because candidate places more traffic in the slowest cell and that cell is worse under candidate.

Weighted intuition: control’s EU mobile cold share is 4/40; candidate’s is 14/40. Moving mass into a ~1216.93 ms cell (vs control ~798.25 ms) dominates the remaining cells where candidate is tens of milliseconds faster.

## 5. Specific worse interaction

The candidate × **EU × mobile × cold** cell is the only materially worse interaction. All four 504s sit there. Payload bins 800+ and 500–799 are where candidate latency and errors concentrate.

## 6. Large cold EU mobile payloads

Evidence **supporting** the hypothesis:

- EU mobile cold candidate mean 1216.93 ms (n=14) vs control 798.25 ms (n=4).
- Overlapping payloads 720–960 KB: candidate 1156.70 ms (n=10) vs control 798.25 ms (n=4).
- Candidate unique larger payloads (1040, 1120 KB) include the highest latencies and 504s.
- Error rows: all candidate, all EU mobile cold.

Evidence **weakening** a simple “payload size alone” causal story:

- Control EU mobile cold n=4; overlapping comparison is small.
- Cache is collinear with mobile; no warm EU mobile rows exist.
- Time windows do not overlap.
- One candidate 1120 KB row (r079) is 986 ms / 200, so size does not map 1:1 onto latency or failure.

## 7. Limitations (no causal claim)

1. Variants occupy disjoint time windows (control minutes 0–15, candidate 20–37), so period effects are confounded with variant.
2. Assignment is not a concurrent randomized experiment; mix of region, device, cache, and payload is not balanced by design.
3. EU mobile cold control has only 4 rows; candidate has 14. Small n makes p95 and interaction magnitude fragile.
4. Cache state is collinear with device (desktop=warm, mobile=cold); region×device×cache strata cannot separate cache from device.
5. Payload size is collinear with region and device (US desktop smallest, EU mobile largest), so payload effects are not independently identified.
6. Four 504s are retained in latency statistics; failed requests may not be comparable to successful latency.
7. No retries, upstream dependency, or concurrency traces are present; a single-path regression cannot be isolated from correlated load.
8. Observational association must not be read as definitive causation of the candidate code path.

## 8. Rollout action justified by this dataset alone

Hold unguarded rollout. Exclude or tightly cap candidate on EU mobile cold large payloads. Other strata may remain enabled only with an explicit guard. This file does not justify a global continue-or-kill based on the aggregate mean.

## 9. Two follow-up measurements

1. Do not continue an unguarded full rollout. Hold or exclude candidate on EU mobile cold (especially payloads ≥720 KB) until a concurrent stratified test reproduces or refutes the cell.
2. Warm desktop US/EU and US mobile cold look faster for candidate in this file; those cells may continue only behind a region/device/payload guard, not as proof of global safety.
3. Follow-up 1: run a concurrent randomized A/B with pre-registered strata and equalized mix, oversampling EU mobile cold large payloads.
4. Follow-up 2: run a payload-size sweep on EU mobile with cache warm vs cold held separately to test whether size, cache, or their interaction drives the 504s and latency slope.

## Error rows

| request_id | variant | minute | region | device | cache | payload_kb | latency_ms | status |
| --- | --- | ---: | --- | --- | --- | ---: | ---: | ---: |
| r070 | candidate | 27 | eu | mobile | cold | 960 | 1264 | 504 |
| r072 | candidate | 29 | eu | mobile | cold | 1120 | 1512 | 504 |
| r076 | candidate | 33 | eu | mobile | cold | 880 | 1328 | 504 |
| r078 | candidate | 35 | eu | mobile | cold | 1040 | 1584 | 504 |

## Payload bins

- **0-99 KB:** control n=16, mean=180.00, median=180.00, p95=191.00, min=169, max=191 (non-200 0); candidate n=8, mean=155.38, median=155.00, p95=164.95, min=146, max=166 (non-200 0)
- **100-249 KB:** control n=14, mean=268.57, median=241.00, p95=445.70, min=226, max=460 (non-200 0); candidate n=8, mean=261.13, median=211.50, p95=429.50, min=198, max=447 (non-200 0)
- **250-499 KB:** control n=6, mean=472.83, median=475.00, p95=498.00, min=446, max=501 (non-200 0); candidate n=8, mean=370.25, median=412.00, p95=435.55, min=221, max=438 (non-200 0)
- **500-799 KB:** control n=1, mean=742.00, median=742.00, p95=742.00, min=742, max=742 (non-200 0); candidate n=6, mean=837.83, median=923.00, p95=1202.00, min=414, max=1242 (non-200 0)
- **800+ KB:** control n=3, mean=817.00, median=811.00, p95=849.70, min=786, max=854 (non-200 0); candidate n=10, mean=1286.70, median=1296.00, p95=1551.60, min=986, max=1584 (non-200 4)

## Findings

- **F1 (fact):** All-row means: control 316.75 ms (n=40) vs candidate 604.7 ms (n=40). Candidate p95 1457.85 vs control 787.25. Candidate non-200 rate 0.1 (4/40); control 0 (0/40).
- **F2 (fact):** Traffic mix shifted toward slower cells. EU share 0.4 control vs 0.55 candidate; mobile 0.3 vs 0.6; cold cache 0.3 vs 0.6; payload 800+ 0.075 vs 0.25.
- **F3 (fact):** Within region×device×cache strata with both variants, candidate is faster in 3 stratum/strata (us|desktop|warm, us|mobile|cold, eu|desktop|warm) and slower in 1 (eu|mobile|cold).
- **F4 (interpretation):** Aggregate ranking conceals a mix-plus-interaction pattern similar to Simpson’s paradox: candidate is faster in the three non-EU-mobile-cold strata, yet slower overall because candidate traffic is heavier in EU mobile cold and that stratum itself is slower.
- **F5 (fact):** The materially worse interaction is candidate × EU × mobile × cold. Mean delta all-rows 418.6786 ms (control n=4, candidate n=14). All 4 non-200 rows are candidate 504s in that stratum: r070, r072, r076, r078.
- **F6 (interpretation):** Large cold EU mobile payloads are supported as the problem cell, not merely a mix artifact. At overlapping payloads 720–960 KB, candidate mean 1156.7 ms (n=10) vs control 798.25 ms (n=4). Candidate also extends to 1040–1120 KB with the highest latencies and the 504s. This is association in a small observational cell, not a proven payload causal mechanism.
