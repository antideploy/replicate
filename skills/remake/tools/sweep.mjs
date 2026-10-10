#!/usr/bin/env node
// Looks through the project for anything that should not ship.
//
//   node sweep.mjs [project-dir] [--config .remake/brand.json] [--safety-only]
//
// Match mode: the original's name, domain, signature colours and image or font
// files must be gone. Every mode: no card fields, no forms that post to another
// site, no bot or webhook endpoints that collect what visitors type.
//
// brand.json: { "avoid": ["Acme", "Acme Inc"], "domains": ["acme.com"],
//               "colors": ["#006bff"], "allowFormHosts": [] }
// .remake/assets.json (written by capture.mjs) supplies the file fingerprints.

import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { extname, join, relative } from "node:path";
import { parseArgs, isMain } from "./lib/args.mjs";

const HELP = `sweep: find leftovers of the original, and anything that looks like a phishing page.

  node sweep.mjs [project-dir] [--config .remake/brand.json] [--safety-only] [--json]

Exit 0 = clean, 1 = something found.`;

const SKIP_DIRS = new Set([
  "node_modules", ".git", ".next", ".nuxt", ".svelte-kit", ".turbo", ".cache", ".vercel",
  "dist", "build", "out", "coverage", ".remake", "__pycache__",
]);
const TEXT_EXT = new Set([
  ".html", ".htm", ".css", ".scss", ".less", ".js", ".mjs", ".cjs", ".jsx", ".ts", ".tsx",
  ".json", ".md", ".mdx", ".txt", ".svg", ".xml", ".yml", ".yaml", ".toml", ".vue", ".svelte",
  ".astro", ".php", ".py", ".rb", ".csv", ".sql", ".webmanifest",
]);
const ASSET_EXT = new Set([
  ".png", ".jpg", ".jpeg", ".gif", ".webp", ".avif", ".ico", ".svg",
  ".woff", ".woff2", ".ttf", ".otf", ".eot", ".mp4", ".webm", ".mp3", ".pdf",
]);
const MAX_TEXT = 5 * 1024 * 1024;
const MAX_ASSET = 40 * 1024 * 1024;

const SAFETY = [
  { re: /api\.telegram\.org\/bot/i, why: "sends data to a Telegram bot, the usual way phishing pages collect what people type" },
  { re: /discord(?:app)?\.com\/api\/webhooks\//i, why: "posts to a Discord webhook, the usual way phishing pages collect what people type" },
  { re: /autocomplete\s*=\s*["']cc-(?:number|csc|exp)/i, why: "has a raw card field. Take payments with a hosted checkout, never your own card inputs" },
  { re: /name\s*=\s*["'](?:card[-_ ]?number|cardnumber|cvv|cvc|card[-_ ]?cvc)["']/i, why: "has a raw card field. Take payments with a hosted checkout, never your own card inputs" },
];

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function nameRegex(term) {
  const parts = term.trim().split(/\s+/).map(escapeRe);
  const forms = new Set([parts.join("\\s+"), parts.join(""), parts.join("[-_]")]);
  const body = [...forms].join("|");
  return new RegExp(term.trim().length < 4 ? `\\b(?:${body})\\b` : `(?:${body})`, "i");
}

function normaliseHex(color) {
  let c = color.trim().toLowerCase().replace(/^#/, "");
  if (c.length === 3) c = c.split("").map((x) => x + x).join("");
  return /^[0-9a-f]{6}$/.test(c) ? c : null;
}

function colorRegexes(color) {
  const hex = normaliseHex(color);
  if (!hex) return [];
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  const out = [new RegExp(`#${hex}\\b`, "i"), new RegExp(`rgba?\\(\\s*${r}\\s*[, ]\\s*${g}\\s*[, ]\\s*${b}\\b`, "i")];
  if (hex[0] === hex[1] && hex[2] === hex[3] && hex[4] === hex[5]) {
    out.push(new RegExp(`#${hex[0]}${hex[2]}${hex[4]}\\b`, "i"));
  }
  return out;
}

function* walk(root, dir = root) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      yield* walk(root, join(dir, entry.name));
    } else if (entry.isFile()) yield join(dir, entry.name);
  }
}

function sha256(buf) {
  return createHash("sha256").update(buf).digest("hex");
}

export function sweep(root, config = {}, { safetyOnly = false, fingerprints = [] } = {}) {
  const findings = [];
  const add = (kind, file, line, detail) =>
    findings.push({ kind, file: relative(root, file).replaceAll("\\", "/"), line, detail });

  const names = safetyOnly ? [] : (config.avoid ?? []).filter(Boolean).map((t) => ({ t, re: nameRegex(t) }));
  const domains = safetyOnly ? [] : (config.domains ?? []).filter(Boolean).map((d) => ({ d, re: new RegExp(escapeRe(d.trim().toLowerCase()), "i") }));
  const colors = safetyOnly ? [] : (config.colors ?? []).filter(Boolean).map((c) => ({ c, res: colorRegexes(c) }));
  const allowedHosts = new Set((config.allowFormHosts ?? []).map((h) => h.toLowerCase()));
  const known = new Set(
    safetyOnly ? [] : [...(config.hashes ?? []), ...fingerprints.map((f) => f.sha256)].filter(Boolean),
  );

  for (const file of walk(root)) {
    const ext = extname(file).toLowerCase();
    const rel = relative(root, file).replaceAll("\\", "/");
    const size = statSync(file).size;

    for (const { t, re } of names) if (re.test(rel)) add("name", file, 0, `file name contains "${t}"`);

    if (known.size && ASSET_EXT.has(ext) && size <= MAX_ASSET) {
      const hash = sha256(readFileSync(file));
      if (known.has(hash)) add("asset", file, 0, "identical to a file on the original site");
    }

    if (!TEXT_EXT.has(ext) || size > MAX_TEXT) continue;
    const lines = readFileSync(file, "utf8").split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      const text = lines[i];
      for (const { t, re } of names) if (re.test(text)) add("name", file, i + 1, `contains "${t}"`);
      for (const { d, re } of domains) if (re.test(text)) add("domain", file, i + 1, `mentions ${d}`);
      for (const { c, res } of colors) if (res.some((re) => re.test(text))) add("color", file, i + 1, `uses the original's colour ${c}`);
      for (const { re, why } of SAFETY) if (re.test(text)) add("safety", file, i + 1, why);
      for (const m of text.matchAll(/<form\b[^>]*\baction\s*=\s*["']https?:\/\/([^/"'?#]+)/gi)) {
        const host = m[1].toLowerCase();
        if (!allowedHosts.has(host)) add("safety", file, i + 1, `a form posts to another site (${host}). Forms must post to this app`);
      }
    }
  }
  return findings;
}

function loadJson(file) {
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

if (isMain(import.meta.url)) {
  const { _, opts } = parseArgs(process.argv.slice(2), ["safety-only", "json", "help"]);
  if (opts.help) {
    console.log(HELP);
    process.exit(0);
  }
  const root = _[0] ?? ".";
  const configPath = opts.config ?? join(root, ".remake", "brand.json");
  const config = existsSync(configPath) ? loadJson(configPath) : {};
  if (config === null) {
    console.error(`sweep: ${configPath} is not valid JSON`);
    process.exit(2);
  }
  const assets = loadJson(join(root, ".remake", "assets.json"));
  const findings = sweep(root, config, {
    safetyOnly: Boolean(opts["safety-only"]),
    fingerprints: Array.isArray(assets?.assets) ? assets.assets : [],
  });
  if (opts.json) console.log(JSON.stringify(findings, null, 2));
  else if (findings.length === 0) console.log("sweep: clean");
  else {
    for (const f of findings) console.log(`${f.kind.padEnd(7)} ${f.file}${f.line ? ":" + f.line : ""}  ${f.detail}`);
    console.log(`\nsweep: ${findings.length} thing${findings.length === 1 ? "" : "s"} to fix`);
  }
  process.exit(findings.length ? 1 : 0);
}
