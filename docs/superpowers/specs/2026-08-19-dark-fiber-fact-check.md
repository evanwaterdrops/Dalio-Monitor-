# Dark Fiber template — fact-check ledger (2026-08-19)

Verification of Evan's "Dark Fiber Template" document (telecom 1996–2004 ↔ AI
2023–26) before ingestion as playbook theme #1. Four parallel web-search agents
checked ~45 claims against primary sources. Verdict: largely solid; 11 corrections,
4 unverifiables. Figures below carry the flag the theme file must use.

## Corrections (apply before ingesting)

| # | Claim in doc | Correction | Source |
|---|---|---|---|
| 1 | Nvidia committed up to $100bn to OpenAI | Sept-2025 LOI **never consummated**; replaced Feb-2026 by a **$30bn equity stake** in OpenAI's $110bn round + binding 3GW inference / 2GW training hardware commitments. Web sizing: best-sourced **>$750bn** (Bloomberg, Jul-2026), not >$800bn | Nvidia IR; Investing.com; Bloomberg 2026-07-27 |
| 2 | Alphabet "raised $84.75bn of equity in June 2026" | **Priced an $84.75bn equity program** (common + mandatory converts + $40bn ATM + $10bn Berkshire placement); ~$49.6bn cash received in Q2; separate $20.3bn senior notes | Alphabet IR 2026-06-03; SEC FWP |
| 3 | Alphabet uncommenced leases $23.9bn→$42.6bn "in a single quarter" (implied 2026) | Real, but **Q2-2025 → Q3-2025** | Calcbench; Alphabet 10-Qs |
| 4 | Amazon $53.4bn Anthropic gain "flows through operating results" | Figure right; ran through **non-operating income** (operating income $27.5bn, +43%) | Amazon Q2-2026 release |
| 5 | S&P Q2-26 EPS +50.4% headline vs +32.0% "underlying/ex one-offs" | FactSet's split is **excluding Alphabet and Amazon as companies**, not an ex-gains line item. Substantively same point | FactSet Earnings Insight 2026-08-07 |
| 6 | 2s10s "re-steepened to ~+35bps" | **~+48–52bps** mid-Aug-2026; +35bps traces to one secondary commentary | yieldcurve.pro; centralbank.watch |
| 7 | CoreWeave rebuttal cites "~95% resale values" on H100/A100 | **~95% re-lease rate** (off-contract H100s rebooked near original rental rate), not resale value | CNBC 2025-11-14; Tom's Hardware |
| 8 | Greenwood–Shleifer–You: run-up alone barely moves crash odds; added attributes take 20%→80% | **Run-up size alone spans 20%→80%** (50%→150% net-of-market); attributes sharpen further. Run-up fails to predict low *average* returns (Fama's point). ~6-month later peak, ~30% further gain: confirmed | Bubbles for Fama (JFE); NBER w23191 |
| 9 | Media+telecom 44% of defaults 2001, 65% 2002 | Telecom/communications ≈ **55% of defaulted dollars 2001, 52% 2002** | Altman, NYU Salomon 2002 |
| 10 | HY issuance averaged $148bn/yr 1997–98, from $45bn 1995–96 | **$148bn was 1998 alone**; 1997 ~$119bn (avg ~$133bn); 1995–96 avg ~$50bn | Altman/NYU series |
| 11 | "Cisco survived on net cash and no vendor-financing dependence" | Cisco **did** vendor-finance (~$2.4bn committed, ≈30% of Lucent's $8.1bn; nine vendors ~$25.6bn end-2000) but carried no long-term debt. Phrase: "limited vendor financing, no balance-sheet dependence" | TheStreet 2000; McKinsey |

Minor sharpenings (claim understated or window off, direction unchanged): forward P/E
compression was ~23.1x (Oct-25) → ~20.0 (Aug-26) — the doc's 20.4→20.0 is only the
Q2-to-Aug leg; Goetzmann's ~10% is "gives back the gains within 5 years" (halving
odds after a 1-yr doubling: ~6.9% next year, ~17% over five); the "3x prior decade's
tech issuance" stat is Breckinridge's 2025 characterization (2026 runs hotter);
Lucent peak price cited variously $64.47–$84.19 (−99% holds either way); Nortel
~35–36.5% of TSE 300.

## Unverified — carry as `unverified`, render dimmed

- Media+telecom = 45% / 57% of HY new issuance 1999 / 2000 (traces only to the
  uncited Fabricated Knowledge post, apparent origin of several telecom figures)
- ~$800bn telecom M&A in 1999 (plausible — Vodafone–Mannesmann ~$183bn, WorldCom–
  Sprint ~$129bn — no primary total found)
- Fibre ~10% lit by 2004; wholesale long-haul prices −55% y/y 2004 (the <5%-by-2002
  half IS confirmed: TeleGeography 3.9% lit through Chicago; WSJ 2.7% in-use)
- Oracle 5Y CDS "~43bps mid-2025" (use "<50bps pre-OpenAI-deal", which is sourced)

## Confirmed highlights (with upgraded sources)

- **Telecom skeleton:** Richmond Fed *Boom and Bust in Telecommunications* (Couper/
  Hejkal/Wolman 2003) confirms 72%→30% incumbent fibre share 1996→99, comm-equipment
  investment $62bn→$135bn/yr (const-1996$, ~18%/yr), and the UUNET/WorldCom origin of
  "doubles every 100 days" → Commerce Dept *Emerging Digital Economy* (Apr-1998);
  Coffman & Odlyzko: actual ~100%/yr.
- **"Ricci" identified:** Cecilia Wagner Ricci (Montclair State), in Newsweek "The
  Stupid Loan Bubble" (2002-10-27). Bad-loan shares end-2000→end-2001 — Lucent
  2.6%→60%, Nortel 25.5%→80%, Motorola 6.7%→57% — **match exactly**.
- Lucent: $2bn Winstar facility (Oct-1998); Winstar Ch.11 2001-04-18/19 owing ~$800m+;
  provisions ~$2.2bn FY01 / ~$1.3bn FY02 (Lazonick & March, MPRA).
- Telecom HY spreads 2,100bps (Oct-02) → 500bps (Jul-04): FRBSF Letter 2004-32.
  ~$2tn telecom market value destroyed: Starr, *American Prospect* 2002.
- **2026 credit:** Oracle 5Y CDS record ~203bps 2026-07-24 → ~215bps mid-Aug (4x from
  <50bps); S&P cut Oracle to BBB− 2026-07-09 (neg. FCF ~−$24bn FY26; OpenAI ≈ half of
  $638bn RPO); CoreWeave 5Y CDS ~855bps ≈ ~50% cum. 5-yr default prob. at 40%
  recovery, loan spreads +125bps, covenant demands; HY OAS 271bps (2026-08-12) vs
  ~450bps long-run median; IG ~81bps; EFFR 3.63%; Oracle equity +11% vs record CDS
  divergence (early Aug) — all confirmed.
- **2026 financing:** capex ≈94% of hyperscaler OCF 2026–27 (PIMCO/Epoch/FactSet);
  incremental debt 9%→32% of capex FY24→LTM (FactSet); Alphabet Q2-26 FCF −$5.9bn,
  first negative since 2004 IPO (TTM +$53.3bn); buyback halts (Alphabet $13.2bn→$0,
  Meta $0 in Q1-26); hyperscaler IG issuance $194bn H1-26; Moody's $662bn uncommenced
  leases = 113% adj. debt / Goldman ~$1tn / Reuters bottom-up ~$1.09tn, Oracle ~$260bn;
  MSFT ~70% fund-level leverage via AI Infrastructure Partnership (BlackRock/GIP, MGX);
  Burry (Nov-25): ~$176bn understated depreciation 2026–28, Oracle ~26.9% / Meta
  ~20.8% overstated by 2028 — confirmed as claims, contested by CoreWeave/Nvidia.
- **2026 ecosystem:** Google Cloud +82% ($24.8bn), Azure +43%, AWS +37% (Q2-CY26);
  Alphabet ~$98bn investment gains (Anthropic $350bn→$965bn; SpaceX IPO stake ~$94bn);
  **no AI-vendor receivable write-down through mid-Aug-2026** (Nvidia allowance ~0.02%
  of AR; three customers = 30/18/16% of AR) — the tripwire-02 baseline.
- **Base rates:** Goetzmann NBER w21693 (42 markets, 1900–2014); Jordà–Schularick–
  Taylor NBER w21486 (credit-fueled equity bubbles: ≈+1yr recession, ~3pp GDP/capita
  drag) — accurately characterized.
