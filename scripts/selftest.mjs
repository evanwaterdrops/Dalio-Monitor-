/**
 * Selftest: feed the actual Aug-2026 readings into the framework math and
 * assert it reproduces the conversation's conclusions. If any of these
 * fail, the monitor's logic has drifted from the analysis it encodes.
 */
import {
  smallCyclePhase, monetisationValve, rVsG, goldDecomposition,
  demandLeg, deferredAsset, interestSqueeze, bigCycleStage, evaluateTriggers,
  priceOfMoney, privateCredit,
} from "../src/lib/framework/math.mjs";

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

// --- Fed deferred asset −$243.9bn = Stage-5 metric, literal
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

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
