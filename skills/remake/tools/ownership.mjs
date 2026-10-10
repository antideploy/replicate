#!/usr/bin/env node
// Proof that the user owns what they want copied exactly.
//
//   node ownership.mjs new https://mysite.com     make a token and say where to put it
//   node ownership.mjs verify                      fetch the site and look for the token
//   node ownership.mjs attest ./my-site --by "Name"  for files the user already holds
//   node ownership.mjs status
//
// A live site is proved by putting a token on it, the way a search console proves
// a site. Only the owner can. Files on disk are the user's word, written down.
// Everything lives in <dir>/ownership.json (default .remake).

import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs, isMain } from "./lib/args.mjs";

const HELP = `ownership: prove a site or app is yours before an exact copy.

  node ownership.mjs new <url> [--dir .remake]
  node ownership.mjs verify [--dir .remake]
  node ownership.mjs attest <path> --by "Your Name" [--dir .remake]
  node ownership.mjs status [--dir .remake]

Put the token on your site in either place:
  <meta name="remake-site-verification" content="TOKEN"> in the home page head
  or a file at /.well-known/remake.txt containing TOKEN`;

export function newToken() {
  return `remake-${randomBytes(12).toString("hex")}`;
}

export function hasMetaToken(html, token) {
  for (const tag of html.matchAll(/<meta\b[^>]*>/gi)) {
    const t = tag[0];
    if (!/name\s*=\s*["']remake-site-verification["']/i.test(t)) continue;
    const m = t.match(/content\s*=\s*["']([^"']*)["']/i);
    if (m && m[1].trim() === token) return true;
  }
  return false;
}

async function fetchText(url) {
  const res = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`${url} answered ${res.status}`);
  return (await res.text()).slice(0, 2_000_000);
}

/** Look for the token on the site. `base` can be replaced in tests. */
export async function verifyLive(record, base) {
  const origin = base ?? `https://${record.host}`;
  const seen = [];
  try {
    if (hasMetaToken(await fetchText(`${origin}/`), record.token)) return { ok: true, where: "meta tag on the home page" };
    seen.push("the home page loaded but has no matching meta tag");
  } catch (err) {
    seen.push(`could not read the home page: ${err.message}`);
  }
  try {
    if ((await fetchText(`${origin}/.well-known/remake.txt`)).trim() === record.token) {
      return { ok: true, where: "/.well-known/remake.txt" };
    }
    seen.push("/.well-known/remake.txt has a different value");
  } catch (err) {
    seen.push(`could not read /.well-known/remake.txt: ${err.message}`);
  }
  return { ok: false, detail: seen };
}

function file(dir) {
  return join(dir, "ownership.json");
}

function read(dir) {
  if (!existsSync(file(dir))) return null;
  return JSON.parse(readFileSync(file(dir), "utf8"));
}

function write(dir, record) {
  mkdirSync(dir, { recursive: true });
  writeFileSync(file(dir), JSON.stringify(record, null, 2) + "\n");
}

if (isMain(import.meta.url)) {
  const { _, opts } = parseArgs(process.argv.slice(2), ["help"]);
  const dir = opts.dir ?? ".remake";
  const [cmd, arg] = _;
  if (opts.help || !cmd) {
    console.log(HELP);
    process.exit(opts.help ? 0 : 2);
  }
  try {
    if (cmd === "new") {
      if (!arg) throw new Error("give the site's address");
      const host = new URL(/^[a-z]+:\/\//i.test(arg) ? arg : `https://${arg}`).hostname.toLowerCase().replace(/^www\./, "");
      const record = { kind: "live", host, token: newToken(), verified: false, createdAt: new Date().toISOString() };
      write(dir, record);
      console.log(`Prove you own ${host}. Put the token on the site in one of two ways:\n`);
      console.log(`  <meta name="remake-site-verification" content="${record.token}">   in the head of the home page`);
      console.log(`  or a file at https://${host}/.well-known/remake.txt containing exactly: ${record.token}\n`);
      console.log("Then run: node ownership.mjs verify");
    } else if (cmd === "verify") {
      const record = read(dir);
      if (!record || record.kind !== "live") throw new Error("run `new <url>` first");
      const result = await verifyLive(record);
      if (!result.ok) {
        console.error("not verified:");
        for (const d of result.detail) console.error(`  - ${d}`);
        process.exit(1);
      }
      write(dir, { ...record, verified: true, verifiedAt: new Date().toISOString(), verifiedBy: result.where });
      console.log(`verified: ${record.host} (${result.where})`);
    } else if (cmd === "attest") {
      if (!arg || !opts.by) throw new Error("usage: attest <path> --by \"Your Name\"");
      write(dir, {
        kind: "local",
        path: arg,
        verified: true,
        statement: "I own this, or I have written permission from the owner to copy it.",
        by: opts.by,
        attestedAt: new Date().toISOString(),
      });
      console.log(`recorded: ${opts.by} says ${arg} is theirs to copy.`);
    } else if (cmd === "status") {
      const record = read(dir);
      if (!record) {
        console.log("no ownership record");
        process.exit(1);
      }
      console.log(JSON.stringify({ ...record, token: record.token ? "(set)" : undefined }, null, 2));
      process.exit(record.verified === true ? 0 : 1);
    } else throw new Error(`unknown command ${cmd}`);
  } catch (err) {
    console.error(`ownership: ${err.message}`);
    process.exit(2);
  }
}
