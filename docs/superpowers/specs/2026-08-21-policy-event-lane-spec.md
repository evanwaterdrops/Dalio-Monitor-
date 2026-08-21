# Policy Event Lane — Design Spec

Source of authority: *Big Debt Crises* (2018), Part 1. Evan's directive (2026-08-21):
attribution before ingestion; events file-backed for now; Supabase is separate work.

Trigger case: **2026-08-19**, Treasury raised the per-operation cap on long-end liquidity
support buybacks from $2bn to ≥$4bn for 10–20y and 20–30y off-the-runs, effective
2026-09-09 through the 2026-11-04 refunding. 30y −9bp to 5.196%, 10y −6bp to 4.647%.
The monitor ingested the yield move and nothing else.

---

## 1. The problem is a misread, not a gap

The monitor **will** see the move: `DGS10`/`DGS30` arrive next day via FRED and feed
`curveShape` (`math.mjs:280`). The failure is what it concludes.

```js
else if (dLongBp3m <= -25 && dFrontBp3m > -10) mode = "bull-flattening";
const status = mode === "bear-steepening" && dTpBp3m > 0 ? STATUS.ELEVATED
  : mode === "bear-steepening" ? STATUS.WATCH : STATUS.OK;
```

A sustained long-end rally with the front anchored resolves to `bull-flattening` → status
**OK**. That inference is only valid when the long end rallies because *someone chose to
buy duration*. Here the buyer was the issuer, retiring its own duration to cap its own
yields. Same print, opposite meaning:

| Same observation | Benign reading | Actual mechanism |
|---|---|---|
| 30y −9bp, front anchored | market comfortable holding duration | issuer had to bid for its own paper |

Dalio's frame makes this sharper. `printDiscriminator` (`math.mjs:295`) already asks the
right question — *is duration being absorbed by the sovereign or by the market?* — but
only of the **Fed** (`WALCL`, `billsShareOfExpansion`). Treasury buybacks are the fiscal
half of the same question and are currently invisible to it. The monitor can therefore
watch the sovereign absorb its own long duration and score it `OK`.

**This is the one defect the spec exists to fix.** Everything else follows.

## 2. Scope

**In:** event model; a file-backed store behind an interface; attribution — how a live
event reinterprets a factor reading; UI surfacing; tests.

**Out (deliberate, each with its reason):**

- *Automated ingestion.* Fiscal Data has a "Treasury Securities Buybacks" dataset and the
  NY Fed Markets API is confirmed live (`markets.newyorkfed.org/api/tsy/all/results/summary/lastTwoWeeks.json`
  → HTTP 200, `operationType`/`totalParAmtAccepted`/`maturityRange*`). But the Fiscal Data
  endpoint path is **unverified** — treasury.gov DNS is unreachable from the dev machine —
  and at ~4–8 events a quarter, automating collection optimises the cheap part. Revisit
  once attribution proves itself.
- *Supabase.* Tracked separately (§7).
- *Retro-scoring history.* The backtest replays vintaged data; events have no vintage
  series. Attribution applies to live readings only.

## 3. Event model

`src/data/policy-events.json`, newest first. Hand-maintained; every field is something a
human can fill from a press release in under a minute.

```jsonc
{
  "id": "2026-08-19-treasury-buyback-longend-double",
  "date": "2026-08-19",          // announcement date — when the market repriced
  "effectiveFrom": "2026-09-09", // when the mechanism starts biting (nullable)
  "effectiveTo": "2026-11-04",   // when it lapses absent renewal (nullable)
  "kind": "issuer_support",      // see taxonomy below
  "actor": "treasury",           // treasury | fed | frbny | congress | foreign
  "surface": ["long_end"],       // front_end | belly | long_end | bills | fx | reserves
  "direction": "suppresses_yield",
  "magnitude": { "value": 2, "unit": "usd_bn_per_operation", "from": 2, "to": 4 },
  "affects": ["curve", "S5", "S8"],   // factor keys this event can reinterpret
  "sourceUrl": "https://home.treasury.gov/news/press-releases/sb0607",
  "note": "Cap doubled for 10-20y and 20-30y off-the-runs."
}
```

**`kind` taxonomy** — closed set, each mapping to a Dalio mechanism:

| kind | Meaning | Dalio reading |
|---|---|---|
| `issuer_support` | sovereign bids for its own debt | duration absorbed by issuer, not market |
| `duration_absorption` | central bank takes duration (QE, twist) | MP2/MP3 — the print |
| `issuance_shift` | maturity mix moves (bills ↔ coupons) | funding the deficit at the short end |
| `rate_policy` | conventional MP1 | the ordinary lever |
| `yield_management` | explicit caps/targets (YCC) | MP3, terminal-stage |
| `fx_intervention` | reserve deployment to defend a level | store-of-wealth defence |
| `fiscal_shock` | discrete tax/spend change | the deficit itself moving |

`direction` ∈ `suppresses_yield | raises_yield | expands_liquidity | drains_liquidity |
neutral`.

An event is **live** on date *d* when `effectiveFrom ≤ d ≤ effectiveTo`, and **announced**
when `date ≤ d < effectiveFrom`. Both attribute; announcement effects are usually the
larger market move, which is exactly what happened on 2026-08-19.

## 4. Storage behind an interface

New `src/lib/events/store.mjs` (plain JS — `math.mjs` precedent, so selftest imports it):

```js
export function loadEvents()                 // reads policy-events.json today
export function activeEvents(events, asOf)   // live + announced, filtered by date
export function eventsFor(events, factorKey, asOf)
```

Only `loadEvents()` knows the backing store. Swapping to Postgres later is a one-function
change — the Supabase table mirrors the JSON shape 1:1 (§7).

## 5. Attribution — the actual work

A new pure function in `math.mjs`, tested like every other rule:

```js
export function attribute(factorKey, reading, events)
  // → { ...reading, attribution?: { eventId, kind, effect, originalStatus, why } }
```

**Rules are narrow and falsifiable.** Attribution never invents a status; it only refuses
to let an *induced* move read as a *revealed* one.

| Factor | Condition | Effect |
|---|---|---|
| `curve` | `mode` is `bull-flattening`/`bull-steepening` at the long end AND a live `issuer_support`/`duration_absorption` event with `suppresses_yield` on `long_end` | status `OK` → **`WATCH`**; `mode` annotated `bull-flattening (issuer-supported)` |
| `S8` (monetisation valve) | live `issuer_support` **or** `yield_management` | raise the valve read one step — the sovereign is already acting on its own curve |
| `S5` (supply/demand) | live `issuer_support` on the auctioned tenor | annotate only. Buybacks flatter the demand picture by removing supply; a clean BTC under an active buyback is weaker than it looks |
| `printDiscriminator` | live `issuer_support` on `long_end` while `printMode === "reserve-management"` | annotate: Fed plumbing + Treasury duration retirement is not the same as plumbing alone |

**Non-goals, stated so they're testable:** attribution must never *lower* a status, never
fire on an expired event, and never change a numeric reading — only status and prose. An
event with no matching rule is inert.

The escalation `OK → WATCH` on `curve` is the whole point: on 2026-08-19 the monitor would
have moved off "benign" and said *why*.

## 6. Surfacing

- **Factor card** — where attribution fired, a line under the headline: *"Reading adjusted:
  Treasury doubled long-end buybacks (19 Aug). A long-end rally under issuer support is not
  a demand signal."* with `sourceUrl` linked. Never silent: an adjusted status must show its
  cause or it is just an unexplained number.
- **New POLICY EVENTS band** beside SOURCE PROBLEMS — live and announced events, collapsed,
  with effective windows. Answers "what is the sovereign currently doing to its own curve?"
- **Snapshot** — `events: PolicyEvent[]` at top level. Costs nothing now and gives the
  future narrator real material: *"yields fell, but the issuer was bidding."*

## 7. Supabase — separate work, noted for interface compatibility

Not in this spec. Recorded because §4's interface should not need redesigning:

```sql
create table if not exists policy_events (
  id text primary key, date date not null, effective_from date, effective_to date,
  kind text not null, actor text not null, surface text[] not null,
  direction text not null, magnitude jsonb, affects text[] not null,
  source_url text, note text, entered_at timestamptz not null default now()
);
```

Independently, Supabase remains the single biggest upgrade available: production currently
runs `latestSnapshot() ?? assess()` with no DB, so **every visit re-runs ~48 external API
calls**, the narrative band has never worked (no previous snapshot to diff), alert
fire-once cannot dedupe, and `manual_inputs` returns null.

## 8. Verification

1. **Unit** — `attribute()` against the real 2026-08-19 event: a synthetic `bull-flattening`
   at `dLongBp3m = -30, dFrontBp3m = 0` must go `OK → WATCH` with the event cited.
2. **Negative** — same curve reading with the event's `effectiveTo` in the past must stay
   `OK`. Expiry is the rule most likely to rot.
3. **Invariants** — property test over the event corpus: attribution never lowers a status,
   never mutates a numeric field, and is idempotent.
4. **Inert event** — an event whose `affects` matches nothing changes no reading.
5. **Schema** — every row in `policy-events.json` validates against the closed `kind`,
   `direction`, `actor` and `surface` sets; dates parse; `effectiveFrom ≤ effectiveTo`.
6. **End-to-end** — `npm run selftest`, `tsc --noEmit`, `npm run build`, then `next start`
   and confirm the POLICY EVENTS band renders with the buyback event and the curve card
   carries its attribution line.

## 9. Falsifier

If, over the next two refunding quarters, no attribution rule ever changes a status that a
human reviewer agrees should have changed, the lane is ceremony — delete it and keep the
events as display-only context. The rules are deliberately narrow so this stays answerable.
