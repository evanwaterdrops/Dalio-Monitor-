# Named regressions

Every case here is a disagreement or miss that was converted into a permanent
test. A change that breaks a named case must argue against THIS file, not
silently adjust the assertion. Convention: `[id] · where the assertion lives ·
what happened · what must stay true`.

| id | assertion lives in | case |
|---|---|---|
| sahm-2024-supply | scripts/selftest.mjs (v2.1 A/B, BACKTEST.md) | 2024 Sahm crossings were labor-supply events; must read supply-side elevation, never T1 chain |
| gfc-lead-2007 | scripts/selftest.mjs (v2.1 A/B) | Small-cycle first break Sep-2007 and critical lock Feb-2008 must not degrade |
| oil73-hard-assets | scripts/playbook/test-returns.mjs | From 1973-10: +12m real S&P deeply negative, gold strongly positive, energy beats market at 2y |
| volcker-inversion | scripts/playbook/test-returns.mjs | From 1980-01: bonds win 5y nominal, gold loses 5y real |
| gfc-flight | scripts/playbook/test-returns.mjs | From 2007-09: stocks < −15% and bonds positive at 12m |
| no-self-match | scripts/playbook/validate-matcher.mjs | Validation never lets an episode predict its own months |
| coarse-degeneracy | scripts/playbook/test-match.mjs | Sparse coarse fingerprints scored 100 on 2-3 shared buckets and topped 75% of months; leaderboard requires applicable ≥ MIN_APPLICABLE |
