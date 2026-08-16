"use client";
/**
 * Small Cycle tab — the labor cycle in real time: payroll momentum bars
 * colored by the small-cycle status, with the Sahm gap and its 0.5 line.
 * Same point-in-time panel the Big Cycle timeline uses.
 */
import { useEffect, useState } from "react";
import panelJson from "@/data/backtest-panel.json";
import { PanelMonth, SC_STATUS_COLOR, SC_STATUS_NAME, useTooltip, recessionBands, useRightPinnedScroll } from "./common";

const PANEL = (panelJson as PanelMonth[]).filter(m => m.s != null);

const WINDOWS = [
  { key: "5Y", ppm: 14 },
  { key: "10Y", ppm: 7 },
  { key: "20Y", ppm: 3.5 },
  { key: "MAX", ppm: 0 },
] as const;

export default function CycleTimeline() {
  const [win, setWin] = useState<(typeof WINDOWS)[number]["key"]>("10Y");
  const { show, hide, node } = useTooltip();
  const { ref, pin } = useRightPinnedScroll();

  const months = PANEL;
  const n = months.length;
  const w = WINDOWS.find(x => x.key === win)!;
  const fit = w.ppm === 0 || n * w.ppm < 940;
  const width = fit ? 940 : Math.round(n * w.ppm);
  const effPpm = width / n;
  const H1 = 130, H2 = 100, PT = 8, PB = 16;

  useEffect(() => { if (!fit) pin(); }, [win, fit, pin]);

  const xAt = (i: number) => i * effPpm + effPpm / 2;
  const NFP_CAP = 400;
  const yNfp = (v: number) => {
    const c = Math.max(-NFP_CAP, Math.min(NFP_CAP, v));
    return PT + (1 - (c + NFP_CAP) / (2 * NFP_CAP)) * (H1 - PT - PB);
  };
  const ySahm = (v: number) => PT + (1 - Math.min(v, 2.5) / 2.5) * (H2 - PT - PB);

  const sahmPts = months.map((m, i) => `${xAt(i).toFixed(1)},${ySahm(m.sahm).toFixed(1)}`).join(" ");
  const yearStep = effPpm >= 7 ? 1 : effPpm >= 3 ? 3 : 10;

  const hover = (e: React.MouseEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const i = Math.max(0, Math.min(n - 1, Math.floor(((e.clientX - r.left) / r.width) * n)));
    const m = months[i];
    show(e, (
      <>
        <div className="tt-head">{m.t}{m.rec ? " · NBER RECESSION" : ""}</div>
        <div className="tt-row"><span>phase</span><b>{m.ph}</b></div>
        <div className="tt-row"><span>status</span><b>{m.s != null ? SC_STATUS_NAME[m.s] : "—"}</b></div>
        <div className="tt-row"><span>NFP 3mma</span><b>{m.nfp != null ? `${m.nfp}k` : "—"}</b></div>
        <div className="tt-row"><span>Sahm gap</span><b>{m.sahm}</b></div>
        <div className="tt-row"><span>claims y/y</span><b>{m.claims != null ? `${m.claims}%` : "—"}</b></div>
      </>
    ));
  };

  return (
    <div className="chart-block">
      <div className="chart-controls">
        <div className="chart-window-btns">
          {WINDOWS.map(x => (
            <button key={x.key} className={`chart-btn${win === x.key ? " active" : ""}`} onClick={() => setWin(x.key)}>{x.key}</button>
          ))}
        </div>
        <span className="chart-legend-note">real-time vintages, {PANEL[0].t} → {PANEL[n - 1].t} · bar color = phase status</span>
      </div>
      <div className="chart-scroller" ref={ref} style={fit ? { overflowX: "hidden" } : undefined}>
        <div style={{ width: fit ? "100%" : width }}>
          <div className="chart-panel-title">PAYROLLS 3MMA · k/month (±{NFP_CAP} clip)</div>
          <svg viewBox={`0 0 ${width} ${H1}`} width="100%" height={H1} preserveAspectRatio="none"
            onMouseMove={hover} onMouseLeave={hide} role="img" aria-label="Payroll momentum, colored by small-cycle status">
            {recessionBands(months, xAt, PT, H1 - PT - PB)}
            <line x1={0} x2={width} y1={yNfp(0)} y2={yNfp(0)} stroke="var(--grid-line)" strokeWidth={1} />
            {months.map((m, i) => m.nfp == null ? null : (
              <rect key={m.t} x={xAt(i) - effPpm / 2 + 0.5} width={Math.max(0.8, effPpm - 1)}
                y={Math.min(yNfp(0), yNfp(m.nfp))} height={Math.max(1, Math.abs(yNfp(m.nfp) - yNfp(0)))}
                fill={SC_STATUS_COLOR[m.s!]} opacity={0.85} />
            ))}
            {months.map((m, i) => {
              const yy = m.t.slice(0, 4);
              return m.t.endsWith("-01") && Number(yy) % yearStep === 0 ? (
                <text key={m.t} x={xAt(i)} y={H1 - 4} fontSize={9} fill="var(--text-faint)" textAnchor="middle" fontFamily="var(--mono)">{yy}</text>
              ) : null;
            })}
          </svg>
          <div className="chart-panel-title" style={{ marginTop: 8 }}>SAHM GAP · pp · 0.5 = RECESSION LINE (DEMAND-CONFIRMED IN v2.1)</div>
          <svg viewBox={`0 0 ${width} ${H2}`} width="100%" height={H2} preserveAspectRatio="none"
            onMouseMove={hover} onMouseLeave={hide} role="img" aria-label="Sahm gap">
            {recessionBands(months, xAt, PT, H2 - PT - PB)}
            <line x1={0} x2={width} y1={ySahm(0.5)} y2={ySahm(0.5)} stroke="var(--red)" strokeWidth={1} strokeDasharray="4 3" opacity={0.5} />
            <line x1={0} x2={width} y1={ySahm(0)} y2={ySahm(0)} stroke="var(--grid-line)" strokeWidth={1} />
            <polyline points={sahmPts} fill="none" stroke="var(--text-dim)" strokeWidth={1.4} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
          </svg>
        </div>
      </div>
      <div className="chart-legend">
        {SC_STATUS_NAME.map((s, i) => (
          <span key={s}><span className="chart-swatch" style={{ background: SC_STATUS_COLOR[i] }} /> {s.toUpperCase()}</span>
        ))}
        <span><span className="chart-swatch chart-swatch-band" /> NBER RECESSION</span>
      </div>
      {node}
    </div>
  );
}
