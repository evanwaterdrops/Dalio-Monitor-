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
  layer: "fast" | "slow";  // fast = daily/weekly, vintage-replayable; slow = quarterly, revised (position layer)
  role: "trigger" | "context";
  retire: string;          // the observation that would remove this series
  trigger?: {
    form: "level" | "roc" | "percentile" | "composite";
    spec: string;          // exact rule with thresholds
    provenance: "published" | "dalio" | "self-calibrated";
  };
}

export const SERIES: SeriesDef[] = [
  // ---------- Small cycle (SC) ----------
  { key: "payrolls", source: "fred_vintage", id: "PAYEMS", cadence: "monthly", factors: ["SC", "TAX", "S7"],
    note: "NFP level; vintage diffs give revisions. Jul-26: −23k vs +83k consensus, May+Jun revised −103k, 12m avg 34k → small-cycle 'stall breaking downward'. Also feeds S7: a contraction knocks ~3pp off nominal g, converting the r>g crossing from projection to event.",
    layer: "fast", role: "trigger", retire: "BLS vintage archive breaks",
    trigger: { form: "composite", spec: "3mma<50 with Sahm≥0.5, or 3mma≤0, or 3mma<50 & revisions2m≤−75k", provenance: "published" } },
  { key: "unrate", source: "fred", id: "UNRATE", cadence: "monthly", factors: ["SC"],
    note: "Use 3mma vs 12m low (Sahm gap). Jul-26 fell to 4.1% ONLY because the labour force shrank 264k — never read the level alone.",
    layer: "fast", role: "trigger", retire: "superseded if claims-based rule outperforms in backtest",
    trigger: { form: "level", spec: "Sahm gap ≥0.5 (3mma vs 12m low)", provenance: "published" } },
  { key: "participation", source: "fred", id: "CIVPART", cadence: "monthly", factors: ["SC"],
    note: "61.4% = lowest since 1976 ex-Covid. Shrinking denominator flatters UNRATE.",
    layer: "fast", role: "context", retire: "UNRATE denominator distortion ends" },

  // ---------- Inflation / valve (S8) ----------
  { key: "cpi_headline", source: "fred", id: "CPIAUCSL", cadence: "monthly", factors: ["S8"],
    note: "Jul-26 3.4% y/y. Headline−core wedge is the energy share of the problem.",
    layer: "fast", role: "trigger", retire: "PCE adopted as sole gate",
    trigger: { form: "level", spec: "headline>3 gates valve at 0.7; wedge≥0.6+energy caps 0.55", provenance: "self-calibrated" } },
  { key: "cpi_core", source: "fred", id: "CPILFESL", cadence: "monthly", factors: ["S8"],
    note: "Jul-26 2.5% y/y — the block on monetisation is the WAR, not a wage-price spiral. If Brent<80 & headline<3, valve reopens within a quarter.",
    layer: "fast", role: "trigger", retire: "PCE adopted as sole gate",
    trigger: { form: "level", spec: "core≥3 blocks valve at 0.25; core-to-2% sets score", provenance: "dalio" } },
  { key: "brent", source: "oanda", id: "BCO_USD", cadence: "daily", factors: ["S8"],
    note: "Live energy gate. Hormuz reopening → Brent<80 → headline collapses toward core.",
    layer: "fast", role: "trigger", retire: "war premium resolves and stays resolved 12m",
    trigger: { form: "level", spec: "Brent≥85 or oil y/y≥+40% = energy gate", provenance: "self-calibrated" } },

  // ---------- Cost of money (S6, S7) ----------
  { key: "dgs10", source: "fred", id: "DGS10", cadence: "daily", factors: ["S6", "S7"],
    note: "Marginal cost of debt. 4.68% ≈ nominal g → every roll drags the average up.",
    layer: "fast", role: "trigger", retire: "never — the marginal cost of debt",
    trigger: { form: "roc", spec: "feeds r-vs-g drift and curve decomposition", provenance: "dalio" } },
  { key: "dgs30", source: "fred", id: "DGS30", cadence: "daily", factors: ["S6"],
    note: "Long-end-selloff-on-easing detector input (T2 trigger).",
    layer: "fast", role: "trigger", retire: "T2 superseded by bear-steepening regime trigger",
    trigger: { form: "roc", spec: "+≥8bp on a cut day = T2 long-end-selloff", provenance: "self-calibrated" } },
  { key: "dgs2", source: "fred", id: "DGS2", cadence: "daily", factors: ["SC"],
    note: "DGS2 − funds midpoint = market-implied path direction (free proxy for cut/hike pricing).",
    layer: "fast", role: "context", retire: "3M series replaces path proxy" },
  { key: "funds_upper", source: "fred", id: "DFEDTARU", cadence: "daily", factors: ["SC", "S8"],
    note: "3.75% upper. A DOWN move on a day DGS30 rises ≥8bp fires the T2 credit-repricing trigger.",
    layer: "fast", role: "trigger", retire: "T2 superseded by bear-steepening regime trigger",
    trigger: { form: "composite", spec: "cut day + DGS30 rule above", provenance: "self-calibrated" } },
  { key: "term_premium", source: "fred", id: "THREEFYTP10", cadence: "daily", factors: ["S6"],
    note: "Supply pressure vs growth expectations decomposition.",
    layer: "fast", role: "trigger", retire: "ACM model discontinued",
    trigger: { form: "roc", spec: "ΔTP input to steepening decomposition", provenance: "self-calibrated" } },
  { key: "real_10y", source: "fred", id: "DFII10", cadence: "daily", factors: ["SoV"],
    note: "Gold rising WITH real yields rising = credit flight, not a rate hedge (T3, already flashing).",
    layer: "fast", role: "trigger", retire: "TIPS liquidity distortions dominate signal",
    trigger: { form: "roc", spec: "+75/150/250bp per 12m = watch/elevated/critical; gold divergence T3", provenance: "self-calibrated" } },
  { key: "avg_interest_rate", source: "fiscaldata", id: "v2/accounting/od/avg_interest_rates", cadence: "monthly", factors: ["S7"],
    note: "rAvg on total marketable (~3.4%). THE hinge input. Filter security_desc='Total Marketable'.",
    layer: "fast", role: "trigger", retire: "never",
    trigger: { form: "level", spec: "rAvg vs g crossing; drift=(10Y−rAvg)×rollover", provenance: "dalio" } },

  // ---------- Stock & flow (S1–S4) ----------
  { key: "debt_to_penny", source: "fiscaldata", id: "v2/accounting/od/debt_to_penny", cadence: "daily", factors: ["S2", "S4"],
    note: "Daily total debt → growth vs nominal GDP (the ratchet: +6.4% vs ~4.7%).",
    layer: "fast", role: "trigger", retire: "never",
    trigger: { form: "roc", spec: "debt growth vs nominal GDP growth", provenance: "dalio" } },
  { key: "mts_receipts_outlays", source: "fiscaldata", id: "v1/accounting/mts/mts_table_9", cadence: "monthly", factors: ["S1", "S3", "TAX"],
    note: "Receipts + interest outlays by classification. TTM interest/receipts ≈19% → 20–25% = historic loss-of-discretion zone (T2). Receipts YoY vs GDP YoY = revenue beta: capex-led GDP that doesn't tax like payroll GDP (Iran-war supplementals land here too — $87.6bn FY26, deficit-financed).",
    layer: "fast", role: "trigger", retire: "never",
    trigger: { form: "level", spec: "TTM interest/receipts ≥20% critical, ≥17% elevated", provenance: "dalio" } },
  { key: "nominal_gdp", source: "fred", id: "GDP", cadence: "quarterly", factors: ["S2", "S7", "TAX"],
    note: "g. CAUTION per v2: ~74% of Q1-26 growth was AI capex (≈1.55pp of 2.1%) — capex-flow g, not higher potential g. Bridgewater's own J-curve view: productivity payoff deferred.",
    layer: "fast", role: "trigger", retire: "never",
    trigger: { form: "roc", spec: "g in the hinge; −3pp recession haircut", provenance: "self-calibrated" } },
  { key: "gross_debt_gdp", source: "fred", id: "GFDEGDQ188S", cadence: "quarterly", factors: ["S2"],
    note: "122.6% Q1-26, CBO path to 136% by 2036.",
    layer: "slow", role: "context", retire: "TCMDO total-economy view replaces headline use" },

  // ---------- Demand for the debt (S5, JP) ----------
  { key: "auctions_10y", source: "treasurydirect", id: "TA_WS/securities/auctioned?format=json&days=60", cadence: "weekly", factors: ["S5"],
    note: "bidToCoverRatio + primaryDealerAccepted/competitiveAccepted = dealer takedown. Aug-26 10Y cleared 4.683%, highest since GFC. T3: two weak 10Ys in a row.",
    layer: "fast", role: "trigger", retire: "auction WI/tail data becomes free",
    trigger: { form: "composite", spec: "2×10Y: BTC<2.4 AND dealer>18% = critical", provenance: "self-calibrated" } },
  { key: "foreign_total", source: "fred", id: "FDHBFIN", cadence: "quarterly", factors: ["S5"],
    note: "Foreign holdings level. Share fell to 31% ONLY because debt grew faster — level rose $8.9→9.5trn. Rate constraint, not buyers' strike (v2 counter-case).",
    layer: "slow", role: "context", retire: "weekly H.4.1 custody proxy adopted" },
  { key: "japan_tic", source: "fred", id: "TIC_JAPAN_DISCOVER", cadence: "monthly", factors: ["JP", "S5"],
    note: "FRED added TIC country holdings Jun-2026 — run scripts via fred/series/search?search_text=TIC+Japan+Treasury to pin the ID, else fallback scrape ticdata.treasury.gov slt_table5.html. T3 trigger is ABSOLUTE decline 2 consecutive months (~$1.2trn now). Pair with JGB 10Y (IRLTLT01JPM156N) + USD_JPY: all three = repatriation.",
    layer: "fast", role: "trigger", retire: "TIC lag makes custody proxy strictly better",
    trigger: { form: "composite", spec: "2m absolute decline + JGB +15bp/3m + yen −2%/3m: 3 hits critical", provenance: "self-calibrated" } },
  { key: "jgb_10y", source: "fred", id: "IRLTLT01JPM156N", cadence: "monthly", factors: ["JP"],
    note: "Rising JGB yields close the carry gap that keeps Japanese money in Treasuries. Feeds japan_tic's composite trigger (JGB +15bp/3m leg) rather than firing on its own.",
    layer: "fast", role: "context", retire: "TIC lag makes custody proxy strictly better" },

  // ---------- Monetary / Stage-5 (S8) ----------
  { key: "fed_assets", source: "fred", id: "WALCL", cadence: "weekly", factors: ["S8"],
    note: "3 consecutive weekly rises while headline>3 = Stage-6 tripwire (post-July restatement: headline gate, since core is 2.5).",
    layer: "fast", role: "trigger", retire: "never",
    trigger: { form: "composite", spec: "up 3wks AND hot AND printMode=monetization (Task 3 discriminator)", provenance: "dalio" } },
  { key: "deferred_asset", source: "fred", id: "RESPPLLOPNWW", cadence: "weekly", factors: ["S8"],
    note: "THE Dalio Stage-5 metric, literal: Fed cumulative losses as negative liability. −$243.9bn Apr-2026. Deepening = Stage 5 worsening; healing toward zero = pressure easing.",
    layer: "fast", role: "trigger", retire: "Fed remits again (level ≥ 0)",
    trigger: { form: "level", spec: "≤−200bn critical; direction by 13w delta", provenance: "dalio" } },

  // ---------- Store of value (SoV) ----------
  { key: "gold_usd", source: "oanda", id: "XAU_USD", cadence: "daily", factors: ["SoV"],
    note: "$4,354, +30.5% y/y at record highs DESPITE high real yields. Decompose vs EUR/JPY numeraires: up in all three = flight from sovereign credit generally, not a dollar trade.",
    layer: "fast", role: "trigger", retire: "never",
    trigger: { form: "composite", spec: "up>2% in all three numeraires = credit flight; + real yields up = T3", provenance: "dalio" } },
  { key: "eurusd", source: "oanda", id: "EUR_USD", cadence: "daily", factors: ["SoV"], note: "Numeraire for XAU/EUR = XAU_USD ÷ EUR_USD — numeraire input to the gold composite.",
    layer: "fast", role: "context", retire: "never" },
  { key: "usdjpy", source: "oanda", id: "USD_JPY", cadence: "daily", factors: ["SoV", "JP"], note: "Numeraire for XAU/JPY = XAU_USD × USD_JPY; yen leg of Japan factor — numeraire input to the gold composite.",
    layer: "fast", role: "context", retire: "never" },

  // ---------- Private credit / AI circularity (PC) ----------
  { key: "hy_oas", source: "fred", id: "BAMLH0A0HYM2", cadence: "daily", factors: ["PC"],
    note: "The private borrowing binge didn't skip stages 1–2 — it moved to AI infra, off-balance-sheet, into private credit (~$800bn circular deals; $570bn 2026 AI debt issuance; Moody's $662bn not-yet-commenced leases = 113% of on-BS debt). HY OAS is the best free daily proxy for that complex repricing.",
    layer: "fast", role: "trigger", retire: "reassigned: public-HY repricing only; BDC P/NAV owns private-credit (Task 3)",
    trigger: { form: "composite", spec: "≥500 & widening critical; ≥400 or +75/3m elevated; +40/3m watch", provenance: "self-calibrated" } },
  { key: "bbb_oas", source: "fred", id: "BAMLC0A4CBBB", cadence: "daily", factors: ["PC"],
    note: "IG-edge stress; hyperscaler bond coverage fell ~5x→<2x Feb→Jul 2026.",
    layer: "fast", role: "context", retire: "fallen-angel boundary stops being the IG cliff" },
  { key: "ai_credit_basket", source: "yahoo", id: "ORCL,CRWV,NVDA,MSFT", cadence: "daily", factors: ["PC"],
    note: "Equity proxy for the circular-financing nexus (Oracle carries the $300bn OpenAI contract + $45-50bn 2026 raise; CoreWeave = GPU-collateralised leverage).",
    layer: "fast", role: "context", retire: "Evan's PC leg restructured" },
  { key: "hyperscaler_coverage", source: "manual", id: "manual:hyperscaler_bond_coverage", cadence: "monthly", factors: ["PC"],
    note: "No API exists. Curated input with source URL + 90-day staleness badge. Same for Moody's lease figure and OpenAI loss run-rate.",
    layer: "slow", role: "context", retire: "an API appears" },

  // ---------- Maturity wall (S7) ----------
  { key: "rollover_share", source: "manual", id: "manual:rollover_share_12m", cadence: "monthly", factors: ["S7"],
    note: "Share of marketable stock maturing ≤12m (MSPD-derived; ~30% default). Drives the r-avg drift rate. v2 backlog: automate from v1/debt/mspd tables.",
    layer: "fast", role: "trigger", retire: "automated from MSPD (roadmap)",
    trigger: { form: "level", spec: "multiplies drift rate in r-vs-g", provenance: "dalio" } },

  // ---------- Money vs credit (S8 signature) ----------
  { key: "m2", source: "fred", id: "M2SL", cadence: "monthly", factors: ["S8"],
    layer: "fast", role: "trigger",
    trigger: { form: "composite", spec: "with total_debt: money y/y ≥8% while credit y/y < money−5pp = watch; money ≥10% & credit ≤0 = critical", provenance: "self-calibrated" },
    retire: "M2 redefinition breaks continuity again",
    note: "Dalio's monetization signature needs a money aggregate next to TCMDO: 'money growing at an extremely fast rate at the same time as credit… contracting' (P1:1506). Feeds moneyVsCredit (Task 3)." },
  { key: "monetary_base", source: "fred", id: "BOGMBASE", cadence: "monthly", factors: ["S8"],
    layer: "fast", role: "context",
    retire: "proves redundant next to WALCL",
    note: "M0 companion to m2 — his 'Money %PGDP' charts may plot M0 rather than M2; the source images from the extraction are lost, so both are carried until one proves redundant." },
  { key: "total_debt", source: "fred", id: "TCMDO", cadence: "quarterly", factors: ["S2", "S8"],
    layer: "slow", role: "context",
    retire: "BIS credit gap goes free & timely",
    note: "The blue line, all-sectors debt ÷ GDP. Stays slow/context: ALFRED's earliest TCMDO vintage is ~2011-01 (checked 1999→2019 in steps; nothing before 2011), so vintage coverage does NOT reach 1999 and the spec's promote-to-trigger condition fails. The backtest's credit input in moneyVsCredit therefore uses latest-vintage data flagged nonPIT (Task 7), excluded from heat exactly like the century panel." },

  // ---------- Household leverage & wealth position (S2, S3, S8) ----------
  { key: "hh_debt_networth", source: "fred", id: "CMDEBT,TNWBSHNO", cadence: "quarterly", factors: ["S2"],
    layer: "slow", role: "context",
    retire: "no retirement condition specified — persistent household-leverage cross-check",
    note: "Household debt (CMDEBT) ÷ household net worth (TNWBSHNO): 'debt-to-net-worth ratios go up' (P1:1076). Two FRED ids, one derived ratio entry." },
  { key: "dsr_household", source: "fred", id: "TDSP", cadence: "quarterly", factors: ["S3"],
    layer: "slow", role: "context",
    retire: "BIS total DSR becomes timely",
    note: "The red line, household leg — Fed's own debt-service-ratio series, quarterly, revised." },
  { key: "dsr_pnf", source: "fred", id: "PIN_PENDING:BIS-DSR-private-nonfinancial-US", cadence: "quarterly", factors: ["S3"],
    layer: "slow", role: "context",
    retire: "BIS total DSR becomes timely",
    note: "The red line, private-nonfinancial leg (BIS DSR series for the US). UNRESOLVED: none of the brief's candidates (BDSRAMRIXOQ, DSRPUS) resolve on FRED — both 404; QUSPAM770A resolves but is 'Total Credit to Private Non-Financial Sector, Adjusted for Breaks' (a BIS credit-gap series, not a debt-service ratio) so it was rejected rather than mis-pinned. A dozen further keyless guesses (BISDSRPNFUS, DSRPRIVATEUS, DSRUS, DSRUSQ, TDSPNFUS, PNFDSRUSQ, BISDSR, USDSRPNF, DSERPUS, BISPNFUS, DEBTSERVUS) also 404. FRED's search/tags endpoints are unreachable from this environment (connection resets), so a keyed series/search run is required to actually pin this — flagged for Task 7 or a follow-up keyed run of scripts/pin-series.mjs." },
  { key: "wealth_shares", source: "fred", id: "WFRBSTP1300,WFRBSB50215,WFRBSN40188", cadence: "quarterly", factors: ["S8"],
    layer: "slow", role: "context",
    retire: "DFA discontinued",
    note: "Wealth-gap position input for positionClock (top0.1/bottom90 wealth ratio, P1:1426): top 0.1% share (WFRBSTP1300, verified title match) over bottom 90% share, itself composed as bottom 50% (WFRBSB50215) + 50th–90th percentile (WFRBSN40188) — no single 'bottom 90%' FRED id exists, titles confirmed via /series/<id> page fetch." },

  // ---------- Inflation expectations & short rate (S8, S6, SC) ----------
  { key: "core_pce", source: "fred", id: "PCEPILFE", cadence: "monthly", factors: ["S8"],
    layer: "fast", role: "context",
    retire: "no retirement condition specified",
    note: "Confirms the CPI gate against the Fed's own target measure (PCE core vs cpi_core)." },
  { key: "t5yie", source: "fred", id: "T5YIE", cadence: "daily", factors: ["S8"],
    layer: "fast", role: "trigger",
    trigger: { form: "level", spec: "valve co-key: ≥2.8% caps monetisationValve score at 0.5 ('gated-by-expectations')", provenance: "self-calibrated" },
    retire: "no retirement condition specified",
    note: "Expected-inflation leg of the two-key valve (realized CPI/PCE + expected breakevens). Series starts 2003 — backtest pre-2003 runs realized-only, documented rather than backfilled." },
  { key: "dgs3mo", source: "fred", id: "DGS3MO", cadence: "daily", factors: ["S6", "SC"],
    layer: "fast", role: "trigger",
    trigger: { form: "composite", spec: "curve level = DGS10−DGS3MO (context); steepening decomposition (trigger): bear-steepening (long +25bp/3m while front ≤+5bp, TP rising) → S5; bull-steepening → SC", provenance: "self-calibrated" },
    retire: "no retirement condition specified",
    note: "Short-rate leg of curveShape's front-end delta (Task 3)." },

  // ---------- Reserve mechanics / print discriminator (S8) ----------
  { key: "sofr", source: "fred", id: "SOFR", cadence: "daily", factors: ["S8"],
    layer: "fast", role: "trigger",
    trigger: { form: "composite", spec: "SOFR−IORB ≥+10bp = funding-stress annotation only; printDiscriminator composition dominates it — a bills-led WALCL expansion (≥60% of Δ) is reserve management regardless of funding stress (2019 precedent: repo stress + bills purchases was still plumbing); duration-led expansion = monetization", provenance: "self-calibrated" },
    retire: "Fed abandons ample-reserves regime",
    note: "Funding-stress leg of printDiscriminator. Amended per spec review: composition (bills- vs duration-led) is the deciding signal, not funding stress — SOFR−IORB only annotates, it never overrides a bills-led read to 'monetization'." },
  { key: "iorb", source: "fred", id: "IORB", cadence: "daily", factors: ["S8"],
    layer: "fast", role: "trigger",
    trigger: { form: "composite", spec: "SOFR−IORB spread reference rate — see sofr entry; composition (billsShareOfExpansion) dominates, not spread level", provenance: "self-calibrated" },
    retire: "Fed abandons ample-reserves regime",
    note: "Reference leg of the SOFR−IORB spread; corridor floor under ample-reserves operating regime." },
  { key: "bills_outright", source: "fred", id: "WSHOBL", cadence: "weekly", factors: ["S8"],
    layer: "fast", role: "trigger",
    trigger: { form: "roc", spec: "Δ bills-held-outright ÷ ΔWALCL = billsShareOfExpansion; ≥0.6 = reserve-management read in printDiscriminator", provenance: "self-calibrated" },
    retire: "H.4.1 stops publishing the bills-held-outright breakout, or Fed abandons ample-reserves regime",
    note: "H.4.1 weekly bills-held-outright — the composition numerator that makes printDiscriminator's bills- vs duration-led call possible." },

  // ---------- Equities & private credit (SC, PC) ----------
  { key: "spx", source: "fred", id: "SP500", cadence: "daily", factors: ["SC"],
    layer: "fast", role: "trigger",
    trigger: { form: "level", spec: "drawdown vs 3y high: −20% elevated, −40% critical (Dalio: depressions ~50%, P1:1085)", provenance: "dalio" },
    retire: "FRED drops SP500, or S&P licensing shortens it below the 3y drawdown window",
    note: "Drawdown ruler + normalization clock. FRED SP500 is licensed as a ROLLING 10-YEAR window (covers 2016→ today) — that is ample for the ruler, which only looks back 756 trading days (~3y), so FRED is primary and yahooCloses('^GSPC','5y') is the fallback. Stooq was removed: its CSV endpoint is permanently behind a JS proof-of-work anti-bot challenge (HTTP 200 + HTML, never CSV) and never once succeeded. The 10y cap DOES bind on the Archetype chart row, whose neighbours span ~30y — that row splices this live series over src/data/spx-monthly.json, a build-time artifact emitted by scripts/backtest/century.mjs, so no equity call on the request path depends on Yahoo." },
  { key: "bdc_basket", source: "yahoo", id: "ARCC,BXSL,OBDC,FSK", cadence: "daily", factors: ["PC"],
    layer: "fast", role: "trigger",
    trigger: { form: "composite", spec: "median P/NAV 5y-percentile ≤10th = elevated; AND HY OAS Δ3m <+40bp = divergence critical (private stress the public index can't see — selection-bias fix)", provenance: "self-calibrated" },
    retire: "private credit marks become observable",
    note: "Daily Yahoo closes for the BDC basket; P/NAV = daily close ÷ last-filed NAV (see bdc_nav). Feeds bdcStress (Task 3)." },
  { key: "bdc_nav", source: "manual", id: "manual:bdc_nav", cadence: "quarterly", factors: ["PC"],
    layer: "slow", role: "context",
    retire: "an API for BDC NAV appears",
    note: "No API exists for BDC NAV-per-share. Curated quarterly inputs enter manual_inputs as bdc_nav_ARCC, bdc_nav_BXSL, bdc_nav_OBDC, bdc_nav_FSK — each with source URL (filed 10-Q/10-K NAV disclosure) + 90-day staleness badge, same discipline as hyperscaler_coverage. P/NAV = bdc_basket's daily Yahoo close ÷ the matching ticker's last-filed NAV here." },
];

export const FACTOR_META: Record<string, { name: string; station: string }> = {
  SC:  { name: "Short-Term Debt Cycle", station: "Business cycle" },
  S1:  { name: "Structural Deficit", station: "Debts rising faster than incomes" },
  S2:  { name: "Debt-to-Income (federal)", station: "The blue line" },
  S3:  { name: "Debt-Service Burden", station: "The red line" },
  S4:  { name: "Borrowing to Pay Debt Service", station: "Unsustainability sign" },
  S5:  { name: "Supply/Demand for Bonds", station: "The thinning bid" },
  S6:  { name: "Interest Rates (MP1)", station: "The squeeze" },
  S7:  { name: "Nominal Growth vs Nominal Rates", station: "The hinge" },
  S8:  { name: "Debt Monetization (MP2/MP3)", station: "Printing money" },
  TAX: { name: "Revenue quality (AI beta)", station: "Tax-base leg" },
  PC:  { name: "Private credit / circularity", station: "Private leg" },
  JP:  { name: "Japan repatriation", station: "Demand leg" },
  SoV: { name: "Store Hold of Wealth", station: "Exit leg" },
};
