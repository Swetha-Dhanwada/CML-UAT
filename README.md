# CML-UAT

Mirrors the UAT1 `LiveRampConstraints` CalcProcedureDefinition (CML) so it can be browsed and diffed outside the org.

## Contents

- `docs/LiveRampConstraints_<YYYY-MM-DD>.txt` — raw CML source, one dated snapshot per refresh (diff two dates for day-over-day rule changes)
- `docs/cml_data.json` — parsed type/condition data extracted from the raw CML
- `docs/CML_Rule_Explorer.html` — self-contained, filterable HTML explorer built from `cml_data.json`; open directly in a browser
- `docs/CML_MEMORY.md` — human-readable summary of the business rules, pricing models, and known issues
- `docs/category_map.json` — product-type → category mapping used by the explorer's category filter

## Daily refresh

`scripts/cml-daily-refresh.js` pulls the active `ExpressionSetDefinitionVersion` for `LiveRampConstraints` from the UAT1 org, re-parses it, regenerates `cml_data.json` / `CML_Rule_Explorer.html` / the stats in `CML_MEMORY.md`, and commits + pushes any changes to `origin/main`.

Runs daily at 06:00 via the Windows Scheduled Task **"CML Rule Explorer Daily Refresh"**, which invokes `scripts/cml-daily-refresh.ps1`. Requires the `sf` CLI authenticated against the `UAT1` org alias on this machine.

To run manually:

```
node scripts/cml-daily-refresh.js
```
