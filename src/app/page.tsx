import { assess } from "@/lib/framework/assess";
import { latestSnapshot, recentAlerts } from "@/lib/db";
import { FACTOR_META } from "@/lib/config/series";
import { fred, stooqCloses, yahooCloses, oandaCandles, type Obs } from "@/lib/sources/clients";
import FactorBoard from "./components/FactorBoard";
import Tabs from "./components/Tabs";
import HeatTimeline from "./components/charts/HeatTimeline";
import CenturyPanel from "./components/charts/CenturyPanel";
import CycleTimeline from "./components/charts/CycleTimeline";
import ArchetypePanel from "./components/charts/ArchetypePanel";
import PlaybookTab from "./components/playbook/PlaybookTab";
import phaseBandsJson from "@/data/phase-bands.json";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
export const revalidate = 0;

type Status = "critical" | "elevated" | "watch" | "ok";
type SourceType = "live" | "manual" | "derived" | "stale";
interface SubInput {
  key: string; label: string; value: string; unit?: string;
  source: SourceType; sourceName: string; contribution: string; trendNote?: string;
  sourceUrl?: string;
  latestActual?: string; latestForecast?: string; latestPrior?: string;
  beatMiss?: string; beatMissDir?: "beat" | "miss" | "inline";
  momDelta?: string; momDir?: "up" | "down" | "flat";
  prints?: { period: string; value: number }[];
  printUnit?: string;
  printThreshold?: number;
  threshold?: { value: number; label: string; direction: "above" | "below"; current?: number | null };
  alsoFeeds?: string[];
}

/** Static street consensus for the AFP strips — update by hand as prints roll. */
const CONSENSUS = {
  coreYoY: { display: "3.0%", value: 3.0, lowerIsBetter: true },
  headlineYoY: { display: "2.9%", value: 2.9, lowerIsBetter: true },
  nfp3mma: { display: "80k", value: 80, lowerIsBetter: false },
  brent: { display: "$82", value: 82, lowerIsBetter: true },
};

const sign = (n: number, unit = "", digits = 2) => `${n >= 0 ? "+" : "−"}${Math.abs(n).toFixed(digits)}${unit}`;

function afp(actual: any, c: { display: string; value: number; lowerIsBetter: boolean }, unit = "", digits = 2) {
  if (actual == null || !Number.isFinite(actual)) return {};
  const d = actual - c.value;
  const dir: "beat" | "miss" | "inline" =
    Math.abs(d) < 1e-9 ? "inline" : (c.lowerIsBetter ? d < 0 : d > 0) ? "beat" : "miss";
  return { latestForecast: c.display, beatMiss: sign(d, unit, digits), beatMissDir: dir };
}

function mom(cur: any, prior: any, unit = "", digits = 2) {
  if (cur == null || prior == null || !Number.isFinite(cur) || !Number.isFinite(prior)) return {};
  const d = cur - prior;
  return { momDelta: sign(d, unit, digits), momDir: (d > 0 ? "up" : d < 0 ? "down" : "flat") as "up" | "down" | "flat" };
}

const SRC = {
  PAYEMS: "https://fred.stlouisfed.org/series/PAYEMS",
  UNRATE: "https://fred.stlouisfed.org/series/UNRATE",
  CPILFESL: "https://fred.stlouisfed.org/series/CPILFESL",
  CPIAUCSL: "https://fred.stlouisfed.org/series/CPIAUCSL",
  DGS10: "https://fred.stlouisfed.org/series/DGS10",
  GDP: "https://fred.stlouisfed.org/series/GDP",
  DFII10: "https://fred.stlouisfed.org/series/DFII10",
  FDHBFIN: "https://fred.stlouisfed.org/series/FDHBFIN",
  AVG_RATES: "https://fiscaldata.treasury.gov/datasets/average-interest-rates-treasury-securities/",
  MTS: "https://fiscaldata.treasury.gov/datasets/monthly-treasury-statement/",
  AUCTIONS: "https://www.treasurydirect.gov/auctions/auction-query/",
};
interface FactorRow {
  key: string; name: string; station: string; status: Status;
  headline: string; logic: string; subInputs: SubInput[];
}

const st = (s: any): Status =>
  s === "critical" || s === "elevated" || s === "watch" || s === "ok" ? s : "watch";
const fmt = (v: any, suffix = "") =>
  v == null || (typeof v === "number" && !Number.isFinite(v)) ? "—" : `${v}${suffix}`;

const STATUS_COLOR: Record<Status, string> = {
  critical: "var(--red)", elevated: "var(--amber)", watch: "var(--blue)", ok: "var(--green)",
};
const TIER_COLOR: Record<number, string> = { 1: "var(--red)", 2: "var(--amber)", 3: "var(--blue)" };

const STAGE_LABELS: Record<number, string> = {
  1: "Early Part of the Cycle", 2: "Bubble", 3: "Top", 4: "Depression",
  5: "Beautiful Deleveraging", 6: "Pushing on a String", 7: "Normalization",
};

/* ---------------- Archetype panel: server-side history fetch ----------------
 * Dedicated pulls for the Dalio chart grammar (spec §5) — separate from the
 * factor-board pulls in assess(), since none of these 7 metrics match an
 * existing sub-input history length. Every source is individually wrapped
 * so one dead source degrades to an empty row ("no data"), never a crash. */
const safeFetch = async <T,>(fn: () => Promise<T>, fallback: T): Promise<T> => {
  try { return await fn(); } catch { return fallback; }
};

/** Last observation per calendar month — keeps daily series light in the DOM. */
function thinMonthly(obs: Obs[]): Obs[] {
  const map = new Map<string, Obs>();
  for (const o of obs) map.set(o.date.slice(0, 7), o);
  return [...map.values()].sort((a, b) => a.date.localeCompare(b.date));
}

/** Exact-date ratio (both series on FRED's quarterly date grid) → %. */
function ratioExact(numer: Obs[], denom: Obs[]): Obs[] {
  const dMap = new Map(denom.map(o => [o.date, o.value]));
  return numer
    .filter(o => dMap.has(o.date) && dMap.get(o.date) !== 0)
    .map(o => ({ date: o.date, value: Math.round((o.value / dMap.get(o.date)!) * 10000) / 100 }));
}

/** Monthly ÷ nearest-prior-quarter ratio, for series (e.g. M2SL) that don't share FRED's quarterly date grid. */
function ratioNearestPrior(numer: Obs[], denomQuarterly: Obs[]): Obs[] {
  const denomSorted = [...denomQuarterly].sort((a, b) => a.date.localeCompare(b.date));
  const out: Obs[] = [];
  for (const o of numer) {
    let d: Obs | null = null;
    for (const q of denomSorted) { if (q.date <= o.date) d = q; else break; }
    if (d && d.value) out.push({ date: o.date, value: Math.round((o.value / d.value) * 10000) / 100 });
  }
  return out;
}

function spreadExact(a: Obs[], b: Obs[]): Obs[] {
  const bMap = new Map(b.map(o => [o.date, o.value]));
  return a.filter(o => bMap.has(o.date)).map(o => ({ date: o.date, value: Math.round((o.value - bMap.get(o.date)!) * 100) / 100 }));
}

function indexToFirst(obs: Obs[]): Obs[] {
  if (!obs.length || !obs[0].value) return [];
  const first = obs[0].value;
  return obs.map(o => ({ date: o.date, value: Math.round((o.value / first) * 10000) / 100 }));
}

async function buildArchetypeSeries(): Promise<Record<string, Obs[]>> {
  try {
    const [tcmdo, gdpQ, tdsp, m2sl, dgs3mo, dgs10] = await Promise.all([
      safeFetch(() => fred("TCMDO", { limit: 120 }), [] as Obs[]),
      safeFetch(() => fred("GDP", { limit: 120 }), [] as Obs[]),
      safeFetch(() => fred("TDSP", { limit: 120 }), [] as Obs[]),
      safeFetch(() => fred("M2SL", { limit: 360 }), [] as Obs[]),
      safeFetch(() => fred("DGS3MO", { limit: 1300 }), [] as Obs[]),
      safeFetch(() => fred("DGS10", { limit: 1300 }), [] as Obs[]),
    ]);
    const equityRaw = await safeFetch(async () => {
      try { return await stooqCloses("^spx"); }
      catch { return await yahooCloses("^GSPC", "5y"); }
    }, [] as Obs[]);
    const goldRaw = await safeFetch(() => oandaCandles("XAU_USD", 500), [] as Obs[]);

    return {
      totalDebtGdp: ratioExact(tcmdo, gdpQ),
      dsrHousehold: tdsp,
      moneyGdp: ratioNearestPrior(m2sl, gdpQ),
      equityIndexed: indexToFirst(thinMonthly(equityRaw)),
      gold: thinMonthly(goldRaw),
      shortRate3mo: thinMonthly(dgs3mo),
      curveSpread: thinMonthly(spreadExact(dgs10, dgs3mo)),
    };
  } catch {
    return {};
  }
}

export default async function Page() {
  let snap: any = null;
  let loadError: string | null = null;
  try {
    snap = (await latestSnapshot()) ?? (await assess());
  } catch (e: any) {
    loadError = e?.message ?? "Unknown error";
  }

  if (loadError || !snap) {
    return (
      <div style={{ padding: "80px 24px", fontFamily: "var(--mono)", color: "var(--amber)" }}>
        <div style={{ fontSize: 10, letterSpacing: "0.15em", marginBottom: 12 }}>ASSESS ERROR</div>
        <div style={{ fontSize: 13 }}>{loadError ?? "No snapshot available."}</div>
      </div>
    );
  }

  const alerts = await recentAlerts(12).catch(() => [] as any[]);
  const archetypeSeries = await buildArchetypeSeries();
  const f = snap.factors ?? {};
  const i = snap.inputs ?? {};

  const meta = (k: string) => FACTOR_META[k] ?? { name: k, station: "—" };
  const stageText: string = snap.stage?.stage ?? "—";
  const stageNum: number = snap.stage?.phaseNum ?? (stageText.includes("DELEVERAGING") || stageText.includes("Depression") ? 4 : 3);
  const stageLabel = STAGE_LABELS[stageNum] ?? "Unknown Phase";

  // slow clock — position layer (Task 5). Quarterly, revised; context-only,
  // never averaged into the fast factor board or its triggers.
  const posClock = snap.position?.clock ?? { score: null, label: "no-data", status: "ok" };
  const posInputs = snap.position?.inputs ?? {};
  const POSITION_INPUT_KEYS = ["totalDebtGdpPct", "hhDebtNetWorthPct", "dsrHouseholdPct", "wealthRatio"] as const;
  const posCount = POSITION_INPUT_KEYS.filter(k => posInputs[k] != null && Number.isFinite(posInputs[k])).length;

  const factorRows: FactorRow[] = [
    {
      key: "SC", ...meta("SC"), status: st(f.SC?.status),
      headline: `Phase: ${f.SC?.phase ?? "—"} — payrolls 3mma ${fmt(i.nfp3mma, "k")}, two-month revisions ${fmt(i.revisionsSum2m, "k")}`,
      logic: "Phase classifier over payroll momentum, revision direction, and the Sahm gap. Sahm gap ≥ 0.5pp = contraction; weak 3mma with negative revisions = late-stall breaking downward. A contraction sets the flag that converts the S7 r>g crossing from projection to event.",
      subInputs: [
        { key: "nfp3mma", label: "Nonfarm payrolls, 3-month average", value: fmt(i.nfp3mma), unit: "k/month", source: "live", sourceName: "FRED PAYEMS (vintage)", sourceUrl: SRC.PAYEMS,
          latestActual: fmt(i.nfp3mma, "k"), latestPrior: i.nfp3mmaPrior != null ? `${i.nfp3mmaPrior}k` : "—",
          ...afp(i.nfp3mma, CONSENSUS.nfp3mma, "k", 0), ...mom(i.nfp3mma, i.nfp3mmaPrior, "k", 0),
          prints: i.nfp3mmaHistory ?? [], printUnit: "k", printThreshold: 0,
          alsoFeeds: ["S7", "TAX"],
          contribution: "The momentum term. Sub-50k signals stall; negative signals contraction and trips the recession flag consumed by the r-vs-g hinge." },
        { key: "revisions", label: "Payroll revisions, last 2 months", value: fmt(i.revisionsSum2m), unit: "k cumulative", source: "live", sourceName: "ALFRED vintages", sourceUrl: SRC.PAYEMS,
          latestActual: fmt(i.revisionsSum2m, "k"), latestPrior: i.revisionsSum2mPrior != null ? `${i.revisionsSum2mPrior}k` : "—",
          ...mom(i.revisionsSum2m, i.revisionsSum2mPrior, "k", 0),
          prints: i.revisionsHistory ?? [], printUnit: "k", printThreshold: -75,
          contribution: "Revision direction is the tell on turning points — persistent downward revisions mean the real-time prints overstate the cycle." },
        { key: "sahm", label: "Sahm gap (U3 3mma vs 12m low)", value: fmt(i.sahmGap), unit: "pp", source: "derived", sourceName: "FRED UNRATE", sourceUrl: SRC.UNRATE,
          threshold: { value: 0.5, label: "≥ 0.5pp = contraction (Sahm rule)", direction: "above", current: i.sahmGap },
          contribution: "≥0.5pp is the historical recession threshold. Read with participation — a shrinking labour force flatters the unemployment level.",
          trendNote: "Jul-26 UNRATE fell to 4.1% only because the labour force shrank — never read the level alone." },
      ],
    },
    {
      key: "S8", ...meta("S8"), status: st(f.S8?.status),
      headline: `Valve ${f.S8?.label ?? "—"} — score ${fmt(f.S8?.score)}, wedge ${fmt(f.S8?.wedge, "pp")}`,
      logic: "Valve score = 1 − (core − 2%) / 2%, then gated: headline−core wedge ≥ 0.6pp with Brent ≥ $85 caps it at 0.55 (energy-shock gate); headline ≥ 3% caps at 0.7; core ≥ 3% caps at 0.25 (blocked). The block on Debt Monetization is the war, not a wage-price spiral.",
      subInputs: [
        { key: "core", label: "Core CPI, y/y", value: fmt(i.coreYoY), unit: "%", source: "live", sourceName: "FRED CPILFESL", sourceUrl: SRC.CPILFESL,
          latestActual: fmt(i.coreYoY, "%"), latestPrior: i.coreYoYPrior != null ? `${i.coreYoYPrior}%` : "—",
          ...afp(i.coreYoY, CONSENSUS.coreYoY, "pp"), ...mom(i.coreYoY, i.coreYoYPrior, "pp"),
          prints: i.coreYoYHistory ?? [], printUnit: "%", printThreshold: 2.0,
          threshold: { value: 3.0, label: "≥ 3.0% = valve blocked (score capped 0.25)", direction: "above", current: i.coreYoY },
          contribution: "The underlying-inflation term of the valve score. Core near 2% means the Fed CAN monetise the moment the energy gate clears." },
        { key: "headline", label: "Headline CPI, y/y", value: fmt(i.headlineYoY), unit: "%", source: "live", sourceName: "FRED CPIAUCSL", sourceUrl: SRC.CPIAUCSL,
          latestActual: fmt(i.headlineYoY, "%"), latestPrior: i.headlineYoYPrior != null ? `${i.headlineYoYPrior}%` : "—",
          ...afp(i.headlineYoY, CONSENSUS.headlineYoY, "pp"), ...mom(i.headlineYoY, i.headlineYoYPrior, "pp"),
          prints: i.headlineYoYHistory ?? [], printUnit: "%", printThreshold: 3.0,
          threshold: { value: 3.0, label: "≥ 3.0% partially gates the valve", direction: "above", current: i.headlineYoY },
          contribution: "Headline ≥ 3% partially gates the valve; the headline−core wedge measures how much of the problem is energy." },
        { key: "brent", label: "Brent crude, spot", value: fmt(i.brent), unit: "USD/bbl", source: "live", sourceName: "OANDA BCO_USD",
          latestActual: `$${fmt(i.brent)}`, latestPrior: i.brentPrior != null ? `$${i.brentPrior}` : "—",
          ...afp(i.brent, CONSENSUS.brent, "", 1), ...mom(i.brent, i.brentPrior, "", 1),
          prints: i.brentHistory ?? [], printUnit: "", printThreshold: 80,
          threshold: { value: 85, label: "≥ $85 with wedge ≥ 0.6pp = energy gate", direction: "above", current: i.brent },
          contribution: "The live energy gate. Brent < $80 with headline < 3% reopens the valve within a quarter.",
          trendNote: "Hormuz reopening → Brent < 80 → headline collapses toward core." },
      ],
    },
    {
      key: "S6", ...meta("S6"), status: st(f.S6?.status),
      headline: `Real-yield impulse ${fmt(f.S6?.realYieldDelta12mBp, "bp")} over 12 months`,
      logic: "12-month change in the 10Y real yield (TIPS). +75bp = watch, +150bp = elevated, +250bp = critical. Added after the backtest showed the 2022 −25% bear was a duration shock no other leg measured — interest rates (MP1) repricing faster than the economy can absorb.",
      subInputs: [
        { key: "impulse", label: "10Y real yield, 12m change", value: fmt(f.S6?.realYieldDelta12mBp), unit: "bp", source: "live", sourceName: "FRED DFII10", sourceUrl: SRC.DFII10,
          threshold: { value: 250, label: "≥ +250bp/12m = CRITICAL duration shock", direction: "above", current: f.S6?.realYieldDelta12mBp },
          contribution: "The tightening impulse itself. 2022's +250bp surge is the calibration point; the Volcker era reads critical on the same math." },
        { key: "real10y_level", label: "10Y real yield (TIPS), level", value: fmt(i.real10y), unit: "%", source: "live", sourceName: "FRED DFII10", sourceUrl: SRC.DFII10,
          prints: i.real10yHistory ?? [], printUnit: "%",
          ...mom(i.real10y, i.real10yPrior, "pp"),
          contribution: "The level the page keeps talking about — shown, not implied. Pre-2003 history uses the nominal-minus-CPI proxy basis." },
      ],
    },
    {
      key: "S7", ...meta("S7"), status: st(f.S7?.status),
      headline: `Gap g−rAvg ${fmt(f.S7?.gap, "pp")} · drift ${fmt(f.S7?.driftPerYear, "pp/yr")} · ~${fmt(f.S7?.monthsToCross, "m")} to cross · recession-crossed: ${String(f.S7?.stressedCrossed ?? "—")}`,
      logic: "Gap = nominal g − average interest rate on marketable debt. Drift = (10Y − rAvg) × 12-month rollover share, i.e. every roll drags the average toward the marginal rate. A payroll contraction knocks ~3pp off nominal g — with that haircut applied, the crossing is a recession EVENT, not a calendar projection.",
      subInputs: [
        { key: "ravg", label: "Average interest rate, total marketable", value: fmt(i.rAvg), unit: "%", source: "live", sourceName: "FiscalData avg_interest_rates", sourceUrl: SRC.AVG_RATES,
          latestActual: fmt(i.rAvg, "%"), latestPrior: i.rAvgPrior != null ? `${i.rAvgPrior}%` : "—",
          ...mom(i.rAvg, i.rAvgPrior, "pp"),
          prints: i.rAvgHistory ?? [], printUnit: "%",
          ...(Number.isFinite(i.gNominal) ? { threshold: { value: i.gNominal, label: `≥ nominal g (${i.gNominal}%) = r>g crossed`, direction: "above" as const, current: i.rAvg } } : {}),
          contribution: "The r side of the hinge. Rises mechanically as maturing stock rolls at marginal cost.",
          ...(f.S7?.gapPrior != null && f.S7?.gap != null ? { trendNote: `Gap g−rAvg moved ${sign(f.S7.gap - f.S7.gapPrior, "pp")} m/m (${f.S7.gapPrior}pp → ${f.S7.gap}pp).` } : {}) },
        { key: "rmarg", label: "Marginal cost of debt (10Y)", value: fmt(i.rMarg), unit: "%", source: "live", sourceName: "FRED DGS10", sourceUrl: SRC.DGS10,
          contribution: "Sets the drift speed: the wider 10Y sits above rAvg, the faster the average ratchets up." },
        { key: "g", label: "Nominal GDP growth, y/y", value: fmt(i.gNominal), unit: "%", source: "live", sourceName: "FRED GDP", sourceUrl: SRC.GDP,
          alsoFeeds: ["TAX"],
          contribution: "The g side. Caution: ~74% of Q1-26 growth was AI capex — capex-flow g, not higher potential g.",
          trendNote: "Stressed test applies a −3pp recession haircut to g before comparing to rAvg." },
        { key: "rollover", label: "Rollover share, ≤12 months", value: fmt(i.rolloverShare != null ? Math.round(i.rolloverShare * 100) : null), unit: "% of stock", source: "manual", sourceName: "manual_inputs (MSPD-derived)",
          contribution: "Scales the drift: the share of the stock repricing at marginal cost each year. Automation from MSPD tables is on the roadmap." },
      ],
    },
    {
      key: "S5", ...meta("S5"), status: st(f.S5?.status),
      headline: `Last 10Y auction: bid-to-cover ${fmt(f.S5?.lastBtc)} · dealer takedown ${fmt(f.S5?.lastDealerPct, "%")}`,
      logic: "Recent 10Y auctions scored on bid-to-cover and primary-dealer takedown. Weak BTC and heavy dealer share together = critical (dealers as buyers of last resort); either alone = elevated. Two weak 10Y auctions in a row fires the Tier-3 plumbing trigger.",
      subInputs: [
        { key: "btc", label: "10Y bid-to-cover", value: fmt(f.S5?.lastBtc), unit: "ratio", source: "live", sourceName: "TreasuryDirect auctions", sourceUrl: SRC.AUCTIONS,
          latestActual: fmt(f.S5?.lastBtc, "×"), latestPrior: f.S5?.btcPrior != null ? `${f.S5.btcPrior}×` : "—",
          ...mom(f.S5?.lastBtc, f.S5?.btcPrior, "", 2),
          prints: f.S5?.btcHistory ?? [], printUnit: "×", printThreshold: 2.4,
          threshold: { value: 2.4, label: "< 2.4 on two straight 10Ys = weak demand", direction: "below", current: f.S5?.lastBtc },
          contribution: "Direct read on demand at the clearing price. Aug-26 10Y cleared 4.683% — highest since the GFC." },
        { key: "dealer", label: "Primary-dealer takedown", value: fmt(f.S5?.lastDealerPct), unit: "%", source: "live", sourceName: "TreasuryDirect auctions", sourceUrl: SRC.AUCTIONS,
          threshold: { value: 18, label: "> 18% on two straight = dealers warehousing", direction: "above", current: f.S5?.lastDealerPct },
          contribution: "Heavy dealer share means end-investors stepped back and the street warehoused the supply." },
        { key: "foreign", label: "Foreign holdings", value: fmt(i.foreignHoldingsBn != null ? Math.round(i.foreignHoldingsBn) : null), unit: "USD bn", source: "live", sourceName: "FRED FDHBFIN", sourceUrl: SRC.FDHBFIN,
          contribution: "The stock-side check. Share fell to 31% only because debt grew faster — the level rose $8.9→9.5trn. Rate constraint, not a buyers' strike." },
      ],
    },
    {
      key: "S3", ...meta("S3"), status: st(f.S3?.status),
      headline: `Interest consumes ${f.S3?.ratio != null ? (f.S3.ratio * 100).toFixed(1) : "—"}% of receipts (TTM $${fmt(i.ttmInterestBn)}bn / $${fmt(i.ttmReceiptsBn)}bn)`,
      logic: "TTM net interest ÷ TTM total receipts from the Monthly Treasury Statement. ≥17% = elevated; ≥20% = critical — the 20–25% band is the historic loss-of-discretion zone where interest starts crowding out policy choices (Tier-2 trigger).",
      subInputs: [
        { key: "interest", label: "Net interest, trailing 12 months", value: fmt(i.ttmInterestBn), unit: "USD bn", source: "live", sourceName: "FiscalData MTS table 9", sourceUrl: SRC.MTS,
          contribution: "The compounding leg made literal: interest paid on debt that was itself borrowed." },
        { key: "receipts", label: "Total receipts, trailing 12 months", value: fmt(i.ttmReceiptsBn), unit: "USD bn", source: "live", sourceName: "FiscalData MTS table 9", sourceUrl: SRC.MTS,
          contribution: "The denominator — the state's actual income against which the interest bill compounds." },
        { key: "ratio", label: "Interest / receipts", value: f.S3?.ratio != null ? (f.S3.ratio * 100).toFixed(1) : "—", unit: "%", source: "derived", sourceName: "computed",
          latestActual: f.S3?.ratio != null ? `${(f.S3.ratio * 100).toFixed(1)}%` : "—",
          latestPrior: f.S3?.ratioPrior != null ? `${(f.S3.ratioPrior * 100).toFixed(1)}%` : "—",
          ...mom(f.S3?.ratio != null ? f.S3.ratio * 100 : null, f.S3?.ratioPrior != null ? f.S3.ratioPrior * 100 : null, "pp", 1),
          prints: f.S3?.ratioHistory ?? [], printUnit: "%", printThreshold: 20,
          threshold: { value: 20, label: "≥ 20% = CRITICAL (loss-of-discretion zone)", direction: "above", current: f.S3?.ratio != null ? f.S3.ratio * 100 : null },
          contribution: "The squeeze itself. Crossing 20% historically marks the point where fiscal discretion is lost." },
      ],
    },
    {
      key: "TAX", ...meta("TAX"), status: st(f.TAX?.status),
      headline: `Revenue beta ${fmt(f.TAX?.beta)} vs nominal growth ${fmt(i.gNominal, "%")}`,
      logic: "Beta = receipts y/y ÷ nominal GDP y/y. Beta < 0.8 = elevated: the GDP being printed is not taxing like normal GDP. AI-capex-led growth (and deficit-financed war supplementals) inflates g without a proportional revenue follow-through.",
      subInputs: [
        { key: "beta", label: "Revenue beta (receipts y/y ÷ GDP y/y)", value: fmt(f.TAX?.beta), unit: "ratio", source: "derived", sourceName: "FiscalData MTS + FRED GDP", sourceUrl: SRC.MTS,
          threshold: { value: 0.8, label: "< 0.8 = growth not taxing like GDP", direction: "below", current: f.TAX?.beta },
          contribution: "Below 0.8, every point of headline growth delivers less than a point of revenue — the deficit path is worse than g suggests." },
        { key: "g", label: "Nominal GDP growth, y/y", value: fmt(i.gNominal), unit: "%", source: "live", sourceName: "FRED GDP", sourceUrl: SRC.GDP,
          alsoFeeds: ["S7"],
          contribution: "The comparator. Capex-flow GDP (AI data-centre build-out) doesn't tax like payroll GDP.",
          trendNote: "Iran-war supplementals ($87.6bn FY26) land in outlays, deficit-financed." },
      ],
    },
    {
      key: "SoV", ...meta("SoV"), status: st(f.SoV?.status),
      headline: `Mode: ${f.SoV?.mode ?? "—"} · gold $${fmt(i.goldSpot)} · real-yield divergence: ${String(f.SoV?.divergence ?? "—")}`,
      logic: "Gold return over ~20 sessions decomposed into USD, EUR, JPY numeraires. Up >2% in all three = credit-flight (exit from sovereign credit generally, not a dollar trade). Divergence flag: gold rising WITH real yields rising = gold bought as an alternative to the sovereign, not as a rate hedge (Tier-3).",
      subInputs: [
        { key: "gold", label: "Gold spot", value: fmt(i.goldSpot), unit: "USD/oz", source: "live", sourceName: "OANDA XAU_USD",
          latestActual: `$${fmt(i.goldSpot)}`, latestPrior: i.goldSpotPrior != null ? `$${i.goldSpotPrior}` : "—",
          ...mom(i.goldSpot, i.goldSpotPrior, "", 0),
          prints: i.goldSpotHistory ?? [], printUnit: "",
          contribution: "The flight asset. Record highs despite high real yields is the anomaly the decomposition explains." },
        { key: "mode", label: "Decomposition mode", value: String(f.SoV?.mode ?? "—"), source: "derived", sourceName: "XAU vs EUR/JPY numeraires",
          alsoFeeds: ["JP"],
          contribution: "Distinguishes a weak-dollar trade from a general exit: rising in every currency means the seller is sovereign credit itself." },
        { key: "diverge", label: "Real-yield divergence", value: f.SoV?.divergence ? "YES" : "no", source: "derived", sourceName: "FRED DFII10", sourceUrl: SRC.DFII10,
          contribution: "Gold up while 10Y real yields rise breaks the rate-hedge model — the store hold of wealth bid is about credit, not rates." },
      ],
    },
    {
      key: "PC", ...meta("PC"), status: st(f.PC?.status),
      headline: `HY OAS ${fmt(f.PC?.hyOasBp, "bp")} · 3m momentum ${fmt(f.PC?.hyOasDelta3mBp, "bp")}`,
      logic: "HY OAS level + 3-month momentum. ≥500bp AND widening = critical (the private-credit complex repricing); ≥400bp level or +75bp/3m = elevated. The ~$800bn circular AI deals, $570bn 2026 AI debt and off-balance-sheet leases have no direct print — spread level and momentum are the free daily read on that complex.",
      subInputs: [
        { key: "oas", label: "HY OAS", value: fmt(f.PC?.hyOasBp), unit: "bp", source: "live", sourceName: "FRED BAMLH0A0HYM2",
          threshold: { value: 500, label: "≥ 500bp + widening = CRITICAL", direction: "above", current: f.PC?.hyOasBp },
          contribution: "Level: where the market prices the weakest private borrowers outright." },
        { key: "mom", label: "HY OAS, 3m change", value: fmt(f.PC?.hyOasDelta3mBp), unit: "bp", source: "derived", sourceName: "computed",
          threshold: { value: 75, label: "≥ +75bp/3m = ELEVATED repricing underway", direction: "above", current: f.PC?.hyOasDelta3mBp },
          contribution: "Momentum: mid-1999, mid-2007 and late-2018 all began as spread momentum before levels looked alarming." },
      ],
    },
    {
      key: "JP", ...meta("JP"), status: st(f.JP?.status),
      headline: `Repatriation hits ${f.JP?.hits ?? 0}/3 (JGB yields, yen, TIC holdings level)`,
      logic: "Three-condition counter: JGB 10Y up ≥25bp over 3m (carry gap closing) + yen strengthening + Japanese Treasury holdings falling outright for 2 consecutive months. 3/3 = critical: the largest foreign creditor is taking money home.",
      subInputs: [
        { key: "hits", label: "Conditions met", value: `${f.JP?.hits ?? 0}/3`, source: "derived", sourceName: "FRED JGB 10Y + OANDA USD_JPY + TIC",
          threshold: { value: 3, label: "3/3 = CRITICAL repatriation", direction: "above", current: f.JP?.hits ?? 0 },
          alsoFeeds: ["SoV", "S5"],
          contribution: "Each leg alone is noise; all three together are repatriation — the marginal foreign bid for Treasuries turning into supply." },
        { key: "tic", label: "Japan TIC holdings, 2m change", value: "—", unit: "USD bn", source: "manual", sourceName: "manual_inputs (TIC series id pending)",
          contribution: "The confirming leg: an ABSOLUTE decline (~$1.2trn stock) two months running, not a share-of-debt artefact. FRED TIC country series to be pinned; manual override until then." },
      ],
    },
  ];

  const SMALL_KEYS = ["SC", "S8", "S6"];
  const smallRows = factorRows.filter(r => SMALL_KEYS.includes(r.key));
  const bigRows = factorRows.filter(r => !SMALL_KEYS.includes(r.key));

  const triggers: any[] = snap.triggers ?? [];
  const asOf = (snap.asOf ?? "").slice(0, 16).replace("T", " ");

  return (
    <>
      <div className="topbar">
        <span className="topbar-logo">SOVEREIGN VITALS</span>
        <span className="topbar-sep">/</span>
        <span className="topbar-label">DALIO FRAMEWORK MONITOR · US</span>
        <div className="topbar-right">
          <span className="topbar-ts">
            <span style={{ display: "inline-block", width: 6, height: 6, borderRadius: "50%", background: "var(--green)", marginRight: 6, verticalAlign: "middle" }} />
            AS OF {asOf || "—"} · LIVE
          </span>
        </div>
      </div>

      {snap.problems?.length > 0 && (
        <details className="problems-banner">
          <summary style={{ cursor: "pointer", listStyle: "none", fontFamily: "var(--mono)", fontSize: 10, color: "var(--amber)", letterSpacing: "0.12em" }}>
            ⚠ {snap.problems.length} SOURCE PROBLEM{snap.problems.length > 1 ? "S" : ""} THIS RUN · TAP TO EXPAND
          </summary>
          <div style={{ marginTop: 6 }}>
            {snap.problems.map((p: string) => (
              <div key={p} style={{ fontFamily: "var(--mono)", fontSize: 10, color: "var(--amber)", overflowWrap: "anywhere" }}>{p}</div>
            ))}
          </div>
        </details>
      )}

      <div className="sv-wrap">
        <section className="hero">
          <div>
            <div className="hero-label">BIG DEBT CYCLE POSITION</div>
            <div className="hero-stage">
              <span className="hero-stage-num">{stageNum}</span>
              <span className="hero-stage-denom">/ 7 PHASES</span>
            </div>
            <div className="hero-stage-label">
              {stageLabel} — <b>{stageText}</b>
            </div>
            <div className="cycle-bar-track">
              <div className="cycle-bar-fill" style={{ width: `${(stageNum / 7) * 100}%` }} />
            </div>
          </div>
          <div className="kpi-grid">
            <div className="kpi-cell">
              <div className="kpi-label">R − G GAP</div>
              <div className="kpi-value" style={{ color: (f.S7?.gap ?? 1) <= 0 ? "var(--red)" : "var(--amber)" }}>{fmt(f.S7?.gap, "pp")}</div>
              <div className="kpi-note">g − rAvg · drift {fmt(f.S7?.driftPerYear, "pp/yr")}</div>
            </div>
            <div className="kpi-cell">
              <div className="kpi-label">INTEREST / RECEIPTS</div>
              <div className="kpi-value" style={{ color: (f.S3?.ratio ?? 0) >= 0.2 ? "var(--red)" : "var(--amber-bright)" }}>
                {f.S3?.ratio != null ? `${(f.S3.ratio * 100).toFixed(1)}%` : "—"}
              </div>
              <div className="kpi-note">TTM · 20–25% = loss-of-discretion zone</div>
            </div>
            <div className="kpi-cell">
              <div className="kpi-label">FED DEFERRED ASSET</div>
              <div className="kpi-value" style={{ color: (i.defLevelBn ?? 0) <= -200 ? "var(--red)" : "var(--amber-bright)" }}>${fmt(i.defLevelBn)}bn</div>
              <div className="kpi-note">Central-bank losses — Dalio's literal metric · {f.deferred?.direction ?? "—"}</div>
            </div>
            <div className="kpi-cell">
              <div className="kpi-label">GOLD SPOT</div>
              <div className="kpi-value" style={{ color: "var(--text)" }}>${fmt(i.goldSpot)}</div>
              <div className="kpi-note">{f.SoV?.mode ?? "—"} · divergence: {String(f.SoV?.divergence ?? "—")}</div>
            </div>
          </div>
        </section>

        <section className="section">
          <div className="section-header">
            <span className="section-title">POSITION (SLOW CLOCK)</span>
            <span className="section-rule" />
            <span className="section-count" style={{ color: "var(--text-faint)" }}>{posCount} OF 4 INPUTS</span>
          </div>
          <div className="position-clock-row">
            <div className="position-clock-cell">
              <div className="position-clock-label">CLOCK READING</div>
              <div className="position-clock-value" style={{ color: STATUS_COLOR[st(posClock.status)] }}>{String(posClock.label ?? "no-data").toUpperCase()}</div>
              <div className="position-clock-score">score {posClock.score != null ? posClock.score.toFixed(2) : "—"}</div>
            </div>
            <div className="position-stats-grid">
              <div className="position-stat">
                <div className="position-stat-label">TOTAL DEBT / GDP</div>
                <div className="position-stat-value">{fmt(posInputs.totalDebtGdpPct, "%")}</div>
              </div>
              <div className="position-stat">
                <div className="position-stat-label">HOUSEHOLD DEBT / NET WORTH</div>
                <div className="position-stat-value">{fmt(posInputs.hhDebtNetWorthPct, "%")}</div>
              </div>
              <div className="position-stat">
                <div className="position-stat-label">HOUSEHOLD DEBT SERVICE / INCOME</div>
                <div className="position-stat-value">{fmt(posInputs.dsrHouseholdPct, "%")}</div>
              </div>
              <div className="position-stat">
                <div className="position-stat-label">TOP 0.1% / BOTTOM 90% WEALTH</div>
                <div className="position-stat-value">{fmt(posInputs.wealthRatio, "×")}</div>
              </div>
            </div>
          </div>
          <p className="position-caption">Quarterly, revised — context, never averaged into triggers.</p>
        </section>

        {snap.narrative && (
          <details className="narrative-section" open>
            <summary className="narrative-toggle-label" style={{ cursor: "pointer", listStyle: "none" }}>
              WHAT CHANGED ▾
            </summary>
            <p className="narrative-body">{snap.narrative}</p>
          </details>
        )}

        <section className="section">
          <div className="section-header">
            <span className="section-title">TRIGGERS FIRED</span>
            <span className="section-rule" />
            <span className="section-count" style={{ color: triggers.length ? "var(--red)" : "var(--green)" }}>
              {triggers.length ? `${triggers.length} ACTIVE` : "NONE ACTIVE"}
            </span>
          </div>
          {triggers.length ? (
            <div className="triggers-list">
              {triggers.map((t: any) => {
                const c = TIER_COLOR[t.tier] ?? "var(--blue)";
                return (
                  <div className="trigger-card" key={t.key} style={{ background: "var(--surface)", border: `1px solid color-mix(in srgb, ${c} 25%, var(--border))`, borderLeft: `3px solid ${c}` }}>
                    <div className="trigger-card-header">
                      <span className="tier-badge" style={{ color: c, background: `color-mix(in srgb, ${c} 10%, transparent)` }}>TIER {t.tier}</span>
                      <span className="trigger-label">{t.key}</span>
                    </div>
                    <p className="trigger-detail">{t.detail}</p>
                  </div>
                );
              })}
            </div>
          ) : (
            <p style={{ margin: 0, fontSize: 12, color: "var(--text-muted)" }}>No machine-checkable triggers currently firing.</p>
          )}
        </section>

        <Tabs
          small={
            <>
              <section className="section">
                <div className="section-header">
                  <span className="section-title">SMALL-CYCLE FACTORS</span>
                  <span className="section-rule" />
                  <span className="section-count" style={{ color: "var(--text-faint)" }}>{smallRows.length} FACTORS · CLICK TO EXPAND</span>
                </div>
                <FactorBoard factors={smallRows} />
              </section>
              <section className="section">
                <div className="section-header">
                  <span className="section-title">THE LABOR CYCLE IN REAL TIME</span>
                  <span className="section-rule" />
                  <span className="section-count" style={{ color: "var(--text-faint)" }}>POINT-IN-TIME VINTAGES · 1960 → NOW</span>
                </div>
                <CycleTimeline />
              </section>
            </>
          }
          big={
            <>
              <section className="section">
                <div className="section-header">
                  <span className="section-title">HEAT vs WHAT THE MARKET DID NEXT</span>
                  <span className="section-rule" />
                  <span className="section-count" style={{ color: "var(--text-faint)" }}>BACKTEST REPLAY · SEE BACKTEST.md</span>
                </div>
                <HeatTimeline />
              </section>
              <section className="section">
                <div className="section-header">
                  <span className="section-title">BIG-CYCLE FACTORS</span>
                  <span className="section-rule" />
                  <span className="section-count" style={{ color: "var(--text-faint)" }}>{bigRows.length} FACTORS · CLICK TO EXPAND</span>
                </div>
                <FactorBoard factors={bigRows} />
              </section>
              <section className="section">
                <div className="section-header">
                  <span className="section-title">CENTURY CONTEXT</span>
                  <span className="section-rule" />
                  <span className="section-count" style={{ color: "var(--text-faint)" }}>ANNUAL · FINAL DATA</span>
                </div>
                <CenturyPanel />
              </section>
            </>
          }
          extras={[
            {
              key: "playbook",
              label: "PLAYBOOK",
              sub: "analogs · theme rhymes · horizon returns",
              content: <PlaybookTab playbook={snap.playbook} />,
            },
            {
              key: "archetype",
              label: "ARCHETYPE",
              sub: "the seven phases · debt · money · markets",
              content: <ArchetypePanel series={archetypeSeries} bands={phaseBandsJson as any} />,
            },
          ]}
        />

        {alerts.length > 0 && (
          <div className="alert-history">
            <div className="alert-history-title">RECENT ALERT HISTORY</div>
            <ul className="alert-list">
              {alerts.map((a: any) => (
                <li className="alert-item" key={a.id}>
                  <span className="alert-date">{(a.fired_at ?? "").slice(0, 10)}</span>
                  {a.trigger_key}
                </li>
              ))}
            </ul>
          </div>
        )}

        <footer className="sv-footer">
          <div className="footer-sources">
            Sources: FRED/ALFRED · Treasury FiscalData · TreasuryDirect · OANDA · Yahoo · curated manual_inputs.
            Framework: Dalio, <i>How Countries Go Broke</i> (2025), as restated Aug-2026. Not investment advice.
          </div>
          <div className="footer-version">SOVEREIGN VITALS · v2</div>
        </footer>
      </div>
    </>
  );
}
