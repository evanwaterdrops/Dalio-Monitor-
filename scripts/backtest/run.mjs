/** Entry point: fetch → replay → score → phase bands → BACKTEST.md (+ century panel + UI data). */
import { replay } from "./replay.mjs";
import { score } from "./score.mjs";
import { century } from "./century.mjs";
import { phaseBands } from "./phase-bands.mjs";

await century();
const rows = await replay();
const s = await score(rows);
console.log("\nlead times (first touch; sustained):");
for (const r of s.leadRows) console.log(`  ${r.episode}: ${r.cells.join(" · ")}`);
console.log(`\nheat vs fwd-12m drawdown correlation: ${s.corr} (heat p75 = ${s.p75})`);
console.log(`SC critical: n=${s.scStats.critN} avg fwd12 ${s.scStats.critAvgFwd12}% | SC ok: n=${s.scStats.okN} avg fwd12 ${s.scStats.okAvgFwd12}%`);
console.log(`false alarms: ${s.falseAlarms.join(", ") || "none"}`);

// Regenerate src/data/phase-bands.json from the just-written results.json so the
// phase cartography can never silently desync from the replay it's painted onto.
phaseBands();
