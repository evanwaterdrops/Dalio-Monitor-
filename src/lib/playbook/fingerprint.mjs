/**
 * Playbook fingerprints — the FROZEN feature set (spec guardrail 1).
 * Pure functions, no I/O. Both the live matcher (via assess.ts) and the
 * extraction script (over backtest results) call these, so an episode is
 * fingerprinted by exactly the math the dashboard runs. Coarse states only
 * (guardrail 2): buckets, never continuous distances.
 */

export const STATUS_ORDER = ["ok", "watch", "elevated", "critical"];

export const CPI_REGIMES = [
  { name: "deflation", max: 0 },
  { name: "low", max: 2 },
  { name: "moderate", max: 4 },
  { name: "high", max: 8 },
  { name: "extreme", max: Infinity },
];

export function cpiRegime(yoy) {
  if (yoy == null || !Number.isFinite(yoy)) return null;
  return CPI_REGIMES.find(r => yoy < r.max).name;
}

// Every return value of smallCyclePhase() in framework/math.mjs, grouped.
export const SC_PHASE_GROUPS = {
  "contraction": "contraction",
  "late-stall-breaking-down": "contraction",
  "jobless-recovery-stall": "stall",
  "late-expansion-stalling": "stall",
  "supply-side-unemployment-rise": "stall",
  "easing-into-expansion": "recovery",
  "mid-expansion": "expansion",
};

const LEG_KEYS = ["SC", "S8", "S6", "S7", "SoV", "S5", "S3", "TAX", "JP", "PC", "deferred"];

function debtGdpBucket(pct) {
  if (pct == null || !Number.isFinite(pct)) return null;
  return pct < 60 ? "<60" : pct <= 90 ? "60-90" : ">90";
}

// The only tag vocabulary. Each tag MUST be computable from a live reading
// (spec guardrail 1) — energy_supply_shock ⇐ oil spot y/y ≥ +50%.
function tagsFrom({ oilYoYPct }) {
  const tags = [];
  if (oilYoYPct != null && oilYoYPct >= 50) tags.push("energy_supply_shock");
  return tags;
}

export function fingerprintFromFactors({ factors = {}, triggers = [], headlineYoY = null, debtGdpPct = null, oilYoYPct = null, longRateDelta12mBp = null }) {
  const legs = {};
  for (const k of LEG_KEYS) {
    const s = factors[k]?.status;
    if (STATUS_ORDER.includes(s)) legs[k] = s;
  }
  return {
    tier: "monthly",
    legs,
    scPhaseGroup: SC_PHASE_GROUPS[factors.SC?.phase] ?? null,
    cpiRegime: cpiRegime(headlineYoY),
    rvgSign: factors.S7?.gap == null ? null : factors.S7.gap > 0 ? "gGreater" : "rGreater",
    triggerKeys: [...new Set(triggers.map(t => t.key))].sort(),
    tags: tagsFrom({ oilYoYPct }),
    debtGdpBucket: debtGdpBucket(debtGdpPct),
    longRateDir: longRateDelta12mBp == null ? null : longRateDelta12mBp > 0 ? "up" : "down",
  };
}

export function coarseFingerprint({ cpiYoY = null, rMinusG = null, debtGdp = null, spxMaxDD = null, longRateDeltaPp = null, rec = null, oilYoYPct = null }) {
  return {
    tier: "coarse",
    cpiRegime: cpiRegime(cpiYoY),
    rvgSign: rMinusG == null ? null : rMinusG < 0 ? "gGreater" : "rGreater", // panel stores r − g
    debtGdpBucket: debtGdpBucket(debtGdp),
    drawdownState: spxMaxDD == null ? null : spxMaxDD <= -15,
    longRateDir: longRateDeltaPp == null ? null : longRateDeltaPp > 0 ? "up" : "down",
    recession: rec == null ? null : rec === 1,
    tags: tagsFrom({ oilYoYPct }),
  };
}
