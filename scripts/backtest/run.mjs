/** Entry point: fetch → replay → score → BACKTEST.md (+ century panel + UI data). */
import { replay } from "./replay.mjs";
import { score } from "./score.mjs";
import { century } from "./century.mjs";

await century();
const rows = await replay();
const s = await score(rows);
console.log("\nlead times (first touch; sustained):");
for (const r of s.leadRows) console.log(`  ${r.episode}: ${r.cells.join(" · ")}`);
console.log(`\nheat vs fwd-12m drawdown correlation: ${s.corr} (heat p75 = ${s.p75})`);
console.log(`SC critical: n=${s.scStats.critN} avg fwd12 ${s.scStats.critAvgFwd12}% | SC ok: n=${s.scStats.okN} avg fwd12 ${s.scStats.okAvgFwd12}%`);
console.log(`false alarms: ${s.falseAlarms.join(", ") || "none"}`);
