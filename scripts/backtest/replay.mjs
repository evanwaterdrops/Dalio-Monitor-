/**
 * Point-in-time replay engine.
 *
 * For each month-end t (1999-01 → 2026-06) it reconstructs every input
 * `assess()` derives — using ONLY data published by t — and feeds them
 * through the PRODUCTION factor math (src/lib/framework/math.mjs, the same
 * module the app and selftest import). Nothing is reimplemented.
 *
 * No-lookahead rules:
 *  - Revisable macro series (PAYEMS, UNRATE, CPI, GDP, FGRECPT) come from
 *    ALFRED vintages dated t. A month whose vintage predates ALFRED
 *    coverage marks that leg unavailable — never backfilled from later data.
 *  - Market series (yields, FX, oil, gold, spreads) are unrevised → truncate ≤ t.
 *  - Publication lags: FiscalData avg_interest_rates −20d; MTS −45d;
 *    OECD JGB monthly −45d; annual FYOINT/FYFR usable from Nov 1 after FY end.
 *  - Payroll revisions signal = (value as known at t) − (first print), where
 *    the first print of month m is read from the vintage at end of m+1.
 *
 * Legs whose data source doesn't exist yet at t are EXCLUDED from the
 * composite heat (not defaulted) and listed in `problems` — mirroring
 * production's graceful-degradation contract.
 */

import { writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  smallCyclePhase, monetisationValve, rVsG, goldDecomposition, demandLeg,
  deferredAsset, interestSqueeze, revenueBeta, japanLeg, bigCycleStage,
  priceOfMoney, privateCredit,
  evaluateTriggers, pctChange, sahmGap, STATUS,
} from "../../src/lib/framework/math.mjs";
import {
  fredLatest, alfredVintages, fiscalAvgRateAll, mtsAll, tdAuctionsYear, yahooDailyMax,
} from "./fetch.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));

/* ---------------- time helpers ---------------- */
// 1960-06: earliest month with both PAYEMS and UNRATE ALFRED vintages —
// probed empirically (PAYEMS vintages ≤1955, UNRATE ~1960).
const START = "1960-06", END = "2026-06";
export function monthGrid(start = START, end = END) {
  const out = [];
  let [y, m] = start.split("-").map(Number);
  const [ey, em] = end.split("-").map(Number);
  while (y < ey || (y === ey && m <= em)) {
    out.push(`${y}-${String(m).padStart(2, "0")}`);
    m++; if (m > 12) { m = 1; y++; }
  }
  return out;
}
const monthEnd = ym => {
  const [y, m] = ym.split("-").map(Number);
  return `${y}-${String(m).padStart(2, "0")}-${String(new Date(y, m, 0).getDate()).padStart(2, "0")}`;
};
const nextMonth = ym => {
  let [y, m] = ym.split("-").map(Number);
  m++; if (m > 12) { m = 1; y++; }
  return `${y}-${String(m).padStart(2, "0")}`;
};
const shiftDays = (iso, days) => {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

/* ---------------- series helpers (mirror assess.ts) ---------------- */
const last = a => a[a.length - 1];
const ago = (a, n) => a[a.length - 1 - n];
const avg = a => a.reduce((s, x) => s + x, 0) / a.length;
const round2 = x => Math.round(x * 100) / 100;
const asOf = (obs, t) => obs.filter(o => o.date <= t);
const yoy = (obs, n) => obs.length > n ? pctChange(last(obs).value, ago(obs, n).value) : null;
/** last value at or before `date` (series asc). */
const valueAt = (obs, date) => {
  let lo = 0, hi = obs.length - 1, ans = null;
  while (lo <= hi) { const m = (lo + hi) >> 1; if (obs[m].date <= date) { ans = obs[m]; lo = m + 1; } else hi = m - 1; }
  return ans;
};
/** y/y regardless of cadence: compares last obs to the obs ~12 months earlier by date. */
const yoyByDate = (obs) => {
  if (obs.length < 2) return null;
  const lastO = last(obs);
  const target = `${Number(lastO.date.slice(0, 4)) - 1}${lastO.date.slice(4)}`;
  const prior = valueAt(obs, target);
  return prior && prior.date > `${Number(lastO.date.slice(0, 4)) - 2}${lastO.date.slice(4)}`
    ? pctChange(lastO.value, prior.value) : null;
};

/* ---------------- main ---------------- */
export async function replay() {
  const months = monthGrid();
  const vintDates = months.map(monthEnd);

  console.log("fetching unrevised series…");
  const [dgs10, dgs30, dfii10, dcoil, dexuseu, dexjpus, walcl, respp, jgb, dfedtar, dfedtaru, baa10y, icsa, hyOasAll] =
    await Promise.all([
      fredLatest("DGS10"), fredLatest("DGS30"), fredLatest("DFII10"),
      fredLatest("DCOILBRENTEU"), fredLatest("DEXUSEU"), fredLatest("DEXJPUS"),
      fredLatest("WALCL"), fredLatest("RESPPLLOPNWW"), fredLatest("IRLTLT01JPM156N"),
      fredLatest("DFEDTAR"), fredLatest("DFEDTARU"),
      fredLatest("BAA10Y").catch(() => []), // report overlay only, not a factor
      fredLatest("ICSA").catch(() => []),   // weekly claims (near-unrevised) → SC confirmation
      fredLatest("BAMLH0A0HYM2").catch(() => []), // PC leg; keyless download is license-capped to ~2023+
    ]);
  const [fedfunds, wti, ltgovt, cpiNsa, coreNsa] = await Promise.all([
    fredLatest("FEDFUNDS"),   // effective funds, monthly 1954→ (pre-DFEDTAR policy-path proxy)
    fredLatest("WTISPLC"),    // WTI monthly 1946→ (oil-momentum energy gate pre-Brent)
    fredLatest("LTGOVTBD"),   // long govt bond yield 1925–2000 (rMarg pre-DGS10)
    fredLatest("CPIAUCNS"),   // NSA CPI 1913→ — NEVER revised ⇒ point-in-time by construction
    fredLatest("CPILFENS"),   // NSA core CPI 1957→ — same property
  ]);
  // Policy-rate splice, date-disjoint: FEDFUNDS monthly → DFEDTAR daily → DFEDTARU daily.
  const funds = [
    ...fedfunds.filter(o => o.date < dfedtar[0].date),
    ...dfedtar, ...dfedtaru,
  ];
  const [fyoint, fyfr, fygfd, gdpa, debtGdpQ] = await Promise.all([
    fredLatest("FYOINT"), fredLatest("FYFR"), fredLatest("FYGFD"),
    fredLatest("GDPA"), fredLatest("GFDEGDQ188S"),
  ]);
  // long-rate splice for rMarg / S6 proxy before DGS10 (1962): LTGOVTBD 1925–2000
  const nominal10 = [...ltgovt.filter(o => o.date < dgs10[0].date), ...dgs10];

  console.log("fetching FiscalData + auctions + gold…");
  const [avgRate, mts, gold] = await Promise.all([fiscalAvgRateAll(), mtsAll(), yahooDailyMax("GC=F")]);
  const auctionYears = [];
  for (let y = 2003; y <= 2026; y++) auctionYears.push(tdAuctionsYear(y));
  const auctionsAll = (await Promise.all(auctionYears)).flat().sort((a, b) => a.date.localeCompare(b.date));

  console.log("fetching ALFRED vintages (batched)…");
  // Restrict each series' vintage requests to its ALFRED coverage era (probed):
  // CPI vintages ~1974→ (NSA fallback before), GDP 1992→ (GNP vintages before),
  // FGRECPT ~1990s→ (TAX leg excluded before), GNP needed only pre-1997.
  const [vPay, vUn, vCpiH, vCpiC, vGdp, vGnp, vRcpt] = await Promise.all([
    alfredVintages("PAYEMS", vintDates), alfredVintages("UNRATE", vintDates),
    alfredVintages("CPIAUCSL", vintDates.filter(d => d >= "1974-01-01")),
    alfredVintages("CPILFESL", vintDates.filter(d => d >= "1974-01-01")),
    alfredVintages("GDP", vintDates.filter(d => d >= "1992-01-01")),
    alfredVintages("GNP", vintDates.filter(d => d < "1997-01-01")),
    alfredVintages("FGRECPT", vintDates.filter(d => d >= "1985-01-01")),
  ]);

  const rows = [];
  for (const ym of months) {
    const t = monthEnd(ym);
    const problems = [];
    const excluded = new Set();

    /* ---- small cycle ---- */
    const payems = vPay[t] ?? [];
    const unrate = vUn[t] ?? [];
    let sc = null, nfp3mma = null, revisionsSum2m = 0, gap = 0;
    let claimsYoYPct = null;
    if (payems.length >= 4 && unrate.length >= 12) {
      const nfpChanges = payems.slice(1).map((o, i) => o.value - payems[i].value);
      nfp3mma = avg(nfpChanges.slice(-3));
      // Winsorized revisions, as known at t: per-month revision (value-at-t
      // minus first print) clamped to ±150k. Genuine print markdowns run
      // tens of k; annual benchmarks are ±300–900k level artifacts — the
      // clamp bounds their influence while keeping their sign. Mirrors
      // fredRevisions() in clients.ts.
      for (let k = 1; k <= 2 && k < payems.length; k++) {
        const obs = ago(payems, k);
        const firstVint = vPay[monthEnd(nextMonth(obs.date.slice(0, 7)))];
        const first = firstVint?.find(o => o.date === obs.date);
        if (first) revisionsSum2m += Math.max(-150, Math.min(150, obs.value - first.value));
      }
      const un3 = avg(unrate.slice(-3).map(o => o.value));
      const unMin12 = Math.min(...unrate.slice(-12).map(o => o.value));
      gap = sahmGap(un3, unMin12);
      // date-based Δ6m so the monthly-FEDFUNDS era and the daily-target era read the same
      const fNow = valueAt(funds, t), fThen = valueAt(funds, shiftDays(t, -183));
      const fundsDelta6m = fNow && fThen ? fNow.value - fThen.value : 0;
      const claimsT = asOf(icsa, t);
      if (claimsT.length >= 57) {
        const avg4 = end => claimsT.slice(end - 4, end).reduce((s, o) => s + o.value, 0) / 4;
        const yAgo = avg4(claimsT.length - 52);
        claimsYoYPct = yAgo === 0 ? null : round2(((avg4(claimsT.length) - yAgo) / yAgo) * 100);
      }
      sc = smallCyclePhase({ nfp3mma, revisionsSum2m, sahmGap: gap, fundsDelta6m, claimsYoYPct });
    } else { excluded.add("SC"); problems.push("SC: no ALFRED vintage yet"); }

    /* ---- valve (S8) ---- */
    // CPI: SA vintages where ALFRED has them (~1974→); before that the NSA
    // series — which is never revised, so truncation IS point-in-time.
    const cpiCut = shiftDays(t, -28); // month-m CPI publishes mid-m+1
    const cpiH = (vCpiH[t]?.length ?? 0) > 13 ? vCpiH[t] : asOf(cpiNsa, cpiCut);
    const cpiC = (vCpiC[t]?.length ?? 0) > 13 ? vCpiC[t] : asOf(coreNsa, cpiCut);
    if ((vCpiH[t]?.length ?? 0) <= 13 && cpiH.length) problems.push("S8: NSA CPI basis (pre-vintage era, unrevised ⇒ still PIT)");
    const brentT = asOf(dcoil, t);
    const headlineYoY = cpiH.length > 12 ? round2(yoy(cpiH, 12)) : null;
    const coreYoY = cpiC.length > 12 ? round2(yoy(cpiC, 12)) : null;
    const brent = brentT.length ? last(brentT).value : null;
    const oilT = asOf(brentT.length ? dcoil : wti, cpiCut);
    const oilYoYPct = oilT.length > 12 ? round2(yoyByDate(oilT) ?? NaN) : null;
    let valve = null;
    if (headlineYoY != null && coreYoY != null)
      valve = monetisationValve({ coreYoY, headlineYoY, brent: brent ?? NaN, oilYoYPct });
    else { excluded.add("S8"); problems.push("S8: CPI unavailable"); }

    /* ---- r vs g (S7) ---- */
    const fyCut = shiftDays(t, -32); // FY figures usable from ~Nov 1 after the Sep 30 FY end
    const rAvgT = avgRate.filter(o => o.date <= shiftDays(t, -20));
    let rAvg = rAvgT.length ? last(rAvgT).value : null;
    let rAvgBasis = rAvg != null ? "fiscaldata" : null;
    if (rAvg == null) {
      // pre-2001: effective rate = FY interest outlays / avg gross federal debt
      const oi = fyoint.filter(o => o.date <= fyCut), gd = fygfd.filter(o => o.date <= fyCut);
      if (oi.length && gd.length >= 2 && last(oi).date === last(gd).date) {
        // FYOINT in $mn, FYGFD in $bn (verified against raw cache)
        rAvg = round2((last(oi).value / 1000 / ((last(gd).value + ago(gd, 1).value) / 2)) * 100);
        rAvgBasis = "effective-annual (FYOINT/FYGFD)";
      }
    }
    const gdp = (vGdp[t]?.length ?? 0) > 4 ? vGdp[t] : (vGnp[t] ?? []);
    const gBasis = (vGdp[t]?.length ?? 0) > 4 ? "GDP" : "GNP";
    const dgs10T = asOf(dgs10, t);
    const rMarg = dgs10T.length ? last(dgs10T).value
      : (() => { const l = asOf(ltgovt, shiftDays(t, -15)); return l.length ? last(l).value : null; })();
    const gNominal = gdp.length > 4 ? round2(yoyByDate(gdp) ?? NaN) : null;
    const contractionFlag = sc != null && (sc.phase === "contraction" || sc.phase === "late-stall-breaking-down");
    // Debt stock for the Station-7 large-stock condition: quarterly series
    // (1966→, ~1q publication lag) with annual FYGFD/GDPA before that.
    // Final data — debt/GDP is essentially unrevised at this granularity.
    const dgq = debtGdpQ.filter(o => o.date <= shiftDays(t, -90));
    let debtToGdpPct = dgq.length ? last(dgq).value : null;
    if (debtToGdpPct == null) {
      const gd = fygfd.filter(o => o.date <= fyCut), gp = gdpa.filter(o => o.date.slice(0, 4) <= fyCut.slice(0, 4));
      if (gd.length && gp.length) debtToGdpPct = round2((last(gd).value / last(gp).value) * 100); // both $bn
    }
    let rvg = null;
    if (rAvg != null && rMarg != null && gNominal != null && Number.isFinite(gNominal))
      rvg = rVsG({ rAvg, rMarg, gNominal, rolloverShare12m: 0.30, contractionFlag, debtToGdpPct });
    else { excluded.add("S7"); problems.push(`S7: missing ${rAvg == null ? "rAvg " : ""}${gNominal == null || !Number.isFinite(gNominal) ? `${gBasis} vintage` : ""}`.trim()); }
    if (rvg && rAvgBasis !== "fiscaldata") problems.push(`S7: rAvg on ${rAvgBasis} basis`);

    /* ---- gold decomposition (SoV) ---- */
    const gcT = asOf(gold, t), eurT = asOf(dexuseu, t), jpyT = asOf(dexjpus, t), realT = asOf(dfii10, t);
    let goldF = null;
    const w = Math.min(20, gcT.length - 1, eurT.length - 1, jpyT.length - 1);
    if (w >= 20) {
      const dXau = pctChange(last(gcT).value, ago(gcT, w).value) ?? 0;
      const dXauEur = pctChange(last(gcT).value / last(eurT).value, ago(gcT, w).value / ago(eurT, w).value) ?? 0;
      const dXauJpy = pctChange(last(gcT).value * last(jpyT).value, ago(gcT, w).value * ago(jpyT, w).value) ?? 0;
      const dRealBp = realT.length > w ? (last(realT).value - ago(realT, w).value) * 100 : 0;
      if (realT.length <= w) problems.push("SoV: no TIPS yield yet (DFII10 starts 2003) — divergence check off");
      goldF = goldDecomposition({ dXauUsdPct: dXau, dXauEurPct: dXauEur, dXauJpyPct: dXauJpy, dRealYieldBp: dRealBp });
    } else { excluded.add("SoV"); problems.push("SoV: gold history starts 2000-09"); }

    /* ---- demand leg (S5) ---- */
    const aucWindow = auctionsAll.filter(a => a.date <= t && a.date > shiftDays(t, -380));
    const tensAvailable = aucWindow.some(a => a.term === "10-Year");
    let demand = null;
    if (tensAvailable) {
      const desc = [...aucWindow].sort((a, b) => b.date.localeCompare(a.date));
      demand = demandLeg({ auctions: desc.map(a => ({ term: a.term, btc: a.btc, dealerPct: a.dealerPct })) });
    } else { excluded.add("S5"); problems.push("S5: no 10Y auction records in window (TD data usable from 2003)"); }

    /* ---- deferred asset ---- */
    const resppT = asOf(respp, t);
    let deferred = null;
    if (resppT.length >= 14) {
      deferred = deferredAsset({
        levelBn: last(resppT).value / 1000,
        deltaBn13w: (last(resppT).value - ago(resppT, 13).value) / 1000,
      });
    } else { excluded.add("deferred"); problems.push("deferred: RESPPLLOPNWW starts 2002-12"); }

    /* ---- interest squeeze (S3) ---- */
    const mtsT = mts.filter(r => r.date <= shiftDays(t, -45));
    const mtsMonths = new Set(mtsT.filter(r => r.kind === "Net Interest").map(r => r.date));
    let squeeze = null, squeezeBasis = null, ttmInterestBn = null, ttmReceiptsBn = null;
    if (mtsMonths.size >= 12) {
      const sum12 = kind => mtsT.filter(r => r.kind === kind).sort((a, b) => b.date.localeCompare(a.date))
        .slice(0, 12).reduce((s, r) => s + r.value, 0) / 1e9;
      ttmInterestBn = sum12("Net Interest"); ttmReceiptsBn = sum12("Total Receipts");
      squeeze = interestSqueeze({ ttmInterestBn, ttmReceiptsBn });
      squeezeBasis = "MTS monthly";
    } else {
      // annual MTS-basis fallback: FY figures usable from Nov 1 after the Sep 30 FY end
      const cutoff = shiftDays(t, -32);
      const oi = fyoint.filter(o => o.date <= cutoff), fr = fyfr.filter(o => o.date <= cutoff);
      if (oi.length && fr.length && last(oi).date === last(fr).date) {
        ttmInterestBn = last(oi).value / 1000; ttmReceiptsBn = last(fr).value / 1000; // $mn → $bn
        squeeze = interestSqueeze({ ttmInterestBn, ttmReceiptsBn });
        squeezeBasis = `FY${last(oi).date.slice(0, 4)} annual`;
      } else { excluded.add("S3"); problems.push("S3: no fiscal-year data yet"); }
    }

    /* ---- revenue beta (TAX) ---- */
    let revBeta = null;
    const rcpt = vRcpt[t] ?? [];
    if (mtsMonths.size >= 13) {
      const rec = mtsT.filter(r => r.kind === "Total Receipts").sort((a, b) => b.date.localeCompare(a.date));
      const receiptsYoY = pctChange(rec[0].value, rec[12].value) ?? 0;
      revBeta = gNominal != null ? revenueBeta({ receiptsYoYPct: receiptsYoY, nominalGdpYoYPct: gNominal }) : null;
    } else if (rcpt.length > 4 && gNominal != null) {
      revBeta = revenueBeta({ receiptsYoYPct: yoy(rcpt, 4) ?? 0, nominalGdpYoYPct: gNominal });
    }
    if (!revBeta) { excluded.add("TAX"); problems.push("TAX: no receipts data"); }

    /* ---- Japan leg ---- */
    const jgbT = jgb.filter(o => o.date <= shiftDays(t, -45));
    const jpyDaily = asOf(dexjpus, t).slice(-25);
    let japan = null;
    if (jgbT.length >= 4 && jpyDaily.length >= 2) {
      japan = japanLeg({
        jgb10Delta3mBp: (last(jgbT).value - ago(jgbT, 3).value) * 100,
        usdJpyDelta3mPct: pctChange(last(jpyDaily).value, jpyDaily[0].value) ?? 0,
        japanHoldingsDelta2mBn: 0, // manual input in production; no PIT source
      });
    } else { excluded.add("JP"); problems.push("JP: JGB series unavailable"); }

    /* ---- price of money (S6) ---- */
    let s6 = null;
    if (realT.length > 250) {
      s6 = priceOfMoney({ realYieldDelta12mBp: (last(realT).value - ago(realT, 250).value) * 100 });
    } else {
      // pre-TIPS proxy: Δ12m(nominal 10Y) − Δ12m(headline y/y), both in bp —
      // catches the Volcker real-rate shock the same way DFII10 catches 2022.
      // CPI terms come from the NSA series (never revised ⇒ PIT, full history —
      // the 1974–94 ALFRED vintages carry only ~18 months of observations).
      const nsaT = asOf(cpiNsa, cpiCut);
      const nNow = valueAt(nominal10, t), nThen = valueAt(nominal10, shiftDays(t, -365));
      const hNow = nsaT.length > 12 ? yoy(nsaT, 12) : null;
      const hThen = nsaT.length > 24 ? pctChange(ago(nsaT, 12).value, ago(nsaT, 24).value) : null;
      if (nNow && nThen && hNow != null && hThen != null) {
        s6 = priceOfMoney({ realYieldDelta12mBp: (nNow.value - nThen.value) * 100 - (hNow - hThen) * 100 });
        problems.push("S6: real-yield proxy basis (nominal − CPI y/y) pre-TIPS");
      } else { excluded.add("S6"); problems.push("S6: no 12m yield history"); }
    }

    /* ---- private credit (PC) ---- */
    const hyT = asOf(hyOasAll, t);
    let pcF = null;
    if (hyT.length > 63) {
      pcF = privateCredit({
        hyOasBp: last(hyT).value * 100,
        hyOasDelta3mBp: (last(hyT).value - ago(hyT, 63).value) * 100,
      });
    } else { excluded.add("PC"); problems.push("PC: HY OAS unavailable (keyless download capped ~2023+)"); }

    /* ---- stage + triggers ---- */
    const walclT = asOf(walcl, t);
    const fedAssetsUp3w = walclT.length >= 4 && [1, 2, 3].every(i => ago(walclT, i - 1).value > ago(walclT, i).value);
    const stage = valve ? bigCycleStage({ fedAssetsUp3w, coreYoY, headlineYoY, valveScore: valve.score }) : null;

    // cut-day identification requires the explicit daily target (1982-09→);
    // monthly effective-funds averages cannot date a policy move
    const fundsT200 = asOf(funds, t).filter(o => o.date >= dfedtar[0].date).slice(-200);
    const dgs30T = asOf(dgs30, t);
    let easedAndLongEndSold = false;
    for (let i = 1; i < fundsT200.length; i++) {
      if (fundsT200[i].value < fundsT200[i - 1].value) {
        const j = dgs30T.findIndex(o => o.date === fundsT200[i].date);
        if (j > 0 && (dgs30T[j].value - dgs30T[j - 1].value) * 100 >= 8) { easedAndLongEndSold = true; break; }
      }
    }

    let triggers = [];
    if (rvg && squeeze && goldF && japan && demand) {
      triggers = evaluateTriggers({
        rvg, rAvg, gNominal, contractionFlag, fedAssetsUp3w, headlineYoY: headlineYoY ?? 0,
        squeeze, gold: goldF, japan, demand, easedAndLongEndSold, billsShareUp3m: null,
      });
    } else if (rvg && squeeze) {
      // partial evaluation with only the legs that exist (mirror production tolerance)
      triggers = evaluateTriggers({
        rvg, rAvg, gNominal, contractionFlag, fedAssetsUp3w, headlineYoY: headlineYoY ?? 0,
        squeeze,
        gold: goldF ?? { divergence: false },
        japan: japan ?? { hits: 0 },
        demand: demand ?? { status: STATUS.WATCH, lastBtc: null, lastDealerPct: null },
        easedAndLongEndSold, billsShareUp3m: null,
      });
    }

    /* ---- heat: composite + the cycle/sovereign split ----
     * Deep-history lesson: the sovereign legs ran genuinely hot through the
     * 1985–95 bull (S3 squeeze 18–21%, valve blocked by inflation) — sovereign
     * stress does NOT map to equity drawdowns in low-debt eras. So the panel
     * carries three readings: cycle heat (the market-facing legs), sovereign
     * heat (the debt-structure legs), and the composite (with T1 floor). */
    const legs = { SC: sc, S8: valve, S6: s6, PC: pcF, S7: rvg, SoV: goldF, S5: demand, deferred, S3: squeeze, TAX: revBeta, JP: japan };
    const pts = { [STATUS.OK]: 0, [STATUS.WATCH]: 0, [STATUS.ELEVATED]: 1, [STATUS.CRITICAL]: 2 };
    const subHeat = keys => {
      const avail = keys.map(k => legs[k]).filter(v => v != null);
      return avail.length ? round2((100 * avail.reduce((s, v) => s + (pts[v.status] ?? 0), 0)) / (2 * avail.length)) : null;
    };
    const heatCycle = subHeat(["SC", "S6", "PC", "SoV", "S5"]);
    const heatSov = subHeat(["S8", "S7", "S3", "TAX", "JP", "deferred"]);
    const availableLegs = Object.entries(legs).filter(([, v]) => v != null);
    const statusSum = availableLegs.reduce((s, [, v]) => s + (pts[v.status] ?? 0), 0);
    const factorHeat = availableLegs.length ? (100 * statusSum) / (2 * availableLegs.length) : null;
    const triggerHeat = triggers.reduce((s, tr) => s + 5 * (4 - tr.tier), 0);
    let heat = factorHeat == null ? null : round2(factorHeat + triggerHeat);
    // 2022 lesson: a lone Tier-1 trigger must not drown in the leg average —
    // any T1 floors the composite at 55.
    if (heat != null && triggers.some(tr => tr.tier === 1)) heat = Math.max(heat, 55);

    rows.push({
      t: ym, date: t, problems, legsAvailable: availableLegs.map(([k]) => k),
      inputs: {
        nfp3mma: nfp3mma == null ? null : Math.round(nfp3mma), revisionsSum2m: Math.round(revisionsSum2m), sahmGap: gap, claimsYoYPct,
        headlineYoY, coreYoY, brent: brent == null ? null : round2(brent),
        rAvg, rMarg, gNominal, ttmInterestBn: ttmInterestBn == null ? null : Math.round(ttmInterestBn),
        ttmReceiptsBn: ttmReceiptsBn == null ? null : Math.round(ttmReceiptsBn), squeezeBasis,
        fedAssetsUp3w, easedAndLongEndSold,
        baa10y: (() => { const b = asOf(baa10y, t); return b.length ? last(b).value : null; })(),
      },
      factors: Object.fromEntries(Object.entries(legs).map(([k, v]) => [k, v])),
      stage: stage?.stage ?? null,
      triggers, factorHeat: factorHeat == null ? null : round2(factorHeat), heat, heatCycle, heatSov,
    });
  }

  const outPath = path.join(HERE, "results.json");
  await writeFile(outPath, JSON.stringify(rows, null, 1));
  console.log(`replayed ${rows.length} months → ${outPath}`);
  return rows;
}
