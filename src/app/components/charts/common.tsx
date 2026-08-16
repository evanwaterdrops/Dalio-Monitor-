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
