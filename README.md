# CML-UAT

Mirrors the UAT1 `LiveRampConstraints` CalcProcedureDefinition (CML) so it can be browsed and diffed outside the org.

## Contents

- `docs/LiveRampConstraints.txt` — raw CML source as last fetched from UAT1 (compared byte-for-byte on each daily check to detect rule changes)
- `docs/cml_data.json` — parsed type/condition data extracted from the raw CML
- `docs/CML_Rule_Explorer.html` — self-contained, filterable HTML explorer built from `cml_data.json`; open directly in a browser
- `docs/CML_MEMORY.md` — human-readable summary of the business rules, pricing models, and known issues
- `docs/category_map.json` — product-type → category mapping used by the explorer's category filter

## Daily refresh

`scripts/cml-daily-refresh.js` pulls the active `ExpressionSetDefinitionVersion` for `LiveRampConstraints` from the UAT1 org and compares it to the `docs/LiveRampConstraints.txt` already committed on `main`. If nothing changed, it exits without touching git. If the CML changed, it updates `LiveRampConstraints.txt` / `cml_data.json` / `CML_Rule_Explorer.html` / the stats in `CML_MEMORY.md` in place and commits straight to `main`, with a commit message stamped with an ISO timestamp and a description of what changed (types/conditions added, removed, or changed counts), e.g.:

```
CML update 2026-09-30T14:05:12.000Z: 163 -> 165 types, 2110 -> 2118 conditions (+8); added: NewProductType; changed: Activation (+3)
```

Runs daily at 06:00 via the Windows Scheduled Task **"CML Rule Explorer Daily Refresh"**, which invokes `scripts/cml-daily-refresh.ps1`. Requires the `sf` CLI authenticated against the `UAT1` org alias on this machine.

To run manually:

```
node scripts/cml-daily-refresh.js
```
