/**
 * Phase bands — Dalio's seven-phase cartography painted onto the monthly
 * replay, for the phase-shaded chart grammar (spec §5). This is DISPLAY-ONLY
 * cartography, not scoring: it does not feed any factor, trigger, or the
 * `bigCycleStage()` classifier. It exists purely so `ArchetypePanel` and the
 * extended `CenturyPanel` can shade a consistent phase band behind every
 * time series.
 *
 * Mapping rule (in priority order, evaluated per month from
 * scripts/backtest/results.json):
 *   1. small-cycle status === "critical" (a genuine contraction, per
 *      smallCyclePhase()/SC factor)                        → 4 Depression
 *   2. the 12 months immediately following the END of such a critical
 *      window (and not themselves critical, e.g. via a new window
 *      starting early) → 7 Normalization
 *   3. else, replayed stage text contains "DEPRESSION" or "DELEVERAGING" → 4 Depression
 *   4. else, replayed stage text contains "TOP"                          → 3 Top
 *   5. else — no stage text to lean on — bucket by heat tercile computed
 *      across the FULL replay (bottom third → 1 Early Part of the Cycle,
 *      middle third → 2 Bubble, top third → 3 Top).
 *
 * `bigCycleStage()` as currently implemented only ever returns "TOP, LATE"
 * or "DEPRESSION — printing begins" text (it has no historical debt-level
 * awareness — it's a live-conditions classifier applied uniformly across
 * the replay), so branch 5 is a documented no-op today; it stays in place
 * so this script keeps behaving correctly if bigCycleStage ever grows a
 * "Bubble"/"Early Part of the Cycle" stage string.
 *
 * Run: `node scripts/backtest/phase-bands.mjs` (no deps, plain Node).
 * Output: contiguous bands `[{ from: "YYYY-MM", to: "YYYY-MM", phaseNum }]`
 * written to src/data/phase-bands.json.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, "..", "..");

function buildBands(rows) {
  const n = rows.length;
  const isCritical = rows.map(r => r.factors?.SC?.status === "critical");

  // 12-month normalization window after each critical window's last month.
  const inPost = new Array(n).fill(false);
  for (let i = 0; i < n; i++) {
    if (isCritical[i] && !isCritical[i + 1]) {
      for (let k = 1; k <= 12 && i + k < n; k++) {
        if (!isCritical[i + k]) inPost[i + k] = true;
        // a fresh critical window starting inside these 12 months takes
        // priority automatically — isCritical is checked first below.
      }
    }
  }

  // Heat terciles across the full replay (branch 5 fallback).
  const heatsSorted = rows.map(r => r.heat ?? 0).slice().sort((a, b) => a - b);
  const q1 = heatsSorted[Math.floor(n / 3)];
  const q2 = heatsSorted[Math.floor((2 * n) / 3)];

  const phaseFor = (i) => {
    if (isCritical[i]) return 4;
    if (inPost[i]) return 7;
    const stage = rows[i].stage || "";
    if (stage.includes("DEPRESSION") || stage.includes("DELEVERAGING")) return 4;
    if (stage.includes("TOP")) return 3;
    const h = rows[i].heat ?? 0;
    return h <= q1 ? 1 : h <= q2 ? 2 : 3;
  };

  const bands = [];
  for (let i = 0; i < n; i++) {
    const phaseNum = phaseFor(i);
    const last = bands[bands.length - 1];
    if (last && last.phaseNum === phaseNum) last.to = rows[i].t;
    else bands.push({ from: rows[i].t, to: rows[i].t, phaseNum });
  }
  return bands;
}

export function phaseBands() {
  const rows = JSON.parse(readFileSync(path.join(HERE, "results.json"), "utf8"));
  const bands = buildBands(rows);

  const outDir = path.join(ROOT, "src", "data");
  mkdirSync(outDir, { recursive: true });
  writeFileSync(path.join(outDir, "phase-bands.json"), JSON.stringify(bands));
  console.log(`phase bands: ${bands.length} bands, ${rows[0].t} → ${rows[rows.length - 1].t} → src/data/phase-bands.json`);
  return bands;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  phaseBands();
}
