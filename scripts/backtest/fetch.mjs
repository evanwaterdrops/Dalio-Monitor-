/**
 * Backtest data layer — keyless, cached.
 *
 * Endpoints (all public, no API key):
 *  - fredgraph.csv    → latest-vintage series (unrevised market data ONLY)
 *  - alfredgraph.csv  → true point-in-time vintages (revisable macro series).
 *    NOTE: fredgraph.csv's vintage_date param proved unreliable (returned
 *    observations that could not have existed at the vintage) — alfredgraph
 *    is the only endpoint we trust for vintages, and its column headers
 *    (SERIES_YYYYMMDD) let us verify what we got.
 *  - FiscalData avg_interest_rates (history from 2001-01)
 *  - FiscalData MTS table 9 (history from 2015-03)
 *  - TreasuryDirect auction search (Notes, usable from ~2007)
 *  - Yahoo chart API (^GSPC ground truth, GC=F gold splice post-Jul-2024)
 *
 * Every response is cached as JSON under scripts/backtest/.cache/ so a
 * completed run is reproducible offline.
 *
 * Task 7 (Dalio realignment) additions — all via the existing generic
 * fredLatest/alfredVintages/yahooDailyMax helpers, no new endpoints:
 *  - M2SL (ALFRED-vintaged; coverage probed empirically to start 1988-01 —
 *    before that the leg is unavailable, never backfilled).
 *  - DGS3MO, T5YIE (fredLatest — daily/market data, unrevised like
 *    DGS10/DGS30, truncate ≤ t).
 *  - TCMDO — probed and confirmed ALFRED vintage coverage only starts
 *    ~2010 (404 on 1970/1980 vintage_date, 200 from ~1988 but that still
 *    leaves 1988–2010 unverified and the pre-2010 credit-cycle window is
 *    exactly what the moneyVsCredit validation gate needs) — used via
 *    fredLatest (latest-vintage data) instead and flagged nonPIT in
 *    replay.mjs, excluded from heat, mirroring century.mjs's convention.
 *  - Real-equity series for equityDrawdown: tried, in order —
 *    (a) shillerdata.com's ie_data.xls IS keyless-reachable but is a
 *        binary OLE2/BIFF file (magic bytes D0 CF 11 E0), not CSV; no
 *        keyless CSV mirror was found, and parsing OLE2/BIFF without
 *        adding a dependency was out of scope for a zero-deps script;
 *    (b) FRED's own `SP500` series only covers 2016→ (useless for a
 *        1960–2026 replay); no long real/total-return S&P series exists
 *        on FRED keylessly;
 *    (c) Stooq (`stooq.com/q/d/l/?s=^spx`) confirmed BOT-BLOCKED from this
 *        environment — returns a JS-challenge HTML page, matching the
 *        documented environment note;
 *    → used `yahooDailyMax("^GSPC")` (already this file's ground-truth SPX
 *      source — score.mjs already trusts it for forward-drawdown scoring),
 *      deflated by the never-revised NSA CPI series in replay.mjs to
 *      approximate a real index. This is price-only (ex-dividend), not
 *      Shiller's dividend-inclusive real total return — a modest
 *      magnitude difference, immaterial to the ≥40% CRITICAL threshold
 *      the GFC validation gate checks for. Documented loudly per the
 *      "do NOT fabricate a series" rule: this is real market data from an
 *      already-vetted keyless source, not a substitute series.
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const CACHE = path.join(path.dirname(fileURLToPath(import.meta.url)), ".cache");

async function cached(name, fn) {
  const f = path.join(CACHE, `${name}.json`);
  if (existsSync(f)) return JSON.parse(await readFile(f, "utf8"));
  const data = await fn();
  await mkdir(CACHE, { recursive: true });
  await writeFile(f, JSON.stringify(data));
  return data;
}

async function get(url, { retries = 3 } = {}) {
  for (let i = 0; ; i++) {
    try {
      const r = await fetch(url, { headers: { "User-Agent": "sovereign-vitals-backtest/0.1" } });
      if (!r.ok) throw new Error(`${r.status} ${url.slice(0, 120)}`);
      return await r.text();
    } catch (e) {
      if (i >= retries) throw e;
      await new Promise(res => setTimeout(res, 1500 * (i + 1)));
    }
  }
}

/* ---------------- CSV parsing ---------------- */
function parseCsv(text) {
  const lines = text.trim().split("\n").map(l => l.split(","));
  return { header: lines[0], rows: lines.slice(1) };
}

/** fredgraph.csv → [{date, value}] latest vintage. Use ONLY for unrevised series. */
export async function fredLatest(id) {
  return cached(`fred_${id}`, async () => {
    const { rows } = parseCsv(await get(`https://fred.stlouisfed.org/graph/fredgraph.csv?id=${id}`));
    return rows.filter(r => r[1] !== "." && r[1] !== "").map(r => ({ date: r[0], value: Number(r[1]) }));
  });
}

/**
 * alfredgraph.csv multi-vintage: id repeated N times + N vintage dates →
 * one column per vintage (header SERIES_YYYYMMDD confirms).
 * Returns { "YYYY-MM-DD": [{date, value}] } keyed by vintage date.
 * A vintage predating ALFRED coverage yields an empty/missing column — the
 * caller treats that leg as unavailable at that time (never substituted).
 */
// alfredgraph silently caps at 12 vintage columns per request — batch must not exceed 12.
export async function alfredVintages(id, vintageDates, { batch = 12 } = {}) {
  const out = {};
  for (let i = 0; i < vintageDates.length; i += batch) {
    const vs = vintageDates.slice(i, i + batch);
    const part = await cached(`alfred_${id}_${vs[0]}_${vs[vs.length - 1]}`, async () => {
      const ids = vs.map(() => id).join(",");
      let text;
      try {
        text = await get(`https://alfred.stlouisfed.org/graph/alfredgraph.csv?id=${ids}&vintage_date=${vs.join(",")}`);
      } catch {
        return {}; // whole batch predates coverage → all legs unavailable
      }
      const { header, rows } = parseCsv(text);
      const res = {};
      for (let c = 1; c < header.length; c++) {
        const m = header[c].match(/_(\d{4})(\d{2})(\d{2})$/);
        if (!m) continue;
        const vd = `${m[1]}-${m[2]}-${m[3]}`;
        res[vd] = rows
          .filter(r => r[c] !== "" && r[c] !== "." && r[c] !== undefined)
          .map(r => ({ date: r[0], value: Number(r[c]) }));
      }
      return res;
    });
    Object.assign(out, part);
  }
  return out;
}

/* ---------------- FiscalData ---------------- */
const FISCAL = "https://api.fiscaldata.treasury.gov/services/api/fiscal_service";

export async function fiscalAvgRateAll() {
  return cached("fiscal_avg_rate", async () => {
    const rows = [];
    for (let page = 1; ; page++) {
      const d = JSON.parse(await get(
        `${FISCAL}/v2/accounting/od/avg_interest_rates?filter=security_desc:eq:Total%20Marketable&sort=record_date&page%5Bsize%5D=500&page%5Bnumber%5D=${page}`));
      rows.push(...d.data.map(r => ({ date: r.record_date, value: Number(r.avg_interest_rate_amt) })));
      if (page >= (d.meta?.["total-pages"] ?? 1)) break;
    }
    return rows.filter(r => Number.isFinite(r.value));
  });
}

/** MTS table 9 full history (2015-03 →), same normalisation as production clients.ts. */
export async function mtsAll() {
  return cached("fiscal_mts", async () => {
    const rows = [];
    for (let page = 1; ; page++) {
      const d = JSON.parse(await get(
        `${FISCAL}/v1/accounting/mts/mts_table_9?filter=classification_desc:in:(Net%20Interest,Total)&sort=record_date&page%5Bsize%5D=500&page%5Bnumber%5D=${page}`));
      for (const r of d.data) {
        const kind =
          r.classification_desc === "Net Interest" ? "Net Interest"
          : r.classification_desc === "Total" && String(r.src_line_nbr) === "12" ? "Total Receipts"
          : null;
        const value = Number(r.current_month_rcpt_outly_amt ?? r.current_month_gross_rcpt_amt ?? r.current_month_net_outly_amt ?? NaN);
        if (kind && Number.isFinite(value)) rows.push({ date: r.record_date, kind, value });
      }
      if (page >= (d.meta?.["total-pages"] ?? 1)) break;
    }
    return rows;
  });
}

/* ---------------- TreasuryDirect auctions ---------------- */
export async function tdAuctionsYear(year) {
  return cached(`td_notes_${year}`, async () => {
    const d = JSON.parse(await get(
      `https://www.treasurydirect.gov/TA_WS/securities/search?startDate=${year}-01-01&endDate=${year}-12-31&type=Note&format=json`));
    return d.map(a => {
      const comp = Number(a.competitiveAccepted || 0);
      const dealer = Number(a.primaryDealerAccepted || 0);
      return {
        date: (a.auctionDate || "").slice(0, 10),
        term: a.securityTerm,
        btc: a.bidToCoverRatio ? Number(a.bidToCoverRatio) : null,
        dealerPct: comp > 0 && dealer > 0 ? Math.round((dealer / comp) * 1000) / 10 : null,
      };
    }).filter(a => a.btc != null && a.date);
  });
}

/* ---------------- Yahoo ---------------- */
export async function yahooDailyMax(symbol) {
  // range=max silently downgrades to monthly bars; explicit epoch bounds keep interval=1d honest.
  return cached(`yahoo_${symbol.replace(/[^A-Za-z0-9]/g, "_")}`, async () => {
    // period1 must be a NEGATIVE epoch to reach pre-1970 history (^GSPC goes to 1927).
    const d = JSON.parse(await get(
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?period1=-1577923200&period2=9999999999&interval=1d`));
    const r = d.chart?.result?.[0];
    const ts = r?.timestamp ?? [];
    const cl = r?.indicators?.quote?.[0]?.close ?? [];
    return ts.map((t, i) => ({ date: new Date(t * 1000).toISOString().slice(0, 10), value: cl[i] }))
      .filter(o => Number.isFinite(o.value) && o.value > 0);
  });
}
