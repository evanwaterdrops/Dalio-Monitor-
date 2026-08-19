"use client";
import { useCallback, useEffect, useRef, useState } from "react";

/** Compact month row emitted by scripts/backtest/score.mjs → src/data/backtest-panel.json */
export interface PanelMonth {
  t: string; h: number | null; hc: number | null; hs: number | null; f: number | null;
  s: number | null;            // SC status: 0 ok · 1 watch · 2 elevated · 3 critical
  ph: string | null;           // SC phase label
  tr: number;                  // top trigger tier fired (0 = none)
  trig: string[];
  rec: number;
  sahm: number; nfp: number | null; claims: number | null;
}

export const SC_STATUS_COLOR = ["var(--green)", "var(--blue)", "var(--amber)", "var(--red)"];
export const SC_STATUS_NAME = ["ok", "watch", "elevated", "critical"];

/** Dalio's seven phases (spec §1) — display-only cartography from
 * src/data/phase-bands.json, shared by ArchetypePanel and CenturyPanel so
 * the same phase reads the same way everywhere. */
export interface Band { from: string; to: string; phaseNum: number }

export const PHASE_NAMES: Record<number, string> = {
  1: "Early Part of the Cycle", 2: "Bubble", 3: "Top", 4: "Depression",
  5: "Beautiful Deleveraging", 6: "Pushing on a String", 7: "Normalization",
};
export const PHASE_COLOR: Record<number, string> = {
  1: "var(--green)", 2: "var(--amber-bright)", 3: "var(--red)", 4: "var(--purple)",
  5: "var(--blue)", 6: "var(--text-dim)", 7: "color-mix(in srgb, var(--blue) 45%, var(--green) 55%)",
};

const monthStartMs = (ym: string) => { const [y, m] = ym.split("-").map(Number); return Date.UTC(y, m - 1, 1); };
const monthEndMs = (ym: string) => { const [y, m] = ym.split("-").map(Number); return Date.UTC(y, m, 0, 23, 59, 59); };

/**
 * Phase-band `<rect>` layer for a time-scaled chart row. `xAt` maps an
 * epoch-ms timestamp to an SVG x coordinate over [0, W]; bands wholly
 * outside that range are skipped. Renders BEHIND whatever the caller draws
 * next (call this before the line/polyline).
 */
export function phaseBandRects(
  bands: Band[], xAt: (ms: number) => number, y: number, h: number, W: number,
  opts: { label?: boolean } = {},
) {
  const nodes: React.ReactNode[] = [];
  for (const b of bands) {
    const x1 = Math.max(0, xAt(monthStartMs(b.from)));
    const x2 = Math.min(W, xAt(monthEndMs(b.to)));
    if (x2 <= 0 || x1 >= W || x2 <= x1) continue;
    const color = PHASE_COLOR[b.phaseNum] ?? "var(--text-faint)";
    nodes.push(<rect key={b.from} x={x1} y={y} width={x2 - x1} height={h} fill={color} opacity={0.08} />);
    if (opts.label && x2 - x1 >= 34) {
      nodes.push(
        <text key={`${b.from}-lbl`} x={x1 + 3} y={y + 9} fontSize={8} fill={color} fontFamily="var(--mono)" letterSpacing="0.03em">
          {(PHASE_NAMES[b.phaseNum] ?? `PHASE ${b.phaseNum}`).toUpperCase()}
        </text>,
      );
    }
  }
  return nodes;
}

/** Collapse monthly phase bands into a per-year majority-phase map (years
 * outside the bands' coverage are simply absent — no band drawn for them). */
export function annualPhaseMap(bands: Band[]): Record<number, number> {
  const counts = new Map<number, Map<number, number>>();
  for (const b of bands) {
    let [y, m] = b.from.split("-").map(Number);
    const [ey, em] = b.to.split("-").map(Number);
    while (y < ey || (y === ey && m <= em)) {
      const yc = counts.get(y) ?? new Map<number, number>();
      yc.set(b.phaseNum, (yc.get(b.phaseNum) ?? 0) + 1);
      counts.set(y, yc);
      m++; if (m > 12) { m = 1; y++; }
    }
  }
  const out: Record<number, number> = {};
  for (const [y, yc] of counts) {
    let best = -1, bestCount = -1;
    for (const [p, c] of yc) if (c > bestCount) { best = p; bestCount = c; }
    out[y] = best;
  }
  return out;
}

/** One shared fixed-position tooltip per chart. */
export function useTooltip() {
  const [tip, setTip] = useState<{ x: number; y: number; html: React.ReactNode } | null>(null);
  const show = useCallback((e: { clientX: number; clientY: number }, html: React.ReactNode) => {
    setTip({ x: Math.min(e.clientX + 14, window.innerWidth - 230), y: Math.min(e.clientY + 14, window.innerHeight - 160), html });
  }, []);
  const hide = useCallback(() => setTip(null), []);
  const node = tip ? (
    <div className="chart-tooltip" style={{ left: tip.x, top: tip.y }}>{tip.html}</div>
  ) : null;
  return { show, hide, node };
}

/** NBER shading rects for a contiguous month array. */
export function recessionBands(months: { rec: number }[], xAt: (i: number) => number, y: number, h: number, bw = 0) {
  const rects: React.ReactNode[] = [];
  let start: number | null = null;
  for (let i = 0; i <= months.length; i++) {
    const on = i < months.length && months[i].rec === 1;
    if (on && start == null) start = i;
    if (!on && start != null) {
      const x1 = xAt(start) - bw / 2, x2 = xAt(i - 1) + bw / 2 + (bw ? 0 : 1);
      rects.push(<rect key={start} x={x1} y={y} width={Math.max(1, x2 - x1)} height={h} fill="var(--rec-band)" />);
      start = null;
    }
  }
  return rects;
}

/**
 * Horizontal scroller that starts pinned to the right edge (the present).
 * Charts mount inside a hidden tab (display:none → scrollWidth 0), so pin()
 * also re-fires whenever the scroller actually becomes visible.
 */
export function useRightPinnedScroll() {
  const ref = useRef<HTMLDivElement>(null);
  const pin = useCallback(() => {
    const el = ref.current;
    if (el && el.scrollWidth > el.clientWidth) el.scrollLeft = el.scrollWidth;
  }, []);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(entries => {
      if (entries.some(e => e.isIntersecting)) pin();
    });
    io.observe(el);
    return () => io.disconnect();
  }, [pin]);
  return { ref, pin };
}
