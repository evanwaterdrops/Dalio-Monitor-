import {
  smallCyclePhase, monetisationValve, rVsG, goldDecomposition, demandLeg,
  deferredAsset, interestSqueeze, revenueBeta, japanLeg, bigCycleStage,
  priceOfMoney, privateCredit,
  moneyVsCredit, curveShape, printDiscriminator, reservePremise, equityDrawdown,
  bdcStress, positionClock, yieldDollarCorr,
  evaluateTriggers, pctChange, sahmGap, clamp01,
  // @ts-ignore — plain JS module, single source of truth with selftest
} from "./math.mjs";
import * as src from "../sources/clients";
import { getManual } from "../db";
import { fingerprintFromFactors } from "../playbook/fingerprint.mjs";
import { leaderboard } from "../playbook/match.mjs";
import { evalTripwires } from "../playbook/theme-eval.mjs";
// @ts-ignore — JSON module, resolveJsonModule
import episodes from "../playbook/episodes.json";
// @ts-ignore — JSON module, resolveJsonModule
import fingerprints from "../playbook/fingerprints.json";
// @ts-ignore — JSON module, resolveJsonModule
import themes from "../playbook/themes.json";

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
         realY, hyOas, gdp, debtGdpQ, avgRate, debt, mts, auctions, jgb, foreignQ, wti,
         m2, tcmdo, dgs3mo, t5yie, sofr, iorb, bills, cmdebt, tnwbshno, tdsp, pcepilfe, termPrem,
         wealthTop01, wealthBottom50, wealthMid50to90] = await Promise.all([
    t("PAYEMS", () => src.fred("PAYEMS", { limit: 30 }), []),
    t("PAYEMS-rev", () => src.fredRevisions("PAYEMS", 4), []),
    t("UNRATE", () => src.fred("UNRATE", { limit: 30 }), []),
    t("CPIAUCSL", () => src.fred("CPIAUCSL", { limit: 30 }), []),
    t("CPILFESL", () => src.fred("CPILFESL", { limit: 30 }), []),
    t("DGS10", () => src.fred("DGS10", { limit: 260 }), []),  // 260 ≥ 251 trading days + margin, so longRateDelta12mBp isn't always null
    t("DGS30", () => src.fred("DGS30", { limit: 30 }), []),
    t("DFEDTARU", () => src.fred("DFEDTARU", { limit: 200 }), []),
    // limit 16 (not 8): billsShareOfExpansion needs ago(walcl,13) — a 13-week-back weekly
    // observation — for the print discriminator to ever resolve "reserve-management".
    t("WALCL", () => src.fred("WALCL", { limit: 16 }), []),
    t("RESPPLLOPNWW", () => src.fred("RESPPLLOPNWW", { limit: 16 }), []),
    t("DFII10", () => src.fred("DFII10", { limit: 300 }), []),   // 300 ≈ 12m of trading days for the S6 impulse
    t("HY-OAS", () => src.fred("BAMLH0A0HYM2", { limit: 90 }), []), // 90 ≈ 3m for the PC momentum
    t("GDP", () => src.fred("GDP", { limit: 10 }), []),
    t("GFDEGDQ188S", () => src.fred("GFDEGDQ188S", { limit: 4 }), []),
    t("avg_interest_rate", src.avgInterestRate, []),
    t("debt_to_penny", src.debtToPenny, []),
    t("mts", src.mtsInterestAndReceipts, []),
    t("auctions", src.recentAuctions, []),
    t("JGB10", () => src.fred("IRLTLT01JPM156N", { limit: 8 }), []),
    t("FDHBFIN", () => src.fred("FDHBFIN", { limit: 8 }), []),
    t("WTISPLC", () => src.fred("WTISPLC", { limit: 13 }), []),
    t("M2SL", () => src.fred("M2SL", { limit: 30 }), []),
    t("TCMDO", () => src.fred("TCMDO", { limit: 10 }), []),
    t("DGS3MO", () => src.fred("DGS3MO", { limit: 260 }), []),
    t("T5YIE", () => src.fred("T5YIE", { limit: 90 }), []),
    t("SOFR", () => src.fred("SOFR", { limit: 90 }), []),
    t("IORB", () => src.fred("IORB", { limit: 90 }), []),
    t("WSHOBL", () => src.fred("WSHOBL", { limit: 16 }), []),
    t("CMDEBT", () => src.fred("CMDEBT", { limit: 8 }), []),
    t("TNWBSHNO", () => src.fred("TNWBSHNO", { limit: 8 }), []),
    t("TDSP", () => src.fred("TDSP", { limit: 8 }), []),
    t("PCEPILFE", () => src.fred("PCEPILFE", { limit: 30 }), []),
    // THREEFYTP10 (term premium) predates this task in the registry but was never
    // wired to a pull — curveShape's dTpBp3m needs it, so wiring it is in scope here.
    t("THREEFYTP10", () => src.fred("THREEFYTP10", { limit: 260 }), []),
    t("WFRBSTP1300", () => src.fred("WFRBSTP1300", { limit: 8 }), []),
    t("WFRBSB50215", () => src.fred("WFRBSB50215", { limit: 8 }), []),
    t("WFRBSN40188", () => src.fred("WFRBSN40188", { limit: 8 }), []),
  ]);
  const claimsYoYPct = await t<number | null>("ICSA", src.claimsYoY, null);

  const [spot, xauHist, eurHist, jpyHist, bcoHist, spxHist, bdcCloses] = await Promise.all([
    t("oanda-spot", () => src.oandaPrices(["XAU_USD", "EUR_USD", "USD_JPY", "BCO_USD"]), {} as Record<string, number>),
    t<src.Obs[]>("XAU-candles", () => src.oandaCandles("XAU_USD", 25), []),
    t<src.Obs[]>("EUR-candles", () => src.oandaCandles("EUR_USD", 25), []),
    t<src.Obs[]>("JPY-candles", () => src.oandaCandles("USD_JPY", 25), []),
    t<src.Obs[]>("BCO-candles", () => src.oandaCandles("BCO_USD", 10), []),
    // Stooq primary (full ^spx history, keyless); Yahoo ^GSPC fallback if Stooq's
    // anti-bot challenge blocks this environment. Both dead → one "SPX" problems entry.
    t<src.Obs[]>("SPX", async () => {
      try { return await src.stooqCloses("^spx"); }
      catch { return await src.yahooCloses("^GSPC"); }
    }, []),
    Promise.all(["ARCC", "BXSL", "OBDC", "FSK"].map(tkr =>
      t<src.Obs[]>(`BDC-${tkr}`, () => src.yahooCloses(tkr), []))),
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
  const oilYoYPct = wti.length > 12 ? round2(pctChange(last(wti).value, ago(wti, 12).value) ?? NaN) : null;

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

  // ---- derived inputs: fast-clock factors (money/curve/print discriminator/equity/BDC/premise) ----
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
  const corr60d = yieldDollarCorr(dgs10, eurHist, jpyHist);
  // BDC: median P/NAV + 5y percentile needs NAV manual inputs; degrade to null cleanly
  const navs = await Promise.all(["ARCC", "BXSL", "OBDC", "FSK"].map(tkr => getManual(`bdc_nav_${tkr}`)));
  const pnavs = bdcCloses
    .map((h, i) => (h.length && navs[i]?.value ? last(h).value / navs[i]!.value : null))
    .filter((x): x is number => x != null);
  const medianPnav = pnavs.length >= 2 ? pnavs.sort((a, b) => a - b)[Math.floor(pnavs.length / 2)] : NaN;
  // pnavPctile5y: requires stored P/NAV history to compute a percentile; no snapshot-history
  // plumbing yet, so this stays null — bdcStress degrades cleanly per its own contract (Task 3).
  const pnavPctile5y: number | null = null;

  // position clock (slow layer) inputs — quarterly, revised; context-only, never a trigger input
  const totalDebtGdpPct = tcmdo.length && gdp.length ? round2((last(tcmdo).value / last(gdp).value) * 100) : NaN;
  const hhDebtNetWorthPct = cmdebt.length && tnwbshno.length ? round2((last(cmdebt).value / last(tnwbshno).value) * 100) : NaN;
  const dsrHouseholdPct = tdsp.length ? last(tdsp).value : NaN;
  const wealthBottom90Share = wealthBottom50.length && wealthMid50to90.length
    ? last(wealthBottom50).value + last(wealthMid50to90).value : NaN;
  const wealthRatio = wealthTop01.length && Number.isFinite(wealthBottom90Share) && wealthBottom90Share !== 0
    ? round2(last(wealthTop01).value / wealthBottom90Share) : NaN;

  if (!mts.length) problems.push("mts: fetch succeeded but no usable rows (schema drift?)");

  // ---- priors & print history (pure slices of the pulls above — no extra API calls) ----
  const mLabel = (d: string) => `${MONTHS[Number(d.slice(5, 7)) - 1]}-${d.slice(2, 4)}`;
  const dLabel = (d: string) => d.slice(5);
  const hist = (obs: { date: string; value: number }[], n: number, label: (d: string) => string, r = round2) =>
    obs.slice(-n).map(o => ({ period: label(o.date), value: r(o.value) }));
  const priorOf = (obs: { date: string; value: number }[], r = round2) =>
    obs.length >= 2 ? r(ago(obs, 1).value) : null;

  const nfp3mmaSeries = nfpChanges
    .map((_, k) => (k >= 2 ? { date: payems[k + 1].date, value: avg(nfpChanges.slice(k - 2, k + 1)) } : null))
    .filter((o): o is { date: string; value: number } => o != null);
  const yoySeries = (obs: src.Obs[]) =>
    obs.length > 12
      ? obs.slice(12).map((o, k) => ({ date: o.date, value: round2(pctChange(o.value, obs[k].value) ?? NaN) }))
      : [];
  const coreSeries = yoySeries(cpiC);
  const headSeries = yoySeries(cpiH);

  const mtsKind = (kind: string) => mts.filter(r => r.kind === kind); // sorted desc by date
  const ttmRatioAt = (off: number) => {
    const int = mtsKind("Net Interest").slice(off, off + 12);
    const rec = mtsKind("Total Receipts").slice(off, off + 12);
    if (int.length < 12 || rec.length < 12) return null;
    const paid = int.reduce((s, r) => s + r.value, 0), got = rec.reduce((s, r) => s + r.value, 0);
    return got === 0 ? null : { date: rec[0].date, value: Math.round((paid / got) * 1000) / 10 }; // %
  };
  const ratioSeries = [...Array(8)]
    .map((_, off) => ttmRatioAt(off))
    .filter((o): o is { date: string; value: number } => o != null)
    .reverse();

  const tenYs = auctions.filter(a => a.term === "10-Year" && a.btc != null);
  const rAvgPrior = priorOf(avgRate);
  const gapPrior = rAvgPrior != null && Number.isFinite(gNominal) ? round2(gNominal - rAvgPrior) : null;

  // ---- factor computations (math.mjs = tested single source of truth) ----
  const sc = smallCyclePhase({ nfp3mma, revisionsSum2m, sahmGap: gap, fundsDelta6m, claimsYoYPct });
  const s6 = priceOfMoney({
    realYieldDelta12mBp: realY.length > 250 ? (last(realY).value - ago(realY, 250).value) * 100 : NaN,
  });
  const hyOasDelta3mBp = hyOas.length > 63 ? (last(hyOas).value - ago(hyOas, 63).value) * 100 : NaN;
  const pc = privateCredit({
    hyOasBp: hyOas.length ? last(hyOas).value * 100 : NaN,
    hyOasDelta3mBp,
  });
  const valve = monetisationValve({ coreYoY, headlineYoY, brent, expInfl5yPct: t5yie.length ? last(t5yie).value : null });
  const contractionFlag = sc.phase === "contraction" || sc.phase === "late-stall-breaking-down";
  const debtToGdpPct = debtGdpQ.length ? last(debtGdpQ).value : null;
  const rvg = rVsG({ rAvg, rMarg, gNominal, rolloverShare12m: rolloverShare, contractionFlag, debtToGdpPct });
  const gold = goldDecomposition({ dXauUsdPct: dXau, dXauEurPct: dXauEur, dXauJpyPct: dXauJpy, dRealYieldBp: dRealBp });
  const demand = demandLeg({ auctions: auctions.map(a => ({ term: a.term, btc: a.btc!, dealerPct: a.dealerPct })) });
  const deferred = deferredAsset({ levelBn: defLevelBn, deltaBn13w: defDelta13w });
  const squeeze = interestSqueeze({ ttmInterestBn, ttmReceiptsBn });
  const revBeta = revenueBeta({ receiptsYoYPct: receiptsYoY, nominalGdpYoYPct: gNominal });
  const japan = japanLeg({ jgb10Delta3mBp: jgbDelta, usdJpyDelta3mPct: jpyDelta3m, japanHoldingsDelta2mBn: japanHoldingsDelta });

  // ---- fast-clock additions: money vs credit, curve decomposition, print discriminator,
  // equity drawdown ruler, BDC/HY divergence, reserve-premise tripwire ----
  const money = moneyVsCredit({ m2YoYPct, creditYoYPct });
  const curve = curveShape({ dFrontBp3m, dLongBp3m, dTpBp3m, spreadBp });
  const disc = printDiscriminator({ fedAssetsUp3w, billsShareOfExpansion, sofrIorbBp });
  const equity = equityDrawdown({ ddPct: spxDdPct });
  const bdc = bdcStress({ medianPnav, pnavPctile5y, hyOasDelta3mBp });
  const premise = reservePremise({ corr60d });

  const stage = bigCycleStage({ fedAssetsUp3w, coreYoY, headlineYoY, valveScore: valve.score, printMode: disc.printMode });

  // ---- slow clock: position layer — quarterly, revised inputs; context-only display +
  // positionClock score. Never averaged into the fast layer, never a trigger input. ----
  const position = {
    clock: positionClock({ totalDebtGdpPct, hhDebtNetWorthPct, dsrHouseholdPct, wealthRatio, curveSpreadBp: spreadBp }),
    inputs: { totalDebtGdpPct, hhDebtNetWorthPct, dsrHouseholdPct, wealthRatio },
  };

  const triggers = evaluateTriggers({
    rvg, rAvg, gNominal, contractionFlag, fedAssetsUp3w, headlineYoY,
    squeeze, gold, japan, demand,
    easedAndLongEndSold: easedAndLongEndSold(funds, dgs30),
    billsShareUp3m: null, // MSPD automation = roadmap; manual override available
    printMode: disc.printMode, curve, bdc, premise,
  });

  // ---- playbook: live fingerprint → episode leaderboard + theme tripwires ----
  const liveFp = fingerprintFromFactors({
    factors: { SC: sc, S8: valve, S6: s6, S7: rvg, SoV: gold, S5: demand, S3: squeeze, TAX: revBeta, JP: japan, PC: pc, deferred },
    triggers,
    headlineYoY,
    debtGdpPct: debtToGdpPct,
    oilYoYPct,
    longRateDelta12mBp: dgs10.length > 250 ? (last(dgs10).value - ago(dgs10, 250).value) * 100 : null,
  });
  const playbook = {
    leaderboard: leaderboard(liveFp, episodes as any[], fingerprints as any),
    themes: (themes as any[]).map((th) => ({
      id: th.id, name: th.name, positionLabel: th.positionLabel,
      tripwires: evalTripwires(th, {
        hyOasBp: hyOas.length ? last(hyOas).value * 100 : null,
        hyOasDelta3mBp: pc?.hyOasDelta3mBp ?? null,
      }),
    })),
  };

  return {
    asOf: new Date().toISOString(),
    problems,
    inputs: {
      nfp3mma: Math.round(nfp3mma), revisionsSum2m, sahmGap: gap, claimsYoYPct, headlineYoY, coreYoY,
      brent: round2(brent), rAvg, rMarg, gNominal, rolloverShare,
      ttmInterestBn: Math.round(ttmInterestBn), ttmReceiptsBn: Math.round(ttmReceiptsBn),
      goldSpot: round2(spot["XAU_USD"] ?? NaN), defLevelBn: round2(defLevelBn),
      debtLatest: debt.length ? last(debt).value : null,
      hyOas: hyOas.length ? last(hyOas).value : null,
      foreignHoldingsBn: foreignQ.length ? last(foreignQ).value : null,
      oilYoYPct,
      real10y: realY.length ? last(realY).value : null,
      real10yPrior: priorOf(realY),
      real10yHistory: hist(realY, 8, dLabel),
      // priors + print history for the AFP strips and mini charts
      nfp3mmaPrior: priorOf(nfp3mmaSeries, Math.round),
      nfp3mmaHistory: hist(nfp3mmaSeries, 8, mLabel, Math.round),
      revisionsSum2mPrior: payRev.length >= 4 ? payRev.slice(-4, -2).reduce((s, r) => s + r.revision, 0) : null,
      revisionsHistory: payRev.map(r => ({ period: mLabel(r.date), value: r.revision })),
      coreYoYPrior: priorOf(coreSeries),
      coreYoYHistory: hist(coreSeries, 8, mLabel),
      headlineYoYPrior: priorOf(headSeries),
      headlineYoYHistory: hist(headSeries, 8, mLabel),
      brentPrior: priorOf(bcoHist),
      brentHistory: hist(bcoHist, 8, dLabel),
      goldSpotPrior: priorOf(xauHist),
      goldSpotHistory: hist(xauHist, 8, dLabel, (x) => Math.round(x)),
      rAvgPrior,
      rAvgHistory: hist(avgRate, 8, mLabel),
      printMode: disc.printMode,
    },
    factors: {
      SC: sc, S8: valve, S6: s6, PC: pc,
      S7: { ...rvg, gapPrior },
      SoV: gold,
      S5: { ...demand, btcPrior: tenYs.length >= 2 ? tenYs[1].btc : null,
            btcHistory: tenYs.slice(0, 8).reverse().map(a => ({ period: mLabel(a.date), value: a.btc as number })) },
      deferred,
      S3: { ...squeeze, ratioPrior: (() => { const p = ttmRatioAt(1); return p ? p.value / 100 : null; })(),
            ratioHistory: ratioSeries.map(o => ({ period: mLabel(o.date), value: o.value })) },
      TAX: revBeta, JP: japan,
      money, curve, equity, bdc, premise,
    },
    position,
    stage,
    triggers,
    playbook,
  };
}

/* ---- helpers ---- */
const avg = (a: number[]) => a.reduce((s, x) => s + x, 0) / a.length;
const round2 = (x: number) => Math.round(x * 100) / 100;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

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
