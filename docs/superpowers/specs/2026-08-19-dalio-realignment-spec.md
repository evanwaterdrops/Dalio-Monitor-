# Dalio Realignment — Design Spec

Source of authority: *Big Debt Crises* (2018), Part 1 "The Archetypal Big Debt Cycle",
full-text extraction at `BridgewaterOS/ingest_work/chapters/P1-C1.txt` (line cites below).
Evan's directives (2026-08-19): stick to Dalio's own descriptors; TAX/PC/JP legs are his
own add-ons and are out of scope for the Dalio comparison; retain TradingView-style
expander cards; adopt Dalio's phase-shaded time-series grammar.

## 1. Vocabulary (display-only; machine keys `S1..S8/SC/SoV` are frozen — they live in
Supabase snapshots, `backtest/results.json`, `playbook/fingerprints.json`)

| Key | New display name | New role line (Dalio's framing) |
|---|---|---|
| SC | Short-Term Debt Cycle | "short-term debt cycles (business cycles)" P1:332 |
| S1 | Structural Deficit | debts rising faster than incomes — sovereign form |
| S2 | Debt-to-Income (federal) | his blue line: total debt % income P1:531,674 |
| S3 | Debt-Service Burden | his red line: debt service % income P1:531,677 |
| S4 | Borrowing to Pay Debt Service | "borrowed to make debt service payments" P1:201,727 |
| S5 | Supply/Demand for Bonds | runs / the thinning bid; HCGB supply-demand test |
| S6 | Interest Rates (MP1) — the Squeeze | "Monetary Policy 1" P1:1717; "debt-service squeeze" P1:816 |
| S7 | Nominal Growth vs Nominal Rates | "nominal growth… above the nominal interest rate" P1:1493,1608 |
| S8 | Debt Monetization (MP2/MP3) | "debt monetization / 'printing money'" P1:1109,1733 |
| SoV | Store Hold of Wealth | his recurring phrase P1:437,1775 |
| JP/TAX/PC | unchanged | Evan's add-ons, excluded from comparison |

Seven phases (replace invented `STAGE_LABELS`): 1 Early Part of the Cycle · 2 Bubble ·
3 Top · 4 Depression · 5 Beautiful Deleveraging · 6 Pushing on a String · 7 Normalization.
`bigCycleStage` returns `{ phaseNum, phase, detail, stage, status }` where `stage` keeps a
composed legacy string (DB snapshots and old fixtures parse nothing beyond display).
Current US read maps to phaseNum 3 ("Top", detail "late"); confirmed monetization while
hot maps to phaseNum 4 ("Depression — printing begins").
`Tabs.tsx` sub-label "price of money" → "interest rates".

## 2. Two-clock architecture (accepted from Evan's critique)

- **Fast clock (stress layer)**: daily/weekly, trigger-bearing. Every input must be
  ALFRED-vintage-replayable (or intrinsically unrevised: market prices, auction results).
- **Slow clock (position layer)**: quarterly, heavily revised (Z.1, DFA, TDSP, TCMDO if
  vintage coverage is thin). Display + `positionClock` score only. **Never averaged into
  the fast layer; never a trigger input.** Staleness is labeled, not smoothed.

## 3. Registry schema additions (`SeriesDef`)

```ts
layer: "fast" | "slow";
role: "trigger" | "context";
retire: string;              // the observation that would remove this series
trigger?: { form: "level" | "roc" | "percentile" | "composite";
            spec: string;    // exact rule, thresholds inline
            provenance: "published" | "dalio" | "self-calibrated" };
```
Rule: `role:"trigger"` requires `trigger` and `layer:"fast"`. `self-calibrated`
thresholds must be validated in the point-in-time backtest or demoted to `context`.

## 4. New series (chosen vs alternatives argued in session; trigger specs inline)

| key | source id | layer/role | trigger / purpose | retire when |
|---|---|---|---|---|
| m2 | FRED `M2SL` | fast/trigger | with `total_debt`: money y/y >8% while credit y/y < money−5pp = watch; money >10% & credit ≤0 = critical (Dalio signature P1:1506) | M2 redefinition breaks continuity again |
| monetary_base | FRED `BOGMBASE` | fast/context | M0 companion (his "Money %PGDP" charts may be M0; images lost) | proves redundant next to WALCL |
| total_debt | FRED `TCMDO` | slow/context* | blue line, all sectors ÷ GDP; *promote to trigger only if ALFRED vintages verified | BIS credit gap goes free & timely |
| hh_debt_networth | `CMDEBT`÷`TNWBSHNO` | slow/context | "debt-to-net-worth ratios go up" P1:1076 | — |
| dsr_household | FRED `TDSP` | slow/context | red line, household leg | BIS total DSR becomes timely |
| dsr_pnf | BIS-on-FRED (pin id) | slow/context | red line, private nonfinancial | same |
| wealth_shares | FRED DFA (pin ids) | slow/context | top 0.1% vs bottom 90% net-worth P1:1426 | DFA discontinued |
| core_pce | FRED `PCEPILFE` | fast/context | confirms CPI gate (Fed's target measure) | — |
| t5yie | FRED `T5YIE` | fast/trigger | valve co-key: ≥2.8% caps valve score 0.5 ("gated-by-expectations"); starts 2003 — backtest pre-2003 runs realized-only, documented | — |
| dgs3mo | FRED `DGS3MO` | fast/trigger | short rate; curve = DGS10−DGS3MO level (context) + steepening decomposition (trigger): bear-steepening (long +25bp/3m while front ≤+5bp, TP rising) → S5; bull-steepening → SC | — |
| sofr, iorb | FRED `SOFR`,`IORB` | fast/trigger | print discriminator: SOFR−IORB ≥ +10bp = funding-stress annotation; WALCL expansion that is bills-led (≥60% of Δ) = reserve management NOT monetization, regardless of funding stress (2019 precedent: repo stress then bills purchases was still plumbing); duration-led expansion = monetization | Fed abandons ample-reserves regime |
| spx | ~~Stooq `^spx` (Yahoo fallback)~~ → **AMENDED 2026-08-20: FRED `SP500` live (Yahoo fallback), spliced over `src/data/spx-monthly.json` for the chart's 30y span.** Stooq is permanently bot-blocked and was removed; FRED's 10y rolling licence covers the 3y ruler with margin. See `series.ts` spx entry. | fast/trigger | drawdown ruler: −20% elevated, −40% critical vs 3y high (Dalio ~50% depression P1:1085); Shiller real total-return monthly for backtest | — |
| bdc_pnav | Yahoo ARCC,BXSL,OBDC,FSK ÷ curated NAV | fast/trigger | median P/NAV 5y-percentile ≤10th = elevated; that AND HY OAS Δ3m < +40bp = divergence critical (private stress the public index can't see — selection-bias fix) | private credit marks become observable |
| reserve_premise | derived: corr60d(Δ DGS10, Δ dollar) | fast/trigger | persistent negative corr (yields up, dollar down > 40 of 60 days) = credibility regime → activates inflationary-archetype series | — |

Monetization gate (`monetisationValve`) becomes two-key: realized (CPI core/headline,
unchanged) + expected (`t5yieBp`). `bigCycleStage` monetising condition becomes
`fedAssetsUp3w && hot && printMode === "monetization"` (discriminator above). The
deferred asset (`RESPPLLOPNWW`) is unaffected by the discriminator critique and remains
the clean monetization-regime observable.

## 5. Chart grammar (Dalio-style)

One long time axis per metric; **phase bands shaded behind the data** using the
backtest's monthly stage history (fast layer) and annual century panel (slow layer);
series expressed %GDP or indexed-to-top as he does; same bands across every chart so
gold/equities/rates/money line up against cycle position. Expander cards stay for
print-level detail.

## 6. Out of scope (with falsifier)

FX reserves / currency-defense metrics stay excluded while the US runs the
reserve-currency deflationary template — the `reserve_premise` tripwire is the
falsifier that reactivates them. GDP gap stays display-never-trigger (model-based,
heavily revised). Seven-bubble-characteristics checklist deferred (partially
non-automatable; would need curated inputs).
