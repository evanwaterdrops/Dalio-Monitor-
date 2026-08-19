/**
 * Dalio's seven phases (spec §1) — display-only cartography from
 * src/data/phase-bands.json.
 *
 * Deliberately NOT a `"use client"` module. The page (a Server Component)
 * labels the current stage from PHASE_NAMES while the chart components render
 * the same names and colours on the client, so these constants have to sit on
 * the boundary-neutral side: anything exported from a `"use client"` file is a
 * client-reference proxy on the server, not the value itself, and reading a
 * key off it produces an unresolvable reference that 500s at request time.
 */

export interface Band { from: string; to: string; phaseNum: number }

export const PHASE_NAMES: Record<number, string> = {
  1: "Early Part of the Cycle", 2: "Bubble", 3: "Top", 4: "Depression",
  5: "Beautiful Deleveraging", 6: "Pushing on a String", 7: "Normalization",
};

export const PHASE_COLOR: Record<number, string> = {
  1: "var(--green)", 2: "var(--amber-bright)", 3: "var(--red)", 4: "var(--purple)",
  5: "var(--blue)", 6: "var(--text-dim)", 7: "color-mix(in srgb, var(--blue) 45%, var(--green) 55%)",
};
