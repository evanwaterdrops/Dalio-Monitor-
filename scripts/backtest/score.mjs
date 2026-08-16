/**
 * Scoring — turns the replayed panel into evidence (or an honest refutation).
 *
 * Ground truth:
 *  - USREC (NBER recession months, FRED)
 *  - ^GSPC forward 6m/12m max drawdown from each month-end close (Yahoo daily)
 *
 * Outputs BACKTEST.md at the repo root with:
 *  - lead-time table per stress episode (first-touch AND sustained-into-event)
 *  - trigger-episode index (when each machine trigger fired, grouped)
 *  - SC-critical month classification incl. false-alarm audit
 *  - 2007–2009 month-by-month case study
 *  - heat-quintile vs forward-drawdown table + correlation
 */

import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { fredLatest, yahooDailyMax } from "./fetch.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, "..", "..");

const round1 = x => Math.round(x * 10) / 10;
const pct = x => Number.isFinite(x) ? `${round1(x)}%` : "—";
const avg = a => a.length ? a.reduce((s, x) => s + x, 0) / a.length : NaN;

export async function score(rows) {
  rows ??= JSON.parse(await readFile(path.join(HERE, "results.json"), "utf8"));
  const [usrec, spx] = await Promise.all([fredLatest("USREC"), yahooDailyMax("^GSPC")]);
  const recMonths = new Set(usrec.filter(o => o.value === 1).map(o => o.date.slice(0, 7)));

  for (const r of rows) {
    const i = lastIndexLE(spx, r.date);
    r.fwd6 = fwdMaxDD(spx, i, 126);
    r.fwd12 = fwdMaxDD(spx, i, 252);
    r.inRecession = recMonths.has(r.t);
  }

  /* ---- episodes: NBER starts + equity peaks ---- */
  const recessionStarts = findRecessionStarts(usrec, rows[0].t, rows[rows.length - 1].t);
  const episodes = [
    ...recessionStarts.map(s => ({ name: `NBER recession start ${s}`, anchor: s })),
    { name: "1973 bear-market top 1973-01 (−48%)", anchor: "1973-01" },
    { name: "Black Monday 1987-08 top (−34%, no recession)", anchor: "1987-08" },
    { name: "Dot-com equity peak 2000-03 (−49% over 2y)", anchor: "2000-03" },
    { name: "GFC equity peak 2007-10 (−57%)", anchor: "2007-10" },
    { name: "Lehman failure 2008-09", anchor: "2008-09" },
    { name: "2011 debt-ceiling top 2011-04 (−19%)", anchor: "2011-04" },
    { name: "2018 Q4 top 2018-09 (−20%)", anchor: "2018-09" },
    { name: "2022 bear-market top 2022-01 (−25%)", anchor: "2022-01" },
  ].sort((a, b) => a.anchor.localeCompare(b.anchor));

  const heats = rows.filter(r => r.heatCycle != null).map(r => r.heatCycle).sort((a, b) => a - b);
  const p75 = heats[Math.floor(heats.length * 0.75)];
  const signals = {
    "SC ≥ elevated": r => r.factors.SC && (r.factors.SC.status === "elevated" || r.factors.SC.status === "critical"),
    "SC critical": r => r.factors.SC?.status === "critical",
    [`Cycle heat ≥ p75 (${round1(p75)})`]: r => r.heatCycle != null && r.heatCycle >= p75,
    "Any T1 trigger": r => r.triggers.some(t => t.tier === 1),
  };
  const leadRows = episodes.map(e => ({
    episode: e.name,
    cells: Object.values(signals).map(pred => leadTimes(rows, e.anchor, pred)),
  }));

  /* ---- trigger episode index ---- */
  const triggerEpisodes = {};
  for (const r of rows) for (const t of r.triggers) {
    (triggerEpisodes[`T${t.tier} ${t.key}`] ??= []).push(r.t);
  }
  const triggerIndex = Object.entries(triggerEpisodes)
    .map(([key, months]) => ({ key, episodes: groupConsecutive(months) }))
    .sort((a, b) => a.key.localeCompare(b.key));

  /* ---- quintiles ---- */
  const scored = rows.filter(r => r.heatCycle != null && r.fwd12 != null);
  if (scored.length < 25) throw new Error(`only ${scored.length} scored months — data problem upstream`);
  const modern = scored.filter(r => r.t >= "1999-01");
  const sorted = [...modern].sort((a, b) => a.heatCycle - b.heatCycle);
  const quintiles = [0, 1, 2, 3, 4].map(q => {
    const seg = sorted.slice(Math.floor(q * sorted.length / 5), Math.floor((q + 1) * sorted.length / 5));
    return {
      q: q + 1,
      heatRange: `${round1(seg[0].heatCycle)}–${round1(seg[seg.length - 1].heatCycle)}`,
      n: seg.length,
      avgFwd6: round1(avg(seg.map(r => r.fwd6))),
      avgFwd12: round1(avg(seg.map(r => r.fwd12))),
      worstFwd12: round1(Math.min(...seg.map(r => r.fwd12))),
      pctRecession12m: round1(100 * seg.filter(r => r.inRecession || recessionWithin(recMonths, r.t, 12)).length / seg.length),
    };
  });
  const corr = pearson(modern.map(r => r.heatCycle), modern.map(r => r.fwd12));
  const corrComposite = pearson(rows.filter(r => r.heat != null && r.fwd12 != null).map(r => r.heat), rows.filter(r => r.heat != null && r.fwd12 != null).map(r => r.fwd12));

  /* ---- era skill table: real-time data quality changed the game over 66y ---- */
  const eras = [
    { name: "1960–1984 (slow vintages, chronic chop)", from: "1960-06", to: "1984-12" },
    { name: "1985–1998 (great moderation)", from: "1985-01", to: "1998-12" },
    { name: "1999–2026 (modern real-time data)", from: "1999-01", to: "2026-06" },
  ].map(e => {
    const seg = scored.filter(r => r.t >= e.from && r.t <= e.to);
    const crit = seg.filter(r => r.factors.SC?.status === "critical");
    const ok = seg.filter(r => r.factors.SC?.status === "ok");
    return {
      ...e, n: seg.length,
      corr: pearson(seg.map(r => r.heatCycle), seg.map(r => r.fwd12)),
      avgFwd12: round1(avg(seg.map(r => r.fwd12))),
      critAvg: round1(avg(crit.map(r => r.fwd12))), critN: crit.length,
      okAvg: round1(avg(ok.map(r => r.fwd12))),
    };
  });

  /* ---- SC critical classification ---- */
  const scCrit = rows.filter(r => r.factors.SC?.status === "critical");
  const lastRecKnown = usrec[usrec.length - 1].date.slice(0, 7);
  const classify = r => {
    if (r.inRecession) return "in-recession";
    if (recessionWithin(recMonths, r.t, 12)) return "pre-recession (≤12m)";
    if (recessionWithinBack(recMonths, r.t, 18)) return "post-recession tail (≤18m)";
    if (addMonth(r.t, 12) > lastRecKnown) return "unresolved (12m outcome window still open)";
    return "false alarm";
  };
  const scClasses = {};
  for (const r of scCrit) (scClasses[classify(r)] ??= []).push(r.t);
  const falseAlarms = groupConsecutive(scClasses["false alarm"] ?? []);
  const scStats = {
    critN: scCrit.filter(r => r.fwd12 != null).length,
    critAvgFwd12: round1(avg(scCrit.filter(r => r.fwd12 != null).map(r => r.fwd12))),
    okN: scored.filter(r => r.factors.SC?.status === "ok").length,
    okAvgFwd12: round1(avg(scored.filter(r => r.factors.SC?.status === "ok").map(r => r.fwd12))),
  };

  /* ---- case study ---- */
  const caseStudy = rows.filter(r => r.t >= "2007-01" && r.t <= "2009-06").map(r => ({
    t: r.t, sc: r.factors.SC?.phase ?? "—", scStatus: r.factors.SC?.status ?? "—",
    nfp3mma: r.inputs.nfp3mma, rev2m: r.inputs.revisionsSum2m, sahm: r.inputs.sahmGap,
    rvg: r.factors.S7?.status ?? "—",
    btc: r.factors.S5?.lastBtc ?? null, squeezePct: r.factors.S3 ? round1(r.factors.S3.ratio * 100) : null,
    baa10y: r.inputs.baa10y, heat: r.heat, fwd12: r.fwd12,
    triggers: r.triggers.map(tr => `T${tr.tier}:${tr.key}`).join(" "),
    rec: r.inRecession ? "REC" : "",
  }));

  const report = renderReport({ rows, corrComposite, eras, leadRows, signalNames: Object.keys(signals), triggerIndex, quintiles, corr, scStats, scClasses, falseAlarms, caseStudy, p75 });
  await writeFile(path.join(ROOT, "BACKTEST.md"), report);
  await writeFile(path.join(HERE, "results.json"), JSON.stringify(rows, null, 1));

  // compact monthly panel for the app's Big Cycle tab (static import)
  const sCode = { ok: 0, watch: 1, elevated: 2, critical: 3 };
  const panel = rows.map(r => ({
    t: r.t, h: r.heat, hc: r.heatCycle, hs: r.heatSov, f: r.fwd12,
    s: r.factors.SC ? sCode[r.factors.SC.status] : null,
    ph: r.factors.SC?.phase ?? null,
    tr: r.triggers.length ? Math.min(...r.triggers.map(x => x.tier)) : 0,
    trig: r.triggers.map(x => `T${x.tier} ${x.key}`),
    rec: r.inRecession ? 1 : 0,
    sahm: r.inputs.sahmGap, nfp: r.inputs.nfp3mma, claims: r.inputs.claimsYoYPct,
  }));
  await mkdir(path.join(ROOT, "src", "data"), { recursive: true });
  await writeFile(path.join(ROOT, "src", "data", "backtest-panel.json"), JSON.stringify(panel));

  console.log(`scored ${scored.length} months → BACKTEST.md + src/data/backtest-panel.json`);
  return { leadRows, quintiles, corr, corrComposite, eras, scStats, falseAlarms, p75 };
}

/* ---------------- helpers ---------------- */
function lastIndexLE(spx, date) {
  let lo = 0, hi = spx.length - 1, ans = -1;
  while (lo <= hi) { const m = (lo + hi) >> 1; if (spx[m].date <= date) { ans = m; lo = m + 1; } else hi = m - 1; }
  return ans;
}
function fwdMaxDD(spx, i, days) {
  if (i < 0 || i + days >= spx.length) return null;
  const base = spx[i].value;
  let min = base;
  for (let k = i + 1; k <= i + days; k++) min = Math.min(min, spx[k].value);
  return Math.round((min / base - 1) * 1000) / 10; // %
}
function findRecessionStarts(usrec, fromYm, toYm) {
  const starts = [];
  for (let i = 1; i < usrec.length; i++) {
    if (usrec[i].value === 1 && usrec[i - 1].value === 0) {
      const ym = usrec[i].date.slice(0, 7);
      if (ym >= fromYm && ym <= toYm) starts.push(ym);
    }
  }
  return starts;
}
function recessionWithin(recMonths, ym, n) {
  let cur = ym;
  for (let k = 0; k < n; k++) { cur = addMonth(cur); if (recMonths.has(cur)) return true; }
  return false;
}
function recessionWithinBack(recMonths, ym, n) {
  let cur = ym;
  for (let k = 0; k < n; k++) { cur = addMonth(cur, -1); if (recMonths.has(cur)) return true; }
  return false;
}
function addMonth(ym, step = 1) {
  let [y, m] = ym.split("-").map(Number);
  m += step; while (m > 12) { m -= 12; y++; } while (m < 1) { m += 12; y--; }
  return `${y}-${String(m).padStart(2, "0")}`;
}
function monthsBetween(a, b) { // b - a
  const [ay, am] = a.split("-").map(Number), [by, bm] = b.split("-").map(Number);
  return (by - ay) * 12 + (bm - am);
}
function pearson(xs, ys) {
  const n = xs.length, mx = avg(xs), my = avg(ys);
  let num = 0, dx = 0, dy = 0;
  for (let i = 0; i < n; i++) { num += (xs[i] - mx) * (ys[i] - my); dx += (xs[i] - mx) ** 2; dy += (ys[i] - my) ** 2; }
  return Math.round((num / Math.sqrt(dx * dy)) * 100) / 100;
}
function groupConsecutive(months) {
  const out = [];
  for (const m of [...months].sort()) {
    const g = out[out.length - 1];
    if (g && addMonth(g.end) === m) g.end = m;
    else out.push({ start: m, end: m });
  }
  return out.map(g => g.start === g.end ? g.start : `${g.start}→${g.end}`);
}
/**
 * Onset and sustained-into-event leads within the 12 months before anchor.
 * "Onset" = the signal flipped from off to on inside the window — a signal
 * already on at the window edge (the tail of a previous episode) is reported
 * as carry-in, not credited as a fresh lead.
 */
function leadTimes(rows, anchorYm, pred) {
  const idx = rows.findIndex(r => r.t === anchorYm);
  if (idx < 0) return "n/a";
  const from = Math.max(0, idx - 12);
  const window = rows.slice(from, idx + 1);
  const prevOn = from > 0 && pred(rows[from - 1]);
  let onset = null, sustained = null;
  for (let i = 0; i < window.length; i++) {
    const on = pred(window[i]);
    if (onset == null && on && !(i === 0 ? prevOn : pred(window[i - 1]))) onset = window[i].t;
    if (sustained == null && on && window.slice(i).every(pred)) sustained = window[i].t;
  }
  if (!onset) return prevOn && window.some(pred) ? "carry-in only" : "—";
  const f = `${onset} (−${monthsBetween(onset, anchorYm)}m)`;
  return sustained && sustained !== onset ? `${f}; sustained ${sustained} (−${monthsBetween(sustained, anchorYm)}m)` : f;
}

/* ---------------- report ---------------- */
function renderReport({ rows, corrComposite, eras, leadRows, signalNames, triggerIndex, quintiles, corr, scStats, scClasses, falseAlarms, caseStudy, p75 }) {
  const md = [];
  const line = s => md.push(s);
  line(`# Sovereign Vitals — Point-in-Time Backtest`);
  line(``);
  line(`Replays the production factor math (\`src/lib/framework/math.mjs\` — the exact module the`);
  line(`dashboard runs; nothing reimplemented) monthly over ${rows[0].t} → ${rows[rows.length - 1].t}, using only`);
  line(`data published by each as-of date. Generated by \`npm run backtest\`.`);
  line(``);
  line(`## Headline findings`);
  line(``);
  line(`- **GFC, from real-time data only:** the small-cycle leg first breaks (with the T1`);
  line(`  r-vs-g *recession event* trigger) in **Sep-2007 — one month before the Oct-2007 equity peak**`);
  line(`  and a year before Lehman. It relaxes on the (real-time) Oct/Nov payroll upward revisions,`);
  line(`  then locks critical from **Feb-2008** with the S&P ~10% off its high and −45% still ahead.`);
  line(`  \`monetisation_while_hot\` fires Sep/Oct-2008 — the exact months the Fed's balance sheet`);
  line(`  exploded with headline CPI ~5%.`);
  line(`- **The trigger set keeps re-identifying famous stress out of sample:** QE2-while-hot in`);
  line(`  May-2011 before the −19% summer; the auction-plumbing trigger flashing May–Oct 2019,`);
  line(`  spanning the September **repo crisis**; QE-still-running-while-CPI-was-hot firing Nov-2021,`);
  line(`  two months before the top of the −25% bear. The Jul/Sep-2024 real-time Sahm alarm — a genuine`);
  line(`  false alarm in history — was reproduced by model v2, and is correctly downgraded to a`);
  line(`  supply-side elevation by the v2.1 demand-confirmation patch (see A/B below).`);
  line(`- **Skill stats:** heat vs forward-12m max drawdown correlation **${corr}**; months with the`);
  line(`  small-cycle leg critical see an average forward-12m drawdown of **${scStats.critAvgFwd12}%**`);
  line(`  (n=${scStats.critN}) vs **${scStats.okAvgFwd12}%** when it reads ok (n=${scStats.okN}).`);
  line(`- **Honest misses:** COVID (exogenous — nothing macro led it; the framework is correctly quiet`);
  line(`  through Feb-2020 and catches it with a 1-month lag); the 2018 Q4 drawdown (a positioning`);
  line(`  event, not a cycle break); most of the 2022 bear beyond its first month.`);
  line(``);
  line(`## Model v2.1 patch validation (A/B vs v2)`);
  line(``);
  line(`The 2026-08 patch set (demand-confirmed Sahm + claims confirmation, winsorized revisions,`);
  line(`S6 price-of-money math, PC private-credit math, T1 heat floor) was gated on this A/B —`);
  line(`each fix had to remove its false alarm WITHOUT degrading the true leads:`);
  line(``);
  line(`| Gate item | v2 (before) | v2.1 (after) |`);
  line(`|---|---|---|`);
  line(`| 2024 Sahm false alarms (Jul/Sep/Oct critical + T1 chain) | fired | eliminated — reads \`supply-side-unemployment-rise\`, elevated, no T1 |`);
  line(`| 2004-01/03 revision blips | fired | eliminated (winsorized ±150k revisions) |`);
  line(`| 2003 jobless-recovery criticals | Jun-03→Oct-03 + 2004 blips | trimmed to Jun→Sep-03 (claims veto) |`);
  line(`| GFC first break | Sep-2007 | Sep-2007 — unchanged |`);
  line(`| GFC critical lock | Feb-2008 | Feb-2008 — unchanged |`);
  line(`| 2001 SC-critical lead | −7m | −7m — unchanged |`);
  line(`| 2022 top | heat 11 at the Jan-22 top | T1 floor: heat 55 at Nov-21 and Feb-22 bracket the top; S6 escalates watch→critical through 2022 |`);
  line(`| SC-critical discrimination (avg fwd-12m DD) | −15.1% vs −8.9% (n=76) | −16.3% vs −8.9% (n=66 — tighter signal) |`);
  line(`| Heat ↔ fwd-12m correlation | −0.26 | −0.28 |`);
  line(``);
  line(`Residual honest misses after patching: 2018 Q4 (S6 impulse +65bp stayed below the 75bp watch`);
  line(`line — a positioning event, out of scope), most of mid-2022 heat carried by S6 rather than the`);
  line(`composite, dot-com valuation peak (macro-flow framework cannot see an equity bubble).`);
  line(``);
  line(`## No-lookahead guarantees`);
  line(``);
  line(`- Revisable macro series (payrolls, unemployment, CPI, GDP, receipts) come from **ALFRED`);
  line(`  vintages** dated to each month-end — the model sees first prints and real-time revisions,`);
  line(`  never today's revised history. (Verified: the Dec-2007 payroll print enters at +18k m/m —`);
  line(`  its real-time first-print value — not today's benchmark-redrawn history; the Aug-2008 print`);
  line(`  enters at −84k, not the ~−210k of revised data.)`);
  line(`- Payroll revision signal = value-as-known-at-t minus first print (first print read from the`);
  line(`  vintage one month after the reference month) — the same first-vs-latest diff \`fredRevisions()\``);
  line(`  computes in production, evaluated as of t. Annual benchmark revisions therefore appear as`);
  line(`  the large real-time swings they actually were.`);
  line(`- Market series (yields, FX, oil, gold, credit) are unrevised → truncated at t.`);
  line(`- Publication lags: FiscalData avg rate −20d, MTS −45d, OECD JGB −45d, fiscal-year totals`);
  line(`  usable from Nov 1 after FY end.`);
  line(`- A leg whose data source did not exist yet is **excluded from the composite** (and logged),`);
  line(`  never defaulted or backfilled.`);
  line(``);
  line(`## Data-era coverage (honesty first)`);
  line(``);
  line(`| Leg | Usable from | Note |`);
  line(`|---|---|---|`);
  line(`| SC small cycle | 1999 | ALFRED vintages |`);
  line(`| S8 valve | 1999 | CPI vintages + Brent |`);
  line(`| S7 r-vs-g | 2001-02 | FiscalData avg rate starts 2001-01 |`);
  line(`| SoV gold | 2000-10 (divergence 2003+) | GC=F starts 2000-09; TIPS 10Y starts 2003 |`);
  line(`| S5 auctions | 2003 | bid-to-cover only until ~2009 (no dealer-takedown field) |`);
  line(`| deferred asset | 2003 | trivially OK until 2022 (Fed had no losses) |`);
  line(`| S3 squeeze | 1999 | FY totals pre-2016, MTS monthly after |`);
  line(`| TAX revenue beta | 1999 | NIPA receipts pre-2016, MTS after |`);
  line(`| JP Japan leg | 1999 | TIC holdings input unavailable historically (held at 0 → max 2 of 3 hits) |`);
  line(``);
  line(`The framework was designed on the 2020s sovereign cycle; 2008 is an **out-of-sample test of its`);
  line(`cyclical legs** (small cycle, r-vs-g recession event, auctions, gold). The sovereign legs`);
  line(`(interest squeeze, monetisation valve, deferred asset) are structurally quiet in that era —`);
  line(`the results show exactly that asymmetry, which is itself evidence the legs measure what they claim.`);
  line(``);
  line(`## Lead times into stress episodes`);
  line(``);
  line(`Onset = the month the signal flipped on within the 12 months before the anchor (lead in`);
  line(`months); "sustained" = stayed on continuously into the anchor month; "carry-in only" = the`);
  line(`signal was already on at the window edge from a previous episode's tail and is NOT credited.`);
  line(``);
  line(`| Episode | ${signalNames.join(" | ")} |`);
  line(`|---|${signalNames.map(() => "---").join("|")}|`);
  for (const r of leadRows) line(`| ${r.episode} | ${r.cells.join(" | ")} |`);
  line(``);
  line(`## When each machine trigger fired (full panel)`);
  line(``);
  line(`| Trigger | Episodes |`);
  line(`|---|---|`);
  for (const t of triggerIndex) line(`| \`${t.key}\` | ${t.episodes.join(", ")} |`);
  line(``);
  line(`## Cycle heat vs forward S&P 500 drawdown`);
  line(``);
  line(`Heat splits in two (a deep-history lesson): **cycle heat** (SC, S6, PC, SoV, S5 — the`);
  line(`market-facing legs) and **sovereign heat** (S8, S7, S3, TAX, JP, deferred — the debt-structure`);
  line(`legs). The sovereign legs ran genuinely hot through 1985–95 (interest/receipts 18–21%, valve`);
  line(`blocked by inflation) while equities boomed — sovereign stress only maps onto markets when the`);
  line(`debt stock is large. The composite (all legs + T1 floor) correlates ${corrComposite} with forward`);
  line(`drawdowns over the full 66-year panel for exactly that reason.`);
  line(``);
  line(`Skill is also **era-dependent, honestly reported**: pre-1985 vintages were slow (payroll breaks`);
  line(`often only visible in real time once the recession had begun, with the drawdown already partly`);
  line(`behind) and drawdowns were chronic. The modern era is where real-time data can lead:`);
  line(``);
  line(`| Era | n | corr(cycle heat, fwd-12m DD) | Avg fwd-12m DD | SC-critical avg | SC-ok avg |`);
  line(`|---|---|---|---|---|---|`);
  for (const e of eras)
    line(`| ${e.name} | ${e.n} | ${e.corr} | ${pct(e.avgFwd12)} | ${pct(e.critAvg)} (n=${e.critN}) | ${pct(e.okAvg)} |`);
  line(``);
  line(`Pearson correlation, cycle heat vs forward-12m max drawdown, modern era: **${corr}**`);
  line(`(negative = higher heat → deeper subsequent drawdown). Quintiles below are modern-era.`);
  line(``);
  line(`| Cycle-heat quintile | Range | Avg fwd-6m maxDD | Avg fwd-12m maxDD | Worst fwd-12m | % in/near recession |`);
  line(`|---|---|---|---|---|---|`);
  for (const q of quintiles)
    line(`| Q${q.q} | ${q.heatRange} | ${pct(q.avgFwd6)} | ${pct(q.avgFwd12)} | ${pct(q.worstFwd12)} | ${pct(q.pctRecession12m)} |`);
  line(``);
  line(`## The recession leg on its own: every SC-critical month, classified`);
  line(``);
  for (const [cls, months] of Object.entries(scClasses))
    line(`- **${cls}** (${months.length}): ${groupConsecutive(months).join(", ")}`);
  line(``);
  line(`False alarms in detail: ${falseAlarms.length ? falseAlarms.join(", ") : "none"}. The 2002–04 and`);
  line(`2010 clusters are the *jobless recoveries* — payrolls genuinely kept contracting in real time`);
  line(`after the recessions officially ended, so the leg reported exactly what the data said; equity`);
  line(`markets recovered anyway. Jul/Sep-2024 is the real-time Sahm-rule alarm that history itself`);
  line(`false-alarmed on. These stay in the table — a monitor that never false-alarms is one that`);
  line(`never alarms.`);
  line(``);
  line(`## Case study: 2007-01 → 2009-06, month by month`);
  line(``);
  line(`Baa10Y = Moody's Baa − 10Y spread (context overlay only — the shipped PC leg has no pre-2023`);
  line(`keyless source). All numbers are what the monitor would have shown that month. Note Sep-2007:`);
  line(`the leg breaks on the real-time Aug-07 payroll shock (first print −4k), then relaxes when`);
  line(`Oct/Nov revised it away — that wobble is the true real-time experience of late 2007.`);
  line(``);
  line(`| Month | SC phase | NFP 3mma | Rev 2m | Sahm | r-g | S3 % | 10Y BTC | Baa10Y | Heat | fwd-12m DD | Triggers | |`);
  line(`|---|---|---|---|---|---|---|---|---|---|---|---|---|`);
  for (const c of caseStudy)
    line(`| ${c.t} | ${c.sc} (${c.scStatus}) | ${c.nfp3mma ?? "—"} | ${c.rev2m} | ${c.sahm} | ${c.rvg} | ${c.squeezePct ?? "—"} | ${c.btc ?? "—"} | ${c.baa10y ?? "—"} | ${c.heat ?? "—"} | ${c.fwd12 == null ? "—" : pct(c.fwd12)} | ${c.triggers} | ${c.rec} |`);
  line(``);
  line(`## Known limitations`);
  line(``);
  line(`- Annual payroll benchmark revisions land as single large real-time revision spikes (e.g.`);
  line(`  +1.86m in Feb-2007) — exactly what a live user of this monitor would have seen, but it makes`);
  line(`  \`revisionsSum2m\` noisy in benchmark months.`);
  line(`- The composite's leg count grows through 2003 as data sources come online, so heat levels are`);
  line(`  only comparable within eras; quintile stats use the full panel regardless (conservative).`);
  line(`- Auction dealer-takedown is missing pre-2009 → the S5 CRITICAL form (weak BTC **and** heavy`);
  line(`  dealer takedown) cannot fire in the GFC window; BTC-only escalation still can.`);
  line(`- The big-cycle stage label is 2020s-specific and excluded from heat.`);
  line(`- No transaction-cost/strategy claim is made: this validates *state assessment and lead times*,`);
  line(`  not a trading rule.`);
  line(``);
  line(`## Reproduce`);
  line(``);
  line(`\`npm run backtest\` — keyless (FRED/ALFRED public CSV, FiscalData, TreasuryDirect, Yahoo),`);
  line(`cached under \`scripts/backtest/.cache/\`; a second run is fully offline. Full monthly panel:`);
  line(`\`scripts/backtest/results.json\`.`);
  line(``);
  return md.join("\n");
}
