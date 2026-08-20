/** Thin fetch clients. All return normalised { date, value } rows. */
import { redactUrl } from "./redact.mjs";

const FRED = "https://api.stlouisfed.org/fred";

async function j(url: string, init?: RequestInit) {
  const r = await fetch(url, { ...init, next: { revalidate: 0 } });
  if (!r.ok) throw new Error(`${r.status} ${redactUrl(url).slice(0, 160)}`);
  return r.json();
}

export interface Obs { date: string; value: number }

/* ---------------- FRED ---------------- */
export async function fred(seriesId: string, opts: { start?: string; limit?: number } = {}): Promise<Obs[]> {
  const key = process.env.FRED_API_KEY;
  if (!key) throw new Error("FRED_API_KEY missing");
  const p = new URLSearchParams({
    series_id: seriesId, api_key: key, file_type: "json",
    sort_order: "desc", limit: String(opts.limit ?? 400),
  });
  if (opts.start) p.set("observation_start", opts.start);
  const d = await j(`${FRED}/series/observations?${p}`);
  return (d.observations as any[])
    .filter(o => o.value !== ".")
    .map(o => ({ date: o.date, value: Number(o.value) }))
    .reverse();
}

/**
 * ALFRED vintages → revision tracking. For each of the last `periods`
 * observation dates, returns first-vintage vs latest-vintage values.
 * This is how the −103k May/Jun payroll revision becomes a signal
 * instead of a silent overwrite.
 *
 * Backtest lesson (benchmark months): annual benchmark revisions are
 * ±300–900k level artifacts, not fresh markdowns — genuine print
 * revisions run tens of k. `revision` is therefore winsorized to ±150k
 * per month (bounds benchmark influence, keeps its sign); `rawRevision`
 * keeps the unadjusted value for display.
 */
export async function fredRevisions(seriesId: string, periods = 4) {
  const key = process.env.FRED_API_KEY!;
  const p = new URLSearchParams({
    series_id: seriesId, api_key: key, file_type: "json",
    realtime_start: "2024-01-01", realtime_end: "9999-12-31",
    sort_order: "desc", limit: "300",
  });
  const d = await j(`${FRED}/series/observations?${p}`);
  const byDate = new Map<string, any[]>();
  for (const o of d.observations as any[]) {
    if (o.value === ".") continue;
    const arr = byDate.get(o.date) ?? [];
    arr.push(o);
    byDate.set(o.date, arr);
  }
  const dates = [...byDate.keys()].sort().slice(-periods);
  return dates.map(date => {
    const vs = byDate.get(date)!.sort((a, b) => a.realtime_start.localeCompare(b.realtime_start));
    const first = Number(vs[0].value), latest = Number(vs[vs.length - 1].value);
    const rawRevision = latest - first;
    return { date, first, latest, rawRevision, revision: Math.max(-150, Math.min(150, rawRevision)) };
  });
}

/** Initial claims (ICSA weekly): 4-week average now vs 52 weeks ago, y/y %. */
export async function claimsYoY(): Promise<number | null> {
  const obs = await fred("ICSA", { limit: 60 });
  if (obs.length < 57) return null;
  const avg4 = (end: number) => obs.slice(end - 4, end).reduce((s, o) => s + o.value, 0) / 4;
  const now = avg4(obs.length), yearAgo = avg4(obs.length - 52);
  return yearAgo === 0 ? null : Math.round(((now - yearAgo) / yearAgo) * 1000) / 10;
}

/** Discover the FRED TIC series id for a country (added to FRED Jun-2026). */
export async function fredSearchTic(country: string) {
  const key = process.env.FRED_API_KEY!;
  const p = new URLSearchParams({
    search_text: `TIC ${country} Treasury securities holdings`,
    api_key: key, file_type: "json", limit: "5",
  });
  const d = await j(`${FRED}/series/search?${p}`);
  return (d.seriess ?? []).map((s: any) => ({ id: s.id, title: s.title }));
}

/* ---------------- Treasury FiscalData (keyless) ---------------- */
const FISCAL = "https://api.fiscaldata.treasury.gov/services/api/fiscal_service";

export async function avgInterestRate(): Promise<Obs[]> {
  const u = `${FISCAL}/v2/accounting/od/avg_interest_rates?filter=security_desc:eq:Total%20Marketable&sort=-record_date&page[size]=24`;
  const d = await j(u);
  return (d.data as any[]).map(r => ({ date: r.record_date, value: Number(r.avg_interest_rate_amt) })).reverse();
}

export async function debtToPenny(): Promise<Obs[]> {
  const u = `${FISCAL}/v2/accounting/od/debt_to_penny?sort=-record_date&page[size]=400&fields=record_date,tot_pub_debt_out_amt`;
  const d = await j(u);
  return (d.data as any[]).map(r => ({ date: r.record_date, value: Number(r.tot_pub_debt_out_amt) })).reverse();
}

/**
 * MTS table 9: monthly receipts + net-interest outlays.
 * The dataset's taxonomy changed: "Total Receipts" is now a generic "Total"
 * row per section (src_line_nbr 12 = total receipts, 33 = total outlays),
 * and the amount lives in current_month_rcpt_outly_amt. Kind names are kept
 * as "Total Receipts"/"Net Interest" for everything downstream.
 */
export async function mtsInterestAndReceipts() {
  const u = `${FISCAL}/v1/accounting/mts/mts_table_9?filter=classification_desc:in:(Net%20Interest,Total)&sort=-record_date&page[size]=96`;
  const d = await j(u);
  const rows = (d.data as any[]).map(r => {
    const kind =
      r.classification_desc === "Net Interest" ? "Net Interest"
      : r.classification_desc === "Total" && String(r.src_line_nbr) === "12" ? "Total Receipts"
      : null;
    return {
      date: r.record_date as string,
      kind,
      value: Number(r.current_month_rcpt_outly_amt ?? r.current_month_gross_rcpt_amt ?? r.current_month_net_outly_amt ?? NaN),
    };
  });
  return rows.filter((r): r is { date: string; kind: string; value: number } => r.kind != null && Number.isFinite(r.value));
}

/* ---------------- TreasuryDirect auctions (keyless) ---------------- */
export async function recentAuctions() {
  const d = await j("https://www.treasurydirect.gov/TA_WS/securities/auctioned?format=json&days=380&type=Note");
  return (d as any[])
    .map(a => {
      const comp = Number(a.competitiveAccepted || 0);
      const dealer = Number(a.primaryDealerAccepted || 0);
      return {
        cusip: a.cusip,
        date: (a.auctionDate || "").slice(0, 10),
        term: a.securityTerm as string,
        highYield: a.highYield ? Number(a.highYield) : null,
        btc: a.bidToCoverRatio ? Number(a.bidToCoverRatio) : null,
        dealerPct: comp > 0 && dealer > 0 ? Math.round((dealer / comp) * 1000) / 10 : null,
      };
    })
    .filter(a => a.btc != null)
    .sort((x, y) => y.date.localeCompare(x.date));
}

/* ---------------- OANDA (live spot) ---------------- */
export async function oandaPrices(instruments: string[]) {
  const key = process.env.OANDA_API_KEY, acct = process.env.OANDA_ACCOUNT_ID;
  if (!key || !acct) throw new Error("OANDA credentials missing");
  const host = process.env.OANDA_ENV === "live" ? "api-fxtrade.oanda.com" : "api-fxpractice.oanda.com";
  const d = await j(`https://${host}/v3/accounts/${acct}/pricing?instruments=${instruments.join(",")}`,
    { headers: { Authorization: `Bearer ${key}` } });
  const out: Record<string, number> = {};
  for (const p of d.prices ?? []) {
    const bid = Number(p.bids?.[0]?.price), ask = Number(p.asks?.[0]?.price);
    if (Number.isFinite(bid) && Number.isFinite(ask)) out[p.instrument] = (bid + ask) / 2;
  }
  return out;
}

/** OANDA daily candles for windowed changes (e.g. 20d gold decomposition). */
export async function oandaCandles(instrument: string, count = 30) {
  const key = process.env.OANDA_API_KEY!;
  const host = process.env.OANDA_ENV === "live" ? "api-fxtrade.oanda.com" : "api-fxpractice.oanda.com";
  const d = await j(`https://${host}/v3/instruments/${instrument}/candles?granularity=D&count=${count}&price=M`,
    { headers: { Authorization: `Bearer ${key}` } });
  return (d.candles ?? []).filter((c: any) => c.complete)
    .map((c: any) => ({ date: c.time.slice(0, 10), value: Number(c.mid.c) }));
}

/* ---------------- Yahoo (AI-credit equity basket proxy) ---------------- */
/** `range` defaults to "1mo" (existing basket/BDC call sites); the spx fallback
 * passes "5y" so drawdown-window math (needs ≥100 rows) has enough history. */
export async function yahooCloses(symbol: string, range = "1mo") {
  const d = await j(`https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?range=${range}&interval=1d`);
  const r = d.chart?.result?.[0];
  const ts: number[] = r?.timestamp ?? [];
  const cl: number[] = r?.indicators?.quote?.[0]?.close ?? [];
  return ts.map((t, i) => ({ date: new Date(t * 1000).toISOString().slice(0, 10), value: cl[i] }))
    .filter(o => Number.isFinite(o.value));
}

/* Stooq removed: its CSV endpoint is permanently gated behind a JavaScript
 * proof-of-work anti-bot challenge, returning HTTP 200 with an HTML page
 * instead of CSV, so it never succeeded from here. SPX now comes from FRED
 * (live, 10y rolling — see assess.ts) and src/data/spx-monthly.json (the
 * vendored long tail — see scripts/backtest/century.mjs). */
