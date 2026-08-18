import assert from "node:assert/strict";
import { scoreFingerprints, band, leaderboard, BANDS, MIN_APPLICABLE } from "../../src/lib/playbook/match.mjs";
import episodes from "../../src/lib/playbook/episodes.json" with { type: "json" };
import fingerprints from "../../src/lib/playbook/fingerprints.json" with { type: "json" };

// Identity: an episode matched against itself scores 100
const fp73 = fingerprints["oil-shock-1973"];
assert.equal(scoreFingerprints(fp73, fp73).score, 100);

// Adjacency half-credit: elevated vs critical on one leg costs half its weight, not all
const a = { tier: "monthly", legs: { SC: "elevated" }, scPhaseGroup: null, cpiRegime: null, rvgSign: null };
const b = { tier: "monthly", legs: { SC: "critical" }, scPhaseGroup: null, cpiRegime: null, rvgSign: null };
assert.equal(scoreFingerprints(a, b).score, 50);
const c = { ...a, legs: { SC: "ok" } };
assert.equal(scoreFingerprints(c, b).score, 0); // ok vs critical: distance 3, no credit

// Fields absent on either side are not applicable — a coarse episode is scored
// only on the coarse-comparable fields (tier comparability, spec §1)
const coarse = fingerprints["war-finance-1942"];
const liveish = { tier: "monthly", legs: { SC: "ok" }, scPhaseGroup: "expansion", cpiRegime: coarse.cpiRegime, rvgSign: coarse.rvgSign, debtGdpBucket: coarse.debtGdpBucket, longRateDir: coarse.longRateDir };
const s = scoreFingerprints(liveish, coarse);
assert.ok(s.score >= 80, `coarse match on shared fields should be high, got ${s.score}`);

// Bands
assert.equal(band(70), "strong");
assert.equal(band(55), "moderate");
assert.equal(band(35), "weak");
assert.equal(band(20), null);
assert.ok(BANDS.strong > BANDS.moderate && BANDS.moderate > BANDS.weak);

// Leaderboard is sorted, hides null band, carries name+tier
const lb = leaderboard(fp73, episodes, fingerprints);
assert.equal(lb[0].id, "oil-shock-1973");
assert.ok(lb.every((r, i) => i === 0 || lb[i - 1].score >= r.score));
assert.ok(lb.every(r => r.band !== null && r.name && r.tier));
// R6: a sparse fingerprint pair (few applicable fields) can still score a
// perfect 100 raw — scoreFingerprints() is unchanged — but MIN_APPLICABLE
// must keep it off the leaderboard.
const sparseLive = { tier: "monthly", cpiRegime: "moderate", longRateDir: "up" };
const sparseEp = { tier: "coarse", cpiRegime: "moderate", longRateDir: "up" };
const sparseScore = scoreFingerprints(sparseLive, sparseEp);
assert.equal(sparseScore.score, 100, "sparse pair should still raw-score 100");
assert.ok(sparseScore.applicable < MIN_APPLICABLE, `expected applicable < MIN_APPLICABLE(${MIN_APPLICABLE}), got ${sparseScore.applicable}`);
const sparseLb = leaderboard(
  sparseLive,
  [{ id: "sparse-fake", name: "Sparse fake", tier: "coarse" }],
  { "sparse-fake": sparseEp },
);
assert.equal(sparseLb.length, 0, "sparse high-score episode must be excluded from leaderboard despite a perfect raw score");

console.log("match tests OK");
