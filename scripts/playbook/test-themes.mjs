import assert from "node:assert/strict";
import themes from "../../src/lib/playbook/themes.json" with { type: "json" };
import { evalTripwires } from "../../src/lib/playbook/theme-eval.mjs";

const CHECKLIST_STATES = new Set(["matched", "partial", "notObserved"]);
const FIGURE_FLAGS = new Set(["verified", "corrected", "unverified"]);

assert.ok(Array.isArray(themes), "themes.json must export an array");
assert.ok(themes.length >= 1, "at least one theme (Dark Fiber) must be present");

const darkFiber = themes.find(t => t.id === "dark-fiber");
assert.ok(darkFiber, "dark-fiber theme must be present");
assert.equal(darkFiber.lens, "theme");

// --- Tripwires: exactly 4, exactly one live:true ---
assert.equal(darkFiber.tripwires.length, 4, "exactly 4 tripwires");
const liveCount = darkFiber.tripwires.filter(t => t.live === true).length;
assert.equal(liveCount, 1, "exactly one tripwire must be live:true");
const liveTripwire = darkFiber.tripwires.find(t => t.live === true);
assert.equal(liveTripwire.id, "hy_transmission");
assert.ok(liveTripwire.threshold && liveTripwire.threshold.length > 0);

// --- Checklist: 8 phases, states in enum ---
assert.equal(darkFiber.checklist.length, 8, "8-phase checklist");
for (const item of darkFiber.checklist) {
  assert.ok(CHECKLIST_STATES.has(item.state), `invalid checklist state: ${item.state}`);
  assert.ok(item.label && item.label.length > 0, `checklist item ${item.id} needs a label`);
  assert.ok(item.note && item.note.length > 0, `checklist item ${item.id} needs a note`);
}

// --- Figures: flags in enum, at least one unverified present ---
assert.ok(darkFiber.figures.length > 0, "figures array must not be empty");
for (const fig of darkFiber.figures) {
  assert.ok(FIGURE_FLAGS.has(fig.flag), `invalid figure flag: ${fig.flag}`);
  assert.ok(fig.text && fig.text.length > 0, "figure must have text");
}
const unverifiedCount = darkFiber.figures.filter(f => f.flag === "unverified").length;
assert.ok(unverifiedCount >= 1, "at least one unverified figure must be carried, not dropped");
assert.equal(unverifiedCount, 4, "ledger specifies exactly four unverified figures");

const correctedCount = darkFiber.figures.filter(f => f.flag === "corrected").length;
assert.ok(correctedCount >= 1, "corrected figures must be present");
const verifiedCount = darkFiber.figures.filter(f => f.flag === "verified").length;
assert.ok(verifiedCount >= 1, "verified figures must be present");

// --- historicalParallels ---
assert.ok(Array.isArray(darkFiber.historicalParallels));
const telecomParallels = darkFiber.historicalParallels.filter(p => p.returnsKey === "dotcom-2000");
assert.ok(telecomParallels.length >= 2, "telecom parallel needs both the 2000-03 and 1998-10 anchors");
const anchorMonths = telecomParallels.map(p => p.anchorMonth).sort();
assert.deepEqual(anchorMonths, ["1998-10", "2000-03"]);
for (const p of telecomParallels) {
  assert.ok(p.name.includes("Telecom") || p.name.includes("dot-com"));
}
const nameOnly = darkFiber.historicalParallels.filter(p => !p.returnsKey);
assert.ok(nameOnly.some(p => /1920s/.test(p.name)), "1920s electrification parallel present");
assert.ok(nameOnly.some(p => /1840s/.test(p.name)), "1840s railway mania parallel present");

// --- positionLabel / activeSince ---
assert.equal(darkFiber.activeSince, "2023");
assert.equal(darkFiber.positionLabel, "Phase 6 of 8 · phase 7 beginning in two issuers (as of Aug 2026)");

// --- evalTripwires firing logic ---
const r1 = evalTripwires(darkFiber, { hyOasBp: 500, hyOasDelta3mBp: 30 });
const hy1 = r1.find(r => r.id === "hy_transmission");
assert.equal(hy1.state, "fired", "500bp + widening 3m should fire");

const r2 = evalTripwires(darkFiber, { hyOasBp: 500, hyOasDelta3mBp: -10 });
const hy2 = r2.find(r => r.id === "hy_transmission");
assert.equal(hy2.state, "armed", "500bp but tightening 3m should stay armed");

const r3 = evalTripwires(darkFiber, { hyOasBp: 300, hyOasDelta3mBp: 80 });
const hy3 = r3.find(r => r.id === "hy_transmission");
assert.equal(hy3.state, "armed", "below 450bp should stay armed regardless of delta");

const r4 = evalTripwires(darkFiber, { hyOasBp: null, hyOasDelta3mBp: null });
const hy4 = r4.find(r => r.id === "hy_transmission");
assert.equal(hy4.state, "stale", "null hyOasBp should render stale");

// Non-live tripwires always render as manual armed watch items
for (const res of r1) {
  if (res.id !== "hy_transmission") assert.equal(res.state, "armed");
}
assert.equal(r1.length, 4);

console.log("theme tests OK");
