import assert from "node:assert/strict";
import { fingerprintFromFactors, coarseFingerprint, cpiRegime } from "../../src/lib/playbook/fingerprint.mjs";

// CPI regime bucketing
assert.equal(cpiRegime(-1.2), "deflation");
assert.equal(cpiRegime(1.5), "low");
assert.equal(cpiRegime(3.4), "moderate");
assert.equal(cpiRegime(6.0), "high");
assert.equal(cpiRegime(11.0), "extreme");
assert.equal(cpiRegime(null), null);

// Monthly fingerprint from a backtest-results-shaped record (2003-10 real shape)
const fp = fingerprintFromFactors({
  factors: {
    SC: { phase: "jobless-recovery-stall", status: "elevated" },
    S8: { label: "open", status: "watch" }, S6: { status: "ok" }, PC: null,
    S7: { gap: 1.25, status: "watch" }, SoV: { status: "elevated" },
    S5: { status: "elevated" }, S3: { status: "watch" }, TAX: { status: "elevated" },
    JP: { status: "watch" }, deferred: { status: "ok" },
  },
  triggers: [{ tier: 2, key: "long_end_selloff_on_easing" }],
  headlineYoY: 2.27, debtGdpPct: 60.1, oilYoYPct: 12, longRateDelta12mBp: 40,
});
assert.equal(fp.tier, "monthly");
assert.equal(fp.legs.SC, "elevated");
assert.equal(fp.legs.PC, undefined);          // null leg → absent, not "ok"
assert.equal(fp.scPhaseGroup, "stall");
assert.equal(fp.cpiRegime, "moderate");
assert.equal(fp.rvgSign, "gGreater");          // S7.gap = g − rAvg > 0
assert.deepEqual(fp.triggerKeys, ["long_end_selloff_on_easing"]);
assert.deepEqual(fp.tags, []);                 // oil y/y 12% < 50% → no shock tag
assert.equal(fp.debtGdpBucket, "60-90");
assert.equal(fp.longRateDir, "up");

// Oil-shock tag fires at ≥ +50% y/y
const hot = fingerprintFromFactors({ factors: { SC: { phase: "mid-expansion", status: "ok" } }, triggers: [], headlineYoY: 8.5, oilYoYPct: 180 });
assert.deepEqual(hot.tags, ["energy_supply_shock"]);
assert.equal(hot.cpiRegime, "extreme");

// Coarse fingerprint from a century-panel-shaped row
const c = coarseFingerprint({ cpiYoY: 9.9, rMinusG: -4.0, debtGdp: 108, spxMaxDD: -10, longRateDeltaPp: 0.2, rec: 0 });
assert.equal(c.tier, "coarse");
assert.equal(c.cpiRegime, "extreme");          // 9.9 ≥ 8
assert.equal(c.rvgSign, "gGreater");           // rMinusG < 0 ⇒ g > r
assert.equal(c.debtGdpBucket, ">90");
assert.equal(c.drawdownState, false);          // −10% shallower than −15%
assert.equal(c.longRateDir, "up");
assert.equal(c.recession, false);

console.log("fingerprint tests OK");
