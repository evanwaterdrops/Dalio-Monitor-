"use client";
/**
 * Century context — annual big-cycle terrain, 1913 → present.
 * Final data, clearly labeled non-point-in-time; the monthly replay above
 * is the evidence, this is the map users zoom out into.
 */
import centuryJson from "@/data/century-panel.json";
import { useTooltip } from "./common";

interface YearRow {
  y: number; debtGdp: number | null; intRcptPct: number | null; rEff: number | null;
  gNom: number | null; rMinusG: number | null; cpiYoY: number | null;
  baaAaaBp: number | null; longRate: number | null; spxMaxDD: number | null; rec: number;
}
const YEARS = centuryJson as YearRow[];

const SERIES: {
  key: keyof YearRow; title: string; unit: string; color: string;
  domain: [number, number]; grid: number[]; note?: string;
}[] = [
  { key: "debtGdp", title: "FEDERAL DEBT / GDP", unit: "%", color: "var(--red)", domain: [0, 130], grid: [0, 60, 120], note: "WWII peak 106% → 2020s 120%+" },
  { key: "intRcptPct", title: "INTEREST / RECEIPTS", unit: "%", color: "var(--amber)", domain: [0, 40], grid: [0, 20, 40], note: "20% = loss-of-discretion zone" },
  { key: "rMinusG", title: "EFFECTIVE r − NOMINAL g", unit: "pp", color: "var(--purple)", domain: [-15, 10], grid: [-10, 0, 10], note: "the 1940s deleveraging ran r far below g" },
  { key: "cpiYoY", title: "CPI, Y/Y", unit: "%", color: "var(--blue)", domain: [-12, 18], grid: [-10, 0, 10], note: "inflation regimes gate the valve" },
  { key: "baaAaaBp", title: "BAA − AAA CREDIT SPREAD", unit: "bp", color: "var(--green)", domain: [0, 400], grid: [0, 200, 400], note: "1931 blowout · every crisis since" },
];

export default function CenturyPanel() {
  const { show, hide, node } = useTooltip();
  const W = 940, H = 84, PT = 6, PB = 14;
  const n = YEARS.length;
  const xAt = (i: number) => (i + 0.5) * (W / n);

  const hover = (e: React.MouseEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const i = Math.max(0, Math.min(n - 1, Math.floor(((e.clientX - r.left) / r.width) * n)));
    const yr = YEARS[i];
    show(e, (
      <>
        <div className="tt-head">{yr.y}{yr.rec ? " · RECESSION YEAR" : ""}</div>
        <div className="tt-row"><span>debt/GDP</span><b>{yr.debtGdp != null ? `${yr.debtGdp}%` : "—"}</b></div>
        <div className="tt-row"><span>interest/receipts</span><b>{yr.intRcptPct != null ? `${yr.intRcptPct}%` : "—"}</b></div>
        <div className="tt-row"><span>eff r − g</span><b>{yr.rMinusG != null ? `${yr.rMinusG}pp` : "—"}</b></div>
        <div className="tt-row"><span>CPI y/y</span><b>{yr.cpiYoY != null ? `${yr.cpiYoY}%` : "—"}</b></div>
        <div className="tt-row"><span>Baa−Aaa</span><b>{yr.baaAaaBp != null ? `${yr.baaAaaBp}bp` : "—"}</b></div>
        <div className="tt-row"><span>SPX max DD in year</span><b>{yr.spxMaxDD != null ? `${yr.spxMaxDD}%` : "—"}</b></div>
      </>
    ));
  };

  return (
    <div className="chart-block">
      <div className="chart-panel-title">A CENTURY OF THE BIG CYCLE · ANNUAL · 1913 → {YEARS[n - 1].y} · FINAL DATA (NOT POINT-IN-TIME)</div>
      {SERIES.map(s => {
        const yAt = (v: number) => PT + (1 - (v - s.domain[0]) / (s.domain[1] - s.domain[0])) * (H - PT - PB);
        const pts = YEARS.map((yr, i) => {
          const v = yr[s.key] as number | null;
          return v == null ? null : `${xAt(i).toFixed(1)},${yAt(Math.max(s.domain[0], Math.min(s.domain[1], v))).toFixed(1)}`;
        }).filter(Boolean).join(" ");
        return (
          <div key={s.key as string} className="century-row">
            <div className="century-label">
              <span style={{ color: s.color }}>{s.title}</span>
              <span className="century-note">{s.note}</span>
            </div>
            <svg viewBox={`0 0 ${W} ${H}`} width="100%" onMouseMove={hover} onMouseLeave={hide}
              role="img" aria-label={s.title}>
              {YEARS.map((yr, i) => yr.rec === 1 ? (
                <rect key={yr.y} x={xAt(i) - W / n / 2} y={PT} width={W / n} height={H - PT - PB} fill="var(--rec-band)" />
              ) : null)}
              {s.grid.map(g => (
                <line key={g} x1={0} x2={W} y1={yAt(g)} y2={yAt(g)} stroke="var(--grid-line)" strokeWidth={1} />
              ))}
              <polyline points={pts} fill="none" stroke={s.color} strokeWidth={1.4} strokeLinejoin="round" />
              {YEARS.map((yr, i) => yr.y % 20 === 0 ? (
                <text key={yr.y} x={xAt(i)} y={H - 3} fontSize={8.5} fill="var(--text-faint)" textAnchor="middle" fontFamily="var(--mono)">{yr.y}</text>
              ) : null)}
              <text x={W - 4} y={yAt(s.grid[s.grid.length - 1]) + 10} fontSize={8.5} fill="var(--text-faint)" textAnchor="end" fontFamily="var(--mono)">{s.grid[s.grid.length - 1]}{s.unit}</text>
            </svg>
          </div>
        );
      })}
      {node}
    </div>
  );
}
