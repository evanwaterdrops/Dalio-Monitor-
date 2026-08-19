# Dalio Realignment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rename the monitor's taxonomy to Dalio's own vocabulary, add the total-economy metrics from *Big Debt Crises* Part 1 under a two-clock (fast-stress / slow-position) architecture with written trigger specs, and render Dalio-style phase-shaded charts — without breaking persisted snapshots, fixtures, or the point-in-time backtest.

**Architecture:** Machine keys (`S1..S8`, `SC`, `SoV`) are frozen; only display strings change. New series enter `src/lib/config/series.ts` under an extended schema (`layer`/`role`/`retire`/`trigger`). New pure functions go in `src/lib/framework/math.mjs` (tested via `scripts/selftest.mjs`), wired in `src/lib/framework/assess.ts`, rendered in `src/app/`. Backtest replays only fast-layer trigger inputs.

**Tech Stack:** Next.js App Router (server components), plain-JS math core shared with zero-dep test scripts, FRED/ALFRED + FiscalData + TreasuryDirect + OANDA + Stooq/Yahoo, Supabase persistence.

**Spec:** `docs/superpowers/specs/2026-08-19-dalio-realignment-spec.md` — read it first; the vocabulary table, trigger specs, and two-clock rules there are normative.

## Global Constraints

- Machine keys `SC,S1..S8,SoV,JP,TAX,PC` and factor object keys in snapshots MUST NOT change (Supabase rows, `scripts/backtest/results.json`, `src/lib/playbook/fingerprints.json` depend on them).
- Valve labels (`"open"`, `"gated-by-energy-shock"`, `"partially-gated"`, `"blocked-by-underlying-inflation"`) and SC phase strings are machine vocabulary consumed by `fingerprint.mjs` — do not rename; new labels may be added.
- Every new `role:"trigger"` series MUST carry a `trigger` spec and `layer:"fast"`; slow-layer series never enter composites with fast-layer factors.
- All commands run from repo root. Verify with `npm run selftest` (must stay green, currently 20/20 → grows), `npm run build` (exit 0). Backtest: `npm run backtest`.
- One-job-per-series; every new registry entry carries a `retire` condition.
- Commit after each task with the message given in the task.

---

### Task 1: Registry schema — layer/role/retire/trigger

**Files:**
- Modify: `src/lib/config/series.ts`

**Interfaces:**
- Produces: extended `SeriesDef` consumed by Tasks 4–5:
  `layer: "fast"|"slow"; role: "trigger"|"context"; retire: string; trigger?: { form: "level"|"roc"|"percentile"|"composite"; spec: string; provenance: "published"|"dalio"|"self-calibrated" }`

- [ ] **Step 1: Extend the interface** in `series.ts` (after the `note` field):

```ts
  layer: "fast" | "slow";  // fast = daily/weekly, vintage-replayable; slow = quarterly, revised (position layer)
  role: "trigger" | "context";
  retire: string;          // the observation that would remove this series
  trigger?: {
    form: "level" | "roc" | "percentile" | "composite";
    spec: string;          // exact rule with thresholds
    provenance: "published" | "dalio" | "self-calibrated";
  };
```

- [ ] **Step 2: Populate all existing entries.** Every current series gets `layer`/`role`/`retire`; trigger-bearing ones get `trigger`. Exact values (key → additions):

| key | layer | role | trigger.form / spec / provenance | retire |
|---|---|---|---|---|
| payrolls | fast | trigger | composite / "3mma<50 with Sahm≥0.5, or 3mma≤0, or 3mma<50 & revisions2m≤−75k" / published (Sahm 0.50) | "BLS vintage archive breaks" |
| unrate | fast | trigger | level / "Sahm gap ≥0.5 (3mma vs 12m low)" / published | "superseded if claims-based rule outperforms in backtest" |
| participation | fast | context | — | "UNRATE denominator distortion ends" |
| cpi_headline | fast | trigger | level / "headline>3 gates valve at 0.7; wedge≥0.6+energy caps 0.55" / self-calibrated (backtest-validated) | "PCE adopted as sole gate" |
| cpi_core | fast | trigger | level / "core≥3 blocks valve at 0.25; core-to-2% sets score" / dalio (inflation blocks printing) | same |
| brent | fast | trigger | level / "Brent≥85 or oil y/y≥+40% = energy gate" / self-calibrated | "war premium resolves and stays resolved 12m" |
| dgs10 | fast | trigger | roc / "feeds r-vs-g drift and curve decomposition" / dalio | "never — the marginal cost of debt" |
| dgs30 | fast | trigger | roc / "+≥8bp on a cut day = T2 long-end-selloff" / self-calibrated | "T2 superseded by bear-steepening regime trigger" |
| dgs2 | fast | context | — | "3M series replaces path proxy" |
| funds_upper | fast | trigger | composite / "cut day + DGS30 rule above" / self-calibrated | same as dgs30 |
| term_premium | fast | trigger | roc / "ΔTP input to steepening decomposition" / self-calibrated | "ACM model discontinued" |
| real_10y | fast | trigger | roc / "+75/150/250bp per 12m = watch/elevated/critical; gold divergence T3" / self-calibrated (2022 backtest) | "TIPS liquidity distortions dominate signal" |
| avg_interest_rate | fast | trigger | level / "rAvg vs g crossing; drift=(10Y−rAvg)×rollover" / dalio (nominal growth vs nominal rates) | "never" |
| debt_to_penny | fast | trigger | roc / "debt growth vs nominal GDP growth" / dalio | "never" |
| mts_receipts_outlays | fast | trigger | level / "TTM interest/receipts ≥20% critical, ≥17% elevated" / dalio (loss-of-discretion) | "never" |
| nominal_gdp | fast | trigger | roc / "g in the hinge; −3pp recession haircut" / self-calibrated | "never" |
| gross_debt_gdp | slow | context | — | "TCMDO total-economy view replaces headline use" |
| auctions_10y | fast | trigger | composite / "2×10Y: BTC<2.4 AND dealer>18% = critical" / self-calibrated | "auction WI/tail data becomes free" |
| foreign_total | slow | context | — | "weekly H.4.1 custody proxy adopted" |
| japan_tic | fast | trigger | composite / "2m absolute decline + JGB +15bp/3m + yen −2%/3m: 3 hits critical" / self-calibrated | "TIC lag makes custody proxy strictly better" |
| jgb_10y | fast | trigger | (japan composite above) | same |
| fed_assets | fast | trigger | composite / "up 3wks AND hot AND printMode=monetization (Task 3 discriminator)" / dalio (monetize-while-hot) | "never" |
| deferred_asset | fast | trigger | level / "≤−200bn critical; direction by 13w delta" / dalio (central-bank losses, literal) | "Fed remits again (level ≥ 0)" |
| gold_usd, eurusd, usdjpy | fast | trigger | composite / "up>2% in all three numeraires = credit flight; + real yields up = T3" / dalio (store hold of wealth) | "never" |
| hy_oas | fast | trigger | composite / "≥500 & widening critical; ≥400 or +75/3m elevated; +40/3m watch" / self-calibrated | "reassigned: public-HY repricing only; BDC P/NAV owns private-credit (Task 3)" |
| bbb_oas | fast | context | — | "fallen-angel boundary stops being the IG cliff" |
| ai_credit_basket | fast | context | — | "Evan's PC leg restructured" |
| hyperscaler_coverage | slow | context | — | "an API appears" |
| rollover_share | fast | trigger | level / "multiplies drift rate in r-vs-g" / dalio | "automated from MSPD (roadmap)" |

- [ ] **Step 3: Verify** — `npx tsc --noEmit` exit 0; `npm run selftest` 20/20 (schema is additive, no behavior change).

- [ ] **Step 4: Commit** — `git add src/lib/config/series.ts && git commit -m "feat(registry): layer/role/retire/trigger schema — every series carries its firing rule and exit clause"`

---

### Task 2: Rename pass — Dalio vocabulary, keys frozen

**Files:**
- Modify: `src/lib/config/series.ts` (FACTOR_META only), `src/lib/framework/math.mjs` (bigCycleStage + comments), `src/app/page.tsx:83-91,115-118,338-346`, `src/app/components/Tabs.tsx:45`, `scripts/selftest.mjs`, `README.md`

**Interfaces:**
- Produces: `bigCycleStage(...)` now returns `{ phaseNum: number, phase: string, detail: string, stage: string, status }` — Tasks 3/5/6/7 rely on `phaseNum` (1–7) and `phase`. Legacy `stage` string retained for old DB snapshots.

- [ ] **Step 1: Rewrite `FACTOR_META`** in `series.ts` with the spec §1 table verbatim:

```ts
export const FACTOR_META: Record<string, { name: string; station: string }> = {
  SC:  { name: "Short-Term Debt Cycle", station: "Business cycle" },
  S1:  { name: "Structural Deficit", station: "Debts rising faster than incomes" },
  S2:  { name: "Debt-to-Income (federal)", station: "The blue line" },
  S3:  { name: "Debt-Service Burden", station: "The red line" },
  S4:  { name: "Borrowing to Pay Debt Service", station: "Unsustainability sign" },
  S5:  { name: "Supply/Demand for Bonds", station: "The thinning bid" },
  S6:  { name: "Interest Rates (MP1)", station: "The squeeze" },
  S7:  { name: "Nominal Growth vs Nominal Rates", station: "The hinge" },
  S8:  { name: "Debt Monetization (MP2/MP3)", station: "Printing money" },
  TAX: { name: "Revenue quality (AI beta)", station: "Tax-base leg" },
  PC:  { name: "Private credit / circularity", station: "Private leg" },
  JP:  { name: "Japan repatriation", station: "Demand leg" },
  SoV: { name: "Store Hold of Wealth", station: "Exit leg" },
};
```

- [ ] **Step 2: Failing test first** — in `scripts/selftest.mjs` change the stage assertions to the new shape (they will fail until Step 3):

```js
const st = bigCycleStage({ fedAssetsUp3w: false, coreYoY: 2.5, headlineYoY: 3.4, valveScore: 0.55 });
eq("phase = Top (Dalio's seven)", st.phase, "Top");
eq("phaseNum 3/7", st.phaseNum, 3);
const stM = bigCycleStage({ fedAssetsUp3w: true, coreYoY: 2.5, headlineYoY: 3.4, valveScore: 0.55 });
eq("monetising while hot → Depression, printing begins", stM.phaseNum, 4);
truthy("legacy stage string retained", typeof stM.stage === "string" && stM.stage.length > 0);
```

Run `npm run selftest` → the new assertions FAIL (old return shape).

- [ ] **Step 3: Rewrite `bigCycleStage`** in `math.mjs` (replaces lines 248–254; `printMode` is used from Task 3 on, null-safe today):

```js
export function bigCycleStage({ fedAssetsUp3w, coreYoY, headlineYoY, valveScore, printMode = null }) {
  const hot = headlineYoY > 3.0;
  const monetising = fedAssetsUp3w && hot && (printMode == null || printMode === "monetization");
  if (monetising) return { phaseNum: 4, phase: "Depression", detail: "printing while hot — monetization confirmed",
    stage: "DEPRESSION — printing begins (monetization confirmed)", status: STATUS.CRITICAL };
  if (valveScore >= 0.7) return { phaseNum: 3, phase: "Top", detail: "monetization gate reopening",
    stage: "TOP, LATE — monetization gate reopening", status: STATUS.CRITICAL };
  return { phaseNum: 3, phase: "Top", detail: "late", stage: "TOP, LATE", status: STATUS.ELEVATED };
}
```

- [ ] **Step 4: `page.tsx`** — replace `STAGE_LABELS` (lines 83–91) with Dalio's seven and use `phaseNum`:

```ts
const STAGE_LABELS: Record<number, string> = {
  1: "Early Part of the Cycle", 2: "Bubble", 3: "Top", 4: "Depression",
  5: "Beautiful Deleveraging", 6: "Pushing on a String", 7: "Normalization",
};
```

Line 116–118 becomes (old-snapshot fallback keeps working):

```ts
const stageText: string = snap.stage?.stage ?? "—";
const stageNum: number = snap.stage?.phaseNum ?? (stageText.includes("DELEVERAGING") || stageText.includes("Depression") ? 4 : 3);
const stageLabel = STAGE_LABELS[stageNum] ?? "Unknown Phase";
```

Line 340: `"/ 7 STAGES"` → `"/ 7 PHASES"`. Line 365 `"Stage-5 metric"` → `"Central-bank losses — Dalio's literal metric"`. Sweep the rest of `page.tsx` prose: "Monetisation" → "Debt Monetization", "price of money" → "interest rates (MP1)", "store-of-value" → "store hold of wealth" (lines 89, 146, 172, 269 and any grep hits).

- [ ] **Step 5: `Tabs.tsx:45`** — `labor · inflation · price of money` → `labor · inflation · interest rates`.

- [ ] **Step 6: `math.mjs` comment headers** — update banner comments only (not function names, not machine labels): "Price of money (Station 6)" → "Interest rates, MP1 (S6 — Dalio: the squeeze)"; "Monetisation valve (Station 8)" → "Debt monetization gate (S8 — Dalio: MP2/MP3, printing blocked by inflation)"; "(Station 5/3/7)" analogous per spec §1. `README.md`: replace the eight-station list in the header comment section with the spec §1 table reference; leave mechanics intact.

- [ ] **Step 7: Verify** — `npm run selftest` all green (including new assertions); `npm run build` exit 0. Run `npm run backtest` and confirm `scripts/backtest/results.json` regenerates cleanly (stage strings are excluded from heat scoring per `score.mjs:411`, so scores must be identical; only the stage text column changes). If backtest fetch needs the network and fails, record that in the commit body and regenerate in Task 7 instead.

- [ ] **Step 8: Commit** — `git commit -am "feat(vocab): Dalio's seven phases + book vocabulary everywhere; machine keys and fixtures untouched"`

---

### Task 3: New framework math (TDD, all pure functions)

**Files:**
- Modify: `src/lib/framework/math.mjs`, `scripts/selftest.mjs`

**Interfaces:**
- Produces (consumed by Tasks 5–7):
  - `moneyVsCredit({ m2YoYPct, creditYoYPct }) → { signature: "none"|"printing-into-contraction"|"broad-expansion", status }`
  - `curveShape({ dFrontBp3m, dLongBp3m, dTpBp3m, spreadBp }) → { mode: "bear-steepening"|"bull-steepening"|"bear-flattening"|"bull-flattening"|"stable", inverted: boolean, status }`
  - `printDiscriminator({ fedAssetsUp3w, billsShareOfExpansion, sofrIorbBp }) → { printMode: "none"|"reserve-management"|"monetization", fundingStress: boolean }`
  - `reservePremise({ corr60d }) → { regime: "reserve-template"|"credibility-watch", status }`
  - `equityDrawdown({ ddPct }) → { ddPct, status }`
  - `bdcStress({ medianPnav, pnavPctile5y, hyOasDelta3mBp }) → { medianPnav, divergence: boolean, status }`
  - `positionClock({ totalDebtGdpPct, hhDebtNetWorthPct, dsrHouseholdPct, wealthRatio, curveSpreadBp }) → { score, label, status }` (slow layer, context-only)
  - `monetisationValve` gains optional `expInfl5yPct = null` (two-key gate)
  - `evaluateTriggers` gains: T2 `bear_steepening_regime`, T3 `bdc_hy_divergence`, T3 `reserve_premise_flip`; `monetisation_while_hot` now requires `s.printMode !== "reserve-management"`.

- [ ] **Step 1: Write the failing tests** — append to `scripts/selftest.mjs` (import the new names in the header import):

```js
// --- money vs credit: Dalio's monetization signature (P1:1506)
eq("2009 shape: money accelerating into credit contraction",
  moneyVsCredit({ m2YoYPct: 10.3, creditYoYPct: -0.8 }).signature, "printing-into-contraction");
eq("2004 shape: both expanding = no signature",
  moneyVsCredit({ m2YoYPct: 5.1, creditYoYPct: 8.9 }).signature, "none");

// --- curve decomposition: bear-steepening = fiscal/term-premium story (S5)
const cs = curveShape({ dFrontBp3m: 2, dLongBp3m: 41, dTpBp3m: 28, spreadBp: 55 });
eq("long selling off, front anchored = bear-steepening", cs.mode, "bear-steepening");
eq("bear-steepening is elevated", cs.status, "elevated");
eq("bull-steepening (front rallying on cuts) is the small-cycle story",
  curveShape({ dFrontBp3m: -45, dLongBp3m: -5, dTpBp3m: 3, spreadBp: 80 }).mode, "bull-steepening");
truthy("inversion flagged as context, not a trigger",
  curveShape({ dFrontBp3m: 0, dLongBp3m: 0, dTpBp3m: 0, spreadBp: -30 }).inverted);

// --- print discriminator: 2019-style bill buying is plumbing, not the Dalio print
eq("bills-led expansion = reserve management",
  printDiscriminator({ fedAssetsUp3w: true, billsShareOfExpansion: 0.85, sofrIorbBp: 12 }).printMode, "reserve-management");
eq("duration-led expansion = monetization",
  printDiscriminator({ fedAssetsUp3w: true, billsShareOfExpansion: 0.2, sofrIorbBp: 2 }).printMode, "monetization");
eq("no expansion = none", printDiscriminator({ fedAssetsUp3w: false, billsShareOfExpansion: 0, sofrIorbBp: 0 }).printMode, "none");

// --- discriminator gates the stage call: same WALCL print, different verdicts
eq("reserve-management expansion does NOT confirm Depression",
  bigCycleStage({ fedAssetsUp3w: true, coreYoY: 2.5, headlineYoY: 3.4, valveScore: 0.55, printMode: "reserve-management" }).phaseNum, 3);

// --- valve two-key gate: expectations can close what realized CPI left open
eq("anchored expectations leave valve as realized-CPI says",
  monetisationValve({ coreYoY: 2.5, headlineYoY: 2.9, brent: 78, expInfl5yPct: 2.3 }).label, "open");
eq("unanchored expectations gate the valve on their own",
  monetisationValve({ coreYoY: 2.5, headlineYoY: 2.9, brent: 78, expInfl5yPct: 3.1 }).label, "gated-by-expectations");

// --- BDC divergence: private stress the public index can't see
truthy("BDCs at 5y-low discounts while HY stays tight = divergence",
  bdcStress({ medianPnav: 0.81, pnavPctile5y: 0.06, hyOasDelta3mBp: 12 }).divergence);
eq("divergence is critical", bdcStress({ medianPnav: 0.81, pnavPctile5y: 0.06, hyOasDelta3mBp: 12 }).status, "critical");
eq("no NAV data degrades to ok", bdcStress({ medianPnav: null, pnavPctile5y: null, hyOasDelta3mBp: 12 }).status, "ok");

// --- reserve premise tripwire: yields up + dollar down = credibility regime
eq("persistent negative yield/dollar corr flips the premise",
  reservePremise({ corr60d: -0.42 }).regime, "credibility-watch");
eq("normal reserve template", reservePremise({ corr60d: 0.31 }).regime, "reserve-template");

// --- equity drawdown ruler (Dalio: depressions ~50%)
eq("−22% vs 3y high = elevated", equityDrawdown({ ddPct: -22 }).status, "elevated");
eq("−45% = critical", equityDrawdown({ ddPct: -45 }).status, "critical");

// --- position clock is slow-layer context and never critical
truthy("position clock caps at elevated",
  positionClock({ totalDebtGdpPct: 350, hhDebtNetWorthPct: 18, dsrHouseholdPct: 12, wealthRatio: 1.1, curveSpreadBp: -40 }).status !== "critical");
```

- [ ] **Step 2: Run `npm run selftest`** — new assertions FAIL ("not defined").

- [ ] **Step 3: Implement** — append to `math.mjs`:

```js
/* Money vs credit — Dalio's monetization signature (P1:1506): "money growing at an
 * extremely fast rate at the same time as credit and real economic activity are
 * contracting". Thresholds self-calibrated; Task 7 validates 2008-09/2020 fire,
 * 1999–2007 quiet, or this demotes to context. */
export function moneyVsCredit({ m2YoYPct, creditYoYPct }) {
  if (!Number.isFinite(m2YoYPct) || !Number.isFinite(creditYoYPct))
    return { signature: "none", status: STATUS.OK };
  if (m2YoYPct >= 10 && creditYoYPct <= 0)
    return { signature: "printing-into-contraction", status: STATUS.CRITICAL };
  if (m2YoYPct >= 8 && creditYoYPct < m2YoYPct - 5)
    return { signature: "printing-into-contraction", status: STATUS.WATCH };
  return { signature: m2YoYPct > 6 && creditYoYPct > 6 ? "broad-expansion" : "none", status: STATUS.OK };
}

/* Curve decomposition. Naive "flat or inverted" fired 2022-24 and un-fired; the
 * trigger-bearing signal is the steepening MODE: bear-steepening (long end sold,
 * front anchored, term premium rising) is the fiscal/demand story → S5;
 * bull-steepening is the cut-pricing small-cycle story → SC. Inversion is context. */
export function curveShape({ dFrontBp3m, dLongBp3m, dTpBp3m, spreadBp }) {
  const inverted = Number.isFinite(spreadBp) && spreadBp < 0;
  let mode = "stable";
  if (dLongBp3m >= 25 && dFrontBp3m <= 5) mode = "bear-steepening";
  else if (dFrontBp3m <= -25 && dLongBp3m > dFrontBp3m) mode = "bull-steepening";
  else if (dFrontBp3m >= 25 && dLongBp3m < dFrontBp3m) mode = "bear-flattening";
  else if (dLongBp3m <= -25 && dFrontBp3m > -10) mode = "bull-flattening";
  const status = mode === "bear-steepening" && dTpBp3m > 0 ? STATUS.ELEVATED
    : mode === "bear-steepening" ? STATUS.WATCH : STATUS.OK;
  return { mode, inverted, status };
}

/* Print discriminator — a WALCL expansion is only Dalio's print if it takes
 * DURATION. Bills-led expansion holding reserves ample (2019 precedent) is
 * plumbing even when SOFR-IORB is stressed. */
export function printDiscriminator({ fedAssetsUp3w, billsShareOfExpansion, sofrIorbBp }) {
  const fundingStress = Number.isFinite(sofrIorbBp) && sofrIorbBp >= 10;
  if (!fedAssetsUp3w) return { printMode: "none", fundingStress };
  if (Number.isFinite(billsShareOfExpansion) && billsShareOfExpansion >= 0.6)
    return { printMode: "reserve-management", fundingStress };
  return { printMode: "monetization", fundingStress };
}

/* Reserve-premise tripwire — the falsifier for excluding inflationary-archetype
 * series. Yields up WITH dollar down as a persistent regime = sovereign
 * credibility repricing, not the deflationary reserve template. */
export function reservePremise({ corr60d }) {
  const flip = Number.isFinite(corr60d) && corr60d <= -0.35;
  return { regime: flip ? "credibility-watch" : "reserve-template",
           status: flip ? STATUS.ELEVATED : STATUS.OK };
}

/* Equity drawdown vs rolling 3y high — Dalio's depression ruler (~50% declines,
 * P1:1085). */
export function equityDrawdown({ ddPct }) {
  if (!Number.isFinite(ddPct)) return { ddPct: null, status: STATUS.OK };
  const status = ddPct <= -40 ? STATUS.CRITICAL : ddPct <= -20 ? STATUS.ELEVATED
    : ddPct <= -10 ? STATUS.WATCH : STATUS.OK;
  return { ddPct: round2(ddPct), status };
}

/* BDC price-to-NAV — live market mark on private-credit books. The divergence
 * (BDCs stressed while public HY stays tight) is the selection-bias scenario:
 * risk migrated out of the public index. Group median vs own 5y history. */
export function bdcStress({ medianPnav, pnavPctile5y, hyOasDelta3mBp }) {
  if (!Number.isFinite(medianPnav)) return { medianPnav: null, divergence: false, status: STATUS.OK };
  const stressed = Number.isFinite(pnavPctile5y) && pnavPctile5y <= 0.10;
  const divergence = stressed && Number.isFinite(hyOasDelta3mBp) && hyOasDelta3mBp < 40;
  const status = divergence ? STATUS.CRITICAL : stressed ? STATUS.ELEVATED
    : medianPnav < 0.9 ? STATUS.WATCH : STATUS.OK;
  return { medianPnav: round2(medianPnav), divergence, status };
}

/* Position clock — the SLOW layer, scored separately from the fast stress layer
 * and never averaged into it. Quarterly, revised inputs; context only, so its
 * ceiling is ELEVATED by construction. */
export function positionClock({ totalDebtGdpPct, hhDebtNetWorthPct, dsrHouseholdPct, wealthRatio, curveSpreadBp }) {
  const parts = [];
  if (Number.isFinite(totalDebtGdpPct)) parts.push(clamp01((totalDebtGdpPct - 150) / 200)); // 150%→0, 350%→1 (Dalio bubble avg ~300%)
  if (Number.isFinite(hhDebtNetWorthPct)) parts.push(clamp01((hhDebtNetWorthPct - 10) / 10));
  if (Number.isFinite(dsrHouseholdPct)) parts.push(clamp01((dsrHouseholdPct - 8) / 6));
  if (Number.isFinite(wealthRatio)) parts.push(clamp01((wealthRatio - 0.6) / 0.6)); // top0.1/bottom90 ≈1 = 1930s/today extreme (P1:1426)
  if (Number.isFinite(curveSpreadBp)) parts.push(curveSpreadBp < 0 ? 1 : clamp01((100 - curveSpreadBp) / 200));
  if (!parts.length) return { score: null, label: "no-data", status: STATUS.OK };
  const score = round2(parts.reduce((s, x) => s + x, 0) / parts.length);
  const label = score >= 0.7 ? "late-cycle position" : score >= 0.4 ? "mid-cycle position" : "early-cycle position";
  return { score, label, status: score >= 0.7 ? STATUS.ELEVATED : score >= 0.4 ? STATUS.WATCH : STATUS.OK };
}
```

- [ ] **Step 4: Valve two-key gate** — in `monetisationValve`, change the signature to `({ coreYoY, headlineYoY, brent, oilYoYPct = null, expInfl5yPct = null })` and insert **after** the core≥3 block (so realized-inflation blocks still win the label when both fire):

```js
  if (expInfl5yPct != null && expInfl5yPct >= 2.8 && score > 0.5) {
    score = Math.min(score, 0.5);
    label = "gated-by-expectations";
  }
```

- [ ] **Step 5: Trigger list** — in `evaluateTriggers`, change the `monetisation_while_hot` line to require the discriminator, and add three entries:

```js
  add(1, "monetisation_while_hot",
      s.fedAssetsUp3w && s.headlineYoY > 3 && s.printMode !== "reserve-management",
      `Fed assets rising 3w (${s.printMode ?? "composition unknown"}) with headline CPI ${s.headlineYoY}%`);
  add(2, "bear_steepening_regime", s.curve?.mode === "bear-steepening" && s.curve?.status !== STATUS.OK,
      "long end selling off with front anchored, term premium rising");
  add(3, "bdc_hy_divergence", s.bdc?.divergence === true,
      `BDC median P/NAV ${s.bdc?.medianPnav} at 5y-low percentile while HY OAS quiet`);
  add(3, "reserve_premise_flip", s.premise?.regime === "credibility-watch",
      "60d corr(Δ10Y, Δdollar) persistently negative — yields up, dollar down");
```

- [ ] **Step 6: Run `npm run selftest`** — all green (old 20 + Task 2 additions + these). Fix until green.

- [ ] **Step 7: Commit** — `git commit -am "feat(math): money-vs-credit signature, curve decomposition, print discriminator, BDC divergence, reserve-premise tripwire, valve expectations key, position clock — all TDD"`

---

### Task 4: Series-ID pinning + new source clients + registry entries

**Files:**
- Create: `scripts/pin-series.mjs`
- Modify: `src/lib/sources/clients.ts`, `src/lib/config/series.ts`, `.env.example` (no new keys needed — document Stooq is keyless)

**Interfaces:**
- Produces (consumed by Task 5): `stooqCloses(symbol: string): Promise<Obs[]>` in clients.ts; verified FRED IDs recorded in series.ts for: DFA wealth shares (top 0.1%, bottom 90% or components), BIS private-nonfinancial DSR, Fed bills-held-outright (for `billsShareOfExpansion`). Registry entries for every spec §4 series.

- [ ] **Step 1: Write `scripts/pin-series.mjs`** — a keyed one-shot that verifies every candidate ID exists and has data, and checks ALFRED vintage depth for the trigger-bearing ones (run with `FRED_API_KEY` from Vercel env or `.env.local` replacement; if keys are unavailable locally, run it against the deployed preview per the env-secrets memory):

```js
/* Verifies new series IDs before they enter the registry. Exit 1 on any miss. */
const KEY = process.env.FRED_API_KEY;
if (!KEY) { console.error("FRED_API_KEY required"); process.exit(1); }
const CANDIDATES = {
  m2: ["M2SL"], monetary_base: ["BOGMBASE"], total_debt: ["TCMDO"],
  hh_debt: ["CMDEBT"], hh_networth: ["TNWBSHNO"], dsr_household: ["TDSP"],
  core_pce: ["PCEPILFE"], t5yie: ["T5YIE"], dgs3mo: ["DGS3MO"],
  sofr: ["SOFR"], iorb: ["IORB"], bills_outright: ["WSHOBL"],
};
const SEARCHES = {
  wealth_top01: "share total net worth top 0.1",
  wealth_bottom90: "share total net worth bottom 90",
  dsr_pnf: "debt service ratio private non-financial united states",
};
const NEED_VINTAGES = ["M2SL", "TCMDO", "DGS3MO", "T5YIE"];
const get = async (path, params) => {
  const p = new URLSearchParams({ api_key: KEY, file_type: "json", ...params });
  const r = await fetch(`https://api.stlouisfed.org/fred/${path}?${p}`);
  if (!r.ok) throw new Error(`${r.status} ${path}`);
  return r.json();
};
let failed = false;
for (const [name, ids] of Object.entries(CANDIDATES)) {
  for (const id of ids) {
    try {
      const d = await get("series/observations", { series_id: id, limit: "3", sort_order: "desc" });
      console.log(`OK    ${name}: ${id} latest=${d.observations?.[0]?.date}`);
    } catch (e) { console.log(`MISS  ${name}: ${id} — ${e.message}`); failed = true; }
  }
}
for (const [name, text] of Object.entries(SEARCHES)) {
  const d = await get("series/search", { search_text: text, limit: "5" });
  console.log(`PIN   ${name}: ` + (d.seriess ?? []).map(s => `${s.id} (${s.title.slice(0, 60)})`).join(" | "));
}
for (const id of NEED_VINTAGES) {
  const d = await get("series/vintagedates", { series_id: id, limit: "10000" });
  const v = d.vintage_dates ?? [];
  console.log(`VINT  ${id}: ${v.length} vintages, first ${v[0]}`);
}
if (failed) process.exit(1);
```

- [ ] **Step 2: Run it** (`node scripts/pin-series.mjs`, or via deployed preview if local keys are placeholders). Record the pinned DFA + BIS DSR IDs. **Decision rule from spec §4:** `TCMDO` promotes to `role:"trigger"` only if its vintage count covers ≥1999; otherwise it stays `slow/context` and `moneyVsCredit`'s credit input in the backtest uses latest-data with an explicit `nonPIT: true` flag (excluded from heat, like the century panel).

- [ ] **Step 3: Add the Stooq client** to `clients.ts` (after `yahooCloses`):

```ts
/** Stooq daily closes — keyless CSV, stable, full ^spx history. Yahoo fallback. */
export async function stooqCloses(symbol: string): Promise<Obs[]> {
  const r = await fetch(`https://stooq.com/q/d/l/?s=${encodeURIComponent(symbol)}&i=d`, { next: { revalidate: 0 } });
  if (!r.ok) throw new Error(`stooq ${r.status} ${symbol}`);
  const text = await r.text();
  const rows = text.trim().split("\n").slice(1); // Date,Open,High,Low,Close,Volume
  const out: Obs[] = [];
  for (const line of rows) {
    const [date, , , , close] = line.split(",");
    const v = Number(close);
    if (date && Number.isFinite(v)) out.push({ date, value: v });
  }
  if (!out.length) throw new Error(`stooq empty ${symbol}`);
  return out;
}
```

- [ ] **Step 4: Registry entries** — append to `SERIES` in `series.ts` (layer/role/retire/trigger exactly per spec §4 table; DFA/BIS ids from Step 2; note strings must carry the why, matching house style). Example shape for the first two — write all of: `m2`, `monetary_base`, `total_debt`, `hh_debt_networth` (two ids, one derived entry), `dsr_household`, `dsr_pnf`, `wealth_shares`, `core_pce`, `t5yie`, `dgs3mo`, `sofr`, `iorb`, `bills_outright`, `spx`, `bdc_basket`, `bdc_nav` (manual):

```ts
  // ---------- Money vs credit (S8 signature) ----------
  { key: "m2", source: "fred", id: "M2SL", cadence: "monthly", factors: ["S8"],
    layer: "fast", role: "trigger",
    trigger: { form: "composite", spec: "m2 y/y ≥10% while total-credit y/y ≤0 = critical; ≥8% while credit < m2−5pp = watch", provenance: "self-calibrated" },
    retire: "another M2 redefinition breaks historical continuity",
    note: "Dalio's monetization signature needs a money aggregate next to TCMDO: 'money growing at an extremely fast rate at the same time as credit… contracting' (P1:1506)." },
  { key: "spx", source: "manual", id: "stooq:^spx", cadence: "daily", factors: ["SC"],
    layer: "fast", role: "trigger",
    trigger: { form: "level", spec: "drawdown vs 3y high: −20% elevated, −40% critical (Dalio: depressions ~50%, P1:1085)", provenance: "dalio" },
    retire: "Stooq endpoint dies and Yahoo licensing blocks fallback",
    note: "Drawdown ruler + normalization clock. FRED SP500 is license-capped at 10y — useless for the ruler; Stooq primary, yahooCloses('^GSPC') fallback." },
```

(`source: "manual"` is wrong for spx — extend the `Source` union with `"stooq"` and use it; the union gains `"stooq"` in this step.)

- [ ] **Step 5: BDC NAV manual inputs** — document in the `bdc_nav` entry note: quarterly NAVs per share for ARCC/BXSL/OBDC/FSK enter `manual_inputs` as `bdc_nav_ARCC` etc. with source URL + 90-day staleness (same discipline as `hyperscaler_coverage`); P/NAV = daily Yahoo close ÷ last-filed NAV.

- [ ] **Step 6: Verify** — `npx tsc --noEmit` exit 0; `npm run selftest` green (registry is data).

- [ ] **Step 7: Commit** — `git commit -am "feat(registry): total-economy series with pinned IDs, trigger specs, retirement clauses; stooq client"`

---

### Task 5: Wire assess.ts — pulls, derived inputs, two-clock snapshot

**Files:**
- Modify: `src/lib/framework/assess.ts`, `src/lib/db.ts` (narrate filter only)

**Interfaces:**
- Consumes: Task 3 functions, Task 4 clients/IDs.
- Produces: snapshot gains `factors.money`, `factors.curve`, `factors.equity`, `factors.bdc`, `factors.premise`, `inputs.printMode`, and a new top-level `position` block `{ clock: positionClock(...), inputs: { totalDebtGdpPct, hhDebtNetWorthPct, dsrHouseholdPct, wealthRatio } }`. Task 6 renders these; Task 7 replays the fast ones.

- [ ] **Step 1: Add pulls** to the main `Promise.all` (same tolerant `t(...)` pattern, limits: M2SL 30, TCMDO 10, DGS3MO 260, T5YIE 90, SOFR 90, IORB 90, WSHOBL 16, CMDEBT 8, TNWBSHNO 8, TDSP 8, PCEPILFE 30, DFA ids 8) and `stooqCloses("^spx")` + `yahooCloses` for the four BDC tickers alongside the OANDA block.

- [ ] **Step 2: Derived inputs** (after the existing derived block, same helper style):

```ts
  const m2YoYPct = m2.length > 12 ? round2(yoy(m2, 12)!) : NaN;
  const creditYoYPct = tcmdo.length > 4 ? round2(yoy(tcmdo, 4)!) : NaN;
  const dFrontBp3m = dgs3mo.length > 63 ? (last(dgs3mo).value - ago(dgs3mo, 63).value) * 100 : NaN;
  const dLongBp3m = dgs10.length > 63 ? (last(dgs10).value - ago(dgs10, 63).value) * 100 : NaN;
  const dTpBp3m = termPrem.length > 63 ? (last(termPrem).value - ago(termPrem, 63).value) * 100 : NaN;
  const spreadBp = dgs10.length && dgs3mo.length ? (last(dgs10).value - last(dgs3mo).value) * 100 : NaN;
  const sofrIorbBp = sofr.length && iorb.length ? (last(sofr).value - last(iorb).value) * 100 : NaN;
  const dWalcl13w = walcl.length >= 14 ? last(walcl).value - ago(walcl, 13).value : NaN;
  const dBills13w = bills.length >= 14 ? last(bills).value - ago(bills, 13).value : NaN;
  const billsShareOfExpansion = Number.isFinite(dWalcl13w) && dWalcl13w > 0 ? clamp01(dBills13w / dWalcl13w) : NaN;
  const spxDdPct = (() => {
    if (spxHist.length < 100) return NaN;
    const win = spxHist.slice(-756); // ~3y
    const hi = Math.max(...win.map(o => o.value));
    return round2(((last(spxHist).value - hi) / hi) * 100);
  })();
  // reserve premise: 60d corr of Δ10Y (bp) vs Δdollar (avg of ΔUSDJPY% and −ΔEURUSD%)
  const corr60d = yieldDollarCorr(dgs10, eurHist, jpyHist); // helper below
  // BDC: median P/NAV + 5y percentile needs NAV manual inputs; degrade to null cleanly
  const navs = await Promise.all(["ARCC","BXSL","OBDC","FSK"].map(t => getManual(`bdc_nav_${t}`)));
  const pnavs = bdcCloses.map((h, i) => h.length && navs[i]?.value ? last(h).value / navs[i].value : null).filter((x): x is number => x != null);
  const medianPnav = pnavs.length >= 2 ? pnavs.sort((a, b) => a - b)[Math.floor(pnavs.length / 2)] : NaN;
```

`yieldDollarCorr` is a ~15-line pure helper added to `math.mjs` (Pearson corr over aligned last-60 daily changes; returns NaN below 40 overlapping days) with a selftest case: perfectly anti-correlated synthetic arrays → ≤ −0.9. `pnavPctile5y` requires stored history: persist `medianPnav` into the snapshot and compute the percentile from prior snapshots via `latestSnapshot` history if available, else pass `null` (function degrades per Task 3 test).

- [ ] **Step 3: Factors + position block** — extend the returned snapshot:

```ts
  const money = moneyVsCredit({ m2YoYPct, creditYoYPct });
  const curve = curveShape({ dFrontBp3m, dLongBp3m, dTpBp3m, spreadBp });
  const disc = printDiscriminator({ fedAssetsUp3w, billsShareOfExpansion, sofrIorbBp });
  const equity = equityDrawdown({ ddPct: spxDdPct });
  const bdc = bdcStress({ medianPnav, pnavPctile5y, hyOasDelta3mBp });
  const premise = reservePremise({ corr60d });
  const stage = valve ? bigCycleStage({ fedAssetsUp3w, coreYoY, headlineYoY, valveScore: valve.score, printMode: disc.printMode }) : null;
  const position = {
    clock: positionClock({ totalDebtGdpPct, hhDebtNetWorthPct, dsrHouseholdPct, wealthRatio, curveSpreadBp: spreadBp }),
    inputs: { totalDebtGdpPct, hhDebtNetWorthPct, dsrHouseholdPct, wealthRatio },
  };
```

where `totalDebtGdpPct = tcmdo/gdp*100`, `hhDebtNetWorthPct = cmdebt/tnwbshno*100`, `dsrHouseholdPct = last TDSP`, `wealthRatio = wealthTop01Share / wealthBottom90Share` (each NaN-safe). Valve call gains `expInfl5yPct: t5yie.length ? last(t5yie).value : null`. `evaluateTriggers` input `s` gains `printMode: disc.printMode, curve, bdc, premise`.

- [ ] **Step 4: narrate filter** — in `db.ts`, add the new factor keys (`money`, `curve`, `equity`, `bdc`, `premise`, `position.clock`) to the filtered readings snapshot passed to the narrative model, same shape as existing entries.

- [ ] **Step 5: Verify** — `npm run build` exit 0. Hit the deployed preview `/api/live?fresh=1` (local env keys are placeholders per the env-secrets memory — verify via `web_fetch_vercel_url`, not localhost) and confirm the new blocks appear with either values or clean `problems` entries.

- [ ] **Step 6: Commit** — `git commit -am "feat(assess): two-clock snapshot — money/curve/equity/BDC/premise fast factors, print discriminator gating the stage call, slow position block"`

---

### Task 6: Dalio-style phase-shaded charts + position layer UI

**Files:**
- Create: `src/app/components/charts/ArchetypePanel.tsx`, `src/data/phase-bands.json`
- Modify: `src/app/components/charts/CenturyPanel.tsx`, `src/app/page.tsx`, `src/app/components/Tabs.tsx`

**Interfaces:**
- Consumes: snapshot `position` block (Task 5), `scripts/backtest/results.json` monthly stage history, `century-panel.json`.
- Produces: `<ArchetypePanel bands={Band[]} />` where `Band = { from: string, to: string, phaseNum: number }`.

- [ ] **Step 1: Generate `src/data/phase-bands.json`** — add a small node script step inside this task (inline, run once, commit output): map `scripts/backtest/results.json` monthly rows to contiguous bands by the replayed heat/stage, emitting `[{ from: "1999-01", to: "2007-05", phaseNum: 1 }, ...]`. Where the replay has no stage (pre-2020s stage strings), derive the band's phaseNum from replayed statuses: contraction-critical periods → 4, recovery windows → 7→1, else 1–3 by heat tercile. This mapping is display-only cartography, not scoring — label it as such in a comment in the JSON-generating script and keep the script in `scripts/backtest/phase-bands.mjs`.

- [ ] **Step 2: `ArchetypePanel.tsx`** — client component, same SVG idiom as `CenturyPanel` (`W=940, H=84` rows, `useTooltip`): renders each Dalio chart (total debt %GDP, debt service %GDP, money %GDP, equity indexed real, gold, short rate, curve spread) as a line with **phase bands as `<rect>` shading behind the path**, band fill `var(--surface-2)` alternating with phase-keyed tint, phase name in 8px caps at band start. Data: fast series from the snapshot's history arrays where present; slow series from a new `position-history` fetch added to the page's server component (quarterly rows straight from FRED via existing `fred()` at render, limit 200, cached by the cron snapshot when available). Reuse `common.tsx` tooltip.

- [ ] **Step 3: Extend `CenturyPanel.tsx`** — same band `<rect>` layer behind the five existing century rows, using annual bands derived from `phase-bands.json` (collapse months → years, majority phase). No data changes.

- [ ] **Step 4: Position layer on `page.tsx`** — new section under the hero: "POSITION (slow clock)" showing `position.clock.label + score` and the four inputs as small stats, visually separated from the fast factor board with the caption "Quarterly, revised — context, never averaged into triggers." Keep every existing expander card untouched.

- [ ] **Step 5: Tab wiring** — add an "Archetype" tab in `Tabs.tsx` rendering `<ArchetypePanel/>`; sub-label `the seven phases · debt · money · markets`.

- [ ] **Step 6: Verify** — `npm run build` exit 0; screenshot the deployed preview (`web_fetch_vercel_url` + Playwright) and eyeball: bands render behind lines, cards still expand, no horizontal scroll at 390px width.

- [ ] **Step 7: Commit** — `git commit -am "feat(ui): Dalio archetype panel — phase-shaded time series, slow-clock position section; cards retained"`

---

### Task 7: Backtest extension + threshold validation

**Files:**
- Modify: `scripts/backtest/fetch.mjs`, `scripts/backtest/replay.mjs`, `scripts/backtest/score.mjs`, `BACKTEST.md`

**Interfaces:**
- Consumes: Task 3 functions; ALFRED vintage coverage results from Task 4 Step 2.
- Produces: regenerated `results.json` including per-month `money`, `curve`, `equity` factor outputs; a "Threshold validation" section in `BACKTEST.md`.

- [ ] **Step 1: fetch.mjs** — add vintaged pulls for `M2SL`, `DGS3MO` (and `TCMDO` if Task 4 verified vintage depth; else latest-data flagged `nonPIT: true`), plus Shiller monthly real total-return SPX (CSV from `http://www.econ.yale.edu/~shiller/data/ie_data.xls` is xls — use the maintained CSV mirror `https://shillerdata.com/` export; if unreachable, Stooq `^spx` monthly closes deflated by vintaged CPI, documented in the fetch comment). T5YIE from 2003 (no vintages needed — market data).

- [ ] **Step 2: replay.mjs** — compute per month: `moneyVsCredit` (m2 y/y vintaged vs credit y/y), `curveShape` (3m deltas of DGS3MO/DGS10, TP where available, else `dTpBp3m: NaN` → function still classifies mode), `equityDrawdown` (vs rolling 3y high of real SPX), valve with `expInfl5yPct` from T5YIE post-2003 / `null` before (documented realized-only). Store in each month's row alongside existing factors. BDC/DFA/premise are NOT replayed (no point-in-time history) — add one comment line in replay.mjs saying so, consistent with the two-clock rule.

- [ ] **Step 3: score.mjs validation gates** — add a `thresholdValidation()` section computing, over the replay: (a) `moneyVsCredit` critical months — MUST include ≥1 month in 2008-09..2009-06 and 2020-03..2020-12, MUST include 0 months in 1999-01..2007-06; (b) `equityDrawdown` critical MUST include 2008-10..2009-03; (c) `curveShape` bear-steepening months reported descriptively (no pass/fail — regime trigger is new). If (a) or (b) fails, print `DEMOTE <fn> to context` and exit 1.

- [ ] **Step 4: Run `npm run backtest`** — validation green, `results.json` regenerated; append the validation table + the pre-2003 expectations-key caveat to `BACKTEST.md` under "Threshold validation (Dalio realignment)".

- [ ] **Step 5: Commit** — `git commit -am "feat(backtest): vintaged money/curve/equity replay + threshold validation gates; self-calibrated rules proven or demoted"`

---

### Task 8: Figma sync + review card

**Files:** none (external surfaces)

- [ ] **Step 1:** Load `figma:figma-generate-design` + `figma:figma-use`, then sync the changed surfaces to the existing Sovereign Vitals Figma file (see `dalio-monitor-figma-file` memory): renamed labels on both tabs, the new Archetype tab frame, the position-layer section. Do not create a new file.
- [ ] **Step 2:** Screenshot the deployed preview and drop a review card on the project's Notion review queue (Context → Ask → Done), linking the Figma frames; Owner = Evan.
- [ ] **Step 3:** Report the Figma + preview URLs in the final summary. No commit.

---

## Self-review notes

- Spec §1–§6 each map to a task (§1→T2, §2→T1/T5, §3→T1, §4→T3/T4/T5, §5→T6, §6→T3 premise tripwire + spec text). Seven-bubble checklist is explicitly deferred in spec §6 — no task, intentional.
- Type consistency: `printDiscriminator` returns `printMode` (string union) consumed by `bigCycleStage({ printMode })` (T2 signature already accepts it, null-safe) and `evaluateTriggers` (`s.printMode`); `curveShape` output consumed as `s.curve`; `bdcStress` as `s.bdc`; `reservePremise` as `s.premise` — names match across T3 Step 5, T5 Step 3.
- Known unknowns are confined to Task 4 Step 2 (DFA/BIS IDs, TCMDO vintage depth) with an explicit decision rule, and Task 7 Step 1 (Shiller source) with a documented fallback — not placeholders, contingencies with defined outcomes.
