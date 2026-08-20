/**
 * Selftest: feed the actual Aug-2026 readings into the framework math and
 * assert it reproduces the conversation's conclusions. If any of these
 * fail, the monitor's logic has drifted from the analysis it encodes.
 */
import {
  smallCyclePhase, monetisationValve, rVsG, goldDecomposition,
  demandLeg, deferredAsset, interestSqueeze, bigCycleStage, evaluateTriggers,
  priceOfMoney, privateCredit,
  moneyVsCredit, curveShape, printDiscriminator, reservePremise, equityDrawdown,
  bdcStress, positionClock, yieldDollarCorr,
  thinMonthly, spliceMonthly,
} from "../src/lib/framework/math.mjs";
import { findBoundaryViolations } from "./check-client-boundary.mjs";
import { createRequire } from "node:module";
const spxMonthly = createRequire(import.meta.url)("../src/data/spx-monthly.json");

let pass = 0, fail = 0;
const eq = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  ok ? pass++ : fail++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : `  got=${JSON.stringify(got)} want=${JSON.stringify(want)}`}`);
};
const truthy = (name, got) => { got ? pass++ : fail++; console.log(`${got ? "PASS" : "FAIL"}  ${name}`); };

// --- Jul-2026 employment: −23k / +20k / +63k, revisions −103k, Sahm gap small
const sc = smallCyclePhase({ nfp3mma: (-23 + 20 + 63) / 3, revisionsSum2m: -103, sahmGap: 0.15, fundsDelta6m: -0.25 });
eq("small cycle = stall breaking downward", sc.phase, "late-stall-breaking-down");

// --- Jul-2026 CPI: core 2.5 / headline 3.4 / Brent 87.2 → gated by energy, NOT by wages
const valve = monetisationValve({ coreYoY: 2.5, headlineYoY: 3.4, brent: 87.2 });
eq("valve label = gated-by-energy-shock", valve.label, "gated-by-energy-shock");
truthy("valve loosening (score ≥ 0.5, i.e. war is the block)", valve.score >= 0.5);

// --- Hormuz-reopens scenario: Brent 78, headline 2.9 → valve open within a quarter
const valveOpen = monetisationValve({ coreYoY: 2.5, headlineYoY: 2.9, brent: 78 });
eq("valve reopens when energy gate lifts", valveOpen.label, "open");

// --- r vs g: rAvg 3.39, 10Y 4.68, g 4.7, rollover 30%
const rvg = rVsG({ rAvg: 3.39, rMarg: 4.68, gNominal: 4.7, rolloverShare12m: 0.30, contractionFlag: false });
truthy("not crossed today (average still winning)", !rvg.crossedNow);
truthy("crossing on a timer (~3-4 years of pure drift)", rvg.monthsToCross >= 30 && rvg.monthsToCross <= 48);

// --- THE claim: r>g is a recession event, not a 2028 projection
const rvgStress = rVsG({ rAvg: 3.39, rMarg: 4.68, gNominal: 4.7, rolloverShare12m: 0.30, contractionFlag: true });
truthy("recession flag → stressed g (1.7%) < rAvg → crossed", rvgStress.stressedCrossed && rvgStress.status === "critical");

// --- Gold $4,354 +30.5% y/y, up in EUR and JPY terms too, real yields UP
const gold = goldDecomposition({ dXauUsdPct: 7.4, dXauEurPct: 5.1, dXauJpyPct: 8.9, dRealYieldBp: 12 });
eq("gold mode = credit flight (all numeraires)", gold.mode, "credit-flight");
truthy("T3 divergence firing (gold up WITH real yields up)", gold.divergence);

// --- 10Y auctions clearing 4.683 with soft cover, heavy dealer takedown
const dem = demandLeg({ auctions: [
  { term: "10-Year", btc: 2.35, dealerPct: 19.2 },
  { term: "10-Year", btc: 2.38, dealerPct: 18.6 },
]});
eq("auction plumbing critical", dem.status, "critical");

// --- Fed deferred asset −$243.9bn = central-bank losses (Dalio's literal metric)
const da = deferredAsset({ levelBn: -243.9, deltaBn13w: 1.2 });
eq("deferred asset critical", da.status, "critical");
eq("but healing (rates lower than 2023 peak-loss era)", da.direction, "healing");

// --- interest/receipts ≈19% → elevated, 20% line = critical
eq("squeeze at 19% = elevated", interestSqueeze({ ttmInterestBn: 1010, ttmReceiptsBn: 5300 }).status, "elevated");
eq("squeeze at 20.4% = critical", interestSqueeze({ ttmInterestBn: 1100, ttmReceiptsBn: 5400 }).status, "critical");

// --- big-cycle stage: Dalio's seven phases; Top now, flips to Depression only on the unprinted marker
const st = bigCycleStage({ fedAssetsUp3w: false, coreYoY: 2.5, headlineYoY: 3.4, valveScore: 0.55 });
eq("phase = Top (Dalio's seven)", st.phase, "Top");
eq("phaseNum 3/7", st.phaseNum, 3);
const stM = bigCycleStage({ fedAssetsUp3w: true, coreYoY: 2.5, headlineYoY: 3.4, valveScore: 0.55 });
eq("monetising while hot → Depression, printing begins", stM.phaseNum, 4);
truthy("legacy stage string retained", typeof stM.stage === "string" && stM.stage.length > 0);

// --- trigger sweep on today's composite state
const trig = evaluateTriggers({
  rvg: rvgStress, rAvg: 3.39, gNominal: 4.7, contractionFlag: true,
  fedAssetsUp3w: false, headlineYoY: 3.4,
  squeeze: { ratio: 0.19 }, gold, japan: { hits: 1 }, demand: dem,
  easedAndLongEndSold: false, billsShareUp3m: null,
});
truthy("T1 recession-event trigger fires", trig.some(t => t.key === "r_crosses_g_recession_event"));
truthy("T3 gold divergence fires", trig.some(t => t.key === "gold_real_yield_divergence"));
truthy("T3 auction plumbing fires", trig.some(t => t.key === "auction_plumbing"));
truthy("T1 monetisation does NOT fire yet (the unprinted marker)", !trig.some(t => t.key === "monetisation_while_hot"));

// --- backtest-derived patches (2024/2003/2022 lessons) ---
// Jul-2024 real-time state: Sahm hits 0.5 with payrolls +177k → supply-side event, NOT contraction
const sc2024 = smallCyclePhase({ nfp3mma: 177, revisionsSum2m: -183, sahmGap: 0.5, fundsDelta6m: 0, claimsYoYPct: 8 });
eq("2024 Sahm crossing with strong payrolls = supply-side, elevated", [sc2024.phase, sc2024.status], ["supply-side-unemployment-rise", "elevated"]);
// Mar-2008: Sahm 0.5 with payrolls −15k → confirmed contraction
eq("2008 Sahm crossing with weak payrolls = contraction", smallCyclePhase({ nfp3mma: -15, revisionsSum2m: -463, sahmGap: 0.5, fundsDelta6m: -1 }).phase, "contraction");
// Claims surge confirms contraction even with middling payrolls
eq("claims surge confirms contraction", smallCyclePhase({ nfp3mma: 120, revisionsSum2m: 0, sahmGap: 0.55, fundsDelta6m: 0, claimsYoYPct: 40 }).phase, "contraction");
// 2003 jobless recovery: payrolls negative but claims improving → elevated, not critical
const sc2003 = smallCyclePhase({ nfp3mma: -60, revisionsSum2m: -20, sahmGap: 0.3, fundsDelta6m: -0.5, claimsYoYPct: -12 });
eq("jobless recovery (claims improving) downgraded", [sc2003.phase, sc2003.status], ["jobless-recovery-stall", "elevated"]);
// No claims data → prior behavior preserved (Aug-2026 conclusion intact above)
// S6 price of money: the 2022 duration shock
eq("S6 +260bp real-yield impulse = critical", priceOfMoney({ realYieldDelta12mBp: 260 }).status, "critical");
eq("S6 +30bp = ok", priceOfMoney({ realYieldDelta12mBp: 30 }).status, "ok");
// PC private credit: level + momentum
eq("PC 520bp and widening = critical", privateCredit({ hyOasBp: 520, hyOasDelta3mBp: 90 }).status, "critical");
eq("PC 300bp +80bp/3m = elevated", privateCredit({ hyOasBp: 300, hyOasDelta3mBp: 80 }).status, "elevated");
eq("PC calm = ok", privateCredit({ hyOasBp: 280, hyOasDelta3mBp: 5 }).status, "ok");
// Station-7 large-stock condition: r>g at 55% debt/GDP (the 1990s norm) is elevated, not critical, and no T1
const rvgSmallStock = rVsG({ rAvg: 6.5, rMarg: 6.0, gNominal: 5.5, rolloverShare12m: 0.30, contractionFlag: false, debtToGdpPct: 55 });
eq("r>g at small debt stock = elevated", rvgSmallStock.status, "elevated");
truthy("no structural T1 at small stock", !evaluateTriggers({
  rvg: rvgSmallStock, rAvg: 6.5, gNominal: 5.5, contractionFlag: false, fedAssetsUp3w: false, headlineYoY: 3,
  squeeze: { ratio: 0.15 }, gold: { divergence: false }, japan: { hits: 0 },
  demand: { status: "ok", lastBtc: null, lastDealerPct: null }, easedAndLongEndSold: false, billsShareUp3m: null,
}).some(t => t.key === "r_avg_crosses_g"));
// same crossing at 122% (today) stays critical + T1
eq("r>g at large stock = critical", rVsG({ rAvg: 6.5, rMarg: 6.0, gNominal: 5.5, rolloverShare12m: 0.30, contractionFlag: false, debtToGdpPct: 122 }).status, "critical");

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

// --- yieldDollarCorr: 60d Pearson corr of Δ10Y(bp) vs Δdollar composite
// (avg of ΔUSD_JPY% and −ΔEUR_USD%), aligned by date. Synthetic anti-correlated
// series: EUR_USD held flat (ΔEUR%=0), USD_JPY set so ΔUSDJPY% = −ΔYield(bp) each
// day — an exact negative proportional relationship, so Pearson corr → −1.
(() => {
  const deltasBp = [4,-2,3,-5,1,6,-3,2,-4,5,-1,3,-6,2,4,-3,1,-2,5,-4,3,-1,6,-5,2,-3,4,-2,1,-4,5,-6,3,-1,2,-5,4,-3,1,-2,6,-4,3,-1,5];
  const n = deltasBp.length + 1; // 45 levels → 44 changes
  const dates = Array.from({ length: n }, (_, i) => `2024-01-${String(i + 1).padStart(2, "0")}`);
  const dgs10 = [{ date: dates[0], value: 4.00 }];
  const eurHist = [{ date: dates[0], value: 1.10 }];
  const jpyHist = [{ date: dates[0], value: 150.00 }];
  for (let i = 1; i < n; i++) {
    dgs10.push({ date: dates[i], value: dgs10[i - 1].value + deltasBp[i - 1] / 100 });
    eurHist.push({ date: dates[i], value: 1.10 }); // flat → ΔEUR% = 0
    jpyHist.push({ date: dates[i], value: jpyHist[i - 1].value * (1 - deltasBp[i - 1] / 100) });
  }
  truthy("synthetic anti-correlated yield/dollar → corr ≤ −0.9", yieldDollarCorr(dgs10, eurHist, jpyHist) <= -0.9);
})();
(() => {
  // Boundary probe: 39 overlapping dates (below the ≥41 the function requires),
  // built the same way the anti-correlated fixture above is, so the ONLY
  // difference from a passing case is sample size, not shape.
  const n = 39;
  const dates = Array.from({ length: n }, (_, i) => `2024-03-${String(i + 1).padStart(2, "0")}`);
  const dgs10 = dates.map((date, i) => ({ date, value: 4.00 + i * 0.01 }));
  const eurHist = dates.map(date => ({ date, value: 1.10 }));
  const jpyHist = dates.map((date, i) => ({ date, value: 150.00 - i * 0.10 }));
  truthy("yieldDollarCorr at 39 overlapping days (below the 41 floor) → NaN",
    Number.isNaN(yieldDollarCorr(dgs10, eurHist, jpyHist)));
})();

(() => {
  // --- Archetype equity row: vendored tail + live FRED splice.
  // FRED's SP500 licence is a rolling 10-year window, so the row's ~30y span
  // depends on src/data/spx-monthly.json carrying the pre-2016 tail. If that
  // artifact shrinks or the splice lets the stale tail win, the chart silently
  // truncates or freezes — neither shows up in tsc or `next build`.
  const spanYears = (Number(spxMonthly[spxMonthly.length - 1].date.slice(0, 4))
    - Number(spxMonthly[0].date.slice(0, 4)));
  truthy(`spx-monthly.json spans ≥30y (got ${spanYears}y, ${spxMonthly[0].date}→${spxMonthly[spxMonthly.length - 1].date})`,
    spanYears >= 30);
  truthy("spx-monthly.json reaches back past 1996 (the neighbour rows' start)",
    spxMonthly[0].date < "1996-01-01");
  truthy("spx-monthly.json is one row per month, ascending",
    new Set(spxMonthly.map(o => o.date.slice(0, 7))).size === spxMonthly.length
    && spxMonthly.every((o, i) => i === 0 || spxMonthly[i - 1].date < o.date));

  // Overlap precedence: live must overwrite the vendored month, not append to it.
  const base = [{ date: "2020-01-31", value: 1 }, { date: "2020-02-28", value: 2 }];
  const live = [{ date: "2020-02-27", value: 99 }, { date: "2020-03-31", value: 3 }];
  const spliced = spliceMonthly(base, live);
  eq("splice keeps one row per month across the seam", spliced.length, 3);
  eq("splice: live wins the overlapping month", spliced[1].value, 99);
  eq("splice: non-overlapping base month survives", spliced[0].value, 1);
  eq("splice: live-only month is appended", spliced[2].value, 3);
  truthy("splice output is date-ascending",
    spliced.every((o, i) => i === 0 || spliced[i - 1].date < o.date));

  // thinMonthly keeps the LAST print of each month (the splice relies on this).
  eq("thinMonthly keeps the last observation of each month",
    thinMonthly([{ date: "2020-01-02", value: 1 }, { date: "2020-01-31", value: 7 }])[0].value, 7);
})();

(() => {
  // RSC boundary: a Server Component reading a data export out of a
  // "use client" module gets a client-reference proxy, which the flight
  // serializer cannot resolve — a request-time 500 that `next build` and
  // `tsc` both pass. See scripts/check-client-boundary.mjs.
  const violations = findBoundaryViolations();
  truthy(
    `no server module imports non-component bindings from a "use client" module${
      violations.length ? ` — ${violations.map(v => `${v.file} imports ${v.binding} from ${v.target}`).join("; ")}` : ""
    }`,
    violations.length === 0,
  );
})();

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
