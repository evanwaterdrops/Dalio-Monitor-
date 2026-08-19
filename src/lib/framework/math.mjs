/**
 * Sovereign Vitals — framework math core.
 * Pure functions only. No I/O, no deps. Imported by the TS app AND by
 * scripts/selftest.mjs, so the formulas the dashboard shows are the
 * formulas the tests prove.
 *
 * Every function encodes a specific conclusion from the Aug-2026 analysis;
 * the comment above each one says which.
 */

export const STATUS = { OK: "ok", WATCH: "watch", ELEVATED: "elevated", CRITICAL: "critical" };

/* ------------------------------------------------------------------ *
 * Small (short-term) cycle phase.
 * July-2026 lesson: the stall broke DOWNWARD. A negative 3mma or a
 * weak 3mma with large negative revisions is the signature, and the
 * Sahm gap confirms an actual contraction. Falling unemployment on a
 * shrinking labour force is NOT improvement, so we never use UNRATE
 * level alone.
 * ------------------------------------------------------------------ */
export function smallCyclePhase({ nfp3mma, revisionsSum2m, sahmGap, fundsDelta6m, claimsYoYPct = null }) {
  // 2024 lesson (backtest): a Sahm crossing with strong payrolls is a labor-
  // SUPPLY event (entrant surge lifting U3), not a demand contraction — it
  // false-alarmed Jul/Sep/Oct-2024 and chained into the T1 recession-event
  // trigger. Contraction now requires demand confirmation: weak payrolls or
  // claims surging. claimsYoYPct (initial claims 4wk avg, y/y) is optional —
  // when null, behavior degrades to the nfp gate alone.
  const claimsSurging = claimsYoYPct != null && claimsYoYPct > 20;
  const claimsImproving = claimsYoYPct != null && claimsYoYPct < -5; // clearly improving — a ±couple-% wiggle is noise
  if (sahmGap >= 0.5) {
    if (nfp3mma < 50 || claimsSurging) return { phase: "contraction", status: STATUS.CRITICAL };
    return { phase: "supply-side-unemployment-rise", status: STATUS.ELEVATED };
  }
  if (nfp3mma <= 0 || (nfp3mma < 50 && revisionsSum2m <= -75)) {
    // 2003 lesson: payrolls stalling while claims improve is a jobless
    // recovery, not a cycle break — markets recovered through every month
    // of the 2003 "critical" run.
    if (claimsImproving) return { phase: "jobless-recovery-stall", status: STATUS.ELEVATED };
    return { phase: "late-stall-breaking-down", status: STATUS.CRITICAL };
  }
  if (nfp3mma < 100 && revisionsSum2m < 0)
    return { phase: "late-expansion-stalling", status: STATUS.ELEVATED };
  if (fundsDelta6m < 0 && nfp3mma >= 100)
    return { phase: "easing-into-expansion", status: STATUS.OK };
  return { phase: "mid-expansion", status: STATUS.OK };
}

/* ------------------------------------------------------------------ *
 * Interest rates, MP1 (S6 — Dalio: the squeeze) — previously display-only, now real math.
 * 2022 lesson (backtest): the −25% bear was a duration shock — a +250bp
 * 12-month surge in the 10Y real yield — that no other leg measures.
 * Impulse thresholds: +75bp/12m watch, +150 elevated, +250 critical.
 * ------------------------------------------------------------------ */
export function priceOfMoney({ realYieldDelta12mBp }) {
  const d = realYieldDelta12mBp;
  const status =
    !Number.isFinite(d) ? STATUS.OK
    : d >= 250 ? STATUS.CRITICAL
    : d >= 150 ? STATUS.ELEVATED
    : d >= 75 ? STATUS.WATCH
    : STATUS.OK;
  return { realYieldDelta12mBp: Number.isFinite(d) ? Math.round(d) : null, status };
}

/* ------------------------------------------------------------------ *
 * Private credit (PC leg) — previously display-only, now real math.
 * HY OAS level + 3m momentum. Level ≥500bp AND widening = the complex
 * repricing (critical); ≥400bp level or +75bp/3m widening = elevated;
 * +40bp/3m = watch. Dot-com/2015/2018 lesson: spread momentum is the
 * only in-framework read on private-credit stress.
 * ------------------------------------------------------------------ */
export function privateCredit({ hyOasBp, hyOasDelta3mBp }) {
  if (!Number.isFinite(hyOasBp)) return { hyOasBp: null, hyOasDelta3mBp: null, status: STATUS.OK };
  const widening = Number.isFinite(hyOasDelta3mBp) && hyOasDelta3mBp > 0;
  const status =
    hyOasBp >= 500 && widening ? STATUS.CRITICAL
    : hyOasBp >= 400 || (Number.isFinite(hyOasDelta3mBp) && hyOasDelta3mBp >= 75) ? STATUS.ELEVATED
    : Number.isFinite(hyOasDelta3mBp) && hyOasDelta3mBp >= 40 ? STATUS.WATCH
    : STATUS.OK;
  return { hyOasBp: Math.round(hyOasBp), hyOasDelta3mBp: Number.isFinite(hyOasDelta3mBp) ? Math.round(hyOasDelta3mBp) : null, status };
}

/* ------------------------------------------------------------------ *
 * Debt monetization gate (S8 — Dalio: MP2/MP3, printing blocked by inflation).
 * Post-July restatement: core CPI at 2.5% means the block is the
 * ENERGY SHOCK, not a wage-price spiral. Valve openness therefore keys
 * off core distance-to-target, gated by the energy wedge (headline−core)
 * and Brent. If Hormuz reopens and Brent < 80 with headline < 3, the
 * valve is effectively open and the Top→Deleveraging transition becomes
 * available within a quarter.
 * ------------------------------------------------------------------ */
export function monetisationValve({ coreYoY, headlineYoY, brent, oilYoYPct = null }) {
  const wedge = headlineYoY - coreYoY;
  let score = clamp01(1 - (coreYoY - 2.0) / 2.0); // core 2% → 1.0 open; core 4% → 0
  let label = "open";
  // Energy gate: the $85 Brent level is 2020s-calibrated; for deep history a
  // nominal level is meaningless (oil at $12 was the 1974 shock), so oil
  // MOMENTUM (y/y ≥ +40%) is an equivalent gate the backtest can supply.
  const energyShock = (Number.isFinite(brent) && brent >= 85) || (oilYoYPct != null && oilYoYPct >= 40);
  if (wedge >= 0.6 && energyShock) {
    score = Math.min(score, 0.55);
    label = "gated-by-energy-shock";
  } else if (headlineYoY >= 3.0) {
    score = Math.min(score, 0.7);
    label = "partially-gated";
  }
  if (coreYoY >= 3.0) {
    score = Math.min(score, 0.25);
    label = "blocked-by-underlying-inflation";
  }
  const status =
    score >= 0.7 ? STATUS.WATCH /* open valve = regime change risk, keep watching */
    : score >= 0.45 ? STATUS.ELEVATED
    : STATUS.CRITICAL;
  return { score: round2(score), label, wedge: round2(wedge), status };
}

/* ------------------------------------------------------------------ *
 * Nominal Growth vs Nominal Rates (S7 — Dalio: the hinge).
 * rAvg from FiscalData avg_interest_rates (total marketable),
 * rMarg = 10Y, g = nominal GDP YoY. Drift = rollover of maturing stock
 * at marginal cost. Key conclusion encoded here: the crossing is not a
 * calendar projection, it is a RECESSION EVENT — a payroll contraction
 * that knocks ~3pp off nominal growth crosses immediately.
 * ------------------------------------------------------------------ */
export function rVsG({ rAvg, rMarg, gNominal, rolloverShare12m, contractionFlag, debtToGdpPct = null }) {
  const gap = gNominal - rAvg;
  const driftPerYear = Math.max(0, (rMarg - rAvg) * rolloverShare12m);
  const monthsToCross = gap <= 0 ? 0 : driftPerYear <= 0 ? Infinity : (12 * gap) / driftPerYear;
  const gStressed = gNominal - 3.0; // recession haircut per Aug-2026 analysis
  const stressedCrossed = rAvg >= gStressed;
  const crossedNow = gap <= 0;
  // Deep-backtest lesson: r > g was the NORM from Volcker to the late 90s —
  // with debt/GDP at 30–60% the compounding it drives is absorbable, and the
  // hinge is not a crisis signal. S7's criticality is conditional on a
  // large stock (Dalio's own framing): below ~90% debt/GDP a structural
  // crossing reads ELEVATED, not CRITICAL. null (unknown) = treat as large.
  const stockMatters = debtToGdpPct == null || debtToGdpPct >= 90;
  const status = crossedNow
    ? (stockMatters ? STATUS.CRITICAL : STATUS.ELEVATED)
    : contractionFlag && stressedCrossed
    ? STATUS.CRITICAL
    : monthsToCross < 24
    ? STATUS.ELEVATED
    : STATUS.WATCH;
  return {
    gap: round2(gap),
    driftPerYear: round2(driftPerYear),
    monthsToCross: Number.isFinite(monthsToCross) ? Math.round(monthsToCross) : null,
    stressedCrossed,
    crossedNow,
    stockMatters,
    status,
  };
}

/* ------------------------------------------------------------------ *
 * Gold decomposition — dollar weakness vs credit flight (follow-up #5).
 * Compute gold in USD, EUR, JPY over the window. Rising in ALL
 * numeraires = flight from sovereign credit generally (Dalio's
 * store-of-value exit). Rising only in USD = a dollar trade.
 * xauEur = XAU_USD / EUR_USD; xauJpy = XAU_USD * USD_JPY (derived, so
 * no dependence on OANDA listing XAU crosses).
 * ------------------------------------------------------------------ */
export function goldDecomposition({ dXauUsdPct, dXauEurPct, dXauJpyPct, dRealYieldBp }) {
  const allUp = dXauUsdPct > 2 && dXauEurPct > 2 && dXauJpyPct > 2;
  const usdOnly = dXauUsdPct > 2 && dXauEurPct <= 0.5;
  const mode = allUp ? "credit-flight" : usdOnly ? "dollar-weakness" : "mixed";
  // Tier-3 trigger: gold rising WITH real yields rising = being bought
  // as an alternative to the sovereign, not as a rate hedge.
  const divergence = dXauUsdPct > 2 && dRealYieldBp > 0;
  const status = mode === "credit-flight" && divergence ? STATUS.CRITICAL
    : mode === "credit-flight" ? STATUS.ELEVATED
    : STATUS.WATCH;
  return { mode, divergence, status };
}

/* ------------------------------------------------------------------ *
 * Supply/Demand for Bonds (S5 — Dalio: the thinning bid) — auction plumbing.
 * Bid-to-cover and primary-dealer takedown on the last two 10Y auctions.
 * Dealers absorbing more = the end-buyer bid thinning before it shows
 * in headline yield.
 * ------------------------------------------------------------------ */
export function demandLeg({ auctions }) {
  const tens = auctions.filter(a => a.term === "10-Year").slice(0, 2);
  if (tens.length === 0) return { status: STATUS.WATCH, note: "no recent 10Y auctions" };
  const weakBtc = tens.every(a => a.btc < 2.4);
  const heavyDealer = tens.every(a => a.dealerPct != null && a.dealerPct > 18);
  const status = weakBtc && heavyDealer ? STATUS.CRITICAL : weakBtc || heavyDealer ? STATUS.ELEVATED : STATUS.OK;
  return { status, lastBtc: tens[0].btc, lastDealerPct: tens[0].dealerPct ?? null };
}

/* ------------------------------------------------------------------ *
 * Central-bank losses — Dalio's literal metric.
 * RESPPLLOPNWW is a negative liability when the Fed runs cumulative
 * losses. −$244bn as of Apr-2026. Shrinking toward zero = healing;
 * growing more negative = central-bank losses deepening.
 * ------------------------------------------------------------------ */
export function deferredAsset({ levelBn, deltaBn13w }) {
  const status = levelBn <= -200 ? STATUS.CRITICAL : levelBn < 0 ? STATUS.ELEVATED : STATUS.OK;
  const direction = deltaBn13w > 1 ? "healing" : deltaBn13w < -1 ? "deepening" : "flat";
  return { status, direction };
}

/* ------------------------------------------------------------------ *
 * Debt-Service Burden (S3 — Dalio: the red line). TTM interest ÷ TTM receipts
 * from MTS table 9. Historic loss-of-discretion zone starts ~20%.
 * ------------------------------------------------------------------ */
export function interestSqueeze({ ttmInterestBn, ttmReceiptsBn }) {
  const ratio = ttmInterestBn / ttmReceiptsBn;
  const status = ratio >= 0.2 ? STATUS.CRITICAL : ratio >= 0.17 ? STATUS.ELEVATED : STATUS.WATCH;
  return { ratio: round3(ratio), status };
}

/* ------------------------------------------------------------------ *
 * Revenue beta — the AI tax-elasticity follow-up. If receipts growth
 * lags nominal GDP growth while capex-led GDP rises, growth is
 * fiscally low-quality (Bridgewater: profits captured by a narrow set
 * of firms; buildout barely touches payrolls).
 * ------------------------------------------------------------------ */
export function revenueBeta({ receiptsYoYPct, nominalGdpYoYPct }) {
  const beta = nominalGdpYoYPct === 0 ? null : receiptsYoYPct / nominalGdpYoYPct;
  const status = beta != null && beta < 0.8 ? STATUS.ELEVATED : STATUS.OK;
  return { beta: beta == null ? null : round2(beta), status };
}

/* ------------------------------------------------------------------ *
 * Japan repatriation risk (follow-up #2). JGB 10Y rising + yen
 * strengthening + Japan TIC holdings falling in ABSOLUTE dollars
 * (Tier-3: level, not share) = the demand leg breaking properly.
 * ------------------------------------------------------------------ */
export function japanLeg({ jgb10Delta3mBp, usdJpyDelta3mPct, japanHoldingsDelta2mBn }) {
  let hits = 0;
  if (jgb10Delta3mBp > 15) hits++;
  if (usdJpyDelta3mPct < -2) hits++; // yen strengthening
  if (japanHoldingsDelta2mBn < 0) hits++;
  const status = hits >= 3 ? STATUS.CRITICAL : hits === 2 ? STATUS.ELEVATED : hits === 1 ? STATUS.WATCH : STATUS.OK;
  return { hits, status };
}

/* ------------------------------------------------------------------ *
 * Big-cycle stage assessor. Everything for the Top has printed; the ONE
 * unprinted marker separating Top from Deleveraging is the central bank
 * buying while inflation is above target. Post-July restatement: the
 * inflation gate is HEADLINE > 3 (energy-shock world), with core > 3 as
 * the stronger form.
 * ------------------------------------------------------------------ */
export function bigCycleStage({ fedAssetsUp3w, coreYoY, headlineYoY, valveScore, printMode = null }) {
  const hot = headlineYoY > 3.0;
  const monetising = fedAssetsUp3w && hot && (printMode == null || printMode === "monetization");
  if (monetising) return { phaseNum: 4, phase: "Depression", detail: "printing while hot — monetization confirmed",
    stage: "DEPRESSION — printing begins (monetization confirmed)", status: STATUS.CRITICAL };
  if (valveScore >= 0.7) return { phaseNum: 3, phase: "Top", detail: "monetization gate reopening",
    stage: "TOP, LATE — monetization gate reopening", status: STATUS.CRITICAL };
  return { phaseNum: 3, phase: "Top", detail: "late", stage: "TOP, LATE", status: STATUS.ELEVATED };
}

/* ---------------- alert triggers (machine-checkable watchlist) ------ */
export function evaluateTriggers(s) {
  const out = [];
  const add = (tier, key, cond, detail) => cond && out.push({ tier, key, detail });

  add(1, "r_avg_crosses_g", s.rvg.crossedNow && s.rvg.stockMatters !== false,
      `rAvg ${s.rAvg} ≥ g ${s.gNominal}`);
  add(1, "r_crosses_g_recession_event", s.contractionFlag && s.rvg.stressedCrossed,
      `payroll contraction + stressed g ${round2(s.gNominal - 3)} < rAvg ${s.rAvg}`);
  add(1, "monetisation_while_hot", s.fedAssetsUp3w && s.headlineYoY > 3,
      `Fed assets rising 3w with headline CPI ${s.headlineYoY}%`);
  add(2, "interest_over_20pct_revenue", s.squeeze.ratio >= 0.2, `interest/receipts ${(s.squeeze.ratio * 100).toFixed(1)}%`);
  add(2, "long_end_selloff_on_easing", s.easedAndLongEndSold === true, "DGS30 +≥8bp on a cut day");
  add(2, "issuance_front_end_migration", s.billsShareUp3m === true, "bills share of marketable debt up 3 consecutive months");
  add(3, "gold_real_yield_divergence", s.gold.divergence, "gold up while real 10Y up (20d)");
  add(3, "japan_absolute_decline", s.japan.hits >= 2, `japan leg hits=${s.japan.hits}`);
  add(3, "auction_plumbing", s.demand.status === STATUS.CRITICAL, `10Y BTC ${s.demand.lastBtc}, dealer ${s.demand.lastDealerPct}%`);
  return out;
}

/* ---------------- helpers ---------------- */
export const clamp01 = x => Math.max(0, Math.min(1, x));
export const round2 = x => Math.round(x * 100) / 100;
export const round3 = x => Math.round(x * 1000) / 1000;
export function pctChange(now, then) { return then === 0 ? null : ((now - then) / then) * 100; }
export function sahmGap(unrate3mma, min12m) { return round2(unrate3mma - min12m); }
