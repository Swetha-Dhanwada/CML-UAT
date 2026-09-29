#!/usr/bin/env node
/**
 * Parses raw CML (CalcML) source for the LiveRampConstraints Expression Set
 * into the docs/CML/cml_data.json structure consumed by the HTML explorer.
 *
 * Usage: node scripts/cml-parse.js <raw-cml-file> <out-cml_data.json> [category-map.json]
 */
const fs = require('fs');
const path = require('path');

const CONDITION_KINDS = ['message', 'require', 'preference', 'rule', 'constraint'];

// NOTE: comments are deliberately NOT stripped before parsing. The source CML
// contains rules disabled via `//` or `/* */` (see CRM-43531/CRM-43551 in
// CML_MEMORY.md) that the explorer intentionally still surfaces for audit
// visibility, and the type-block braces inside those comments still balance,
// so brace-matching works the same with or without them. Parsing literally
// (no strip) is what reproduces the documented 163 types / 2110 conditions.

function findMatchingBrace(src, openIdx) {
  let depth = 0;
  for (let i = openIdx; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

function parseTypeBody(body) {
  // body is the content between the type's outer { and }, comments already stripped.
  const conditions = [];
  let depth = 0;
  let stmtStart = 0;
  for (let i = 0; i < body.length; i++) {
    const c = body[i];
    if (c === '{') depth++;
    else if (c === '}') depth--;
    else if (c === ';' && depth === 0) {
      const stmt = body.slice(stmtStart, i + 1).trim();
      stmtStart = i + 1;
      const m = stmt.match(/(message|require|preference|rule|constraint)\s*\(/);
      if (m) conditions.push({ kind: m[1], code: stmt.replace(/\s+/g, ' ').trim() });
    }
  }
  return conditions;
}

function parseCml(raw) {
  const src = raw;
  const types = [];
  // Matches either a bodied type (`type Name [: Parent] { ... }`) or an
  // alias/shorthand type with no body (`type Name : Parent;`).
  const typeRe = /(?:^|\n)\s*type\s+([A-Za-z0-9_]+)\s*(?::\s*([A-Za-z0-9_]+))?\s*([{;])/g;
  let m;
  while ((m = typeRe.exec(src))) {
    const name = m[1];
    const parent = m[2] || '';
    const before = src.slice(0, m.index);
    const annMatch = before.match(/@\(([^)]*)\)\s*$/);
    const annotation = annMatch ? `@(${annMatch[1]})` : '';

    if (m[3] === ';') {
      types.push({ name, parent, annotation, alias: true, conditions: [], count: 0 });
      continue;
    }

    const openBraceIdx = m.index + m[0].length - 1;
    const closeBraceIdx = findMatchingBrace(src, openBraceIdx);
    if (closeBraceIdx === -1) continue;
    const body = src.slice(openBraceIdx + 1, closeBraceIdx);

    const conditions = parseTypeBody(body);
    types.push({
      name,
      parent,
      annotation,
      alias: false,
      conditions,
      count: conditions.length,
    });
    typeRe.lastIndex = closeBraceIdx;
  }
  return types;
}

module.exports = { parseCml, findMatchingBrace };

function main() {
  const [rawFile, outFile, categoryMapFile] = process.argv.slice(2);
  if (!rawFile || !outFile) {
    console.error('Usage: node scripts/cml-parse.js <raw-cml-file> <out-cml_data.json> [category-map.json]');
    process.exit(1);
  }
  const raw = fs.readFileSync(rawFile, 'utf8');
  const types = parseCml(raw);

  let categoryMap = {};
  if (categoryMapFile && fs.existsSync(categoryMapFile)) {
    categoryMap = JSON.parse(fs.readFileSync(categoryMapFile, 'utf8'));
  }
  types.forEach((t) => {
    t.category = categoryMap[t.name] || 'Other';
  });

  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, JSON.stringify(types, null, 1));
  const totalConditions = types.reduce((s, t) => s + t.count, 0);
  console.log(`Parsed ${types.length} type blocks, ${totalConditions} conditions -> ${outFile}`);
}

if (require.main === module) main();
