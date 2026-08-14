# Latency Forensics — Find the Real Rollout Regression

## Executive conclusion

**Computed fact:** Candidate aggregate latency is worse: its mean is 604.7 ms versus 316.8 ms for control (+288.0 ms), and its p95 is 1,457.9 ms versus 787.3 ms. Candidate has 4/40 non-200 responses (10.0%); control has none. All requests, including 504s, are retained in these primary figures.

**Interpretation:** This is not a broad regression. Candidate is faster in three of four comparable region × device × cache strata. The exception—EU × mobile × cold—is 418.7 ms slower on mean and contains every observed 504. Candidate traffic also contains much more of this slow stratum, so traffic mix inflates the aggregate gap. Yet direct standardization to the combined stratum mix still leaves candidate +69.9 ms slower, meaning mix alone does not explain the result.

**Recommendation:** Do not continue an unrestricted rollout from this evidence. Pause or exclude EU mobile cold traffic behind a guardrail while running a concurrent, randomized, payload-balanced comparison. The association is strong enough for operational caution, but this time-separated observational sample cannot establish that the candidate path caused the regression.

## Method

- Source: `data/requests.csv`; 80 rows (control n=40, candidate n=40).
- Quantiles: Linear interpolation at h=(n-1)p on sorted values (R type 7 / NumPy default).
- Primary latency statistics include every status. Status-200-only statistics are shown separately where they clarify sensitivity.
- Payload ranges are fixed at 0–255, 256–511, 512–767, and 768+ KB.
- Group keys and output categories are lexically sorted for deterministic output.

## 1. Aggregate comparison

| Variant | All requests | Status 200 only |
|---|---|---|
| Control | n=40; mean 316.8 ms; median 235.5 ms; p95 787.3 ms; min–max 169–854 ms; non-200 0/40 (0.0%) | n=40; mean 316.8 ms; median 235.5 ms; p95 787.3 ms; min–max 169–854 ms; non-200 0/40 (0.0%) |
| Candidate | n=40; mean 604.7 ms; median 416.5 ms; p95 1,457.9 ms; min–max 146–1,584 ms; non-200 4/40 (10.0%) | n=36; mean 513.9 ms; median 403.5 ms; p95 1,278.5 ms; min–max 146–1,455 ms; non-200 0/36 (0.0%) |

Removing candidate 504s lowers the candidate mean to 513.9 ms (n=36), but this remains an outcome-conditioned sensitivity view, not the primary comparison.

## 2. Traffic mix

### region

| Category | Control | Candidate | Candidate − control |
|---|---:|---:|---:|
| eu | 16 (40.0%) | 22 (55.0%) | +15.0 pp |
| us | 24 (60.0%) | 18 (45.0%) | -15.0 pp |

### device

| Category | Control | Candidate | Candidate − control |
|---|---:|---:|---:|
| desktop | 28 (70.0%) | 16 (40.0%) | -30.0 pp |
| mobile | 12 (30.0%) | 24 (60.0%) | +30.0 pp |

### cache

| Category | Control | Candidate | Candidate − control |
|---|---:|---:|---:|
| cold | 12 (30.0%) | 24 (60.0%) | +30.0 pp |
| warm | 28 (70.0%) | 16 (40.0%) | -30.0 pp |

### payload range kb

| Category | Control | Candidate | Candidate − control |
|---|---:|---:|---:|
| 0000-0255 | 30 (75.0%) | 16 (40.0%) | -35.0 pp |
| 0256-0511 | 6 (15.0%) | 8 (20.0%) | +5.0 pp |
| 0512-0767 | 1 (2.5%) | 6 (15.0%) | +12.5 pp |
| 0768+ | 3 (7.5%) | 10 (25.0%) | +17.5 pp |

The largest consequential imbalance is the bundled EU × mobile × cold stratum: control n=4 (10.0%) versus candidate n=14 (35.0%). Marginal tables above also show candidate has more EU, mobile, cold, and 768+ KB traffic; because these attributes co-occur, the marginal shifts must not be interpreted as independent effects.

## 3. Comparable strata

| Stratum | Control | Candidate | Mean delta |
|---|---|---|---:|
| eu × desktop × warm | n=12; mean 238.5 ms; median 239.5 ms; p95 249.0 ms; min–max 226–249 ms; non-200 0/12 (0.0%) | n=8; mean 211.4 ms; median 211.5 ms; p95 223.6 ms; min–max 198–225 ms; non-200 0/8 (0.0%) | -27.1 ms (-11.4%) |
| eu × mobile × cold | n=4; mean 798.3 ms; median 798.5 ms; p95 847.6 ms; min–max 742–854 ms; non-200 0/4 (0.0%) | n=14; mean 1,216.9 ms; median 1,219.0 ms; p95 1,537.2 ms; min–max 902–1,584 ms; non-200 4/14 (28.6%) | +418.7 ms (+52.4%) |
| us × desktop × warm | n=16; mean 180.0 ms; median 180.0 ms; p95 191.0 ms; min–max 169–191 ms; non-200 0/16 (0.0%) | n=8; mean 155.4 ms; median 155.0 ms; p95 165.0 ms; min–max 146–166 ms; non-200 0/8 (0.0%) | -24.6 ms (-13.7%) |
| us × mobile × cold | n=8; mean 466.9 ms; median 466.0 ms; p95 496.8 ms; min–max 438–501 ms; non-200 0/8 (0.0%) | n=10; mean 421.7 ms; median 420.0 ms; p95 445.2 ms; min–max 397–447 ms; non-200 0/10 (0.0%) | -45.2 ms (-9.7%) |

Candidate is faster in US desktop warm, EU desktop warm, and US mobile cold. It is slower only in EU mobile cold. Therefore the aggregate result conceals a mix effect resembling Simpson’s paradox, but not a complete sign reversal: direct standardization gives 398.3 ms for control and 468.2 ms for candidate (+69.9 ms). The raw aggregate gap is +288.0 ms.

## 4. Payload and interaction analysis

| Payload KB range | Variant | n | Mean ms | Median ms | p95 ms | Non-200 |
|---|---|---:|---:|---:|---:|---:|
| 0000-0255 | candidate | 16 | 208.3 | 182.0 | 409.5 | 0 |
| 0000-0255 | control | 30 | 221.3 | 191.0 | 353.0 | 0 |
| 0256-0511 | candidate | 8 | 370.3 | 412.0 | 435.6 | 0 |
| 0256-0511 | control | 6 | 472.8 | 475.0 | 498.0 | 0 |
| 0512-0767 | candidate | 6 | 837.8 | 923.0 | 1,202.0 | 0 |
| 0512-0767 | control | 1 | 742.0 | 742.0 | 742.0 | 0 |
| 0768+ | candidate | 10 | 1,286.7 | 1,296.0 | 1,551.6 | 4 |
| 0768+ | control | 3 | 817.0 | 811.0 | 849.7 | 0 |

The candidate EU × mobile × cold slice has n=14; mean 1,216.9 ms; median 1,219.0 ms; p95 1,537.2 ms; min–max 902–1,584 ms; non-200 4/14 (28.6%). Its status-200-only mean is 1,134.9 ms (n=10), so high latency is not confined to the four errors. 10/14 observations in this slice are at least 768 KB.

Evidence supporting the “large cold EU mobile payload” hypothesis:

- It is the only comparable stratum where candidate is slower, by +418.7 ms on mean.
- All four 504s occur there, at 880–1040 KB, and successful rows in the slice are also slow.
- Candidate’s 768+ KB band is dramatically slower than its smaller bands.

Evidence weakening a causal payload claim:

- Region, mobile device, cold cache, larger payload, later time, and candidate are tightly bundled; their individual contributions are not identifiable.
- The control EU mobile cold sample is only n=4, and its payload range (720–960 KB) overlaps only part of candidate’s range (720–1120 KB).
- Candidate latency is not monotonic in payload (for example, 1120 KB includes both 986 and 1512 ms), and there are no concurrent randomized observations.

## 5. Error rows

| Request | Minute | Payload KB | Latency ms | Status |
|---|---:|---:|---:|---:|
| r070 | 27 | 960 | 1264 | 504 |
| r072 | 29 | 1120 | 1512 | 504 |
| r076 | 33 | 880 | 1328 | 504 |
| r078 | 35 | 1040 | 1584 | 504 |

## 6. Data-quality and design limitations

- Variant is perfectly separated by time (control minutes 0–15; candidate minutes 20–37), so temporal drift is confounded with treatment.
- Traffic was not balanced or randomized across strata; stratum sample sizes differ, especially EU × mobile × cold (control n=4, candidate n=14).
- Payload distributions do not overlap well inside EU × mobile × cold, limiting like-for-like payload comparisons.
- Region, device, and cache occur only in four bundled combinations, so their individual effects and interactions are not separately identifiable.
- The dataset is small, contains no repeated rollout cycles, and supplies no server/resource/network telemetry.
- Status 504 may be part of the latency mechanism; excluding it would condition on an outcome, so primary statistics retain all rows.

These limitations prevent a causal claim. The dataset supports a localized association and an operational decision, not attribution to payload size or the candidate implementation alone.

## 7. Rollout action and follow-ups

**Action justified by this dataset alone:** pause or exclude the EU mobile cold candidate slice and retain a conservative guardrail. The dataset does not justify either a full rollout or a claim that all candidate traffic is slower.

The two highest-value follow-ups are:

1. **Experiment:** Run a concurrent randomized control/candidate comparison within region × device × cache, with balanced payload bands and predefined latency/error guardrails.
2. **Measurement:** Instrument stage-level latency, timeout origin, payload bytes, network timing, and resource saturation for EU mobile cold requests, keyed by request ID.

Those directly address the two largest uncertainties: treatment/time and mix confounding, then the location of delay and timeout mechanism.
