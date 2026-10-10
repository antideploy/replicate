#!/usr/bin/env node
// Scores the feature matrix: can a user do everything they could do in the original?
//
//   node parity.mjs .remake/features.csv [--min 80] [--json]
//
// Columns: feature,area,priority,original,clone,notes
//   priority  must | should | could         (weights 3, 2, 1)
//   original  yes | no                      "no" marks something we added, never scored
//   clone     yes | partial | no | skip     partial counts half, skip is left out

import { readFileSync } from "node:fs";
import { parseArgs, isMain } from "./lib/args.mjs";

const HELP = `parity: feature score from the feature matrix.

  node parity.mjs .remake/features.csv [--min 80] [--json]

Exits 1 when a must-have is not done, or the score is under --min.`;

const WEIGHT = { must: 3, should: 2, could: 1 };
const CREDIT = { yes: 1, partial: 0.5, no: 0 };

export function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") { row.push(cell); cell = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      cell = "";
      if (row.some((c) => c.trim() !== "")) rows.push(row);
      row = [];
    } else cell += ch;
  }
  row.push(cell);
  if (row.some((c) => c.trim() !== "")) rows.push(row);
  return rows;
}

export function score(csvText) {
  const [header, ...body] = parseCsv(csvText);
  if (!header) throw new Error("the feature matrix is empty");
  const col = Object.fromEntries(header.map((h, i) => [h.trim().toLowerCase(), i]));
  for (const need of ["feature", "priority", "original", "clone"]) {
    if (!(need in col)) throw new Error(`the feature matrix needs a "${need}" column`);
  }

  let earned = 0;
  let possible = 0;
  const byArea = new Map();
  const missing = [];
  const mustNotDone = [];
  let skipped = 0;
  let added = 0;

  for (const r of body) {
    const feature = (r[col.feature] ?? "").trim();
    if (!feature) continue;
    const priority = (r[col.priority] ?? "").trim().toLowerCase();
    const original = (r[col.original] ?? "").trim().toLowerCase();
    const clone = (r[col.clone] ?? "").trim().toLowerCase();
    const area = col.area !== undefined ? (r[col.area] ?? "").trim() || "general" : "general";
    if (clone === "skip") { skipped++; continue; }
    if (original === "no") { added++; continue; }
    if (!(priority in WEIGHT)) throw new Error(`"${feature}": priority must be must, should or could`);
    if (!(clone in CREDIT)) throw new Error(`"${feature}": clone must be yes, partial, no or skip`);

    const weight = WEIGHT[priority];
    earned += weight * CREDIT[clone];
    possible += weight;
    const a = byArea.get(area) ?? { earned: 0, possible: 0 };
    a.earned += weight * CREDIT[clone];
    a.possible += weight;
    byArea.set(area, a);

    if (clone !== "yes") {
      missing.push({ feature, area, priority, clone });
      if (priority === "must") mustNotDone.push(feature);
    }
  }

  const order = { must: 0, should: 1, could: 2 };
  missing.sort((p, q) => order[p.priority] - order[q.priority]);
  const areas = [...byArea.entries()]
    .map(([area, v]) => ({ area, score: Math.round((1000 * v.earned) / v.possible) / 10 }))
    .sort((p, q) => p.score - q.score);

  return {
    score: possible === 0 ? 0 : Math.round((1000 * earned) / possible) / 10,
    mustNotDone,
    shippable: mustNotDone.length === 0 && possible > 0,
    areas,
    missing,
    skipped,
    added,
  };
}

if (isMain(import.meta.url)) {
  const { _, opts } = parseArgs(process.argv.slice(2), ["json", "help"]);
  if (opts.help || !_[0]) {
    console.log(HELP);
    process.exit(opts.help ? 0 : 2);
  }
  try {
    const result = score(readFileSync(_[0], "utf8"));
    if (opts.json) console.log(JSON.stringify(result, null, 2));
    else {
      console.log(`feature score ${result.score}`);
      console.log(`must-haves not done: ${result.mustNotDone.length}`);
      for (const a of result.areas) console.log(`  ${a.area.padEnd(20)} ${a.score}`);
      if (result.missing.length) {
        console.log("missing, in build order:");
        for (const m of result.missing) console.log(`  [${m.priority}] ${m.feature} (${m.clone})`);
      }
      console.log(result.shippable ? "every must-have is done" : "NOT SHIPPABLE: a must-have is missing");
    }
    const tooLow = opts.min !== undefined && result.score < Number(opts.min);
    process.exit(result.shippable && !tooLow ? 0 : 1);
  } catch (err) {
    console.error(`parity: ${err.message}`);
    process.exit(2);
  }
}
