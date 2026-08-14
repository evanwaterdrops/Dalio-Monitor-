/**
 * Selftest: feed the actual Aug-2026 readings into the framework math and
 * assert it reproduces the conversation's conclusions. If any of these
 * fail, the monitor's logic has drifted from the analysis it encodes.
 */
import {
  smallCyclePhase, monetisationValve, rVsG, goldDecomposition,
  demandLeg, deferredAsset, interestSqueeze, bigCycleStage, evaluateTriggers,
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

// --- big-cycle stage: TOP LATE now; flips to DELEVERAGING only on the unprinted marker
const st = bigCycleStage({ fedAssetsUp3w: false, coreYoY: 2.5, headlineYoY: 3.4, valveScore: valve.score });
truthy("stage = TOP, LATE", st.stage.startsWith("TOP"));
const st2 = bigCycleStage({ fedAssetsUp3w: true, coreYoY: 2.5, headlineYoY: 3.4, valveScore: valve.score });
truthy("Fed buying while headline>3 → Stage 6 confirmed", st2.stage.startsWith("DELEVERAGING"));

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

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
