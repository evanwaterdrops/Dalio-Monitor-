// scripts/playbook/extract-fingerprints.mjs
// Regenerates src/lib/playbook/fingerprints.json from the backtest artifacts.
// Fingerprints are EXTRACTED, never asserted (spec guardrail 1). Run:
//   node scripts/playbook/extract-fingerprints.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { fingerprintFromFactors, coarseFingerprint } from "../../src/lib/playbook/fingerprint.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const read = (p) => JSON.parse(fs.readFileSync(path.join(HERE, p), "utf8"));
const results = read("../backtest/results.json");            // array of monthly records
const century = read("../backtest/century-panel.json");      // array of annual rows
const episodes = read("../../src/lib/playbook/episodes.json");

// Optional oil series (present after Task 3); y/y % by "YYYY-MM".
const oilYoY = (() => {
  const f = path.join(HERE, "data/wtisplc.csv");
  if (!fs.existsSync(f)) return () => null;
  const rows = fs.readFileSync(f, "utf8").trim().split("\n").slice(1)
    .map(l => l.split(","))
    .map(([d, v]) => [d.slice(0, 7), Number(v)])
    .filter(([, v]) => Number.isFinite(v));
  const byMonth = new Map(rows);
  const yoyAt = (ym) => {
    const [y, m] = ym.split("-").map(Number);
    const prev = `${y - 1}-${String(m).padStart(2, "0")}`;
    const now = byMonth.get(ym), then = byMonth.get(prev);
    return now != null && then != null && then !== 0 ? ((now - then) / then) * 100 : null;
  };
  // WTISPLC ("Spliced WTI Crude Oil Price") is an administered/posted price
  // through the early 1970s: it moves in discrete official-price steps
  // rather than continuously. A supply shock that BEGINS in one month (the
  // Oct-1973 embargo) can only show up in this series once the posted
  // price is reset a few months later (the Jan-1974 OPEC hike to ~$10.11,
  // +184% y/y — documented history). Take the max y/y reading over the
  // anchor month and the following 3 months so the fingerprint captures
  // the shock the episode's own window covers, not just the month the
  // embargo was announced. Still purely extracted from the price series —
  // never asserted.
  return (ym) => {
    const [y0, m0] = ym.split("-").map(Number);
    let best = null;
    for (let i = 0; i <= 3; i++) {
      const t = y0 * 12 + (m0 - 1) + i;
      const cursor = `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, "0")}`;
      const v = yoyAt(cursor);
      if (v != null && (best == null || v > best)) best = v;
    }
    return best;
  };
})();

const byMonth = new Map(results.map(r => [r.t, r]));
const byYear = new Map(century.map(r => [r.y, r]));
const out = {};

for (const ep of episodes) {
  if (ep.tier === "monthly") {
    const rec = byMonth.get(ep.anchorMonth);
    if (!rec) throw new Error(`no backtest record for ${ep.id} anchor ${ep.anchorMonth}`);
    // longRateDelta12mBp from the panel's annual longRate (sufficient for a coarse direction)
    const y = Number(ep.anchorMonth.slice(0, 4));
    const lr = byYear.get(y)?.longRate, lrPrev = byYear.get(y - 1)?.longRate;
    out[ep.id] = fingerprintFromFactors({
      factors: rec.factors, triggers: rec.triggers ?? [],
      headlineYoY: rec.inputs?.headlineYoY ?? null,
      debtGdpPct: byYear.get(y)?.debtGdp ?? null,
      oilYoYPct: oilYoY(ep.anchorMonth),
      longRateDelta12mBp: lr != null && lrPrev != null ? (lr - lrPrev) * 100 : null,
    });
  } else {
    const y = Number(ep.anchorMonth.slice(0, 4));
    const row = byYear.get(y), prev = byYear.get(y - 1);
    if (!row) throw new Error(`no century row for ${ep.id} year ${y}`);
    out[ep.id] = coarseFingerprint({
      cpiYoY: row.cpiYoY, rMinusG: row.rMinusG, debtGdp: row.debtGdp,
      spxMaxDD: row.spxMaxDD, rec: row.rec,
      longRateDeltaPp: row.longRate != null && prev?.longRate != null ? row.longRate - prev.longRate : null,
      oilYoYPct: oilYoY(ep.anchorMonth),
    });
  }
}

fs.writeFileSync(path.join(HERE, "../../src/lib/playbook/fingerprints.json"), JSON.stringify(out, null, 1));
console.log(`wrote fingerprints for ${Object.keys(out).length} episodes`);
