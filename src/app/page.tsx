import { assess } from "@/lib/framework/assess";
import { latestSnapshot, recentAlerts } from "@/lib/db";
import { FACTOR_META } from "@/lib/config/series";
import FactorBoard from "./components/FactorBoard";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
export const revalidate = 0;

type Status = "critical" | "elevated" | "watch" | "ok";
type SourceType = "live" | "manual" | "derived" | "stale";
interface SubInput {
  key: string; label: string; value: string; unit?: string;
  source: SourceType; sourceName: string; contribution: string; trendNote?: string;
}
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

export default async function Page() {
  const snap = (await latestSnapshot()) ?? (await assess());
  const alerts = await recentAlerts(12);
  const f = snap.factors ?? {};
  const i = snap.inputs ?? {};

  const meta = (k: string) => FACTOR_META[k] ?? { name: k, station: "—" };
  const stageText: string = snap.stage?.stage ?? "—";
  const stageNum = stageText.includes("Stage 6") || stageText.includes("DELEVERAGING") ? 6 : 5;

  const factorRows: FactorRow[] = [
    {
      key: "SC", ...meta("SC"), status: st(f.SC?.status),
      headline: `Phase: ${f.SC?.phase ?? "—"} — payrolls 3mma ${fmt(i.nfp3mma, "k")}, two-month revisions ${fmt(i.revisionsSum2m, "k")}`,
      logic: "Phase classifier over payroll momentum, revision direction, and the Sahm gap. Sahm gap ≥ 0.5pp = contraction; weak 3mma with negative revisions = late-stall breaking downward. A contraction sets the flag that converts the S7 r>g crossing from projection to event.",
      subInputs: [
        { key: "nfp3mma", label: "Nonfarm payrolls, 3-month average", value: fmt(i.nfp3mma), unit: "k/month", source: "live", sourceName: "FRED PAYEMS (vintage)",
          contribution: "The momentum term. Sub-50k signals stall; negative signals contraction and trips the recession flag consumed by the r-vs-g hinge." },
        { key: "revisions", label: "Payroll revisions, last 2 months", value: fmt(i.revisionsSum2m), unit: "k cumulative", source: "live", sourceName: "ALFRED vintages",
          contribution: "Revision direction is the tell on turning points — persistent downward revisions mean the real-time prints overstate the cycle." },
        { key: "sahm", label: "Sahm gap (U3 3mma vs 12m low)", value: fmt(i.sahmGap), unit: "pp", source: "derived", sourceName: "FRED UNRATE",
          contribution: "≥0.5pp is the historical recession threshold. Read with participation — a shrinking labour force flatters the unemployment level.",
          trendNote: "Jul-26 UNRATE fell to 4.1% only because the labour force shrank — never read the level alone." },
      ],
    },
    {
      key: "S8", ...meta("S8"), status: st(f.S8?.status),
      headline: `Valve ${f.S8?.label ?? "—"} — score ${fmt(f.S8?.score)}, wedge ${fmt(f.S8?.wedge, "pp")}`,
      logic: "Valve score = 1 − (core − 2%) / 2%, then gated: headline−core wedge ≥ 0.6pp with Brent ≥ $85 caps it at 0.55 (energy-shock gate); headline ≥ 3% caps at 0.7; core ≥ 3% caps at 0.25 (blocked). The block on monetisation is the war, not a wage-price spiral.",
      subInputs: [
        { key: "core", label: "Core CPI, y/y", value: fmt(i.coreYoY), unit: "%", source: "live", sourceName: "FRED CPILFESL",
          contribution: "The underlying-inflation term of the valve score. Core near 2% means the Fed CAN monetise the moment the energy gate clears." },
        { key: "headline", label: "Headline CPI, y/y", value: fmt(i.headlineYoY), unit: "%", source: "live", sourceName: "FRED CPIAUCSL",
          contribution: "Headline ≥ 3% partially gates the valve; the headline−core wedge measures how much of the problem is energy." },
        { key: "brent", label: "Brent crude, spot", value: fmt(i.brent), unit: "USD/bbl", source: "live", sourceName: "OANDA BCO_USD",
          contribution: "The live energy gate. Brent < $80 with headline < 3% reopens the valve within a quarter.",
          trendNote: "Hormuz reopening → Brent < 80 → headline collapses toward core." },
      ],
    },
    {
      key: "S7", ...meta("S7"), status: st(f.S7?.status),
      headline: `Gap g−rAvg ${fmt(f.S7?.gap, "pp")} · drift ${fmt(f.S7?.driftPerYear, "pp/yr")} · ~${fmt(f.S7?.monthsToCross, "m")} to cross · recession-crossed: ${String(f.S7?.stressedCrossed ?? "—")}`,
      logic: "Gap = nominal g − average interest rate on marketable debt. Drift = (10Y − rAvg) × 12-month rollover share, i.e. every roll drags the average toward the marginal rate. A payroll contraction knocks ~3pp off nominal g — with that haircut applied, the crossing is a recession EVENT, not a calendar projection.",
      subInputs: [
        { key: "ravg", label: "Average interest rate, total marketable", value: fmt(i.rAvg), unit: "%", source: "live", sourceName: "FiscalData avg_interest_rates",
          contribution: "The r side of the hinge. Rises mechanically as maturing stock rolls at marginal cost." },
        { key: "rmarg", label: "Marginal cost of debt (10Y)", value: fmt(i.rMarg), unit: "%", source: "live", sourceName: "FRED DGS10",
          contribution: "Sets the drift speed: the wider 10Y sits above rAvg, the faster the average ratchets up." },
        { key: "g", label: "Nominal GDP growth, y/y", value: fmt(i.gNominal), unit: "%", source: "live", sourceName: "FRED GDP",
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
        { key: "btc", label: "10Y bid-to-cover", value: fmt(f.S5?.lastBtc), unit: "ratio", source: "live", sourceName: "TreasuryDirect auctions",
          contribution: "Direct read on demand at the clearing price. Aug-26 10Y cleared 4.683% — highest since the GFC." },
        { key: "dealer", label: "Primary-dealer takedown", value: fmt(f.S5?.lastDealerPct), unit: "%", source: "live", sourceName: "TreasuryDirect auctions",
          contribution: "Heavy dealer share means end-investors stepped back and the street warehoused the supply." },
        { key: "foreign", label: "Foreign holdings", value: fmt(i.foreignHoldingsBn != null ? Math.round(i.foreignHoldingsBn) : null), unit: "USD bn", source: "live", sourceName: "FRED FDHBFIN",
          contribution: "The stock-side check. Share fell to 31% only because debt grew faster — the level rose $8.9→9.5trn. Rate constraint, not a buyers' strike." },
      ],
    },
    {
      key: "S3", ...meta("S3"), status: st(f.S3?.status),
      headline: `Interest consumes ${f.S3?.ratio != null ? (f.S3.ratio * 100).toFixed(1) : "—"}% of receipts (TTM $${fmt(i.ttmInterestBn)}bn / $${fmt(i.ttmReceiptsBn)}bn)`,
      logic: "TTM net interest ÷ TTM total receipts from the Monthly Treasury Statement. ≥17% = elevated; ≥20% = critical — the 20–25% band is the historic loss-of-discretion zone where interest starts crowding out policy choices (Tier-2 trigger).",
      subInputs: [
        { key: "interest", label: "Net interest, trailing 12 months", value: fmt(i.ttmInterestBn), unit: "USD bn", source: "live", sourceName: "FiscalData MTS table 9",
          contribution: "The compounding leg made literal: interest paid on debt that was itself borrowed." },
        { key: "receipts", label: "Total receipts, trailing 12 months", value: fmt(i.ttmReceiptsBn), unit: "USD bn", source: "live", sourceName: "FiscalData MTS table 9",
          contribution: "The denominator — the state's actual income against which the interest bill compounds." },
        { key: "ratio", label: "Interest / receipts", value: f.S3?.ratio != null ? (f.S3.ratio * 100).toFixed(1) : "—", unit: "%", source: "derived", sourceName: "computed",
          contribution: "The squeeze itself. Crossing 20% historically marks the point where fiscal discretion is lost." },
      ],
    },
    {
      key: "TAX", ...meta("TAX"), status: st(f.TAX?.status),
      headline: `Revenue beta ${fmt(f.TAX?.beta)} vs nominal growth ${fmt(i.gNominal, "%")}`,
      logic: "Beta = receipts y/y ÷ nominal GDP y/y. Beta < 0.8 = elevated: the GDP being printed is not taxing like normal GDP. AI-capex-led growth (and deficit-financed war supplementals) inflates g without a proportional revenue follow-through.",
      subInputs: [
        { key: "beta", label: "Revenue beta (receipts y/y ÷ GDP y/y)", value: fmt(f.TAX?.beta), unit: "ratio", source: "derived", sourceName: "FiscalData MTS + FRED GDP",
          contribution: "Below 0.8, every point of headline growth delivers less than a point of revenue — the deficit path is worse than g suggests." },
        { key: "g", label: "Nominal GDP growth, y/y", value: fmt(i.gNominal), unit: "%", source: "live", sourceName: "FRED GDP",
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
          contribution: "The flight asset. Record highs despite high real yields is the anomaly the decomposition explains." },
        { key: "mode", label: "Decomposition mode", value: String(f.SoV?.mode ?? "—"), source: "derived", sourceName: "XAU vs EUR/JPY numeraires",
          contribution: "Distinguishes a weak-dollar trade from a general exit: rising in every currency means the seller is sovereign credit itself." },
        { key: "diverge", label: "Real-yield divergence", value: f.SoV?.divergence ? "YES" : "no", source: "derived", sourceName: "FRED DFII10",
          contribution: "Gold up while 10Y real yields rise breaks the rate-hedge model — the store-of-value bid is about credit, not rates." },
      ],
    },
    {
      key: "JP", ...meta("JP"), status: st(f.JP?.status),
      headline: `Repatriation hits ${f.JP?.hits ?? 0}/3 (JGB yields, yen, TIC holdings level)`,
      logic: "Three-condition counter: JGB 10Y up ≥25bp over 3m (carry gap closing) + yen strengthening + Japanese Treasury holdings falling outright for 2 consecutive months. 3/3 = critical: the largest foreign creditor is taking money home.",
      subInputs: [
        { key: "hits", label: "Conditions met", value: `${f.JP?.hits ?? 0}/3`, source: "derived", sourceName: "FRED JGB 10Y + OANDA USD_JPY + TIC",
          contribution: "Each leg alone is noise; all three together are repatriation — the marginal foreign bid for Treasuries turning into supply." },
        { key: "tic", label: "Japan TIC holdings, 2m change", value: "—", unit: "USD bn", source: "manual", sourceName: "manual_inputs (TIC series id pending)",
          contribution: "The confirming leg: an ABSOLUTE decline (~$1.2trn stock) two months running, not a share-of-debt artefact. FRED TIC country series to be pinned; manual override until then." },
      ],
    },
  ];

  const triggers: any[] = snap.triggers ?? [];
  const asOf = (snap.asOf ?? "").slice(0, 16).replace("T", " ");

  return (
    <>
      <div className="topbar">
        <span className="topbar-logo">SOVEREIGN VITALS</span>
        <span className="topbar-sep">/</span>
        <span className="topbar-label">DALIO FRAMEWORK MONITOR · US</span>
        <div className="topbar-right">
          <div className="source-legend">
            {([["live", "var(--green)"], ["manual", "var(--amber)"], ["derived", "var(--purple)"], ["stale", "var(--red)"]] as const).map(([k, c]) => (
              <span className="source-dot" key={k}>
                <span className="source-dot-mark" style={{ background: c }} />
                {k.toUpperCase()}
              </span>
            ))}
          </div>
          <span className="topbar-ts">AS OF {asOf || "—"} UTC</span>
        </div>
      </div>

      <div className="sv-wrap">
        <section className="hero">
          <div>
            <div className="hero-label">BIG DEBT CYCLE POSITION</div>
            <div className="hero-stage">
              <span className="hero-stage-num">{stageNum}</span>
              <span className="hero-stage-denom">/ 7 STAGES</span>
              <span className="hero-stage-label">{stageText}</span>
            </div>
            <div>
              <div className="cycle-bar-labels">
                <span className="cycle-bar-label">S1 · HEALTHY MONEY</span>
                <span className="cycle-bar-label">S7 · NORMALISATION</span>
              </div>
              <div className="cycle-bar-track">
                <div className="cycle-bar-fill" style={{ width: `${(stageNum / 7) * 100}%` }} />
              </div>
              <div className="cycle-bar-ticks">
                {[1, 2, 3, 4, 5, 6, 7].map(n => (
                  <span className="cycle-bar-label" key={n} style={n === stageNum ? { color: "var(--red)", fontWeight: 700 } : undefined}>S{n}</span>
                ))}
              </div>
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
              <div className="kpi-value" style={{ color: (f.S3?.ratio ?? 0) >= 0.2 ? "var(--red)" : "var(--amber)" }}>
                {f.S3?.ratio != null ? `${(f.S3.ratio * 100).toFixed(1)}%` : "—"}
              </div>
              <div className="kpi-note">TTM · 20–25% = loss-of-discretion zone</div>
            </div>
            <div className="kpi-cell">
              <div className="kpi-label">FED DEFERRED ASSET</div>
              <div className="kpi-value" style={{ color: (i.defLevelBn ?? 0) <= -200 ? "var(--red)" : "var(--amber)" }}>${fmt(i.defLevelBn)}bn</div>
              <div className="kpi-note">Stage-5 metric · {f.deferred?.direction ?? "—"}</div>
            </div>
            <div className="kpi-cell">
              <div className="kpi-label">GOLD SPOT</div>
              <div className="kpi-value" style={{ color: "var(--text)" }}>${fmt(i.goldSpot)}</div>
              <div className="kpi-note">{f.SoV?.mode ?? "—"} · divergence: {String(f.SoV?.divergence ?? "—")}</div>
            </div>
          </div>
        </section>

        {snap.narrative && (
          <section className="narrative-section">
            <span className="narrative-toggle-label">WHAT CHANGED</span>
            <p className="narrative-body">{snap.narrative}</p>
          </section>
        )}

        <section className="section">
          <div className="section-header">
            <span className="section-title">TRIGGERS FIRED</span>
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

        <section className="section">
          <div className="section-header">
            <span className="section-title">FACTOR BOARD</span>
            <span className="section-count" style={{ color: "var(--text-faint)" }}>{factorRows.length} FACTORS · CLICK TO EXPAND</span>
          </div>
          <FactorBoard factors={factorRows} />
        </section>

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

        {snap.problems?.length > 0 && (
          <div className="problems-section" style={{ marginTop: 24 }}>
            <div className="problems-title">SOURCE PROBLEMS THIS RUN</div>
            {snap.problems.map((p: string) => <div className="problem-item" key={p}>{p}</div>)}
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
