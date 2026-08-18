/**
 * Episode matcher. Weighted overlap over coarse fingerprint fields —
 * deliberately NOT nearest-neighbor on continuous values (guardrail 2).
 * Weights are fixed here and were set BEFORE validation (guardrail 4);
 * validate-matcher.mjs measures them, it does not tune them per-episode.
 */
import { STATUS_ORDER } from "./fingerprint.mjs";

// Recalibrated by validate-matcher.mjs (guardrail 4): at strong:65/moderate:50,
// 764/793 months (96.3%) had an actionable non-self top analog — near-vacuous.
// Raised moderate/strong to the max values the frozen band-unit assertions in
// test-match.mjs still permit (band(55)="moderate", band(70)="strong"). This
// is a partial mitigation, not a fix: ~75% of months (595/793) score exactly
// 100 against a small set of coarse-tier episodes (crash-1929, tightening-1937)
// regardless of threshold, because those episodes expose only 2 comparable
// categorical fields (cpiRegime, longRateDir) against a monthly-tier live
// fingerprint — matching both nails the 100 ceiling by construction of the
// applicable-field normalization. See PLAYBOOK.md honest-limits section.
export const BANDS = { strong: 70, moderate: 55, weak: 30 };

const W = { leg: 1, cpiRegime: 3, rvgSign: 2, scPhaseGroup: 2, triggers: 3, tag: 2, debtGdpBucket: 2, drawdownState: 1, longRateDir: 1, recession: 2 };

export function scoreFingerprints(live, ep) {
  let got = 0, applicable = 0;

  // Leg statuses with adjacency half-credit
  if (live.legs && ep.legs) {
    for (const k of Object.keys(ep.legs)) {
      if (live.legs[k] == null) continue;
      applicable += W.leg;
      const d = Math.abs(STATUS_ORDER.indexOf(live.legs[k]) - STATUS_ORDER.indexOf(ep.legs[k]));
      got += d === 0 ? W.leg : d === 1 ? W.leg / 2 : 0;
    }
  }

  const cat = (field, w) => {
    if (live[field] != null && ep[field] != null) { applicable += w; if (live[field] === ep[field]) got += w; }
  };
  cat("cpiRegime", W.cpiRegime);
  cat("rvgSign", W.rvgSign);
  cat("scPhaseGroup", W.scPhaseGroup);
  cat("debtGdpBucket", W.debtGdpBucket);
  cat("drawdownState", W.drawdownState);
  cat("longRateDir", W.longRateDir);
  cat("recession", W.recession);

  // Trigger overlap (Jaccard), only when both sides are monthly tier
  if (Array.isArray(live.triggerKeys) && Array.isArray(ep.triggerKeys)) {
    applicable += W.triggers;
    const a = new Set(live.triggerKeys), b = new Set(ep.triggerKeys);
    if (a.size === 0 && b.size === 0) got += W.triggers;
    else {
      const inter = [...a].filter(x => b.has(x)).length;
      const union = new Set([...a, ...b]).size;
      got += W.triggers * (union === 0 ? 1 : inter / union);
    }
  }

  // Tags: any tag present on either side is a comparison point
  const tagUniverse = new Set([...(live.tags ?? []), ...(ep.tags ?? [])]);
  for (const t of tagUniverse) {
    applicable += W.tag;
    if ((live.tags ?? []).includes(t) && (ep.tags ?? []).includes(t)) got += W.tag;
  }

  return { score: applicable === 0 ? 0 : Math.round((got / applicable) * 100), applicable };
}

export function band(score) {
  if (score >= BANDS.strong) return "strong";
  if (score >= BANDS.moderate) return "moderate";
  if (score >= BANDS.weak) return "weak";
  return null;
}

export function leaderboard(live, episodes, fingerprints) {
  return episodes
    .map(ep => {
      const fp = fingerprints[ep.id];
      const { score } = scoreFingerprints(live, fp);
      return { id: ep.id, name: ep.name, tier: ep.tier, score, band: band(score) };
    })
    .filter(r => r.band !== null)
    .sort((x, y) => y.score - x.score);
}
