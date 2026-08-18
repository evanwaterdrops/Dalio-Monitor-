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
// Shiller (datahub): Date like 1871-01-01; columns:
// Date,SP500,Dividend,Earnings,Consumer Price Index,Long Interest Rate,...
// NOTE (format drift from the brief's assumed shape): the feed's trailing
// months (price data extended past ~2023-09) carry CPI/GS10/Dividend/Earnings
// as literal "0.0" placeholders rather than blank cells — these fields are
// never legitimately zero in this series (confirmed: zero CPI/GS10 never
// occurs before the trailing-placeholder region), so 0 is treated as missing
// (null) for those four fields. SP500 price itself stays valid through the
// full range.
const shiller = new Map(); // ym -> {p, d, cpi, gs10}
for (const line of D("shiller.csv").trim().split("\n").slice(1)) {
  const c = line.split(",");
  const key = c[0].slice(0, 7);
  const p = Number(c[1]);
  const dRaw = Number(c[2]), cpiRaw = Number(c[4]), gs10Raw = Number(c[5]);
  const d = Number.isFinite(dRaw) && dRaw !== 0 ? dRaw : null;
  const cpi = Number.isFinite(cpiRaw) && cpiRaw !== 0 ? cpiRaw : null;
  const gs10 = Number.isFinite(gs10Raw) && gs10Raw !== 0 ? gs10Raw : null;
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
  // WTISPLC ("Spliced WTI Crude Oil Price") is an administered/posted price
  // through the early 1970s, not a continuous market quote — long flat
  // stretches (e.g. 1972-07..1973-07 all $3.56) are real recorded posted
  // prices, not missing data. Same caveat documented in extract-fingerprints.mjs.
  series.commod.push(w0 && w1 ? (w1 / w0 - 1) * 100 : null); // WTI spot as commodity proxy (labeled as such)
  const f = ff.get(m);
  series.cash.push(f?.RF ?? null);
  series.valueMinusGrowth.push(f?.HML ?? null);
  series.smallMinusLarge.push(f?.SMB ?? null);
  const e = ind.get(m);
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
