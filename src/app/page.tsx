import { assess } from "@/lib/framework/assess";
import { latestSnapshot, recentAlerts } from "@/lib/db";
import { FACTOR_META } from "@/lib/config/series";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
export const revalidate = 0;

const chip = (s: string) =>
  s === "critical" ? "chip c-crit" : s === "elevated" ? "chip c-elev" : s === "watch" ? "chip c-watch" : "chip c-ok";

export default async function Page() {
  const snap = (await latestSnapshot()) ?? (await assess());
  const alerts = await recentAlerts(12);
  const f = snap.factors ?? {};
  const i = snap.inputs ?? {};

  const rows: [string, any, string][] = [
    ["SC", f.SC, `${f.SC?.phase ?? "—"} · 3mma ${i.nfp3mma}k · rev ${i.revisionsSum2m}k`],
    ["S8", f.S8, `${f.S8?.label ?? "—"} · core ${i.coreYoY}% / headline ${i.headlineYoY}% · Brent $${i.brent}`],
    ["S7", f.S7, `gap ${f.S7?.gap}pp · drift ${f.S7?.driftPerYear}pp/yr · cross ~${f.S7?.monthsToCross ?? "—"}m · recession-crossed: ${String(f.S7?.stressedCrossed)}`],
    ["S5", f.S5, `10Y BTC ${f.S5?.lastBtc ?? "—"} · dealer ${f.S5?.lastDealerPct ?? "—"}%`],
    ["S3", f.S3, `interest/receipts ${(f.S3?.ratio * 100).toFixed(1)}% (TTM $${i.ttmInterestBn}bn / $${i.ttmReceiptsBn}bn)`],
    ["TAX", f.TAX, `revenue beta ${f.TAX?.beta ?? "—"} vs nominal g ${i.gNominal}%`],
    ["SoV", f.SoV, `${f.SoV?.mode ?? "—"} · gold $${i.goldSpot} · real-yield divergence: ${String(f.SoV?.divergence)}`],
    ["JP", f.JP, `hits ${f.JP?.hits ?? 0}/3 (JGB, yen, TIC level)`],
  ];

  return (
    <main className="wrap">
      <header className="masthead">
        <div className="eyebrow">Sovereign vitals · live monitor</div>
        <h1>US position in the two debt cycles</h1>
        <div className="recordbar">
          <span>Stage: <b>{snap.stage?.stage ?? "—"}</b></span>
          <span>Deferred asset: <b>${i.defLevelBn}bn</b></span>
          <span>As of: <b>{(snap.asOf ?? "").slice(0, 16).replace("T", " ")} UTC</b></span>
        </div>
      </header>

      <section>
        <div className="sechead"><span className="idx">01</span><h2>Factor board</h2></div>
        <div className="board">
          {rows.map(([k, v, detail]) => (
            <div className="frow" key={k}>
              <div className="fname">{FACTOR_META[k]?.name ?? k}<span className="tag">{FACTOR_META[k]?.station}</span></div>
              <p>{detail}</p>
              <div className="fstatus"><span className={chip(v?.status ?? "watch")}>{v?.status ?? "—"}</span></div>
            </div>
          ))}
          <div className="frow">
            <div className="fname">Fed deferred asset<span className="tag">Stage-5 metric</span></div>
            <p>${i.defLevelBn}bn cumulative losses · {f.deferred?.direction}</p>
            <div className="fstatus"><span className={chip(f.deferred?.status ?? "watch")}>{f.deferred?.status}</span></div>
          </div>
        </div>
      </section>

      <section>
        <div className="sechead"><span className="idx">02</span><h2>Triggers fired</h2></div>
        {snap.triggers?.length ? (
          <ul className="alerts">{snap.triggers.map((t: any) => (
            <li key={t.key}><span className="tag">Tier {t.tier}</span> <b>{t.key}</b> — {t.detail}</li>
          ))}</ul>
        ) : <p className="muted">No machine-checkable triggers currently firing.</p>}
        {alerts.length > 0 && (
          <>
            <h3>Recent alert history</h3>
            <ul className="alerts hist">{alerts.map((a: any) => (
              <li key={a.id}><span className="tag">{(a.fired_at ?? "").slice(0, 10)}</span> {a.trigger_key}</li>
            ))}</ul>
          </>
        )}
      </section>

      {snap.narrative && (
        <section>
          <div className="sechead"><span className="idx">03</span><h2>What changed</h2></div>
          <p className="narr">{snap.narrative}</p>
        </section>
      )}

      {snap.problems?.length > 0 && (
        <section>
          <div className="sechead"><span className="idx">!</span><h2>Source problems this run</h2></div>
          <ul className="alerts">{snap.problems.map((p: string) => <li key={p}>{p}</li>)}</ul>
        </section>
      )}

      <footer>
        Sources: FRED/ALFRED · Treasury FiscalData · TreasuryDirect · OANDA · Yahoo · curated manual_inputs.
        Framework: Dalio, <i>How Countries Go Broke</i> (2025), as restated Aug-2026. Not investment advice.
      </footer>
    </main>
  );
}
