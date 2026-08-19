"use client";
/**
 * Archetype — Dalio's own chart grammar (spec §5): one long time axis per
 * metric, the seven phases shaded behind the line, %GDP/indexed framing.
 * Fast series come from the FactorBoard's live sources, slow series from
 * the position layer; both are fetched server-side in page.tsx and passed
 * in as props — this component only draws.
 */
import { phaseBandRects, useTooltip } from "./common";
import { type Band, PHASE_COLOR, PHASE_NAMES } from "./phases";

interface Pt { date: string; value: number }

const ROWS: { key: string; title: string; unit: string; color: string }[] = [
  { key: "totalDebtGdp", title: "TOTAL DEBT / GDP", unit: "%", color: "var(--red)" },
  { key: "dsrHousehold", title: "DEBT SERVICE / INCOME · HOUSEHOLD", unit: "%", color: "var(--amber)" },
  { key: "moneyGdp", title: "MONEY (M2) / GDP", unit: "%", color: "var(--blue)" },
  { key: "equityIndexed", title: "EQUITY, INDEXED TO FIRST VALUE", unit: "", color: "var(--green)" },
  { key: "gold", title: "GOLD", unit: "/oz", color: "var(--purple)" },
  { key: "shortRate3mo", title: "SHORT RATE · 3M", unit: "%", color: "var(--amber-bright)" },
  { key: "curveSpread", title: "CURVE SPREAD · 10Y − 3M", unit: "pp", color: "var(--text-dim)" },
];

const fmtNum = (v: number) => (Math.abs(v) >= 100 ? v.toFixed(0) : v.toFixed(v >= 10 || v <= -10 ? 1 : 2));

export default function ArchetypePanel({ series, bands }: { series: Record<string, Pt[]>; bands: Band[] }) {
  const { show, hide, node } = useTooltip();
  const W = 940, H = 84, PT = 6, PB = 14;

  return (
    <div className="chart-block">
      <div className="chart-panel-title">THE ARCHETYPAL BIG DEBT CYCLE · DALIO'S SEVEN PHASES SHADED BEHIND EACH SERIES</div>
      {ROWS.map(r => {
        const raw = (series?.[r.key] ?? []).filter(p => p && Number.isFinite(p.value) && p.date);
        const pts = raw.slice().sort((a, b) => a.date.localeCompare(b.date));

        if (pts.length < 2) {
          return (
            <div key={r.key} className="century-row">
              <div className="century-label">
                <span style={{ color: r.color }}>{r.title}</span>
                <span className="century-note">no data this run</span>
              </div>
              <div className="archetype-nodata">NO DATA</div>
            </div>
          );
        }

        const minT = new Date(pts[0].date).getTime();
        const maxT = new Date(pts[pts.length - 1].date).getTime();
        const span = Math.max(1, maxT - minT);
        const xAtT = (ms: number) => ((ms - minT) / span) * W;

        const vals = pts.map(p => p.value);
        const vMinRaw = Math.min(...vals), vMaxRaw = Math.max(...vals);
        const padBase = vMaxRaw - vMinRaw || Math.abs(vMaxRaw) || 1;
        const pad = padBase * 0.1;
        const vMin = vMinRaw - pad, vMax = vMaxRaw + pad;
        const yAt = (v: number) => PT + (1 - (v - vMin) / (vMax - vMin)) * (H - PT - PB);

        const linePts = pts.map(p => `${xAtT(new Date(p.date).getTime()).toFixed(1)},${yAt(p.value).toFixed(1)}`).join(" ");
        const gridVals = [vMinRaw, (vMinRaw + vMaxRaw) / 2, vMaxRaw];

        const hover = (e: React.MouseEvent<SVGSVGElement>) => {
          const rct = e.currentTarget.getBoundingClientRect();
          const frac = Math.max(0, Math.min(1, (e.clientX - rct.left) / rct.width));
          const targetT = minT + frac * span;
          let best = 0, bestDiff = Infinity;
          for (let i = 0; i < pts.length; i++) {
            const d = Math.abs(new Date(pts[i].date).getTime() - targetT);
            if (d < bestDiff) { bestDiff = d; best = i; }
          }
          const p = pts[best];
          const ym = p.date.slice(0, 7);
          const band = bands.find(b => ym >= b.from && ym <= b.to);
          show(e, (
            <>
              <div className="tt-head">{p.date}</div>
              <div className="tt-row"><span>{r.title.toLowerCase()}</span><b>{fmtNum(p.value)}{r.unit}</b></div>
              {band && <div className="tt-row"><span>phase</span><b>{PHASE_NAMES[band.phaseNum] ?? band.phaseNum}</b></div>}
            </>
          ));
        };

        return (
          <div key={r.key} className="century-row">
            <div className="century-label">
              <span style={{ color: r.color }}>{r.title}</span>
              <span className="century-note">{pts[0].date.slice(0, 7)} → {pts[pts.length - 1].date.slice(0, 7)}</span>
            </div>
            <svg viewBox={`0 0 ${W} ${H}`} width="100%" onMouseMove={hover} onMouseLeave={hide}
              role="img" aria-label={r.title}>
              {phaseBandRects(bands, xAtT, PT, H - PT - PB, W, { label: true })}
              {gridVals.map((g, gi) => (
                <line key={gi} x1={0} x2={W} y1={yAt(g)} y2={yAt(g)} stroke="var(--grid-line)" strokeWidth={1} />
              ))}
              <polyline points={linePts} fill="none" stroke={r.color} strokeWidth={1.4} strokeLinejoin="round" />
              <text x={W - 4} y={yAt(gridVals[2]) + 10} fontSize={8.5} fill="var(--text-faint)" textAnchor="end" fontFamily="var(--mono)">{fmtNum(gridVals[2])}{r.unit}</text>
            </svg>
          </div>
        );
      })}
      <div className="chart-legend">
        {Object.entries(PHASE_NAMES).map(([num, name]) => (
          <span key={num}><span className="chart-swatch" style={{ background: PHASE_COLOR[Number(num)] }} /> {name.toUpperCase()}</span>
        ))}
        <span className="chart-legend-note">display-only cartography from the monthly replay, not a scoring input</span>
      </div>
      {node}
    </div>
  );
}
