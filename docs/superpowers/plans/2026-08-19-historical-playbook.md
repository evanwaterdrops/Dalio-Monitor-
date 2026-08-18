# Historical Playbook Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A two-lane historical-analog layer — measured cycle analogs (auto-matched leaderboard over a century-wide episode library) and asserted theme rhymes (Dark Fiber telecom↔AI template) — with forward-return tables at 6m/1y/2y/5y/10y horizons, delivered as a shared engine plus two A/B UI branches.

**Architecture:** Pure-function fingerprint + matcher modules in `src/lib/playbook/*.mjs` (same pattern as `framework/math.mjs`: plain JS, no I/O, imported by both the TS app and node test scripts). Static data (episodes, fingerprints, forward returns) is built by scripts in `scripts/playbook/` from CSVs committed to the repo and shipped as JSON. The live matcher runs inside `assess()` so the leaderboard persists with each snapshot. UI variants live on branches `playbook-band` and `playbook-tab`.

**Tech Stack:** Next.js 14 / React 18 / TypeScript (strict:false, allowJs, resolveJsonModule), recharts, node:assert test scripts, FRED/Shiller/Ken-French/datahub CSVs. **No new npm dependencies.**

**Spec:** `docs/superpowers/specs/2026-08-19-historical-playbook-design.md` (fact-check ledger: `docs/superpowers/specs/2026-08-19-dark-fiber-fact-check.md`)

## Global Constraints

- No new npm dependencies; no jest — tests are node scripts using `node:assert`, wired as npm scripts (repo pattern: `scripts/selftest.mjs`).
- Playbook logic modules are pure functions in `.mjs` (no I/O, no Date.now) so node scripts and the TS app import the identical code — the `math.mjs` pattern.
- Display language: "STRONG / MODERATE / WEAK RHYME" — never a decimal match percentage anywhere in UI.
- Every horizon table renders the line: *"What each allocation actually returned from this point in history — precedent, not advice."*
- Incomplete horizons are `null` in data and "n/a" in UI — never 0.
- Gold rows before 1971-08 carry `nonInvestable: true` (pegged era) and render dimmed with a "pegged" marker.
- Tasks 1–8 commit to branch `Backtest`. Task 9 on branch `playbook-band`, Task 10 on branch `playbook-tab` (both branched from `Backtest` after Task 8). Task 11 spans both.
- `npm run build` must pass at the end of every task.
- Data downloads happen once in Task 3 and the CSVs are committed; build scripts must run offline from those files thereafter.

---

### Task 1: Fingerprint core (`fingerprint.mjs`)

**Files:**
- Create: `src/lib/playbook/fingerprint.mjs`
- Test: `scripts/playbook/test-fingerprint.mjs`
- Modify: `package.json` (add `"test:playbook": "node scripts/playbook/test-fingerprint.mjs && node scripts/playbook/test-match.mjs"` — the second file arrives in Task 4; until then wire only the first)

**Interfaces:**
- Consumes: nothing (pure module).
- Produces (used by Tasks 2, 4, 7):
  - `fingerprintFromFactors({ factors, triggers, headlineYoY, debtGdpPct, oilYoYPct, longRateDelta12mBp }) → Fingerprint`
  - `coarseFingerprint({ cpiYoY, rMinusG, debtGdp, spxMaxDD, longRateDeltaPp, rec }) → Fingerprint` (century-panel rows)
  - `Fingerprint = { tier: "monthly"|"coarse", legs?: Record<string,string>, scPhaseGroup?: string, cpiRegime: string, rvgSign: "gGreater"|"rGreater"|null, triggerKeys?: string[], tags: string[], debtGdpBucket?: string, drawdownState?: boolean, longRateDir?: "up"|"down"|null, recession?: boolean }`
  - Constants: `CPI_REGIMES`, `SC_PHASE_GROUPS`, `STATUS_ORDER`

- [ ] **Step 1: Write the failing test**

```js
// scripts/playbook/test-fingerprint.mjs
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
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node scripts/playbook/test-fingerprint.mjs`
Expected: FAIL — `Cannot find module '.../src/lib/playbook/fingerprint.mjs'`

- [ ] **Step 3: Implement `fingerprint.mjs`**

```js
// src/lib/playbook/fingerprint.mjs
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
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node scripts/playbook/test-fingerprint.mjs`
Expected: `fingerprint tests OK`

- [ ] **Step 5: Wire npm script and commit**

In `package.json` scripts add: `"test:playbook": "node scripts/playbook/test-fingerprint.mjs"`.

```bash
npm run test:playbook && npm run build
git add src/lib/playbook/fingerprint.mjs scripts/playbook/test-fingerprint.mjs package.json
git commit -m "feat(playbook): frozen fingerprint vocabulary (monthly + coarse tiers)"
```

---

### Task 2: Episode library + fingerprint extraction

**Files:**
- Create: `src/lib/playbook/episodes.json` (hand-authored)
- Create: `scripts/playbook/extract-fingerprints.mjs`
- Create: `src/lib/playbook/fingerprints.json` (generated by the script, committed)

**Interfaces:**
- Consumes: `fingerprint.mjs` (Task 1), `scripts/backtest/results.json` (793 monthly records, fields `t`, `factors`, `triggers`, `inputs.headlineYoY`), `scripts/backtest/century-panel.json` (annual rows `{y, debtGdp, cpiYoY, rMinusG, longRate, spxMaxDD, rec}`), WTI CSV (Task 3 downloads it — for this task, oil y/y may be `null`; re-run the script after Task 3 to fill tags).
- Produces (used by Tasks 3, 4, 9, 10):
  - `episodes.json`: array of `{ id, name, dateRange, anchorMonth, secondaryAnchors?, tier, takeaway, lens: "cycle" }`
  - `fingerprints.json`: `{ [episodeId]: Fingerprint }`

- [ ] **Step 1: Author `episodes.json`**

All 16 episodes. Takeaways state the mechanism (spec guardrail 5). `anchorMonth` is the point-in-time "you are here" (GFC = Sep-2007, the month the backtest first broke — not Lehman).

```json
[
  { "id": "deflation-1920", "name": "1920–21 deflation", "dateRange": "1920–1921", "anchorMonth": "1920-06", "tier": "coarse", "lens": "cycle",
    "takeaway": "A deflation on purpose: the Fed forced liquidation and prices fell ~15%, so nominal assets (cash, bonds) beat real ones — the exact inverse of the 1970s mechanism." },
  { "id": "crash-1929", "name": "1929–32 debt deflation", "dateRange": "1929–1932", "anchorMonth": "1929-09", "tier": "coarse", "lens": "cycle",
    "takeaway": "Debt deflation: every risk asset fell until the 1933 devaluation. Cash then long bonds won; the 5y winner was whoever held bonds through −80% equities and bought after gold was repriced." },
  { "id": "tightening-1937", "name": "1937 premature tightening", "dateRange": "1937–1938", "anchorMonth": "1937-03", "tier": "coarse", "lens": "cycle",
    "takeaway": "Policy reversal inside an incomplete deleveraging: reserve-requirement + fiscal tightening halved equities while bonds held. The mechanism is tightening into a debt overhang, not overheating." },
  { "id": "war-finance-1942", "name": "1942–51 war finance / curve peg", "dateRange": "1942–1951", "anchorMonth": "1942-04", "tier": "coarse", "lens": "cycle",
    "takeaway": "Financial repression: pegged nominal rates below inflation guaranteed bondholders real losses, while equities from depressed valuations tripled by 1946. Repression pays equity and robs coupons." },
  { "id": "inflation-1946", "name": "1946–48 peacetime inflation", "dateRange": "1946–1948", "anchorMonth": "1946-07", "tier": "coarse", "lens": "cycle",
    "takeaway": "Price-control release with the peg still on: double-digit real losses in cash and bonds, equities flat-to-chop. Scarcity pricing (real assets) won until the 1948–49 disinflation." },
  { "id": "oil-shock-1973", "name": "1973–74 oil shock", "dateRange": "1973–1974", "anchorMonth": "1973-10", "tier": "monthly", "lens": "cycle",
    "takeaway": "A supply shock into already-hot CPI: stocks AND bonds lost real money together — 60/40 has no defense when inflation is the shock. Hard assets (gold, commodities, energy equities) and rising-rate cash won every horizon to 5y; the 5y equity winner was whoever bought the Dec-1974 low." },
  { "id": "volcker-1980", "name": "1979–82 Volcker", "dateRange": "1979–1982", "anchorMonth": "1980-01", "tier": "monthly", "lens": "cycle",
    "takeaway": "The inverse of 1973: policy chose the recession, so the trade inverted — long bonds and equities won the decade from the 1982 pivot, while gold peaked the same month and lost ~60% real. When the price of money is the weapon, own what it eventually rescues." },
  { "id": "crash-1987", "name": "1987 crash", "dateRange": "1987", "anchorMonth": "1987-08", "tier": "monthly", "lens": "cycle",
    "takeaway": "A positioning event inside an intact expansion: no macro leg broke, and buying the crash paid at every horizon. The mechanism (portfolio insurance) lived in market structure, not the debt cycle." },
  { "id": "gulf-snl-1990", "name": "1990 Gulf / S&L", "dateRange": "1990–1991", "anchorMonth": "1990-07", "tier": "monthly", "lens": "cycle",
    "takeaway": "Oil spike + credit crunch + recession at once: a short sharp equity hit, bonds fine throughout, then easing resolved the credit stress into a decade-long bull. Supply shock WITH a central bank free to cut is survivable." },
  { "id": "ltcm-1998", "name": "1998 LTCM", "dateRange": "1998", "anchorMonth": "1998-08", "tier": "monthly", "lens": "cycle",
    "takeaway": "A leverage unwind the Fed short-circuited: the rescue-plus-cuts fueled the melt-up that became the 2000 top. The analog for stress that resolves into bubble, not bust — the 2y numbers reward risk, the 5y numbers punish it." },
  { "id": "dotcom-2000", "name": "2000 dot-com", "dateRange": "2000–2002", "anchorMonth": "2000-03", "secondaryAnchors": ["1998-10"], "tier": "monthly", "lens": "cycle",
    "takeaway": "A valuation unwind with tame CPI and no system-wide credit break: bonds, value and small caps won big while the index halved — the rare bear where the average stock beat the stocks that defined the era. Macro-flow frameworks cannot see this top; valuation has to." },
  { "id": "gfc-2007", "name": "2007–09 GFC", "dateRange": "2007–2009", "anchorMonth": "2007-09", "tier": "monthly", "lens": "cycle",
    "takeaway": "A credit-cycle break: only Treasuries and cash worked on the way down; gold worked once monetisation began. Value did NOT protect — the banks WERE the value. Diversification inside equities is no defense when the collateral chain is the problem." },
  { "id": "downgrade-2011", "name": "2011 US downgrade / euro stress", "dateRange": "2011", "anchorMonth": "2011-07", "tier": "monthly", "lens": "cycle",
    "takeaway": "Sovereign stress in the reserve currency prices as DEFLATION risk, not default risk: Treasuries rallied into their own downgrade. Gold peaked as the acute phase eased — the flight asset's bid dies when the tail risk is bought back." },
  { "id": "repo-2019", "name": "2019 repo stress", "dateRange": "2019", "anchorMonth": "2019-09", "tier": "monthly", "lens": "cycle",
    "takeaway": "Plumbing stress answered with balance-sheet expansion while CPI was quiet: everything melted up until an exogenous shock (COVID) ended it. The lesson is that liquidity responses to plumbing breaks inflate assets first and resolve nothing." },
  { "id": "covid-2020", "name": "2020 COVID", "dateRange": "2020", "anchorMonth": "2020-02", "tier": "monthly", "lens": "cycle",
    "takeaway": "An exogenous stop met with total monetisation: the drawdown was violent but every asset won at 1y. The bill surfaced two years later as the 2021–22 inflation — the analog's 2y+ numbers carry the warning, not the 6m ones." },
  { "id": "inflation-bear-2021", "name": "2021–22 inflation bear", "dateRange": "2021–2022", "anchorMonth": "2021-11", "tier": "monthly", "lens": "cycle",
    "takeaway": "Monetisation-while-hot unwound: 1973-lite. Stocks and bonds fell together, commodities and energy equities won, and cash beat 60/40 for the first time in four decades. The S6 duration shock was the whole mechanism." }
]
```

- [ ] **Step 2: Write `extract-fingerprints.mjs`**

```js
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
  return (ym) => {
    const [y, m] = ym.split("-").map(Number);
    const prev = `${y - 1}-${String(m).padStart(2, "0")}`;
    const now = byMonth.get(ym), then = byMonth.get(prev);
    return now != null && then != null && then !== 0 ? ((now - then) / then) * 100 : null;
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
```

- [ ] **Step 3: Run it and sanity-check**

Run: `node scripts/playbook/extract-fingerprints.mjs`
Expected: `wrote fingerprints for 16 episodes`. Then spot-check:
`node -e "const f=require('./src/lib/playbook/fingerprints.json'); console.log(f['oil-shock-1973'], f['war-finance-1942'])"`
Expected: 1973 record is `tier:"monthly"` with `cpiRegime` "high" or "extreme"; 1942 is `tier:"coarse"`. If an anchor month is missing from results.json (records start 1960-06), the script throws — fix the anchor, don't skip.

- [ ] **Step 4: Commit**

```bash
npm run build
git add src/lib/playbook/episodes.json src/lib/playbook/fingerprints.json scripts/playbook/extract-fingerprints.mjs
git commit -m "feat(playbook): 16-episode library + extracted fingerprints (monthly + coarse tiers)"
```

---

### Task 3: Forward-return dataset

**Files:**
- Create: `scripts/playbook/data/` — committed CSVs: `shiller.csv`, `ff_factors.csv`, `ff_12industry.csv`, `gold_monthly.csv`, `wtisplc.csv`
- Create: `scripts/playbook/build-returns.mjs`
- Create: `src/lib/playbook/returns.json` (generated, committed — per-episode horizon tables + 24m paths)
- Create: `scripts/playbook/returns-monthly.json` (generated, committed — full monthly series for validation; NOT imported by the app)
- Test: `scripts/playbook/test-returns.mjs`

**Interfaces:**
- Consumes: `episodes.json` (Task 2).
- Produces (used by Tasks 5, 9, 10):
  - `returns.json`: `{ assets: [{key, label}], episodes: { [episodeId]: { anchors: { [anchorMonth]: { horizons: { h6, h12, h24, h60, h120 }, path24: { [assetKey]: number[] } } } } } }` where each horizon is `{ [assetKey]: { nominal: number|null, real: number|null, nonInvestable?: true } }` (cumulative %, e.g. `-26.4`).
  - `returns-monthly.json`: `{ months: ["1871-01", ...], series: { [assetKey]: (number|null)[] } }` — monthly nominal total returns in %, plus `cpi: number[]` index levels.
  - Asset keys: `spx`, `gold`, `bond10`, `cash`, `commod`, `valueMinusGrowth`, `smallMinusLarge`, `energySector`.

- [ ] **Step 1: Download and commit the source CSVs**

```bash
mkdir -p scripts/playbook/data && cd scripts/playbook/data
# Shiller monthly (datahub mirror): Date, SP500, Dividend, Earnings, CPI, Long Interest Rate...
curl -fL -o shiller.csv https://raw.githubusercontent.com/datasets/s-and-p-500/main/data/data.csv \
  || curl -fL -o shiller.csv https://raw.githubusercontent.com/datasets/s-and-p-500/master/data/data.csv
# Ken French: market/value/size factors + 12 industries (zips contain one CSV each)
curl -fL -o ff.zip "https://mba.tuck.dartmouth.edu/pages/faculty/ken.french/ftp/F-F_Research_Data_Factors_CSV.zip" && unzip -p ff.zip > ff_factors.csv && rm ff.zip
curl -fL -o ind.zip "https://mba.tuck.dartmouth.edu/pages/faculty/ken.french/ftp/12_Industry_Portfolios_CSV.zip" && unzip -p ind.zip > ff_12industry.csv && rm ind.zip
# Gold monthly (datahub, 1950+; pre-1971 is the $35 peg)
curl -fL -o gold_monthly.csv https://raw.githubusercontent.com/datasets/gold-prices/main/data/monthly.csv \
  || curl -fL -o gold_monthly.csv https://raw.githubusercontent.com/datasets/gold-prices/master/data/monthly.csv
# WTI monthly 1946+ (FRED, no API key needed for fredgraph csv)
curl -fL -o wtisplc.csv "https://fred.stlouisfed.org/graph/fredgraph.csv?id=WTISPLC"
head -3 shiller.csv ff_factors.csv ff_12industry.csv gold_monthly.csv wtisplc.csv
```

Verify by eye: `shiller.csv` starts 1871; `ff_factors.csv` data rows start `192607` with columns `Mkt-RF,SMB,HML,RF`; `ff_12industry.csv` has an `Enrgy` column (average value-weighted returns block is the FIRST block — parsing must stop at the first blank line); `gold_monthly.csv` rows like `1950-01,34.73`; `wtisplc.csv` rows like `1946-01-01,1.17`. If any URL 404s, find the current one on the provider's page and record the change in the commit message — do not substitute a different dataset.

- [ ] **Step 2: Write the failing test**

```js
// scripts/playbook/test-returns.mjs
import assert from "node:assert/strict";
import fs from "node:fs";
const returns = JSON.parse(fs.readFileSync("src/lib/playbook/returns.json", "utf8"));
const monthly = JSON.parse(fs.readFileSync("scripts/playbook/returns-monthly.json", "utf8"));

// Known history as fixed points (spec: schema check + spot checks):
const oil73 = returns.episodes["oil-shock-1973"].anchors["1973-10"].horizons;
assert.ok(oil73.h12.spx.real < -20, `1973-10 +12m real S&P should be deeply negative, got ${oil73.h12.spx.real}`);
assert.ok(oil73.h12.gold.nominal > 30, `1973-10 +12m gold should be strongly positive, got ${oil73.h12.gold.nominal}`);
assert.ok(oil73.h24.energySector.nominal > oil73.h24.spx.nominal, "energy beat market from 1973-10 at 2y");

const volcker = returns.episodes["volcker-1980"].anchors["1980-01"].horizons;
assert.ok(volcker.h60.bond10.nominal > 40, "bonds won big 5y from 1980-01");
assert.ok(volcker.h60.gold.real < 0, "gold lost real value 5y from 1980-01");

const gfc = returns.episodes["gfc-2007"].anchors["2007-09"].horizons;
assert.ok(gfc.h12.spx.nominal < -15 && gfc.h12.bond10.nominal > 0, "GFC: stocks down, bonds up at 12m");

// Incomplete horizons are null, not 0
const cov = returns.episodes["covid-2020"].anchors["2020-02"].horizons;
assert.equal(cov.h120.spx.nominal, null, "10y from 2020-02 has not completed (data ends before 2030)");

// Pegged-gold flagging
const c29 = returns.episodes["crash-1929"].anchors["1929-09"].horizons;
assert.ok(c29.h12.gold == null || c29.h12.gold.nonInvestable === true, "pre-1971 gold flagged nonInvestable or absent");

// Monthly series aligned
assert.equal(monthly.months.length, monthly.series.spx.length);
assert.ok(monthly.months.includes("1973-10") && monthly.months.includes("2007-09"));
console.log("returns tests OK");
```

- [ ] **Step 3: Run to verify it fails**

Run: `node scripts/playbook/test-returns.mjs`
Expected: FAIL — `returns.json` doesn't exist.

- [ ] **Step 4: Write `build-returns.mjs`**

```js
// scripts/playbook/build-returns.mjs
// Builds the static forward-return dataset from committed CSVs. Offline,
// deterministic (same inputs → byte-identical outputs). Run:
//   node scripts/playbook/build-returns.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const D = (f) => fs.readFileSync(path.join(HERE, "data", f), "utf8");
const episodes = JSON.parse(fs.readFileSync(path.join(HERE, "../../src/lib/playbook/episodes.json"), "utf8"));

const ym = (y, m) => `${y}-${String(m).padStart(2, "0")}`;
const addM = (s, n) => { const [y, m] = s.split("-").map(Number); const t = y * 12 + (m - 1) + n; return ym(Math.floor(t / 12), (t % 12) + 1); };

/* ---------- parse sources into per-month maps ---------- */
// Shiller (datahub): Date like 1871-01 or 1871-01-01; columns: Date,SP500,Dividend,Earnings,CPI,Long Interest Rate,...
const shiller = new Map(); // ym -> {p, d, cpi, gs10}
for (const line of D("shiller.csv").trim().split("\n").slice(1)) {
  const c = line.split(",");
  const key = c[0].slice(0, 7);
  const [p, d, cpi, gs10] = [Number(c[1]), Number(c[2]), Number(c[4]), Number(c[5])];
  if (Number.isFinite(p)) shiller.set(key, { p, d, cpi, gs10 });
}

// Ken French CSVs: header junk, then rows "192607,  2.96, -2.56, ..."; stop at first non-YYYYMM row after data starts.
function parseFrench(text, wanted /* array of column names */) {
  const lines = text.split("\n");
  const out = new Map();
  let cols = null;
  for (const raw of lines) {
    const line = raw.trim();
    const cells = line.split(",").map(s => s.trim());
    if (!cols) {
      if (cells.length > 2 && cells.slice(1).some(c => wanted.includes(c))) cols = cells;
      continue;
    }
    if (!/^\d{6}$/.test(cells[0])) { if (out.size > 0) break; else continue; }
    const key = `${cells[0].slice(0, 4)}-${cells[0].slice(4)}`;
    const row = {};
    for (const w of wanted) {
      const i = cols.indexOf(w);
      const v = Number(cells[i]);
      row[w] = Number.isFinite(v) && v > -99 ? v : null; // -99.99 = missing
    }
    out.set(key, row);
  }
  return out;
}
const ff = parseFrench(D("ff_factors.csv"), ["Mkt-RF", "SMB", "HML", "RF"]);
const ind = parseFrench(D("ff_12industry.csv"), ["Enrgy"]);

const gold = new Map(); // ym -> price
for (const line of D("gold_monthly.csv").trim().split("\n").slice(1)) {
  const [d, v] = line.split(",");
  if (Number.isFinite(Number(v))) gold.set(d.slice(0, 7), Number(v));
}
const wti = new Map();
for (const line of D("wtisplc.csv").trim().split("\n").slice(1)) {
  const [d, v] = line.split(",");
  if (Number.isFinite(Number(v))) wti.set(d.slice(0, 7), Number(v));
}

/* ---------- monthly nominal total-return series (%) ---------- */
const months = [...shiller.keys()].sort();
const GOLD_FLOAT_FROM = "1971-08"; // post-peg
const series = { spx: [], gold: [], bond10: [], cash: [], commod: [], valueMinusGrowth: [], smallMinusLarge: [], energySector: [] };
const cpiIndex = [];

// 10y constant-maturity synthetic TR from the Shiller long rate:
// carry y/12 plus price move of a 10y par bond repriced from y0 to y1.
function bondTR(y0Pct, y1Pct) {
  if (y0Pct == null || y1Pct == null) return null;
  const y0 = y0Pct / 100, y1 = y1Pct / 100, n = 20; // semiannual
  let price = 0;
  for (let i = 1; i <= n; i++) price += (y0 / 2) / Math.pow(1 + y1 / 2, i);
  price += 1 / Math.pow(1 + y1 / 2, n);
  return (y0 / 12 + (price - 1)) * 100;
}

for (let i = 0; i < months.length; i++) {
  const m = months[i], prev = months[i - 1];
  const cur = shiller.get(m), last = prev ? shiller.get(prev) : null;
  cpiIndex.push(cur.cpi ?? null);
  series.spx.push(last && cur.p && last.p ? ((cur.p + (cur.d ?? 0) / 12) / last.p - 1) * 100 : null);
  series.bond10.push(last ? bondTR(last.gs10, cur.gs10) : null);
  const g0 = prev ? gold.get(prev) : null, g1 = gold.get(m);
  series.gold.push(m >= GOLD_FLOAT_FROM && g0 && g1 ? (g1 / g0 - 1) * 100 : null);
  const w0 = prev ? wti.get(prev) : null, w1 = wti.get(m);
  series.commod.push(w0 && w1 ? (w1 / w0 - 1) * 100 : null); // WTI spot as commodity proxy (labeled as such)
  const f = ff.get(m);
  series.cash.push(f?.RF ?? null);
  series.valueMinusGrowth.push(f?.HML ?? null);
  series.smallMinusLarge.push(f?.SMB ?? null);
  const e = ind.get(m), mkt = f ? f["Mkt-RF"] + f.RF : null;
  series.energySector.push(e?.Enrgy ?? null);
}

/* ---------- horizons per episode anchor ---------- */
const HORIZONS = { h6: 6, h12: 12, h24: 24, h60: 60, h120: 120 };
const idx = new Map(months.map((m, i) => [m, i]));

function cumulative(key, from, n) {
  const i0 = idx.get(from);
  if (i0 == null || i0 + n >= months.length) return null;
  let acc = 1;
  for (let i = i0 + 1; i <= i0 + n; i++) {
    const r = series[key][i];
    if (r == null) return null;
    acc *= 1 + r / 100;
  }
  return (acc - 1) * 100;
}
function realize(nominalPct, from, n) {
  const i0 = idx.get(from);
  if (nominalPct == null || i0 == null || i0 + n >= months.length) return null;
  const c0 = cpiIndex[i0], c1 = cpiIndex[i0 + n];
  if (!c0 || !c1) return null;
  return ((1 + nominalPct / 100) / (c1 / c0) - 1) * 100;
}

const round1 = (x) => x == null ? null : Math.round(x * 10) / 10;
const ASSETS = [
  { key: "spx", label: "S&P 500 (total return)" },
  { key: "gold", label: "Gold" },
  { key: "bond10", label: "10y Treasury (synthetic TR)" },
  { key: "cash", label: "T-bills" },
  { key: "commod", label: "Oil spot (commodity proxy)" },
  { key: "valueMinusGrowth", label: "Value − growth (HML)" },
  { key: "smallMinusLarge", label: "Small − large (SMB)" },
  { key: "energySector", label: "Energy sector" },
];

const out = { assets: ASSETS, episodes: {} };
for (const ep of episodes) {
  const anchors = {};
  for (const a of [ep.anchorMonth, ...(ep.secondaryAnchors ?? [])]) {
    const horizons = {};
    for (const [hk, n] of Object.entries(HORIZONS)) {
      const row = {};
      for (const { key } of ASSETS) {
        const nom = cumulative(key, a, n);
        row[key] = { nominal: round1(nom), real: round1(realize(nom, a, n)) };
        if (key === "gold" && a < GOLD_FLOAT_FROM) row[key] = { nominal: null, real: null, nonInvestable: true };
      }
      horizons[hk] = row;
    }
    const path24 = {};
    for (const { key } of ["spx", "gold", "bond10", "cash"].map(k => ({ key: k }))) {
      const i0 = idx.get(a);
      const p = [100];
      for (let i = 1; i <= 24 && i0 != null && i0 + i < months.length; i++) {
        const r = series[key][i0 + i];
        p.push(r == null ? null : Math.round(p[p.length - 1] * (1 + r / 100) * 10) / 10);
        if (p[p.length - 1] == null) { p.length = 0; break; }
      }
      if (p.length) path24[key] = p;
    }
    anchors[a] = { horizons, path24 };
  }
  out.episodes[ep.id] = { anchors };
}

fs.writeFileSync(path.join(HERE, "../../src/lib/playbook/returns.json"), JSON.stringify(out));
fs.writeFileSync(path.join(HERE, "returns-monthly.json"), JSON.stringify({ months, series, cpi: cpiIndex }));
console.log(`returns.json: ${Object.keys(out.episodes).length} episodes; monthly series ${months[0]} → ${months[months.length - 1]}`);
```

- [ ] **Step 5: Run builder, then the test**

Run: `node scripts/playbook/build-returns.mjs && node scripts/playbook/test-returns.mjs`
Expected: `returns tests OK`. If a fixed-point assertion fails, debug the PARSER (column indices, French file block boundaries, date alignment) — do not loosen the assertion: these are documented historical facts.

- [ ] **Step 6: Determinism check, re-extract fingerprints (oil tags now available), commit**

```bash
node scripts/playbook/build-returns.mjs && git diff --stat --exit-code src/lib/playbook/returns.json  # re-run must be byte-identical
node scripts/playbook/extract-fingerprints.mjs   # fills energy_supply_shock tags now that wtisplc.csv exists
node scripts/playbook/test-fingerprint.mjs && node -e "const f=require('./src/lib/playbook/fingerprints.json'); if(!f['oil-shock-1973'].tags.includes('energy_supply_shock')) throw new Error('1973 must carry the oil-shock tag')"
npm run build
git add scripts/playbook/data scripts/playbook/build-returns.mjs scripts/playbook/test-returns.mjs scripts/playbook/returns-monthly.json src/lib/playbook/returns.json src/lib/playbook/fingerprints.json
git commit -m "feat(playbook): forward-return dataset (8 assets, 5 horizons, nominal+real) from committed CSVs"
```

Add to `package.json` `test:playbook`: `&& node scripts/playbook/test-returns.mjs`.

---

### Task 4: Matcher (`match.mjs`)

**Files:**
- Create: `src/lib/playbook/match.mjs`
- Test: `scripts/playbook/test-match.mjs`
- Modify: `package.json` (`test:playbook` gains `&& node scripts/playbook/test-match.mjs`)

**Interfaces:**
- Consumes: `Fingerprint` shape (Task 1), `fingerprints.json` + `episodes.json` (Task 2).
- Produces (used by Tasks 5, 7, 9, 10):
  - `scoreFingerprints(live: Fingerprint, episode: Fingerprint) → { score: number, applicable: number }` (score 0–100; `applicable` = total weight compared, for debugging)
  - `band(score) → "strong"|"moderate"|"weak"|null` — STRONG ≥65, MODERATE ≥50, WEAK ≥30, else null (hidden). Constants exported as `BANDS` so validation (Task 5) can recalibrate in ONE place.
  - `leaderboard(live: Fingerprint, episodes, fingerprints) → [{ id, name, tier, score, band }]` sorted by score desc, null-band entries excluded.

- [ ] **Step 1: Write the failing test**

```js
// scripts/playbook/test-match.mjs
import assert from "node:assert/strict";
import { scoreFingerprints, band, leaderboard, BANDS } from "../../src/lib/playbook/match.mjs";
import episodes from "../../src/lib/playbook/episodes.json" with { type: "json" };
import fingerprints from "../../src/lib/playbook/fingerprints.json" with { type: "json" };

// Identity: an episode matched against itself scores 100
const fp73 = fingerprints["oil-shock-1973"];
assert.equal(scoreFingerprints(fp73, fp73).score, 100);

// Adjacency half-credit: elevated vs critical on one leg costs half its weight, not all
const a = { tier: "monthly", legs: { SC: "elevated" }, scPhaseGroup: null, cpiRegime: null, rvgSign: null, triggerKeys: [], tags: [] };
const b = { tier: "monthly", legs: { SC: "critical" }, scPhaseGroup: null, cpiRegime: null, rvgSign: null, triggerKeys: [], tags: [] };
assert.equal(scoreFingerprints(a, b).score, 50);
const c = { ...a, legs: { SC: "ok" } };
assert.equal(scoreFingerprints(c, b).score, 0); // ok vs critical: distance 3, no credit

// Fields absent on either side are not applicable — a coarse episode is scored
// only on the coarse-comparable fields (tier comparability, spec §1)
const coarse = fingerprints["war-finance-1942"];
const liveish = { tier: "monthly", legs: { SC: "ok" }, scPhaseGroup: "expansion", cpiRegime: coarse.cpiRegime, rvgSign: coarse.rvgSign, triggerKeys: [], tags: [], debtGdpBucket: coarse.debtGdpBucket, longRateDir: coarse.longRateDir };
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
console.log("match tests OK");
```

- [ ] **Step 2: Run to verify it fails**

Run: `node scripts/playbook/test-match.mjs`
Expected: FAIL — match.mjs missing.

- [ ] **Step 3: Implement `match.mjs`**

```js
// src/lib/playbook/match.mjs
/**
 * Episode matcher. Weighted overlap over coarse fingerprint fields —
 * deliberately NOT nearest-neighbor on continuous values (guardrail 2).
 * Weights are fixed here and were set BEFORE validation (guardrail 4);
 * validate-matcher.mjs measures them, it does not tune them per-episode.
 */
import { STATUS_ORDER } from "./fingerprint.mjs";

export const BANDS = { strong: 65, moderate: 50, weak: 30 };

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
```

- [ ] **Step 4: Run tests, commit**

Run: `node scripts/playbook/test-match.mjs` → `match tests OK`; `npm run test:playbook` all green.

```bash
npm run build
git add src/lib/playbook/match.mjs scripts/playbook/test-match.mjs package.json
git commit -m "feat(playbook): weighted-overlap matcher with strong/moderate/weak banding"
```

---

### Task 5: Point-in-time validation (guardrail 4)

**Files:**
- Create: `scripts/playbook/validate-matcher.mjs`
- Create: `PLAYBOOK.md` (generated skill-stats section + hand-written intro)

**Interfaces:**
- Consumes: `results.json`, `fingerprint.mjs`, `match.mjs`, `returns-monthly.json`, `episodes.json`, `fingerprints.json`.
- Produces: `PLAYBOOK.md` with the validation table; console summary. No app-facing artifact.

- [ ] **Step 1: Write `validate-matcher.mjs`**

For every month in `results.json` (1960-06 → present): build the live-style fingerprint from that month's record (same call as extraction), run `leaderboard()`, and where the top entry is `strong` or `moderate` **and is not the episode containing that month** (no self-matching — skip when the month falls inside the top episode's `dateRange` years), predict that the analog's 12-month winner among `{spx, gold, bond10, cash}` (from its anchor's `h12` nominal returns) repeats. Score against the realized 12m winner computed from `returns-monthly.json`. Baselines: (a) always-`spx`; (b) trailing-12m winner persists.

```js
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
```

- [ ] **Step 2: Run it and read the numbers honestly**

Run: `node scripts/playbook/validate-matcher.mjs`
Expected: a table. **Judgment gate, not a green/red test:** the hit rate does not need to beat both baselines everywhere — but if the matcher's actionable-month count is near zero (bands too strict) or near 793 (bands vacuous), adjust the `BANDS` constants in `match.mjs` ONCE, re-run, and record the change. Do not touch per-field weights per-episode — that is the overfitting this guardrail exists to catch.

- [ ] **Step 3: Write `PLAYBOOK.md`**

Hand-write: what the playbook is (2 paragraphs, citing the spec), the two lanes, the honest-limits section (small N, coarse tiers, no-lookahead caveats), then paste the generated `validation-stats.md` table under "## Matcher skill stats (point-in-time, 1960–2026)". State plainly where it fails (e.g. "the matcher has no view in quiet regimes — X% of months have no actionable analog; that is by design").

- [ ] **Step 4: Commit**

```bash
git add scripts/playbook/validate-matcher.mjs scripts/playbook/validation-stats.md PLAYBOOK.md
git commit -m "feat(playbook): point-in-time matcher validation vs baselines + PLAYBOOK.md"
```

---

### Task 6: Theme lane — Dark Fiber

**Files:**
- Create: `src/lib/playbook/themes.json`
- Create: `src/lib/playbook/theme-eval.mjs`
- Test: `scripts/playbook/test-themes.mjs` (append to `test:playbook`)

**Interfaces:**
- Consumes: fact-check ledger content (spec + `2026-08-19-dark-fiber-fact-check.md`); snapshot fields `inputs.hyOas` (percent, e.g. 2.71) and `factors.PC.hyOasDelta3mBp`.
- Produces (used by Tasks 7, 9, 10):
  - `themes.json`: `[{ id, name, lens: "theme", activeSince, positionLabel, historicalParallels: [{episodeRef?, name, anchorMonth?, returnsKey?}], checklist: [{id, label, state: "matched"|"partial"|"notObserved", note}], tripwires: [{id, label, threshold, live: boolean, note}], figures: [{text, flag: "verified"|"corrected"|"unverified"}] }]`
  - `evalTripwires(theme, { hyOasBp, hyOasDelta3mBp }) → [{ id, state: "fired"|"armed"|"stale", detail }]`

- [ ] **Step 1: Author `themes.json`** — one theme, content transcribed from the fact-checked template. Checklist = the 8 phases (P1 matched, P2 partial, P3 matched/passed, P4 matched, P5 matched, P6 partial — "form matched, degree early", P7 partial — "beginning, idiosyncratic", P8 notObserved). Tripwires: `hy_transmission` (live: true, threshold "HY OAS > 450bp while AI-issuer credit widens"), `vendor_impairment`, `useful_life_revisions`, `utilisation_disclosure` (live: false). `positionLabel: "Phase 6 of 8 · phase 7 beginning in two issuers (as of Aug 2026)"`. `historicalParallels`: telecom (returnsKey `dotcom-2000`, anchors 2000-03 + 1998-10 — the playbook reuses the dot-com returns entries; label it "Telecom/dot-com bust window"), plus 1920s-electrification and 1840s-railway-mania as name-only entries (no returns data — render without tables). Figures array: carry the corrected claims with `flag: "corrected"`, the four unverifiables with `flag: "unverified"`, headline confirmed ones as `"verified"` — pull exact text from the ledger doc. Full JSON is authored in this step (long but mechanical transcription; every entry's text comes from the two spec docs — no new research).

- [ ] **Step 2: Implement `theme-eval.mjs`**

```js
// src/lib/playbook/theme-eval.mjs
/** Live tripwire evaluation. Only tripwires with live:true are computed;
 *  the rest render as manual watch items. */
export function evalTripwires(theme, { hyOasBp = null, hyOasDelta3mBp = null }) {
  return theme.tripwires.map(t => {
    if (!t.live) return { id: t.id, state: "armed", detail: "manual watch — flip in themes.json when observed" };
    if (t.id === "hy_transmission") {
      if (hyOasBp == null) return { id: t.id, state: "stale", detail: "HY OAS unavailable this run" };
      const fired = hyOasBp > 450 && (hyOasDelta3mBp ?? 0) > 0;
      return { id: t.id, state: fired ? "fired" : "armed", detail: `HY OAS ${Math.round(hyOasBp)}bp vs 450bp line · 3m ${hyOasDelta3mBp == null ? "—" : Math.round(hyOasDelta3mBp) + "bp"}` };
    }
    return { id: t.id, state: "armed", detail: "" };
  });
}
```

- [ ] **Step 3: Test** — `test-themes.mjs`: schema assertions on themes.json (exactly 4 tripwires, exactly one `live:true`; every checklist state ∈ enum; every figure flag ∈ enum; ≥1 `unverified` figure present — the ledger requires them carried, not dropped) plus `evalTripwires` firing logic: `(500, +30) → fired`, `(500, −10) → armed`, `(300, +80) → armed`, `(null) → stale`. Run, expect green, wire into `test:playbook`.

- [ ] **Step 4: Commit** — `git commit -m "feat(playbook): dark-fiber theme lane with live HY-OAS tripwire"`

---

### Task 7: Live integration (assess + snapshot + real-yield input)

**Files:**
- Modify: `src/lib/framework/assess.ts`
- Test: extend `scripts/playbook/test-fingerprint.mjs` with a snapshot-shaped fixture

**Interfaces:**
- Consumes: everything above.
- Produces: snapshot gains `playbook: { leaderboard, themes }` and `inputs` gains `real10y`, `real10yPrior`, `real10yHistory`, `oilYoYPct` — consumed by Tasks 9/10 UI and persisted via the existing `db.ts` snapshot flow (no db changes needed; the snapshot is stored whole).

- [ ] **Step 1: Add inputs in `assess.ts`**

In the tools list add a WTI fetch: `t("WTISPLC", () => src.fred("WTISPLC", { limit: 14 }), [])`. Compute `oilYoYPct` = y/y % from first/last of that series (null-safe). Real yield: `realY` is already fetched (DFII10, limit 300) — add to `inputs`: `real10y: realY.length ? last(realY).value : null`, `real10yPrior: priorOf(realY)`, `real10yHistory: hist(realY, 8, dLabel)`.

- [ ] **Step 2: Build the live fingerprint + leaderboard at the end of `assess()`**

After `triggers` is computed, before `return`:

```ts
import { fingerprintFromFactors } from "@/lib/playbook/fingerprint.mjs";
import { leaderboard } from "@/lib/playbook/match.mjs";
import { evalTripwires } from "@/lib/playbook/theme-eval.mjs";
import episodes from "@/lib/playbook/episodes.json";
import fingerprints from "@/lib/playbook/fingerprints.json";
import themes from "@/lib/playbook/themes.json";

const liveFp = fingerprintFromFactors({
  factors: { SC: sc, S8: valve, S6: s6, S7: rvg, SoV: gold, S5: demand, S3: squeeze, TAX: revBeta, JP: japan, PC: pc, deferred },
  triggers,
  headlineYoY,
  debtGdpPct: debtToGdpPct,
  oilYoYPct,
  longRateDelta12mBp: dgs10.length > 250 ? (last(dgs10).value - ago(dgs10, 250).value) * 100 : null,
});
const playbook = {
  leaderboard: leaderboard(liveFp, episodes as any[], fingerprints as any),
  themes: (themes as any[]).map(th => ({
    id: th.id, name: th.name, positionLabel: th.positionLabel,
    tripwires: evalTripwires(th, { hyOasBp: hyOas.length ? last(hyOas).value * 100 : null, hyOasDelta3mBp: pc?.hyOasDelta3mBp ?? null }),
  })),
};
```

Add `playbook` and the new inputs to the returned object. The snapshot persists whole through the existing `db.ts` flow, so leaderboard history (rank deltas) comes free from the previous row — same mechanism `narrate()` already uses. Add one line to the `narrate()` reading filter so leaderboard rank changes are visible to the narrative (follow the existing filtered-readings pattern in `db.ts`; the value passed is `playbook.leaderboard.map(r => `${r.id}:${r.band}`).join(",")`).

- [ ] **Step 3: Verify** — `npm run build` (type errors surface here; the `.mjs`+JSON imports follow the existing `math.mjs` pattern and `resolveJsonModule`). Local `npm run dev` will fail on env placeholders (known; see memory) — verification of the live path happens on the Vercel preview in Task 11.

- [ ] **Step 4: Commit** — `git commit -m "feat(playbook): live leaderboard + theme tripwires in assess snapshot; real-yield & oil inputs"`

---

### Task 8: Shared UI components + real-yield tile

**Files:**
- Create: `src/app/components/playbook/HorizonTable.tsx`, `AnalogCard.tsx`, `Leaderboard.tsx`, `ThemeCard.tsx`
- Modify: `src/app/page.tsx` (real-yield tile only — playbook UI mounts on the branches)
- Modify: `src/app/globals.css` (playbook classes, following existing `.trigger-card` / `.section` vocabulary)

**Interfaces:**
- Consumes: `snap.playbook` (Task 7), `returns.json`, `episodes.json`, `themes.json`.
- Produces (used by Tasks 9, 10):
  - `<Leaderboard entries={snap.playbook.leaderboard} limit={number|undefined} />` — renders ranked rows: rank, name, band chip (STRONG/MODERATE RHYME etc.), tier chip (`COARSE MATCH` when tier==="coarse"); entries with `band==="weak"` render dimmed under a "WEAK RHYMES" divider and are NOT expandable; strong/moderate rows expand to `<AnalogCard>`.
  - `<AnalogCard episodeId />` — server-safe: pulls episode + returns JSON, renders takeaway (mechanism line), `<HorizonTable>`, and the disclaimer line (global constraint).
  - `<HorizonTable episodeId anchor />` — 8 asset rows × 5 horizon columns, nominal with real in smaller type beneath, `null → "n/a"`, `nonInvestable → "pegged"` dimmed; client component with a NOM/REAL emphasis toggle is NOT needed — render both, keep it server-side.
  - `<ThemeCard theme snapTheme />` — "THEME — ASSERTED, NOT MEASURED" chip, positionLabel, checklist (✓/◐/○ per state), tripwires (fired→red / armed→muted / stale→amber, using `STATUS_COLOR` conventions), figures with `unverified` dimmed, parallels' horizon tables via `<HorizonTable>` where `returnsKey` exists.
- Expansion pattern: `<details>`/`<summary>` (repo precedent: problems banner, narrative section) — no client state needed.

- [ ] **Step 1: Implement the four components** following the file's existing inline-style + CSS-variable idiom (see `.trigger-card`, `.kpi-cell`). No new libraries. Weak-band dimming via `opacity: 0.45`.
- [ ] **Step 2: Real-yield tile** — in `page.tsx` S6 factor row, add a subInput as specified: key `real10y_level`, label "10Y real yield (TIPS), level", value `fmt(i.real10y)`, unit `%`, source live, sourceName "FRED DFII10", sourceUrl SRC.DFII10, prints `i.real10yHistory`, `...mom(i.real10y, i.real10yPrior, "pp")`, contribution: "The level the page keeps talking about — shown, not implied. Pre-2003 history uses the nominal-minus-CPI proxy basis."
- [ ] **Step 3: Verify + commit** — `npm run build`; components are exported but unmounted (branches mount them) — confirm no unused-import lint failure in build output. `git commit -m "feat(playbook): shared leaderboard/analog/theme components + 10Y real-yield tile"`

---

### Task 9: Branch `playbook-band` (A/B variant 1)

**Files:**
- Branch: `git checkout -b playbook-band` (from `Backtest` at Task-8 tip)
- Create: `src/app/components/playbook/PlaybookBand.tsx`
- Modify: `src/app/page.tsx`

**Steps:**
- [ ] **Step 1:** `<PlaybookBand playbook={snap.playbook} />` — a `.section` titled `PLAYBOOK — WHICH HISTORY ARE WE LIVING IN`, rendering `<Leaderboard entries limit={3} />` plus, when a theme exists, a one-line theme chip row (name + positionLabel + tripwire states) linking to the expandable `<ThemeCard>` in a `<details>`. Mount it in `page.tsx` directly below the WHAT CHANGED narrative block (above `TRIGGERS FIRED`), so it shows on both tabs.
- [ ] **Step 2:** `npm run build` green; commit: `feat(playbook-ui): band variant — top-3 leaderboard under WHAT CHANGED`.

### Task 10: Branch `playbook-tab` (A/B variant 2)

**Files:**
- Branch: `git checkout Backtest && git checkout -b playbook-tab`
- Modify: `src/app/components/Tabs.tsx`, `src/app/page.tsx`
- Create: `src/app/components/playbook/EpisodePathChart.tsx`

**Steps:**
- [ ] **Step 1: Extend Tabs** — generalize to `Tabs({ small, big, extra }: { small; big; extra?: { label: string; sub: string; content: React.ReactNode } })`; hash value `#playbook`; type union `"small" | "big" | "extra"`. Keep existing hash behavior byte-compatible for `#small`/`#big`.
- [ ] **Step 2: `EpisodePathChart`** — client component, recharts `LineChart` (repo already uses recharts): x = months 0–24, one line per core asset (spx/gold/bond10/cash) from `returns.json` `path24`, indexed to 100. Follow axis/tooltip styling of `src/app/components/charts/HeatTimeline.tsx`.
- [ ] **Step 3: Compose the tab** — sections: full `<Leaderboard entries />` (no limit — weak tail dimmed), "THEME RHYMES (ASSERTED)" with full `<ThemeCard>`s, and inside each expanded `<AnalogCard>` include the `<EpisodePathChart episodeId anchor />`. Wire `extra={{ label: "PLAYBOOK", sub: "analogs · theme rhymes · horizon returns", content: ... }}` in `page.tsx`.
- [ ] **Step 4:** `npm run build` green; commit: `feat(playbook-ui): tab variant — full leaderboard, themes, episode path charts`.

### Task 11: Figma frames + preview deploys for the A/B

- [ ] **Step 1:** Push both branches; create Vercel preview deploys (`npx vercel` per branch or via git integration). Verify each preview renders the playbook UI against the deployed env (local dev cannot — env placeholders).
- [ ] **Step 2:** Screenshot both variants from the previews (playwright MCP). Load `figma:figma-generate-design` + `figma:figma-use` skills, then add two frames — "Playbook / Band variant" and "Playbook / Tab variant" — to the existing Sovereign Vitals Figma file (URL in memory `dalio-monitor-figma-file.md`), reusing the file's existing tokens/styles.
- [ ] **Step 3:** Report both preview URLs + Figma frame links to Evan for the A/B decision. Do NOT merge either branch — the A/B outcome decides.

---

## Self-review notes

- **Spec coverage:** episodes/two tiers → T2; returns 8 assets 5 horizons nominal+real → T3; matcher + guardrails 1,2 → T1/T4; guardrail 3 (dispersion display) → T8 HorizonTable/AnalogCard render ranges via top-analog card copy — the "3 of 4 analogs" cross-analog line renders in `Leaderboard` when ≥2 strong/moderate entries share a horizon winner (implemented in T8 Step 1); guardrail 4 → T5; guardrail 5 → takeaway authoring T2; theme lane + tripwires → T6; live wiring + persistence + narrate hook → T7; real-yield tile → T8; A/B branches → T9/T10; Figma/preview → T11; disclaimers/n-a/pegged/no-percentages → global constraints.
- **Known deviations from spec (accepted):** commodities = WTI spot proxy labeled as such (spec said PPI splice — WTI is cleaner and already needed for tags); HY-OAS series already existed (`hy_oas`) so no `series.ts` addition; pre-1926 cash and style rows are n/a (French data floor) — the 1920-06 anchor shows spx/bond10/commod only.
- **Type consistency:** asset keys (`spx, gold, bond10, cash, commod, valueMinusGrowth, smallMinusLarge, energySector`), horizon keys (`h6,h12,h24,h60,h120`), band names (`strong/moderate/weak`), tripwire states (`fired/armed/stale`), checklist states (`matched/partial/notObserved`) are each defined once above and used identically across tasks.
