#!/usr/bin/env node
// Scores every page the skill captured against the clone, at every width.
//
//   node fidelity.mjs [dir]            dir defaults to .remake
//
// Reads  <dir>/screens/*.png          the original, written by capture.mjs
//        <dir>/clone-screens/*.png    the clone, written by capture.mjs --role clone
//        <dir>/state.json             { "mode": "mine" | "match", "fidelity": { "min": 95 } }
// Writes <dir>/diffs/*.png            a picture of what differs
// Exits 1 when any screenshot is under the bar or has no clone to compare.

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { compareFiles } from "./shotdiff.mjs";
import { parseArgs, isMain } from "./lib/args.mjs";

const HELP = `fidelity: score the whole clone against the original.

  node fidelity.mjs [dir] [--mode pixel|layout] [--min N] [--json]

  dir      the working folder, default .remake
  --mode   override the mode (mine = pixel, match = layout)
  --min    override the bar (defaults: pixel 95, layout 88)`;

export const DEFAULT_BARS = { pixel: 95, layout: 88 };

export function runFidelity(dir, overrides = {}) {
  let state = {};
  try {
    state = JSON.parse(readFileSync(join(dir, "state.json"), "utf8"));
  } catch {
    // no state file: fall back to the defaults below
  }
  const mode = overrides.mode ?? (state.mode === "mine" ? "pixel" : "layout");
  const bar = Number(overrides.min ?? state.fidelity?.min ?? DEFAULT_BARS[mode]);

  const screens = join(dir, "screens");
  const clones = join(dir, "clone-screens");
  if (!existsSync(screens)) throw new Error(`no original screenshots in ${screens}. Run capture.mjs first.`);
  mkdirSync(join(dir, "diffs"), { recursive: true });

  const rows = [];
  for (const name of readdirSync(screens).filter((f) => f.endsWith(".png")).sort()) {
    const clone = join(clones, name);
    if (!existsSync(clone)) {
      rows.push({ name, score: null, pass: false, note: "no clone screenshot" });
      continue;
    }
    try {
      const result = compareFiles(join(screens, name), clone, { mode, diffImage: true });
      writeFileSync(join(dir, "diffs", name), result.image);
      rows.push({
        name,
        score: result.score,
        pass: result.score >= bar,
        verdict: result.verdict,
        worst: result.regions[0] ?? null,
        heightDelta: result.heightB - result.heightA,
      });
    } catch (err) {
      rows.push({ name, score: null, pass: false, note: err.message });
    }
  }

  const scored = rows.filter((r) => r.score !== null);
  const average = scored.length
    ? Math.round((10 * scored.reduce((sum, r) => sum + r.score, 0)) / scored.length) / 10
    : null;
  return { mode, bar, rows, average, pass: rows.length > 0 && rows.every((r) => r.pass) };
}

export function table(report) {
  const lines = [`mode ${report.mode}, bar ${report.bar}`, ""];
  for (const r of report.rows) {
    if (r.score === null) {
      lines.push(`  FAIL  ${r.name.padEnd(28)} ${r.note}`);
      continue;
    }
    const worst = r.worst ? `  worst: y=${r.worst.y} h=${r.worst.h} (${r.worst.differs}%)` : "";
    const height = r.heightDelta ? `  height ${r.heightDelta > 0 ? "+" : ""}${r.heightDelta}px` : "";
    lines.push(`  ${r.pass ? "ok  " : "FAIL"}  ${r.name.padEnd(28)} ${r.score.toFixed(1).padStart(5)}${height}${worst}`);
  }
  lines.push("", report.average === null ? "nothing scored" : `average ${report.average}`);
  lines.push(report.pass ? "PASS: every screenshot is over the bar" : "NOT YET: fix the screens marked FAIL, look at .remake/diffs");
  return lines.join("\n");
}

if (isMain(import.meta.url)) {
  const { _, opts } = parseArgs(process.argv.slice(2), ["json", "help"]);
  if (opts.help) {
    console.log(HELP);
    process.exit(0);
  }
  try {
    const report = runFidelity(_[0] ?? ".remake", { mode: opts.mode, min: opts.min });
    console.log(opts.json ? JSON.stringify(report, null, 2) : table(report));
    process.exit(report.pass ? 0 : 1);
  } catch (err) {
    console.error(`fidelity: ${err.message}`);
    process.exit(2);
  }
}
