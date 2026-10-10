#!/usr/bin/env node
// The first gate. Run it on every target before anything is captured.
//
//   node refuse.mjs <url or app name> [--text "what the user asked for"] [--dir .remake]
//
//   exit 0  ok      go on
//   exit 3  review  sensitive. Go on only if the user has proved they own it
//   exit 2  refuse  never. Say so in one sentence and offer to build their own tool instead
//
// This is a tripwire, not a judge. It catches the obvious. The agent still reads
// rules.md and uses its own judgment on everything it does not catch.

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs, isMain } from "./lib/args.mjs";

const HELP = `refuse: is this safe to remake?

  node refuse.mjs <url or name> [--text "what the user asked for"] [--dir .remake] [--json]

Exit 0 = ok, 3 = sensitive (needs proof of ownership), 2 = refused.`;

// Sign-in, identity and payment pages of other people's services, banks, wallets,
// exchanges and governments. A copy of these is a phishing page whatever the intent.
const REFUSE_HOSTS = [
  "accounts.google.com", "login.live.com", "login.microsoftonline.com", "appleid.apple.com",
  "id.apple.com", "icloud.com",
  "paypal.com", "stripe.com", "razorpay.com", "paytm.com", "phonepe.com", "pay.google.com",
  "wise.com", "revolut.com", "venmo.com", "cash.app", "squareup.com",
  "coinbase.com", "binance.com", "kraken.com", "metamask.io", "wazirx.com", "coindcx.com",
  "hdfcbank.com", "icicibank.com", "sbi.co.in", "onlinesbi.sbi", "axisbank.com", "kotak.com",
  "chase.com", "bankofamerica.com", "wellsfargo.com", "citi.com", "capitalone.com",
  "hsbc.com", "barclays.co.uk", "lloydsbank.com", "natwest.com", "santander.com",
  "uidai.gov.in", "digilocker.gov.in", "incometax.gov.in", "irs.gov",
];
// Big consumer products people do ask to rebuild ("an Instagram-style app"). Fine in
// match mode with a new name and look. Never their sign-in page, never exact.
const CAUTION_HOSTS = [
  "facebook.com", "instagram.com", "x.com", "twitter.com", "linkedin.com", "github.com",
  "amazon.com", "amazon.in", "netflix.com", "whatsapp.com", "tiktok.com", "snapchat.com",
];
const REFUSE_HOST_PATTERNS = [
  /\.gov(\.[a-z]{2})?$/, /\.mil$/, /\.nic\.in$/, /\.gob\.[a-z]{2}$/, /\.gouv\.[a-z]{2}$/, /\.bank$/,
  /(^|[.-])(net|internet|online)-?banking([.-]|$)/,
];
const REFUSE_TEXT = [
  { re: /\b(log ?in|sign ?in|sso)\s+(page|screen|portal|form)\b/i, why: "a copy of someone else's sign-in page" },
  { re: /\b(net|internet|online|mobile)\s*banking\b/i, why: "a banking page" },
  { re: /\b(phish|phishing|credential harvest|steal (?:passwords?|logins?|cards?)|fake (?:login|bank|portal))\b/i, why: "asks for something built to deceive" },
  { re: /\b(?:look|appear)s?\s+(?:exactly\s+)?like\s+(?:the\s+)?(?:real|official)\b/i, why: "built to pass as the official site" },
];
const REVIEW_TEXT = [
  { re: /\b(bank|banking|wallet|upi|neft|imps|kyc|aadhaar|aadhar|pan card|otp|loan|credit card|insurance claim|payroll|tax return|itr|passport|visa application|e-?challan)\b/i, why: "money, identity or a government service" },
  { re: /\b(crypto|exchange|trading platform|brokerage)\b/i, why: "handles other people's money" },
  { re: /\b(patient|telehealth|medical records?|health portal)\b/i, why: "health records" },
  { re: /\b(webmail|single sign-on|password manager|authenticator)\b/i, why: "handles other people's sign-ins" },
  { re: /\b(government|govt|ministry|municipal|official portal)\b/i, why: "a government service" },
  { re: /\b(checkout|payment page|pay now)\b/i, why: "takes payments" },
];

function hostOf(target) {
  const t = target.trim();
  try {
    return new URL(/^[a-z]+:\/\//i.test(t) ? t : `https://${t}`).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}

function ownsHost(dir, host) {
  const file = join(dir, "ownership.json");
  if (!host || !existsSync(file)) return false;
  try {
    const o = JSON.parse(readFileSync(file, "utf8"));
    return o.kind === "live" && o.verified === true && String(o.host).toLowerCase().replace(/^www\./, "") === host;
  } catch {
    return false;
  }
}

export function check(target, { text = "", dir = ".remake" } = {}) {
  const host = /[./]/.test(target) ? hostOf(target) : "";
  const all = `${target} ${text}`;
  const reasons = [];
  const notes = [];
  let level = "ok";
  const raise = (to, why) => {
    reasons.push(why);
    if (to === "refuse" || (to === "review" && level === "ok")) level = to;
  };

  if (host) {
    if (REFUSE_HOSTS.some((h) => host === h || host.endsWith(`.${h}`))) raise("refuse", `${host} is a sign-in, payment, bank or government service`);
    if (REFUSE_HOST_PATTERNS.some((re) => re.test(host))) raise("refuse", `${host} is a government, military or banking address`);
    if (CAUTION_HOSTS.some((h) => host === h || host.endsWith(`.${h}`))) {
      notes.push(`${host} is a big consumer product: match mode only, a new name and look, and never copy its sign-in page`);
    }
  }
  for (const { re, why } of REFUSE_TEXT) if (re.test(all)) raise("refuse", why);
  for (const { re, why } of REVIEW_TEXT) if (re.test(all)) raise("review", why);

  if (level !== "ok" && ownsHost(dir, host)) {
    return { level: "ok", host, reasons: [], notes: [`ownership of ${host} is proved, so the sensitive-topic checks are lifted`, ...reasons] };
  }
  return { level, host, reasons, notes };
}

const EXIT = { ok: 0, review: 3, refuse: 2 };

if (isMain(import.meta.url)) {
  const { _, opts } = parseArgs(process.argv.slice(2), ["json", "help"]);
  if (opts.help || !_[0]) {
    console.log(HELP);
    process.exit(opts.help ? 0 : 2);
  }
  const result = check(_[0], { text: opts.text ?? "", dir: opts.dir ?? ".remake" });
  if (opts.json) console.log(JSON.stringify(result));
  else {
    console.log(`refuse: ${result.level}${result.host ? ` (${result.host})` : ""}`);
    for (const r of result.reasons) console.log(`  - ${r}`);
    for (const n of result.notes) console.log(`  note: ${n}`);
    if (result.level === "review") console.log("Sensitive. Continue only in mine mode with ownership proved (ownership.mjs).");
    if (result.level === "refuse") console.log("Do not build this. Offer to build the user's own tool of the same kind, with their own brand.");
  }
  process.exit(EXIT[result.level]);
}
