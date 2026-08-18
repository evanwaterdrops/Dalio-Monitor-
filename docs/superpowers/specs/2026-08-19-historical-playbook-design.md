# Historical Playbook — design spec

**Date:** 2026-08-19 · **Status:** awaiting Evan's review · **Branch plan:** engine on `Backtest`, UI A/B on `playbook-band` and `playbook-tab`

## Purpose

Given the dashboard's current small-cycle + big-cycle placement, show the user which
historical episodes today most resembles ("which history are we living in"), and what
each asset allocation actually returned from those points at 6m / 1y / 2y / 5y / 10y
horizons. Precedent, not advice: the layer answers *what happened when the machine
looked like this*, never *what to buy*.

Two lanes, honestly labeled:

1. **Cycle analogs (measured)** — auto-matched against the production factor math.
2. **Theme rhymes (asserted)** — hand-curated structural parallels that don't live in
   the Dalio factor vocabulary (first entry: the Dark Fiber template, telecom 1996–2004
   ↔ AI capex 2023–26).

## Components

### 1. Episode library — `src/lib/playbook/episodes.ts`

Curated, century-wide (matching the app's deepest data, the 1913+ century panel):

| Era | Episodes (anchor month in parens) |
|---|---|
| Pre-1960 (coarse tier) | 1920–21 deflation (1920-06), 1929–32 (1929-09), 1937 (1937-03), 1942–51 war finance / peg era (1942-04), 1946–48 inflation (1946-07) |
| 1960+ (monthly tier) | 1973–74 oil shock (1973-10), 1979–82 Volcker (1980-01), 1987 crash (1987-08), 1990 Gulf/S&L (1990-07), 1998 LTCM (1998-08), 2000 dot-com (2000-03), 2007–09 GFC (2007-09), 2011 downgrade/euro (2011-07), 2019 repo stress (2019-09), 2020 COVID (2020-02), 2021–22 inflation bear (2021-11) |

Each episode: `id`, `name`, `dateRange`, `anchorMonth` (the point-in-time "you are
here" moment — GFC anchors at Sep-2007, the month the backtest first broke, not at
Lehman), `fingerprint`, `takeaway` (hand-written, must state the **mechanism** —
why the winners won), `tier: "monthly" | "coarse"`, optional secondary anchors.

**Fingerprints are extracted, not asserted.** A build script reads
`scripts/backtest/results.json` at each anchor month and records the coarse factor
states (S1–S8 ok/watch/critical, trigger fires, CPI regime bucket, r−g sign, heat
bucket). Pre-1960 episodes get coarse annual fingerprints from
`scripts/backtest/century-panel.json` (debt/GDP bucket, CPI regime, r−g sign, long-rate
direction, drawdown state) and are marked `tier: "coarse"` — the UI renders a
"coarse match" chip so a 1942 analog never looks as precisely measured as a 1974 one.

A small fixed tag vocabulary (`energy_supply_shock`, `war_finance`, …) may be added
per episode, with the hard rule that **every tag maps to a live-computable reading**
(oil y/y from Brent already in the snapshot; WTI history from FRED for the past).
No vibes-only tags in the measured lane.

### 2. Forward-return dataset — `scripts/playbook/build-returns.mjs` → `src/lib/playbook/returns.json`

Run manually (history doesn't change); never at request time. Monthly series:

- **S&P 500 total return** — Shiller monthly (price + dividends) back past 1913
- **Gold** — LBMA/FRED from 1968; pre-1971 rows marked `nonInvestable` (pegged)
- **10y Treasury total return** — synthetic constant-maturity TR from long-yield series
- **Cash** — T-bill returns (Ken French RF)
- **Commodities** — PPI all-commodities pre-index-era, spliced to a commodity index
- **Equity styles** — Ken French library: value vs growth (HML legs), small vs large
  (size legs), energy industry vs market
- **Oil** — FRED WTI (from 1946) for fingerprint tags, not as an allocatable asset
- **CPI** — for real returns

For every episode anchor: forward **nominal and real** cumulative returns at
6m / 1y / 2y / 5y / 10y per asset. Horizons that haven't completed (10y from 2020+)
are `null` and render as "n/a", never zero. Splice points and source per series are
recorded in the JSON so provenance survives.

### 3. Matcher — `src/lib/playbook/match.ts`

On each refresh: current snapshot → the same coarse factor-state vector → weighted
overlap score vs every episode fingerprint → 0–100.

Overfitting guardrails (all five are requirements, not aspirations):

1. **Frozen feature set** — only states the production math already computes.
   Episodes cannot bring bespoke features.
2. **Coarse states, not distances** — bucket overlap, no continuous nearest-neighbor.
   Display is "strong / moderate / weak rhyme" + rank; no decimal match percentages.
3. **Dispersion is the display** — horizon tables show the *range across top analogs*
   ("gold beat equities at 12m in 3 of 4 analogs"). Disagreement renders as the
   finding. No single "optimal allocation" ever displays.
4. **Point-in-time validation** — `scripts/playbook/validate-matcher.mjs` replays the
   matcher over every month 1960–2026 (same no-lookahead discipline as BACKTEST.md)
   and scores whether top-analog playbooks anticipated the subsequent 12m asset
   ranking better than a static 60/40 baseline. Results — including failures — go in
   a PLAYBOOK.md section. The matcher is defined once, then evaluated; no tuning
   until a preferred episode tops today's board.
5. **Mechanism, not pattern** — takeaway text must state why winners won, so a match
   survives only if the mechanism transfers.

Gating: below the weak-rhyme threshold (calibrated during validation, ~40 overlap),
episodes render dimmed under a "weak rhymes" divider with no expandable card. In a
boring regime the board is allowed to say "no strong rhymes."

Pre-2003 real-yield basis: same nominal-minus-CPI proxy the backtest replay uses, so
old episodes match on equal footing.

### 4. Theme lane — `src/lib/playbook/themes.ts`

Hand-curated. A theme: `id`, `name`, `activeSince`, `historicalParallels` (episode
refs + their horizon tables from the same returns.json), `checklist` (parallel
features, each `matched | partial | notObserved`), `tripwires` (watch-list items,
each optionally wired to a live series), `figures` (each carrying
`verified | corrected | unverified` from the fact-check ledger — UI dims
`unverified`). No match % — a "THEME — asserted, not measured" chip instead.

**Theme #1: Dark Fiber (telecom 1996–2004 ↔ AI 2023–26)**, ingested from Evan's
document with the 2026-08-19 fact-check corrections applied (ledger:
`docs/superpowers/specs/2026-08-19-dark-fiber-fact-check.md`). Headline corrections
baked in: Nvidia–OpenAI $100bn LOI never consummated (→ $30bn equity stake Feb-2026 +
3GW/2GW hardware commitments; web sizing >$750bn per Bloomberg); Alphabet "priced an
$84.75bn equity program" (~$49.6bn Q2 cash); uncommenced-lease jump dated Q2→Q3 2025;
Amazon $53.4bn gain is non-operating; FactSet +50.4%→+32.0% is ex-Alphabet-and-Amazon;
2s10s ~+50bps; CoreWeave 95% re-lease rate; GSY 20→80% span from run-up size alone;
telecom ~55%/52% of defaulted dollars 2001/02; 1998 HY issuance $148bn (not a 97–98
average); Cisco had limited vendor financing, no balance-sheet dependence.
Unverified figures (media+telecom HY issuance shares, $800bn 1999 M&A, 10%-lit-by-2004,
−55% wholesale prices) carried as `unverified` and dimmed.

Phase structure: the 8 phases become the checklist (position: phase 6 of 8, phase 7
beginning in two issuers). The 4 tripwires become the watch-list; **tripwire 01
(broad HY OAS > 450bps while AI-issuer credit widens) is live**: add FRED
`BAMLH0A0HYM2` to `series.ts` and evaluate on refresh. Tripwires 02–04 (first
vendor-financing impairment, useful-life revisions, utilisation disclosure) are
manual flags flipped by editing the theme file. Telecom horizon returns anchor at
Mar-2000, secondary anchor Oct-1998 ("early phase 4").

### 5. Real-yield tile

The page discusses real yields but never shows the number. Add a "10y real yield
(TIPS)" tile to the existing readings board — data already in the snapshot (DFII10);
display current level + 12m change (the S6 input). Small, shared across both branches.

### 6. UI — two A/B branches, shared engine

Shared components: `Leaderboard`, `AnalogCard` (expand → horizon table + takeaway +
mechanism line), `HorizonTable` (nominal/real toggle, dispersion rendering, n/a
handling), `ThemeCard` (checklist + tripwires). Rank-change arrows when a refresh
moves an episode's rank; that movement also feeds the WHAT CHANGED narrative input.

- **Branch `playbook-band`** — PLAYBOOK band under WHAT CHANGED on both tabs: top-3
  slice of the leaderboard + active-theme chip.
- **Branch `playbook-tab`** — third top-level tab: full leaderboard (dimmed weak-rhyme
  tail), theme section, asset-path chart through each episode window (reusing the
  existing windowed-timeline chart pattern).

Both branches get frames pushed to the Sovereign Vitals Figma file (per Figma-sync
rule) and Vercel preview deploys for the A/B.

Every table carries: *"What each allocation actually returned from this point in
history — precedent, not advice."*

## Data flow

```
build-time (manual):  FRED/Shiller/French CSVs → build-returns.mjs → returns.json
                      results.json + century-panel.json → extract-fingerprints → episodes.ts (fingerprint fields)
refresh (cron):       snapshot → match.ts → ranked leaderboard → persisted with snapshot
                      BAMLH0A0HYM2 → tripwire-01 state
page load:            latestSnapshot() → leaderboard + themes render; rank deltas → narrate() input
validation (CI-able): validate-matcher.mjs → PLAYBOOK.md skill stats
```

## Error handling

- Missing/failed FRED series on refresh: leaderboard renders from last persisted
  snapshot; tripwire-01 shows "stale" rather than a false ok.
- No DB (the current Supabase gap): playbook degrades exactly like the narrative
  layer — page renders live readings with no leaderboard persistence/deltas.
- Returns JSON is static and validated at build: a schema check + spot-check totals
  (e.g. S&P 1973-10 +5y real must be negative) run in `npm run build` via the
  existing selftest pattern.

## Testing

- Matcher unit tests: known synthetic snapshots → known rankings; threshold gating;
  coarse-tier comparability.
- Determinism: build-returns.mjs re-run produces byte-identical JSON from cached CSVs.
- Point-in-time validation script output reviewed before UI ships (guardrail 4).
- `npm run build` green on both UI branches; existing backtest selftest untouched.

## Out of scope (YAGNI)

- PAT-style ask-anything research agent over the corpus (snapshot history +
  episodes + returns) — explicitly parked by Evan (2026-08-19) as a possible
  next phase after the playbook ships.
- Position sizing, portfolio construction, any "recommended allocation".
- Auto-detected themes (theme lane is deliberately manual).
- Non-US assets, FX, TIPS-as-asset, REITs (kitchen-sink palette rejected).
- Paid CDS data for tripwires (manual flags instead).
