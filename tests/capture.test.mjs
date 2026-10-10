import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createServer } from "node:http";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { capture, findChrome, loadPlaywright, robotsAllows, slugFor } from "../skills/remake/tools/capture.mjs";
import { runFidelity } from "../skills/remake/tools/fidelity.mjs";
import { image, pngBuffer, put, tmp } from "./helpers.mjs";

test("slugs name the page", () => {
  assert.equal(slugFor("https://x.com/"), "home");
  assert.equal(slugFor("https://x.com/pricing/"), "pricing");
  assert.equal(slugFor("https://x.com/docs/getting started?x=1"), "docs-getting-started");
});

test("robots.txt: disallow, allow and groups", () => {
  const robots = "User-agent: Googlebot\nDisallow: /g\n\nUser-agent: *\nDisallow: /private\nAllow: /private/open\n";
  assert.equal(robotsAllows(robots, "/"), true);
  assert.equal(robotsAllows(robots, "/private/x"), false);
  assert.equal(robotsAllows(robots, "/private/open/y"), true);
  assert.equal(robotsAllows(robots, "/g"), true, "rules for another bot do not apply");
  assert.equal(robotsAllows("", "/anything"), true);
});

const LOGO = pngBuffer(image(24, 24, [[0, 0, 24, 24, [220, 30, 30]]]));
const PAGE = `<!doctype html><html lang="en"><head><title>Test shop</title>
<meta name="description" content="A page for the test"><meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  body { margin: 0; font-family: Arial, sans-serif; font-size: 16px; }
  header { padding: 24px 32px; background: #112233; color: #fff; }
  h1 { font-size: 40px; margin: 32px; color: #112233; }
  .cta { margin: 0 32px; padding: 12px 20px; background: #0a84ff; color: #fff; border: 0; border-radius: 8px; transition: background-color 150ms ease; cursor: pointer; }
  .cta:hover { background-color: #ff3b30; }
  form { margin: 32px; }
</style></head><body>
<header><a href="/about" style="color:#fff">About</a></header>
<h1>Hello there</h1>
<img src="/logo.png" width="24" height="24" alt="">
<button class="cta">Buy now</button>
<form method="post" action="/subscribe"><label for="e">Email</label><input id="e" name="email" type="email" required></form>
</body></html>`;

function shop(t) {
  const server = createServer((req, res) => {
    if (req.url === "/") res.writeHead(200, { "content-type": "text/html" }).end(PAGE);
    else if (req.url === "/logo.png") res.writeHead(200, { "content-type": "image/png" }).end(LOGO);
    else if (req.url === "/robots.txt") res.writeHead(200, { "content-type": "text/plain" }).end("User-agent: *\nDisallow: /private\n");
    else if (req.url === "/private") res.writeHead(200, { "content-type": "text/html" }).end("<h1>private</h1>");
    else res.writeHead(404).end("no");
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      t.after(() => server.close());
      resolve(`http://127.0.0.1:${server.address().port}`);
    });
  });
}

const canRunBrowser = Boolean(loadPlaywright() && findChrome());
const browserTest = canRunBrowser ? test : test.skip;

browserTest("capture measures a page: screenshots, styles, facts, fingerprints, hover", async (t) => {
  const base = await shop(t);
  const out = join(tmp(t), ".remake");
  const manifest = await capture([`${base}/`], { out, widths: "800,400", wait: 100 });
  const page = manifest.pages[0];

  assert.deepEqual(page.screenshots, ["home@800.png", "home@400.png"]);
  assert.ok(existsSync(join(out, "screens", "home@800.png")));
  assert.ok(existsSync(join(out, "screens", "home@400.png")));

  const records = JSON.parse(readFileSync(join(out, "measure", "home@800.json"), "utf8"));
  const h1 = records.find((r) => r.tag === "h1");
  assert.equal(h1.style.fontSize, "40px");
  assert.equal(h1.text, "Hello there");
  const header = records.find((r) => r.tag === "header");
  assert.equal(header.style.backgroundColor, "rgb(17, 34, 51)");

  assert.equal(page.facts.title, "Test shop");
  assert.equal(page.facts.lang, "en");
  assert.equal(page.facts.forms[0].fields[0].name, "email");
  assert.ok(page.facts.links.some((l) => l.path === "/about"));
  assert.ok(page.facts.fontsUsed.includes("Arial"));

  const cta = page.interactions.find((i) => i.element.startsWith("button"));
  assert.ok(cta, "the button was probed");
  assert.equal(cta.hover.backgroundColor[1], "rgb(255, 59, 48)");
  assert.match(cta.transition, /0\.15s/);

  const assets = JSON.parse(readFileSync(join(out, "assets.json"), "utf8"));
  const expected = createHash("sha256").update(LOGO).digest("hex");
  assert.ok(assets.assets.some((a) => a.sha256 === expected), "the logo is fingerprinted");
  assert.ok(!existsSync(join(out, "mirror")), "no files are saved without --mirror");
});

browserTest("capture stops at robots.txt", async (t) => {
  const base = await shop(t);
  const out = join(tmp(t), ".remake");
  const manifest = await capture([`${base}/private`], { out, widths: "600", wait: 50 });
  assert.match(manifest.pages[0].skipped, /robots/);
  assert.ok(!existsSync(join(out, "screens", "private@600.png")));
});

browserTest("mirror and saved sessions need proved ownership", async (t) => {
  const base = await shop(t);
  const out = join(tmp(t), ".remake");
  await assert.rejects(capture([`${base}/`], { out, widths: "600", mirror: true }), /ownership/);
  await assert.rejects(capture([`${base}/`], { out, widths: "600", "storage-state": "x.json" }), /ownership/);

  put(out, "ownership.json", JSON.stringify({ kind: "live", host: "127.0.0.1", verified: true }));
  await capture([`${base}/`], { out, widths: "600", wait: 50, mirror: true });
  assert.ok(existsSync(join(out, "mirror", "127.0.0.1", "index.html")), "the page was saved");
  assert.ok(existsSync(join(out, "mirror", "127.0.0.1", "logo.png")), "the image was saved");
});

browserTest("a clone of the same page scores exact in pixel mode, and a changed one does not", async (t) => {
  const base = await shop(t);
  const out = join(tmp(t), ".remake");
  put(out, "state.json", JSON.stringify({ mode: "mine" }));
  await capture([`${base}/`], { out, widths: "800,400", wait: 100 });
  await capture([`${base}/`], { out, widths: "800,400", wait: 100, role: "clone" });
  assert.ok(existsSync(join(out, "clone-screens", "home@800.png")));

  const same = runFidelity(out);
  assert.equal(same.mode, "pixel");
  assert.equal(same.pass, true, JSON.stringify(same.rows));
  assert.ok(existsSync(join(out, "diffs", "home@800.png")));

  // swap the clone's 400px screenshot for a different page and it must fail
  put(out, "clone-screens/home@400.png", pngBuffer(image(400, 900, [[0, 0, 400, 900, [0, 0, 0]]])));
  const changed = runFidelity(out);
  assert.equal(changed.pass, false);
  assert.equal(changed.rows.find((r) => r.name === "home@400.png").pass, false);
});

test("fidelity reports a missing clone screenshot as a failure", (t) => {
  const out = join(tmp(t), ".remake");
  put(out, "screens/home@800.png", pngBuffer(image(100, 100)));
  put(out, "state.json", JSON.stringify({ mode: "match" }));
  const report = runFidelity(out);
  assert.equal(report.mode, "layout");
  assert.equal(report.pass, false);
  assert.match(report.rows[0].note, /no clone screenshot/);
});
