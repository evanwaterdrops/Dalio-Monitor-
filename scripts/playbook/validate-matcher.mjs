// scripts/playbook/validate-matcher.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { fingerprintFromFactors } from "../../src/lib/playbook/fingerprint.mjs";
import { leaderboard } from "../../src/lib/playbook/match.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const J = (p) => JSON.parse(fs.readFileSync(path.join(HERE, p), "utf8"));
const results = J("../backtest/results.json");
const episodes = J("../../src/lib/playbook/episodes.json");
const fingerprints = J("../../src/lib/playbook/fingerprints.json");
const returns = J("../../src/lib/playbook/returns.json");
const monthly = J("returns-monthly.json");

const CORE = ["spx", "gold", "bond10", "cash"];
const mIdx = new Map(monthly.months.map((m, i) => [m, i]));

function fwd12Winner(fromYm) {
  const i0 = mIdx.get(fromYm);
  if (i0 == null || i0 + 12 >= monthly.months.length) return null;
  let best = null, bestR = -Infinity;
  for (const k of CORE) {
    let acc = 1, ok = true;
    for (let i = i0 + 1; i <= i0 + 12; i++) {
      const r = monthly.series[k][i];
      if (r == null) { ok = false; break; }
      acc *= 1 + r / 100;
    }
    if (ok && acc - 1 > bestR) { bestR = acc - 1; best = k; }
  }
  return best;
}
function analogH12Winner(epId) {
  const ep = episodes.find(e => e.id === epId);
  const h12 = returns.episodes[epId].anchors[ep.anchorMonth].horizons.h12;
  let best = null, bestR = -Infinity;
  for (const k of CORE) {
    const v = h12[k]?.nominal;
    if (v != null && v > bestR) { bestR = v; best = k; }
  }
  return best;
}
const inEpisodeYears = (epId, ymStr) => {
  const ep = episodes.find(e => e.id === epId);
  const y = Number(ymStr.slice(0, 4));
  const ys = ep.dateRange.match(/\d{4}/g).map(Number);
  return y >= ys[0] && y <= (ys[1] ?? ys[0]);
};

let n = 0, hit = 0, baseSpx = 0, basePersist = 0;
const perEpisode = {};
for (const rec of results) {
  const fp = fingerprintFromFactors({ factors: rec.factors, triggers: rec.triggers ?? [], headlineYoY: rec.inputs?.headlineYoY ?? null });
  const lb = leaderboard(fp, episodes, fingerprints).filter(r => (r.band === "strong" || r.band === "moderate") && !inEpisodeYears(r.id, rec.t));
  if (!lb.length) continue;
  const realized = fwd12Winner(rec.t);
  if (!realized) continue;
  const predicted = analogH12Winner(lb[0].id);
  if (!predicted) continue;
  n++;
  if (predicted === realized) hit++;
  if (realized === "spx") baseSpx++;
  // persistence baseline: trailing 12m winner
  const i0 = mIdx.get(rec.t);
  let tb = null, tbr = -Infinity;
  for (const k of CORE) {
    let acc = 1, ok = true;
    for (let i = i0 - 11; i <= i0; i++) { const r = monthly.series[k][i]; if (r == null) { ok = false; break; } acc *= 1 + r / 100; }
    if (ok && acc - 1 > tbr) { tbr = acc - 1; tb = k; }
  }
  if (tb === realized) basePersist++;
  perEpisode[lb[0].id] = (perEpisode[lb[0].id] ?? 0) + 1;
}

const pct = (x) => `${((x / n) * 100).toFixed(1)}%`;
const table = [
  `| Metric | Value |`, `|---|---|`,
  `| Months with an actionable (strong/moderate, non-self) top analog | ${n} of ${results.length} |`,
  `| Top-analog 12m-winner hit rate | ${pct(hit)} |`,
  `| Baseline: always S&P | ${pct(baseSpx)} |`,
  `| Baseline: trailing-12m winner persists | ${pct(basePersist)} |`,
  `| Top-analog usage | ${Object.entries(perEpisode).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}:${v}`).join(" · ")} |`,
].join("\n");
console.log(table);
fs.writeFileSync(path.join(HERE, "validation-stats.md"), table + "\n");
