/* Verifies new series IDs before they enter the registry. Exit 1 on any miss. */
const KEY = process.env.FRED_API_KEY;
if (!KEY) { console.error("FRED_API_KEY required"); process.exit(1); }
const CANDIDATES = {
  m2: ["M2SL"], monetary_base: ["BOGMBASE"], total_debt: ["TCMDO"],
  hh_debt: ["CMDEBT"], hh_networth: ["TNWBSHNO"], dsr_household: ["TDSP"],
  core_pce: ["PCEPILFE"], t5yie: ["T5YIE"], dgs3mo: ["DGS3MO"],
  sofr: ["SOFR"], iorb: ["IORB"], bills_outright: ["WSHOBL"],
};
const SEARCHES = {
  wealth_top01: "share total net worth top 0.1",
  wealth_bottom90: "share total net worth bottom 90",
  dsr_pnf: "debt service ratio private non-financial united states",
};
const NEED_VINTAGES = ["M2SL", "TCMDO", "DGS3MO", "T5YIE"];
const get = async (path, params) => {
  const p = new URLSearchParams({ api_key: KEY, file_type: "json", ...params });
  const r = await fetch(`https://api.stlouisfed.org/fred/${path}?${p}`);
  if (!r.ok) throw new Error(`${r.status} ${path}`);
  return r.json();
};
let failed = false;
for (const [name, ids] of Object.entries(CANDIDATES)) {
  for (const id of ids) {
    try {
      const d = await get("series/observations", { series_id: id, limit: "3", sort_order: "desc" });
      console.log(`OK    ${name}: ${id} latest=${d.observations?.[0]?.date}`);
    } catch (e) { console.log(`MISS  ${name}: ${id} — ${e.message}`); failed = true; }
  }
}
for (const [name, text] of Object.entries(SEARCHES)) {
  const d = await get("series/search", { search_text: text, limit: "5" });
  console.log(`PIN   ${name}: ` + (d.seriess ?? []).map(s => `${s.id} (${s.title.slice(0, 60)})`).join(" | "));
}
for (const id of NEED_VINTAGES) {
  const d = await get("series/vintagedates", { series_id: id, limit: "10000" });
  const v = d.vintage_dates ?? [];
  console.log(`VINT  ${id}: ${v.length} vintages, first ${v[0]}`);
}
if (failed) process.exit(1);
