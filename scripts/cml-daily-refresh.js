#!/usr/bin/env node
/**
 * Daily refresh pipeline for the CML Rule Explorer (CML-UAT repo):
 *   1. Resolve the active ExpressionSetDefinitionVersion for the
 *      LiveRampConstraints Expression Set in UAT1 and pull its raw CML
 *      (ConstraintModel) text via the REST API.
 *   2. Compare it to docs/LiveRampConstraints.txt as currently committed on
 *      main. If identical, stop — nothing to do today.
 *   3. If different: create branch `CML_<YYYY-MM-DD>` off main, overwrite
 *      docs/LiveRampConstraints.txt, re-parse into docs/cml_data.json,
 *      re-embed into docs/CML_Rule_Explorer.html (header subtitle +
 *      DATA array), refresh the stats block in docs/CML_MEMORY.md, commit,
 *      and push that branch to origin. main is never auto-merged.
 *
 * Usage: node scripts/cml-daily-refresh.js
 * Requires: `sf` CLI authenticated against the UAT1 org alias, and a git
 * remote ("origin") this account can push to without a credential prompt.
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { parseCml } = require('./cml-parse');

const ORG_ALIAS = 'UAT1';
const EXPRESSION_SET_NAME = 'LiveRampConstraints';
const REPO_ROOT = path.resolve(__dirname, '..');
const DOCS_DIR = path.join(REPO_ROOT, 'docs');
const RAW_CML_TXT = path.join(DOCS_DIR, 'LiveRampConstraints.txt');
const CML_DATA_JSON = path.join(DOCS_DIR, 'cml_data.json');
const EXPLORER_HTML = path.join(DOCS_DIR, 'CML_Rule_Explorer.html');
const CATEGORY_MAP_JSON = path.join(DOCS_DIR, 'category_map.json');
const MEMORY_MD = path.join(DOCS_DIR, 'CML_MEMORY.md');

const SF_BIN = process.platform === 'win32' ? 'sf.cmd' : 'sf';
const GIT_BIN = process.platform === 'win32' ? 'git.exe' : 'git';
const IS_WIN = process.platform === 'win32';

function winQuote(arg) {
  if (!/[ "&|<>^]/.test(arg)) return arg;
  return `"${arg.replace(/"/g, '""')}"`;
}

function run(bin, args) {
  const finalArgs = IS_WIN ? args.map(winQuote) : args;
  return execFileSync(bin, finalArgs, {
    encoding: 'utf8',
    maxBuffer: 1024 * 1024 * 50,
    shell: IS_WIN,
    cwd: REPO_ROOT,
  });
}

function sf(args) {
  return run(SF_BIN, args);
}

function git(args) {
  return run(GIT_BIN, args);
}

function sfJson(args) {
  return JSON.parse(sf(args));
}

function fetchRawCml() {
  const esRes = sfJson([
    'data', 'query', '-o', ORG_ALIAS, '--json', '-q',
    `SELECT Id, ExpressionSetDefinitionId FROM ExpressionSet WHERE Name='${EXPRESSION_SET_NAME}'`,
  ]);
  const es = esRes.result.records[0];
  if (!es) throw new Error(`ExpressionSet '${EXPRESSION_SET_NAME}' not found in ${ORG_ALIAS}`);

  const versionRes = sfJson([
    'data', 'query', '-o', ORG_ALIAS, '--json', '-q',
    `SELECT Id FROM ExpressionSetDefinitionVersion WHERE ExpressionSetDefinitionId='${es.ExpressionSetDefinitionId}' AND Status='Active'`,
  ]);
  const version = versionRes.result.records[0];
  if (!version) throw new Error(`No Active ExpressionSetDefinitionVersion for ${EXPRESSION_SET_NAME}`);

  const tmpFile = path.join(REPO_ROOT, '.cml-raw.tmp.txt');
  sf([
    'api', 'request', 'rest',
    `/services/data/v68.0/sobjects/ExpressionSetDefinitionVersion/${version.Id}/ConstraintModel`,
    '-o', ORG_ALIAS, '--stream-to-file', tmpFile,
  ]);
  const raw = fs.readFileSync(tmpFile, 'utf8');
  fs.unlinkSync(tmpFile);
  return raw;
}

function updateExplorerHtml(types, today) {
  let html = fs.readFileSync(EXPLORER_HTML, 'utf8');
  const totalConditions = types.reduce((s, t) => s + t.count, 0);

  html = html.replace(
    /<div class="sub">.*?<\/div>/s,
    `<div class="sub">${types.length} product types &middot; ${totalConditions} extracted conditions (message / require / preference / rule / constraint) &middot; Source: ${ORG_ALIAS} ExpressionSet '${EXPRESSION_SET_NAME}' (refreshed ${today})</div>`
  );
  html = html.replace(
    /const DATA = \[.*?\];\s*\n/s,
    `const DATA = ${JSON.stringify(types)};\n`
  );
  fs.writeFileSync(EXPLORER_HTML, html);
}

function updateMemoryStats(types, today, raw) {
  if (!fs.existsSync(MEMORY_MD)) return;
  let md = fs.readFileSync(MEMORY_MD, 'utf8');
  const totalConditions = types.reduce((s, t) => s + t.count, 0);
  const lines = raw.split('\n').length;

  md = md.replace(/\*\*Backup Date:\*\* .*/, `**Backup Date:** ${today} (auto-refreshed from ${ORG_ALIAS})`);
  md = md.replace(/- \*\*Total Lines:\*\* [\d,]+/, `- **Total Lines:** ${lines.toLocaleString()}`);
  md = md.replace(/- \*\*Product Types \(type blocks parsed\):\*\* \d+/, `- **Product Types (type blocks parsed):** ${types.length}`);
  md = md.replace(
    /- \*\*Total Conditions \(message\/require\/preference\/rule\/constraint\):\*\* [\d,]+/,
    `- **Total Conditions (message/require/preference/rule/constraint):** ${totalConditions.toLocaleString()}`
  );
  fs.writeFileSync(MEMORY_MD, md);
}

function main() {
  git(['checkout', 'main']);
  git(['pull', 'origin', 'main']);

  console.log(`Fetching CML for '${EXPRESSION_SET_NAME}' from ${ORG_ALIAS}...`);
  const raw = fetchRawCml();
  const previous = fs.existsSync(RAW_CML_TXT) ? fs.readFileSync(RAW_CML_TXT, 'utf8') : null;

  // Compare with line endings normalized: git's core.autocrlf can check
  // LiveRampConstraints.txt out with CRLF on Windows while the freshly
  // fetched REST response always comes back LF-only, which would otherwise
  // register as a "change" every single day even when UAT1 CML is untouched.
  const normalize = (s) => (s === null ? null : s.replace(/\r\n/g, '\n'));
  if (normalize(previous) === normalize(raw)) {
    console.log('No change in LiveRampConstraints.txt since last check — nothing to do.');
    return;
  }

  const today = new Date().toISOString().slice(0, 10);
  const branch = `CML_${today}`;
  git(['checkout', '-B', branch]);

  fs.writeFileSync(RAW_CML_TXT, raw);

  const types = parseCml(raw);
  let categoryMap = {};
  if (fs.existsSync(CATEGORY_MAP_JSON)) {
    categoryMap = JSON.parse(fs.readFileSync(CATEGORY_MAP_JSON, 'utf8'));
  }
  types.forEach((t) => { t.category = categoryMap[t.name] || 'Other'; });

  fs.writeFileSync(CML_DATA_JSON, JSON.stringify(types, null, 1));
  updateExplorerHtml(types, today);
  updateMemoryStats(types, today, raw);

  const totalConditions = types.reduce((s, t) => s + t.count, 0);
  console.log(`Change detected. Updated ${CML_DATA_JSON} and ${EXPLORER_HTML}: ${types.length} types, ${totalConditions} conditions.`);

  git(['add', 'docs']);
  git(['commit', '-m', `CML change detected in ${ORG_ALIAS} (${today})`]);
  git(['push', '-f', 'origin', `${branch}:${branch}`]);
  git(['checkout', 'main']);
  console.log(`Committed and pushed to branch '${branch}'.`);
}

main();
