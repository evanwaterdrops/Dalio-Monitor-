/**
 * Century panel — annual big-cycle context, 1913 → present.
 *
 * NOT point-in-time: these are final annual series (clearly labeled in the
 * UI). The monthly replay is the evidence; this panel is the *map* — the
 * century of debt-cycle terrain (WWII debt peak, 1940s financial repression,
 * stagflation, Volcker, the 2020s) that the Big Cycle tab uses to let users
 * zoom out.
 *
 * Series (all keyless FRED + Yahoo):
 *  debt/GDP        GFDGDPA188S           1939→
 *  interest/receipts FYOINT / FYFR       1940→
 *  effective r     FYOINT / avg FYGFD    1940→
 *  nominal g       GDPA y/y              1930→
 *  CPI y/y         CPIAUCNS (annual avg) 1914→
 *  credit spread   BAA − AAA (annual avg) 1919→
 *  long rate       LTGOVTBD → DGS10      1925→
 *  SPX max drawdown within year           1928→ (^GSPC daily)
 *  recession       any USREC month in year
 */

import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { fredLatest, yahooDailyMax } from "./fetch.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, "..", "..");
const round1 = x => Math.round(x * 10) / 10;
const round2 = x => Math.round(x * 100) / 100;

export async function century() {
  const [debtGdp, fyoint, fyfr, fygfd, gdpa, cpi, baa, aaa, ltgovt, dgs10, usrec, spx] = await Promise.all([
    fredLatest("GFDGDPA188S"), fredLatest("FYOINT"), fredLatest("FYFR"), fredLatest("FYGFD"),
    fredLatest("GDPA"), fredLatest("CPIAUCNS"), fredLatest("BAA"), fredLatest("AAA"),
    fredLatest("LTGOVTBD"), fredLatest("DGS10"), fredLatest("USREC"), yahooDailyMax("^GSPC"),
  ]);

  const byYear = (obs, agg = "avg") => {
    const m = new Map();
    for (const o of obs) {
      const y = Number(o.date.slice(0, 4));
      (m.get(y) ?? m.set(y, []).get(y)).push(o.value);
    }
    const out = new Map();
    for (const [y, vs] of m) out.set(y, agg === "avg" ? vs.reduce((s, x) => s + x, 0) / vs.length : vs[vs.length - 1]);
    return out;
  };
  const yDebt = byYear(debtGdp), yGdp = byYear(gdpa), yCpi = byYear(cpi);
  const yBaa = byYear(baa), yAaa = byYear(aaa);
  const yLong = byYear([...ltgovt.filter(o => o.date < dgs10[0].date), ...dgs10]);
  const yOint = byYear(fyoint), yFr = byYear(fyfr), yGfd = byYear(fygfd, "last");
  const recYears = new Set(usrec.filter(o => o.value === 1).map(o => Number(o.date.slice(0, 4))));

  // in-year max drawdown from the running year high
  const ddByYear = new Map();
  let curYear = null, high = 0, worst = 0;
  for (const o of spx) {
    const y = Number(o.date.slice(0, 4));
    if (y !== curYear) { if (curYear != null) ddByYear.set(curYear, round1(worst * 100)); curYear = y; high = o.value; worst = 0; }
    high = Math.max(high, o.value);
    worst = Math.min(worst, o.value / high - 1);
  }
  if (curYear != null) ddByYear.set(curYear, round1(worst * 100));

  const years = [];
  const thisYear = Number(usrec[usrec.length - 1].date.slice(0, 4));
  for (let y = 1913; y <= thisYear; y++) {
    const oint = yOint.get(y), fr = yFr.get(y), gfd = yGfd.get(y), gfdPrev = yGfd.get(y - 1);
    const gdpNow = yGdp.get(y), gdpPrev = yGdp.get(y - 1);
    const cpiNow = yCpi.get(y), cpiPrev = yCpi.get(y - 1);
    // units: FYOINT/FYFR in $mn, FYGFD in $bn (verified against raw cache)
    const rEff = oint != null && gfd != null && gfdPrev != null ? round2((oint / 1000 / ((gfd + gfdPrev) / 2)) * 100) : null;
    const gNom = gdpNow != null && gdpPrev != null ? round2(((gdpNow - gdpPrev) / gdpPrev) * 100) : null;
    years.push({
      y,
      debtGdp: yDebt.get(y) != null ? round1(yDebt.get(y)) : null,
      intRcptPct: oint != null && fr != null ? round1((oint / fr) * 100) : null,
      rEff,
      gNom,
      rMinusG: rEff != null && gNom != null ? round2(rEff - gNom) : null,
      cpiYoY: cpiNow != null && cpiPrev != null ? round1(((cpiNow - cpiPrev) / cpiPrev) * 100) : null,
      baaAaaBp: yBaa.get(y) != null && yAaa.get(y) != null ? Math.round((yBaa.get(y) - yAaa.get(y)) * 100) : null,
      longRate: yLong.get(y) != null ? round2(yLong.get(y)) : null,
      spxMaxDD: ddByYear.get(y) ?? null,
      rec: recYears.has(y) ? 1 : 0,
    });
  }

  await writeFile(path.join(HERE, "century-panel.json"), JSON.stringify(years));
  await mkdir(path.join(ROOT, "src", "data"), { recursive: true });
  await writeFile(path.join(ROOT, "src", "data", "century-panel.json"), JSON.stringify(years));
  console.log(`century panel: ${years.length} years → century-panel.json (+ src/data copy)`);

  /* Monthly SPX artifact for the live Archetype chart row.
   *
   * The chart needs ~30y of history; FRED's SP500 is licensed as a rolling
   * 10-year window (covers 2016→ today), and replay.mjs records Shiller and
   * FRED both failing for the long tail. So the tail is vendored here, at
   * build time, from the daily history this function already pulled and
   * cached — rather than fetched from Yahoo on every page request, where a
   * 429 becomes a user-visible gap.
   *
   * page.tsx splices live FRED over the recent end, so only pre-2016 history
   * is served from this file, and that history does not change. */
  const monthly = [...spx
    .reduce((m, o) => m.set(o.date.slice(0, 7), o), new Map())  // last close of each month
    .values()]
    .map(o => ({ date: o.date, value: round2(o.value) }))
    .sort((a, b) => a.date.localeCompare(b.date));
  await writeFile(path.join(ROOT, "src", "data", "spx-monthly.json"), JSON.stringify(monthly));
  console.log(`spx monthly: ${monthly.length} months (${monthly[0].date} → ${monthly[monthly.length - 1].date}) → src/data/spx-monthly.json`);

  return years;
}
