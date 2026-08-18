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
