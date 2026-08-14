import {
  smallCyclePhase, monetisationValve, rVsG, goldDecomposition, demandLeg,
  deferredAsset, interestSqueeze, revenueBeta, japanLeg, bigCycleStage,
  evaluateTriggers, pctChange, sahmGap,
  // @ts-ignore — plain JS module, single source of truth with selftest
} from "./math.mjs";
import * as src from "../sources/clients";
import { getManual } from "../db";

const last = <T,>(a: T[]) => a[a.length - 1];
const ago = <T,>(a: T[], n: number) => a[a.length - 1 - n];
const yoy = (obs: { value: number }[], periodsPerYear: number) =>
  pctChange(last(obs).value, ago(obs, periodsPerYear).value);

/** Full snapshot: pull everything, compute every factor, evaluate triggers. */
export async function assess() {
  const problems: string[] = [];
  const t = async <T,>(name: string, fn: () => Promise<T>, fallback: T): Promise<T> => {
    try { return await fn(); } catch (e: any) { problems.push(`${name}: ${e.message}`); return fallback; }
  };

  // ---- pulls (tolerant: one dead source must not kill the run) ----
  const [payems, payRev, unrate, cpiH, cpiC, dgs10, dgs30, funds, walcl, defAsset,
         realY, hyOas, gdp, avgRate, debt, mts, auctions, jgb, foreignQ] = await Promise.all([
    t("PAYEMS", () => src.fred("PAYEMS", { limit: 30 }), []),
    t("PAYEMS-rev", () => src.fredRevisions("PAYEMS", 4), []),
    t("UNRATE", () => src.fred("UNRATE", { limit: 30 }), []),
    t("CPIAUCSL", () => src.fred("CPIAUCSL", { limit: 30 }), []),
    t("CPILFESL", () => src.fred("CPILFESL", { limit: 30 }), []),
    t("DGS10", () => src.fred("DGS10", { limit: 30 }), []),
    t("DGS30", () => src.fred("DGS30", { limit: 30 }), []),
    t("DFEDTARU", () => src.fred("DFEDTARU", { limit: 200 }), []),
    t("WALCL", () => src.fred("WALCL", { limit: 8 }), []),
    t("RESPPLLOPNWW", () => src.fred("RESPPLLOPNWW", { limit: 16 }), []),
    t("DFII10", () => src.fred("DFII10", { limit: 30 }), []),
    t("HY-OAS", () => src.fred("BAMLH0A0HYM2", { limit: 30 }), []),
    t("GDP", () => src.fred("GDP", { limit: 10 }), []),
    t("avg_interest_rate", src.avgInterestRate, []),
    t("debt_to_penny", src.debtToPenny, []),
    t("mts", src.mtsInterestAndReceipts, []),
    t("auctions", src.recentAuctions, []),
    t("JGB10", () => src.fred("IRLTLT01JPM156N", { limit: 8 }), []),
    t("FDHBFIN", () => src.fred("FDHBFIN", { limit: 8 }), []),
  ]);

  const [spot, xauHist, eurHist, jpyHist] = await Promise.all([
    t("oanda-spot", () => src.oandaPrices(["XAU_USD", "EUR_USD", "USD_JPY", "BCO_USD"]), {} as Record<string, number>),
    t("XAU-candles", () => src.oandaCandles("XAU_USD", 25), []),
    t("EUR-candles", () => src.oandaCandles("EUR_USD", 25), []),
    t("JPY-candles", () => src.oandaCandles("USD_JPY", 25), []),
  ]);

  // ---- derived inputs ----
  const nfpChanges = payems.slice(1).map((o, i) => o.value - payems[i].value);
  const nfp3mma = nfpChanges.length >= 3 ? avg(nfpChanges.slice(-3)) : 0;
  const revisionsSum2m = payRev.slice(-3, -1).reduce((s, r) => s + r.revision, 0);
  const un3 = unrate.length >= 3 ? avg(unrate.slice(-3).map(o => o.value)) : NaN;
  const unMin12 = unrate.length >= 12 ? Math.min(...unrate.slice(-12).map(o => o.value)) : NaN;
  const gap = Number.isFinite(un3) ? sahmGap(un3, unMin12) : 0;
  const fundsDelta6m = funds.length ? last(funds).value - funds[Math.max(0, funds.length - 126)].value : 0;

  const headlineYoY = cpiH.length > 12 ? round2(yoy(cpiH, 12)!) : NaN;
  const coreYoY = cpiC.length > 12 ? round2(yoy(cpiC, 12)!) : NaN;
  const brent = spot["BCO_USD"] ?? NaN;

  const rAvg = avgRate.length ? last(avgRate).value : NaN;
  const rMarg = dgs10.length ? last(dgs10).value : NaN;
  const gNominal = gdp.length > 4 ? round2(yoy(gdp, 4)!) : NaN;
  const rolloverShare = (await getManual("rollover_share_12m"))?.value ?? 0.30;

  // gold decomposition over ~20 trading days, in three numeraires
  const w = Math.min(20, xauHist.length - 1, eurHist.length - 1, jpyHist.length - 1);
  const chg = (h: { value: number }[]) => pctChange(last(h).value, ago(h, w).value) ?? 0;
  const dXau = w > 0 ? chg(xauHist) : 0;
  const dXauEur = w > 0 ? pctChange(last(xauHist).value / last(eurHist).value, ago(xauHist, w).value / ago(eurHist, w).value) ?? 0 : 0;
  const dXauJpy = w > 0 ? pctChange(last(xauHist).value * last(jpyHist).value, ago(xauHist, w).value * ago(jpyHist, w).value) ?? 0 : 0;
  const dRealBp = w > 0 && realY.length > w ? (last(realY).value - ago(realY, w).value) * 100 : 0;

  const ttm = (kind: string) => mts.filter(r => r.kind === kind).slice(0, 12).reduce((s, r) => s + r.value, 0) / 1e9;
  const ttmInterestBn = ttm("Net Interest");
  const ttmReceiptsBn = ttm("Total Receipts");
  const receiptsYoY = receiptsYoYPct(mts);

  const fedAssetsUp3w = walcl.length >= 4 && [1, 2, 3].every(i => ago(walcl, i - 1).value > ago(walcl, i).value);
  const defLevelBn = defAsset.length ? last(defAsset).value / 1000 : NaN;
  const defDelta13w = defAsset.length >= 14 ? (last(defAsset).value - ago(defAsset, 13).value) / 1000 : 0;

  const jgbDelta = jgb.length >= 4 ? (last(jgb).value - ago(jgb, 3).value) * 100 : 0;
  const jpyDelta3m = jpyHist.length ? pctChange(last(jpyHist).value, jpyHist[0].value) ?? 0 : 0;
  const japanHoldingsDelta = (await getManual("japan_tic_delta_2m_bn"))?.value ?? 0; // until TIC series id pinned

  // ---- factor computations (math.mjs = tested single source of truth) ----
  const sc = smallCyclePhase({ nfp3mma, revisionsSum2m, sahmGap: gap, fundsDelta6m });
  const valve = monetisationValve({ coreYoY, headlineYoY, brent });
  const contractionFlag = sc.phase === "contraction" || sc.phase === "late-stall-breaking-down";
  const rvg = rVsG({ rAvg, rMarg, gNominal, rolloverShare12m: rolloverShare, contractionFlag });
  const gold = goldDecomposition({ dXauUsdPct: dXau, dXauEurPct: dXauEur, dXauJpyPct: dXauJpy, dRealYieldBp: dRealBp });
  const demand = demandLeg({ auctions: auctions.map(a => ({ term: a.term, btc: a.btc!, dealerPct: a.dealerPct })) });
  const deferred = deferredAsset({ levelBn: defLevelBn, deltaBn13w: defDelta13w });
  const squeeze = interestSqueeze({ ttmInterestBn, ttmReceiptsBn });
  const revBeta = revenueBeta({ receiptsYoYPct: receiptsYoY, nominalGdpYoYPct: gNominal });
  const japan = japanLeg({ jgb10Delta3mBp: jgbDelta, usdJpyDelta3mPct: jpyDelta3m, japanHoldingsDelta2mBn: japanHoldingsDelta });
  const stage = bigCycleStage({ fedAssetsUp3w, coreYoY, headlineYoY, valveScore: valve.score });

  const triggers = evaluateTriggers({
    rvg, rAvg, gNominal, contractionFlag, fedAssetsUp3w, headlineYoY,
    squeeze, gold, japan, demand,
    easedAndLongEndSold: easedAndLongEndSold(funds, dgs30),
    billsShareUp3m: null, // MSPD automation = roadmap; manual override available
  });

  return {
    asOf: new Date().toISOString(),
    problems,
    inputs: {
      nfp3mma: Math.round(nfp3mma), revisionsSum2m, sahmGap: gap, headlineYoY, coreYoY,
      brent: round2(brent), rAvg, rMarg, gNominal, rolloverShare,
      ttmInterestBn: Math.round(ttmInterestBn), ttmReceiptsBn: Math.round(ttmReceiptsBn),
      goldSpot: round2(spot["XAU_USD"] ?? NaN), defLevelBn: round2(defLevelBn),
      debtLatest: debt.length ? last(debt).value : null,
      hyOas: hyOas.length ? last(hyOas).value : null,
      foreignHoldingsBn: foreignQ.length ? last(foreignQ).value : null,
    },
    factors: { SC: sc, S8: valve, S7: rvg, SoV: gold, S5: demand, deferred, S3: squeeze, TAX: revBeta, JP: japan },
    stage,
    triggers,
  };
}

/* ---- helpers ---- */
const avg = (a: number[]) => a.reduce((s, x) => s + x, 0) / a.length;
const round2 = (x: number) => Math.round(x * 100) / 100;

function receiptsYoYPct(mts: { date: string; kind: string; value: number }[]) {
  const rec = mts.filter(r => r.kind === "Total Receipts");
  if (rec.length < 13) return 0;
  return pctChange(rec[0].value, rec[12].value) ?? 0;
}

/** T2: a funds cut whose day sees DGS30 rise ≥8bp = sovereign repriced as credit. */
function easedAndLongEndSold(funds: { date: string; value: number }[], dgs30: { date: string; value: number }[]) {
  for (let i = 1; i < funds.length; i++) {
    if (funds[i].value < funds[i - 1].value) {
      const d = funds[i].date;
      const j = dgs30.findIndex(o => o.date === d);
      if (j > 0 && (dgs30[j].value - dgs30[j - 1].value) * 100 >= 8) return true;
    }
  }
  return false;
}
