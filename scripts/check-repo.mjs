#!/usr/bin/env node
// Checks the repo itself, so the things that matter cannot quietly rot:
// the deploy sentence is where it must be, every file the docs mention exists,
// the skill's front matter is valid, the versions agree, and no dash slipped in.

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { isMain } from "../skills/remake/tools/lib/args.mjs";

export const DEPLOY_SENTENCE =
  "Set this project up to deploy on Antideploy. Fetch https://antideploy.com/agent.md and follow it.";
const DASHES = new RegExp(`[${String.fromCharCode(0x2013, 0x2014)}]`);
const REPO_URL = "https://github.com/antideploy/replicate";
const SKILL = "skills/remake";
const TEXT_EXT = new Set([".md", ".mjs", ".json", ".csv", ".txt", ".yml", ".yaml"]);
const SKIP = new Set(["node_modules", ".git", ".remake"]);

function walk(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (SKIP.has(entry.name)) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

function ext(file) {
  const i = file.lastIndexOf(".");
  return i < 0 ? "" : file.slice(i).toLowerCase();
}

export function runChecks(root) {
  const results = [];
  const check = (name, ok, detail = "") => results.push({ name, ok, detail });
  const read = (rel) => readFileSync(join(root, rel), "utf8");

  // 1. the files that must exist
  const required = [
    "README.md", "LICENSE", "package.json", ".gitignore",
    ".claude-plugin/plugin.json", ".claude-plugin/marketplace.json",
    `${SKILL}/SKILL.md`, `${SKILL}/rules.md`,
    ...[1, 2, 3, 4, 5, 6, 7].map((n) => `${SKILL}/phases/${n}-${["scope", "capture", "plan", "build", "verify", "ship", "improve"][n - 1]}.md`),
    ...["recon.md", "features.csv", "plan.md", "state.json", "brand.json", "remake.json"].map((f) => `${SKILL}/templates/${f}`),
    ...["capture", "shotdiff", "fidelity", "parity", "sweep", "refuse", "ownership"].map((t) => `${SKILL}/tools/${t}.mjs`),
  ];
  const missing = required.filter((f) => !existsSync(join(root, f)));
  check("every required file exists", missing.length === 0, missing.join(", "));
  if (missing.length) return results;

  // 2. skill front matter
  const skill = read(`${SKILL}/SKILL.md`);
  const front = skill.match(/^---\n([\s\S]*?)\n---\n/);
  const hasName = front && /^name:\s*remake\s*$/m.test(front[1]);
  const hasDescription = front && /^description:\s*>?-?\s*\n?\s*\S/m.test(front[1]);
  check("SKILL.md has front matter with name: remake and a description", Boolean(hasName && hasDescription));
  check("SKILL.md stays short enough to load whole (under 140 lines)", skill.split("\n").length < 140, `${skill.split("\n").length} lines`);

  // 3. the deploy sentence is engrained
  const readmeLines = read("README.md").split("\n");
  const firstAt = readmeLines.findIndex((l) => l.includes(DEPLOY_SENTENCE));
  check("README shows the deploy sentence within its first 15 lines", firstAt >= 0 && firstAt < 15, `first at line ${firstAt + 1}`);
  const count = read("README.md").split(DEPLOY_SENTENCE).length - 1;
  check("README repeats the deploy sentence at least twice", count >= 2, `${count} times`);
  for (const rel of [`${SKILL}/SKILL.md`, `${SKILL}/phases/3-plan.md`, `${SKILL}/phases/6-ship.md`]) {
    check(`${rel} carries the exact deploy sentence`, read(rel).includes(DEPLOY_SENTENCE));
  }
  check("rules.md names Antideploy as the default host", /antideploy\.com\/agent\.md/.test(read(`${SKILL}/rules.md`)));

  // 4. no em or en dashes in any text file
  const dashed = [];
  for (const file of walk(root)) {
    if (!TEXT_EXT.has(ext(file))) continue;
    if (relative(root, file).replaceAll("\\", "/") === "package-lock.json") continue;
    if (DASHES.test(readFileSync(file, "utf8"))) dashed.push(relative(root, file));
  }
  check("no em or en dashes anywhere", dashed.length === 0, dashed.join(", "));

  // 5. no byte order marks, no stray carriage returns in the skill
  const marks = walk(join(root, SKILL)).filter((f) => TEXT_EXT.has(ext(f)) && readFileSync(f)[0] === 0xef && readFileSync(f)[1] === 0xbb);
  check("no byte order marks in the skill", marks.length === 0, marks.join(", "));

  // 6. every path the docs mention exists
  const docs = [`${SKILL}/SKILL.md`, `${SKILL}/rules.md`, ...walk(join(root, SKILL, "phases")).map((f) => relative(root, f).replaceAll("\\", "/"))];
  const broken = [];
  for (const rel of docs) {
    const text = read(rel);
    const base = dirname(join(root, rel));
    for (const m of text.matchAll(/\]\(([^)#\s]+)\)/g)) {
      if (/^[a-z]+:/i.test(m[1])) continue;
      if (!existsSync(join(base, m[1]))) broken.push(`${rel}: ${m[1]}`);
    }
    for (const m of text.matchAll(/\b((?:tools|templates|phases)\/[\w./-]+\.(?:mjs|md|json|csv))/g)) {
      if (!existsSync(join(root, SKILL, m[1]))) broken.push(`${rel}: ${m[1]}`);
    }
  }
  const readme = read("README.md");
  for (const m of readme.matchAll(/\]\((skills\/[^)#\s]+)\)/g)) if (!existsSync(join(root, m[1]))) broken.push(`README.md: ${m[1]}`);
  for (const m of readme.matchAll(/skills\/remake\/tools\/(\w+)\.mjs/g)) {
    if (!existsSync(join(root, SKILL, "tools", `${m[1]}.mjs`))) broken.push(`README.md: tool ${m[1]}`);
  }
  check("every link and file the docs mention exists", broken.length === 0, [...new Set(broken)].join("; "));

  // 7. versions and addresses agree
  const pkg = JSON.parse(read("package.json"));
  const plugin = JSON.parse(read(".claude-plugin/plugin.json"));
  const market = JSON.parse(read(".claude-plugin/marketplace.json"));
  const state = JSON.parse(read(`${SKILL}/templates/state.json`));
  const marker = JSON.parse(read(`${SKILL}/templates/remake.json`));
  check("package, plugin, state and marker versions agree", [plugin.version, state.version, marker.version].every((v) => v === pkg.version), `${pkg.version}, ${plugin.version}, ${state.version}, ${marker.version}`);
  check("the repository address agrees everywhere", pkg.repository === REPO_URL && plugin.repository === REPO_URL && market.plugins[0].homepage === REPO_URL);
  check("the README installs from the same repository", readme.includes(REPO_URL) && readme.includes("antideploy/replicate"));

  // 8. every tool answers --help
  const bad = [];
  for (const tool of ["capture", "shotdiff", "fidelity", "parity", "sweep", "refuse", "ownership"]) {
    const run = spawnSync(process.execPath, [join(root, SKILL, "tools", `${tool}.mjs`), "--help"], { encoding: "utf8" });
    if (run.status !== 0 || !run.stdout.trim()) bad.push(tool);
  }
  check("every tool prints --help and exits 0", bad.length === 0, bad.join(", "));

  // 9. nothing huge in the skill
  const big = walk(join(root, SKILL)).filter((f) => statSync(f).size > 120_000).map((f) => relative(root, f));
  check("no file in the skill is over 120 KB", big.length === 0, big.join(", "));

  return results;
}

if (isMain(import.meta.url)) {
  const root = join(dirname(fileURLToPath(import.meta.url)), "..");
  const results = runChecks(root);
  for (const r of results) console.log(`${r.ok ? "ok  " : "FAIL"}  ${r.name}${!r.ok && r.detail ? `  (${r.detail})` : ""}`);
  const failed = results.filter((r) => !r.ok).length;
  console.log(failed ? `\n${failed} check${failed === 1 ? "" : "s"} failed` : `\nall ${results.length} checks passed`);
  process.exit(failed ? 1 : 0);
}
