# Sovereign Vitals — Dalio Framework Monitor

Automated monitor of the US position in the small and big debt cycles from
*How Countries Go Broke*, encoding the Aug-2026 analysis (v2, post-restatement).
When a print lands, it doesn't just store the number — it recomputes the
framework factor that number feeds and files a tiered alert if a watchlist
trigger crosses.

## How a print connects to the framework

| Print / feed | Source | Factor(s) it updates | The connection |
|---|---|---|---|
| NFP + ALFRED vintage diffs | FRED `PAYEMS` | Small cycle, r-vs-g, tax base | Revisions are a first-class signal (May+Jun −103k). A payroll contraction knocks ~3pp off nominal g → the r>g crossing is a **recession event**, not a projection |
| CPI headline/core | FRED `CPIAUCSL`/`CPILFESL` | Monetisation valve (S8) | Core 2.5% means the block is the **war**, not wages. Valve keys off core-to-target, gated by the energy wedge |
| Brent live | OANDA `BCO_USD` | S8 energy gate | Brent <80 + headline <3 → valve reopens within a quarter |
| Avg interest rate on debt | FiscalData `avg_interest_rates` | S7 hinge | rAvg (~3.4%) vs g; drift = (10Y − rAvg) × 12m rollover share |
| 10Y/30Y/2Y, term premium, real 10Y | FRED | S6, SoV | Marginal cost; long-end-on-easing T2 detector; gold/real-yield divergence T3 |
| MTS table 9 | FiscalData | S1/S3/TAX | TTM interest/receipts (19% → 20% = loss-of-discretion line); receipts YoY ÷ GDP YoY = **revenue beta** (capex-led GDP that doesn't tax like payroll GDP; war supplementals land here) |
| 10Y auctions | TreasuryDirect `TA_WS` | S5 plumbing | Bid-to-cover + primary-dealer takedown = the bid thinning before the yield shows it |
| Fed assets + deferred asset | FRED `WALCL`, `RESPPLLOPNWW` | S8 / Stage-5 | Deferred asset = Dalio's Stage-5 metric, literal: **−$243.9bn** Apr-26. Assets rising 3wks while headline >3 = the one unprinted marker → Stage 6 confirmed |
| Gold + FX | OANDA `XAU_USD`,`EUR_USD`,`USD_JPY` | SoV | Decompose gold into USD/EUR/JPY numeraires: up in all three = credit flight, not a dollar trade |
| HY/BBB OAS + AI basket | FRED + Yahoo | Private-credit leg | The "skipped" private binge lives here: ~$800bn circular deals, $570bn 2026 AI debt, coverage 5x→<2x. OAS is the best free daily proxy |
| Japan: TIC + JGB + yen | FRED TIC (Jun-26 addition) + OANDA | JP leg | All three moving together = repatriation of the largest foreign bid ($1.2trn) |

Machine-checkable triggers (`framework/math.mjs → evaluateTriggers`) implement
the watchlist: T1 r≥g (incl. the recession-event form), T1 monetise-while-hot;
T2 interest ≥20% of revenue, long-end selloff on a cut, bills-share migration;
T3 gold/real-yield divergence, Japan absolute decline, auction plumbing.

## What's honest about this system

- **20/20 selftest** (`npm run selftest`, zero deps): the shipped math
  reproduces every conclusion of the underlying analysis from the raw
  Aug-2026 numbers, including that the monetisation trigger does *not*
  fire yet — that's the Top/Deleveraging boundary.
- **Auto vs curated is explicit.** Hyperscaler bond coverage, Moody's
  uncommenced leases, and (until the FRED TIC series id is pinned) Japan's
  monthly holdings have no API; they live in `manual_inputs` with source
  URLs and a 90-day staleness rule, never silently interpolated.
- **Judgment triggers are approximations.** "Long end sells off on dovish
  news" is proxied as DGS30 +≥8bp on a funds-cut day — documented, editable.
- **Degrades gracefully.** Any dead source is reported in `problems`, not
  fatal. No Supabase → stateless mode via `/api/live?fresh=1`.

## Deploy

**Via connectors (preferred):** connect Vercel + Supabase, then the next
step is: create Supabase project → run `supabase/migrations/0001_init.sql`
→ create Vercel project from this repo → set env from `.env.example` →
deploy → hit `/api/cron/refresh` once to seed.

**Manual:** `npx vercel` from the repo root; paste the migration into the
Supabase SQL editor; set env vars in the Vercel dashboard.

**Cadence:** two Vercel crons (13:50 UTC — after 8:30 ET prints; 21:30 UTC —
after auctions/close). Hobby plans limit crons to daily, so
`.github/workflows/poll.yml` optionally boosts to hourly during release
windows using `APP_URL` + `CRON_SECRET` repo secrets.

## Keys

FRED (free, instant), OANDA (practice account token is fine — pricing is
identical), optional Anthropic key for the "what changed" narrative,
optional Supabase for persistence + alert history.

## Roadmap

1. Pin the FRED TIC Japan series id (`fredSearchTic("Japan")` helper is in
   `clients.ts`) and retire the manual input.
2. Automate 12m rollover share from MSPD (`v1/debt/mspd`) — this drives the
   r-avg drift rate and the crossing clock.
3. BEA NIPA (free key) → true AI-capex GDP contribution → ex-AI nominal g
   next to headline g on the S7 row.
4. Bills-share-of-issuance T2 trigger from MSPD composition.
5. Alert delivery (Resend email / Slack webhook) off the `alerts` table.
