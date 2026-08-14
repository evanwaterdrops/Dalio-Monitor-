/**
 * SERIES REGISTRY — the intellectual core of the monitor.
 *
 * Each entry maps a raw observable to the Dalio-framework factor(s) it
 * updates, with the reasoning from the Aug-2026 analysis embedded so the
 * "why" travels with the "what". When a print lands, the refresh job pulls
 * these, recomputes the factor states in framework/assess.ts, diffs against
 * the prior state in Supabase, and files alerts.
 *
 * Stations refer to the eight-station mechanism loop:
 *  S1 primary impulse (structural deficit)   S5 supply/demand test
 *  S2 ratchet (debt vs income)               S6 price of money
 *  S3 compounding leg (interest)             S7 r vs g hinge
 *  S4 self-referential borrowing             S8 monetisation valve
 * Plus cross-cutting legs added in v2: TAX (revenue quality),
 * PC (private-credit / AI circularity), JP (Japan repatriation),
 * SoV (store-of-value flight), SC (small cycle).
 */

export type Source = "fred" | "fred_vintage" | "fiscaldata" | "treasurydirect" | "oanda" | "yahoo" | "manual";

export interface SeriesDef {
  key: string;
  source: Source;
  id: string;            // provider series id / endpoint / instrument
  cadence: "daily" | "weekly" | "monthly" | "quarterly";
  factors: string[];     // which framework factors this feeds
  note: string;          // the connective analysis
}

export const SERIES: SeriesDef[] = [
  // ---------- Small cycle (SC) ----------
  { key: "payrolls", source: "fred_vintage", id: "PAYEMS", cadence: "monthly", factors: ["SC", "TAX", "S7"],
    note: "NFP level; vintage diffs give revisions. Jul-26: −23k vs +83k consensus, May+Jun revised −103k, 12m avg 34k → small-cycle 'stall breaking downward'. Also feeds S7: a contraction knocks ~3pp off nominal g, converting the r>g crossing from projection to event." },
  { key: "unrate", source: "fred", id: "UNRATE", cadence: "monthly", factors: ["SC"],
    note: "Use 3mma vs 12m low (Sahm gap). Jul-26 fell to 4.1% ONLY because the labour force shrank 264k — never read the level alone." },
  { key: "participation", source: "fred", id: "CIVPART", cadence: "monthly", factors: ["SC"],
    note: "61.4% = lowest since 1976 ex-Covid. Shrinking denominator flatters UNRATE." },

  // ---------- Inflation / valve (S8) ----------
  { key: "cpi_headline", source: "fred", id: "CPIAUCSL", cadence: "monthly", factors: ["S8"],
    note: "Jul-26 3.4% y/y. Headline−core wedge is the energy share of the problem." },
  { key: "cpi_core", source: "fred", id: "CPILFESL", cadence: "monthly", factors: ["S8"],
    note: "Jul-26 2.5% y/y — the block on monetisation is the WAR, not a wage-price spiral. If Brent<80 & headline<3, valve reopens within a quarter." },
  { key: "brent", source: "oanda", id: "BCO_USD", cadence: "daily", factors: ["S8"],
    note: "Live energy gate. Hormuz reopening → Brent<80 → headline collapses toward core." },

  // ---------- Cost of money (S6, S7) ----------
  { key: "dgs10", source: "fred", id: "DGS10", cadence: "daily", factors: ["S6", "S7"],
    note: "Marginal cost of debt. 4.68% ≈ nominal g → every roll drags the average up." },
  { key: "dgs30", source: "fred", id: "DGS30", cadence: "daily", factors: ["S6"],
    note: "Long-end-selloff-on-easing detector input (T2 trigger)." },
  { key: "dgs2", source: "fred", id: "DGS2", cadence: "daily", factors: ["SC"],
    note: "DGS2 − funds midpoint = market-implied path direction (free proxy for cut/hike pricing)." },
  { key: "funds_upper", source: "fred", id: "DFEDTARU", cadence: "daily", factors: ["SC", "S8"],
    note: "3.75% upper. A DOWN move on a day DGS30 rises ≥8bp fires the T2 credit-repricing trigger." },
  { key: "term_premium", source: "fred", id: "THREEFYTP10", cadence: "daily", factors: ["S6"],
    note: "Supply pressure vs growth expectations decomposition." },
  { key: "real_10y", source: "fred", id: "DFII10", cadence: "daily", factors: ["SoV"],
    note: "Gold rising WITH real yields rising = credit flight, not a rate hedge (T3, already flashing)." },
  { key: "avg_interest_rate", source: "fiscaldata", id: "v2/accounting/od/avg_interest_rates", cadence: "monthly", factors: ["S7"],
    note: "rAvg on total marketable (~3.4%). THE hinge input. Filter security_desc='Total Marketable'." },

  // ---------- Stock & flow (S1–S4) ----------
  { key: "debt_to_penny", source: "fiscaldata", id: "v2/accounting/od/debt_to_penny", cadence: "daily", factors: ["S2", "S4"],
    note: "Daily total debt → growth vs nominal GDP (the ratchet: +6.4% vs ~4.7%)." },
  { key: "mts_receipts_outlays", source: "fiscaldata", id: "v1/accounting/mts/mts_table_9", cadence: "monthly", factors: ["S1", "S3", "TAX"],
    note: "Receipts + interest outlays by classification. TTM interest/receipts ≈19% → 20–25% = historic loss-of-discretion zone (T2). Receipts YoY vs GDP YoY = revenue beta: capex-led GDP that doesn't tax like payroll GDP (Iran-war supplementals land here too — $87.6bn FY26, deficit-financed)." },
  { key: "nominal_gdp", source: "fred", id: "GDP", cadence: "quarterly", factors: ["S2", "S7", "TAX"],
    note: "g. CAUTION per v2: ~74% of Q1-26 growth was AI capex (≈1.55pp of 2.1%) — capex-flow g, not higher potential g. Bridgewater's own J-curve view: productivity payoff deferred." },
  { key: "gross_debt_gdp", source: "fred", id: "GFDEGDQ188S", cadence: "quarterly", factors: ["S2"],
    note: "122.6% Q1-26, CBO path to 136% by 2036." },

  // ---------- Demand for the debt (S5, JP) ----------
  { key: "auctions_10y", source: "treasurydirect", id: "TA_WS/securities/auctioned?format=json&days=60", cadence: "weekly", factors: ["S5"],
    note: "bidToCoverRatio + primaryDealerAccepted/competitiveAccepted = dealer takedown. Aug-26 10Y cleared 4.683%, highest since GFC. T3: two weak 10Ys in a row." },
  { key: "foreign_total", source: "fred", id: "FDHBFIN", cadence: "quarterly", factors: ["S5"],
    note: "Foreign holdings level. Share fell to 31% ONLY because debt grew faster — level rose $8.9→9.5trn. Rate constraint, not buyers' strike (v2 counter-case)." },
  { key: "japan_tic", source: "fred", id: "TIC_JAPAN_DISCOVER", cadence: "monthly", factors: ["JP", "S5"],
    note: "FRED added TIC country holdings Jun-2026 — run scripts via fred/series/search?search_text=TIC+Japan+Treasury to pin the ID, else fallback scrape ticdata.treasury.gov slt_table5.html. T3 trigger is ABSOLUTE decline 2 consecutive months (~$1.2trn now). Pair with JGB 10Y (IRLTLT01JPM156N) + USD_JPY: all three = repatriation." },
  { key: "jgb_10y", source: "fred", id: "IRLTLT01JPM156N", cadence: "monthly", factors: ["JP"],
    note: "Rising JGB yields close the carry gap that keeps Japanese money in Treasuries." },

  // ---------- Monetary / Stage-5 (S8) ----------
  { key: "fed_assets", source: "fred", id: "WALCL", cadence: "weekly", factors: ["S8"],
    note: "3 consecutive weekly rises while headline>3 = Stage-6 tripwire (post-July restatement: headline gate, since core is 2.5)." },
  { key: "deferred_asset", source: "fred", id: "RESPPLLOPNWW", cadence: "weekly", factors: ["S8"],
    note: "THE Dalio Stage-5 metric, literal: Fed cumulative losses as negative liability. −$243.9bn Apr-2026. Deepening = Stage 5 worsening; healing toward zero = pressure easing." },

  // ---------- Store of value (SoV) ----------
  { key: "gold_usd", source: "oanda", id: "XAU_USD", cadence: "daily", factors: ["SoV"],
    note: "$4,354, +30.5% y/y at record highs DESPITE high real yields. Decompose vs EUR/JPY numeraires: up in all three = flight from sovereign credit generally, not a dollar trade." },
  { key: "eurusd", source: "oanda", id: "EUR_USD", cadence: "daily", factors: ["SoV"], note: "Numeraire for XAU/EUR = XAU_USD ÷ EUR_USD." },
  { key: "usdjpy", source: "oanda", id: "USD_JPY", cadence: "daily", factors: ["SoV", "JP"], note: "Numeraire for XAU/JPY = XAU_USD × USD_JPY; yen leg of Japan factor." },

  // ---------- Private credit / AI circularity (PC) ----------
  { key: "hy_oas", source: "fred", id: "BAMLH0A0HYM2", cadence: "daily", factors: ["PC"],
    note: "The private borrowing binge didn't skip stages 1–2 — it moved to AI infra, off-balance-sheet, into private credit (~$800bn circular deals; $570bn 2026 AI debt issuance; Moody's $662bn not-yet-commenced leases = 113% of on-BS debt). HY OAS is the best free daily proxy for that complex repricing." },
  { key: "bbb_oas", source: "fred", id: "BAMLC0A4CBBB", cadence: "daily", factors: ["PC"],
    note: "IG-edge stress; hyperscaler bond coverage fell ~5x→<2x Feb→Jul 2026." },
  { key: "ai_credit_basket", source: "yahoo", id: "ORCL,CRWV,NVDA,MSFT", cadence: "daily", factors: ["PC"],
    note: "Equity proxy for the circular-financing nexus (Oracle carries the $300bn OpenAI contract + $45-50bn 2026 raise; CoreWeave = GPU-collateralised leverage)." },
  { key: "hyperscaler_coverage", source: "manual", id: "manual:hyperscaler_bond_coverage", cadence: "monthly", factors: ["PC"],
    note: "No API exists. Curated input with source URL + 90-day staleness badge. Same for Moody's lease figure and OpenAI loss run-rate." },

  // ---------- Maturity wall (S7) ----------
  { key: "rollover_share", source: "manual", id: "manual:rollover_share_12m", cadence: "monthly", factors: ["S7"],
    note: "Share of marketable stock maturing ≤12m (MSPD-derived; ~30% default). Drives the r-avg drift rate. v2 backlog: automate from v1/debt/mspd tables." },
];

export const FACTOR_META: Record<string, { name: string; station: string }> = {
  SC:  { name: "Small-cycle phase", station: "Short-term cycle" },
  S1:  { name: "Structural deficit impulse", station: "Station 1" },
  S2:  { name: "Debt vs income ratchet", station: "Station 2" },
  S3:  { name: "Interest compounding", station: "Station 3" },
  S4:  { name: "Self-referential borrowing", station: "Station 4" },
  S5:  { name: "Demand for the debt", station: "Station 5" },
  S6:  { name: "Price of money", station: "Station 6" },
  S7:  { name: "r vs g hinge", station: "Station 7" },
  S8:  { name: "Monetisation valve", station: "Station 8" },
  TAX: { name: "Revenue quality (AI beta)", station: "Tax-base leg" },
  PC:  { name: "Private credit / circularity", station: "Private leg" },
  JP:  { name: "Japan repatriation", station: "Demand leg" },
  SoV: { name: "Store-of-value flight", station: "Exit leg" },
};
