#!/usr/bin/env node
// Measures a page in a real browser, so the copy is built from numbers, not from guessing.
//
//   node capture.mjs <url> [more urls] [--out .remake] [--widths 1440,1024,768,390]
//                    [--role original|clone] [--wait 1200] [--click "text=Accept"]
//                    [--mirror] [--storage-state file.json] [--ignore-robots]
//
// For each page and width it writes a full-page screenshot. For the original it also
// writes the computed style of every visible element, how each button and link looks on
// hover and focus, the page's facts (headings, links, forms, fonts), and a fingerprint
// of every image and font so the sweep can prove nothing was copied.
//
// It reads at human speed: one page at a time, a pause between pages, no crawling past
// the addresses it is given, and it stops at robots.txt. It never logs in on its own.
// It needs playwright-core in the project (npm i -D playwright-core) and Chrome.

import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { parseArgs, isMain } from "./lib/args.mjs";

const HELP = `capture: screenshots and measurements of a page, at several widths.

  node capture.mjs <url> [more urls] [options]

  --out .remake          working folder
  --widths 1440,1024,768,390
  --role original|clone  original = measure everything (default); clone = screenshots only
  --wait 1200            extra milliseconds to let the page settle
  --click "<selector>"   click this first (a cookie banner, for example)
  --mirror               also save the site's files. Only for a site whose ownership is proved
  --storage-state <file> a saved browser session for a site you own. Needs proved ownership
  --ignore-robots        only for a site whose ownership is proved
  --max-pages 30

Needs: npm i -D playwright-core, and Chrome installed (or CHROME_PATH set).`;

const SKIP_TAGS = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "META", "LINK", "TEMPLATE", "HEAD", "BR", "TITLE"]);
const PAUSE_BETWEEN_PAGES_MS = 1200;

export function loadPlaywright() {
  const requires = [createRequire(join(process.cwd(), "noop.js")), createRequire(import.meta.url)];
  for (const name of ["playwright-core", "playwright"]) {
    for (const req of requires) {
      try {
        return req(name);
      } catch {
        // try the next place
      }
    }
  }
  return null;
}

export function findChrome() {
  const fromEnv = process.env.CHROME_PATH;
  if (fromEnv && existsSync(fromEnv)) return fromEnv;
  const local = process.env.LOCALAPPDATA ?? "";
  const candidates = [
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
    join(local, "Google/Chrome/Application/chrome.exe"),
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
  ];
  return candidates.find((p) => p && existsSync(p)) ?? null;
}

export function slugFor(url) {
  let { pathname } = new URL(url);
  try {
    pathname = decodeURIComponent(pathname);
  } catch {
    // keep the raw path
  }
  const slug = pathname.replace(/^\/+|\/+$/g, "").replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-+|-+$/g, "").toLowerCase();
  return slug || "home";
}

/** Does robots.txt (for everyone) allow this path? Plain prefix rules only. */
export function robotsAllows(robotsText, path) {
  let applies = false;
  let inRules = false;
  const disallow = [];
  const allow = [];
  for (const raw of robotsText.split(/\r?\n/)) {
    const line = raw.replace(/#.*/, "").trim();
    const m = line.match(/^([a-z-]+)\s*:\s*(.*)$/i);
    if (!m) continue;
    const key = m[1].toLowerCase();
    const value = m[2].trim();
    if (key === "user-agent") {
      if (inRules) {
        // a new group starts after the rules of the last one
        applies = false;
        inRules = false;
      }
      if (value === "*") applies = true;
    } else if (key === "disallow" || key === "allow") {
      inRules = true;
      if (applies && value) (key === "disallow" ? disallow : allow).push(value);
    }
  }
  const longest = (list) => list.filter((p) => path.startsWith(p)).reduce((n, p) => Math.max(n, p.length), -1);
  return longest(allow) >= longest(disallow);
}

function ownsHost(dir, host) {
  try {
    const o = JSON.parse(readFileSync(join(dir, "ownership.json"), "utf8"));
    return o.kind === "live" && o.verified === true && String(o.host).replace(/^www\./, "") === host.replace(/^www\./, "");
  } catch {
    return false;
  }
}

// Runs inside the page.
function measurePage(skipTags) {
  const skip = new Set(skipTags);
  const KEEP = [
    "color", "fontFamily", "fontSize", "fontWeight", "fontStyle", "lineHeight", "letterSpacing",
    "textTransform", "textAlign", "textDecorationLine", "backgroundColor", "borderRadius", "boxShadow",
    "padding", "margin", "gap", "display", "position", "flexDirection", "flexWrap", "justifyContent",
    "alignItems", "gridTemplateColumns", "zIndex", "opacity", "overflow", "cursor", "transform", "filter",
    "backdropFilter", "transitionProperty", "transitionDuration", "transitionTimingFunction",
  ];
  const DEFAULTS = new Set(["none", "normal", "0px", "auto", "static", "visible", "rgba(0, 0, 0, 0)", "1", "start", "0px 0px", "all", "0s", "ease", "block", "inline", "baseline", "stretch", "row", "nowrap", "flex-start", "normal normal"]);
  const STRUCTURAL = new Set(["A", "BUTTON", "INPUT", "SELECT", "TEXTAREA", "IMG", "VIDEO", "CANVAS", "IFRAME", "SUMMARY", "LABEL", "H1", "H2", "H3", "H4", "H5", "H6", "NAV", "HEADER", "FOOTER", "MAIN", "SECTION", "ARTICLE", "ASIDE", "FORM", "LI", "SVG"]);

  const readStyle = (el) => {
    const cs = getComputedStyle(el);
    const out = {};
    for (const k of KEEP) {
      const v = cs[k];
      if (v && !DEFAULTS.has(v)) out[k] = v;
    }
    const sides = ["Top", "Right", "Bottom", "Left"].map((s) => `${cs["border" + s + "Width"]} ${cs["border" + s + "Style"]} ${cs["border" + s + "Color"]}`);
    const real = sides.filter((s) => !s.startsWith("0px"));
    if (real.length) out.border = new Set(sides).size === 1 ? sides[0] : sides.join(" | ");
    const bg = cs.backgroundImage;
    if (bg && bg !== "none") out.backgroundImage = /gradient/.test(bg) ? bg.slice(0, 200) : "image";
    return out;
  };

  const records = [];
  const fonts = new Set();
  const all = document.body.querySelectorAll("*");
  for (const el of all) {
    if (records.length >= 1500) break;
    if (skip.has(el.tagName)) continue;
    const rect = el.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) continue;
    const style = readStyle(el);
    if (getComputedStyle(el).visibility === "hidden") continue;
    const direct = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
    const hasBox = style.backgroundColor || style.border || style.boxShadow || style.backgroundImage;
    const layout = style.display === "flex" || style.display === "grid" || style.display === "inline-flex";
    if (!(direct || STRUCTURAL.has(el.tagName.toUpperCase()) || hasBox || layout)) continue;
    if (style.fontFamily) fonts.add(style.fontFamily.split(",")[0].replace(/["']/g, "").trim());
    let depth = 0;
    for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) depth++;
    const text = direct
      ? [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join(" ").replace(/\s+/g, " ").trim().slice(0, 40)
      : undefined;
    records.push({
      i: records.length,
      tag: el.tagName.toLowerCase(),
      role: el.getAttribute("role") || undefined,
      type: el.getAttribute("type") || undefined,
      text,
      x: Math.round((rect.left + scrollX) * 2) / 2,
      y: Math.round((rect.top + scrollY) * 2) / 2,
      w: Math.round(rect.width * 2) / 2,
      h: Math.round(rect.height * 2) / 2,
      depth,
      style,
    });
  }

  const meta = (n) => document.querySelector(`meta[name="${n}"], meta[property="${n}"]`)?.content ?? null;
  const same = (href) => {
    try {
      return new URL(href, location.href).origin === location.origin;
    } catch {
      return false;
    }
  };
  const links = [...new Map(
    [...document.querySelectorAll("a[href]")]
      .filter((a) => same(a.href))
      .map((a) => [new URL(a.href).pathname, { path: new URL(a.href).pathname, text: a.textContent.replace(/\s+/g, " ").trim().slice(0, 40) }]),
  ).values()].slice(0, 200);
  const forms = [...document.forms].map((f) => ({
    method: (f.method || "get").toLowerCase(),
    postsToOtherSite: f.action ? !same(f.action) : false,
    fields: [...f.elements].filter((e) => e.name || e.id).map((e) => ({
      tag: e.tagName.toLowerCase(),
      type: e.type || undefined,
      name: e.name || e.id,
      required: e.required || undefined,
      autocomplete: e.autocomplete || undefined,
      label: (e.labels?.[0]?.textContent ?? e.placeholder ?? "").replace(/\s+/g, " ").trim().slice(0, 40) || undefined,
    })),
  }));

  return {
    records,
    facts: {
      title: document.title,
      lang: document.documentElement.lang || null,
      description: meta("description"),
      themeColor: meta("theme-color"),
      ogTitle: meta("og:title"),
      viewport: meta("viewport"),
      favicon: document.querySelector('link[rel~="icon"]')?.getAttribute("href") ?? null,
      headings: [...document.querySelectorAll("h1,h2,h3")].slice(0, 80).map((h) => ({ level: Number(h.tagName[1]), text: h.textContent.replace(/\s+/g, " ").trim().slice(0, 60) })),
      links,
      forms,
      fontsUsed: [...fonts],
      fontsLoaded: [...document.fonts].filter((f) => f.status === "loaded").map((f) => `${f.family} ${f.weight} ${f.style}`.replace(/"/g, "")),
      counts: {
        images: document.images.length,
        svg: document.querySelectorAll("svg").length,
        video: document.querySelectorAll("video").length,
        canvas: document.querySelectorAll("canvas").length,
        iframes: document.querySelectorAll("iframe").length,
        scripts: document.scripts.length,
      },
      frameworkHints: [
        window.__NEXT_DATA__ && "next", window.__NUXT__ && "nuxt", window.Shopify && "shopify",
        document.querySelector("[ng-version]") && "angular", document.querySelector("[data-reactroot]") && "react",
        document.querySelector('meta[name="generator"]')?.content,
      ].filter(Boolean),
      hasPasswordField: Boolean(document.querySelector('input[type="password"]')),
      bodyTextLength: document.body.innerText.length,
      pageHeight: document.documentElement.scrollHeight,
    },
  };
}

// Runs inside the page, for one element: the properties hover and focus can change.
function readInteractive(el) {
  const cs = getComputedStyle(el);
  const keys = ["color", "backgroundColor", "borderTopColor", "boxShadow", "transform", "opacity", "textDecorationLine", "outlineStyle", "outlineColor", "outlineWidth", "cursor", "transitionDuration", "transitionTimingFunction"];
  const out = {};
  for (const k of keys) out[k] = cs[k];
  return out;
}

/** The longest time in a CSS duration list like "0.15s, 200ms", in milliseconds. */
export function longestDurationMs(list) {
  const times = String(list ?? "").split(",").map((s) => s.trim()).map((s) => (s.endsWith("ms") ? parseFloat(s) : parseFloat(s) * 1000));
  return Math.min(1500, Math.max(0, ...times.filter(Number.isFinite)));
}

async function settle(page, wait) {
  await page.evaluate(async () => {
    const step = Math.max(300, Math.round(innerHeight * 0.8));
    let guard = 0;
    for (let y = 0; y < document.documentElement.scrollHeight && guard < 40; y += step, guard++) {
      scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 120));
    }
    scrollTo(0, 0);
    if (document.fonts?.ready) await document.fonts.ready;
  });
  await page.waitForTimeout(wait);
}

async function interactions(page) {
  const handles = await page.$$("a[href], button, input:not([type=hidden]), select, textarea, summary, [role=button], [role=tab], [role=menuitem]");
  const found = [];
  const seen = new Set();
  for (const handle of handles) {
    if (found.length >= 40) break;
    try {
      if (!(await handle.isVisible())) continue;
      const box = await handle.boundingBox();
      if (!box) continue;
      const key = `${Math.round(box.x)}:${Math.round(box.y)}:${Math.round(box.width)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const label = await handle.evaluate((e) => `${e.tagName.toLowerCase()}${e.type ? `[${e.type}]` : ""} ${(e.textContent || e.value || e.placeholder || "").replace(/\s+/g, " ").trim().slice(0, 30)}`.trim());
      const base = await handle.evaluate(readInteractive);
      const changes = {};
      const settleMs = longestDurationMs(base.transitionDuration) + 60;
      await handle.hover({ timeout: 1500 });
      await page.waitForTimeout(settleMs);
      const hover = await handle.evaluate(readInteractive);
      for (const k of Object.keys(base)) if (hover[k] !== base[k]) (changes.hover ??= {})[k] = [base[k], hover[k]];
      await page.mouse.move(0, 0);
      await handle.focus({ timeout: 1500 });
      await page.waitForTimeout(settleMs);
      const focus = await handle.evaluate(readInteractive);
      for (const k of Object.keys(base)) if (focus[k] !== base[k]) (changes.focus ??= {})[k] = [base[k], focus[k]];
      await handle.evaluate((e) => e.blur());
      found.push({ element: label, x: Math.round(box.x), y: Math.round(box.y), w: Math.round(box.width), h: Math.round(box.height), transition: `${base.transitionDuration} ${base.transitionTimingFunction}`, ...changes });
    } catch {
      // an element that cannot be hovered is skipped
    }
  }
  return found;
}

export async function capture(urls, opts = {}) {
  const out = opts.out ?? ".remake";
  const role = opts.role ?? "original";
  const widths = (opts.widths ?? "1440,1024,768,390").toString().split(",").map((n) => Number(n.trim())).filter(Boolean);
  const wait = Number(opts.wait ?? 1200);
  const maxPages = Number(opts["max-pages"] ?? 30);
  const pw = loadPlaywright();
  if (!pw) throw new Error("playwright-core is not installed. Run: npm i -D playwright-core");
  if (urls.length === 0) throw new Error("give at least one address");
  if (urls.length > maxPages) throw new Error(`${urls.length} pages is more than --max-pages ${maxPages}`);

  const host = new URL(urls[0]).hostname;
  const owned = ownsHost(out, host);
  if (role === "original") {
    for (const u of urls) {
      if (new URL(u).hostname !== host) throw new Error("capture one site at a time: all addresses must share a host");
    }
    if (opts.mirror && !owned) throw new Error("--mirror needs proved ownership of this site. Run ownership.mjs first.");
    if (opts["storage-state"] && !owned) throw new Error("--storage-state needs proved ownership of this site. Run ownership.mjs first.");
  }

  const executablePath = findChrome();
  const browser = await pw.chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) });
  const shotDir = join(out, role === "clone" ? "clone-screens" : "screens");
  mkdirSync(shotDir, { recursive: true });
  const manifest = { tool: "remake-capture", role, capturedAt: new Date().toISOString(), widths, pages: [] };
  const assets = new Map();

  try {
    let robots = null;
    if (role === "original" && !opts["ignore-robots"] && !owned) {
      try {
        const r = await fetch(new URL("/robots.txt", urls[0]), { signal: AbortSignal.timeout(10_000) });
        if (r.ok) robots = await r.text();
      } catch {
        robots = null;
      }
    }

    for (let n = 0; n < urls.length; n++) {
      const url = urls[n];
      const slug = slugFor(url);
      if (robots && !robotsAllows(robots, new URL(url).pathname)) {
        manifest.pages.push({ url, slug, skipped: "robots.txt disallows this path" });
        continue;
      }
      if (n > 0) await new Promise((r) => setTimeout(r, PAUSE_BETWEEN_PAGES_MS));

      const page = { url, slug, screenshots: [], consoleErrors: [], failedRequests: [] };
      for (let w = 0; w < widths.length; w++) {
        const width = widths[w];
        const context = await browser.newContext({
          viewport: { width, height: 900 },
          deviceScaleFactor: 1,
          ...(opts["storage-state"] ? { storageState: opts["storage-state"] } : {}),
        });
        const tab = await context.newPage();
        if (w === 0) {
          tab.on("console", (m) => m.type() === "error" && page.consoleErrors.push(m.text().slice(0, 200)));
          tab.on("pageerror", (e) => page.consoleErrors.push(String(e.message).slice(0, 200)));
          tab.on("requestfailed", (r) => page.failedRequests.push(r.url().split("?")[0].slice(0, 200)));
        }
        if (role === "original") {
          tab.on("response", async (res) => {
            try {
              const type = res.request().resourceType();
              const sameHost = new URL(res.url()).hostname === host;
              if (!["image", "font", "media"].includes(type) && !(opts.mirror && sameHost)) return;
              const body = await res.body();
              if (["image", "font", "media"].includes(type)) {
                assets.set(res.url().split("?")[0], {
                  url: res.url().split("?")[0], type, bytes: body.length,
                  sha256: createHash("sha256").update(body).digest("hex"),
                });
              }
              if (opts.mirror && sameHost && body.length < 40 * 1024 * 1024) {
                const u = new URL(res.url());
                let p = u.pathname.endsWith("/") ? `${u.pathname}index.html` : u.pathname;
                if (u.search) p += `__q${createHash("sha1").update(u.search).digest("hex").slice(0, 8)}`;
                const dest = join(out, "mirror", u.hostname, ...p.split("/").filter(Boolean));
                mkdirSync(dirname(dest), { recursive: true });
                writeFileSync(dest, body);
              }
            } catch {
              // redirects and aborted requests have no body
            }
          });
        }
        try {
          await tab.goto(url, { waitUntil: "networkidle", timeout: 45_000 });
        } catch {
          await tab.goto(url, { waitUntil: "load", timeout: 45_000 });
        }
        if (opts.click) {
          try {
            await tab.click(opts.click, { timeout: 3000 });
          } catch {
            // no banner to dismiss
          }
        }
        await settle(tab, wait);
        const file = `${slug}@${width}.png`;
        await tab.screenshot({ path: join(shotDir, file), fullPage: true, animations: "disabled", caret: "hide" });
        page.screenshots.push(file);

        if (role === "original") {
          const measured = await tab.evaluate(measurePage, [...SKIP_TAGS]);
          mkdirSync(join(out, "measure"), { recursive: true });
          writeFileSync(join(out, "measure", `${slug}@${width}.json`), JSON.stringify(measured.records));
          if (w === 0) {
            page.facts = measured.facts;
            page.interactions = await interactions(tab);
            if (opts.mirror) {
              mkdirSync(join(out, "mirror", host), { recursive: true });
              writeFileSync(join(out, "mirror", host, `${slug}.rendered.html`), await tab.content());
            }
          }
        }
        await context.close();
      }
      if (page.facts?.hasPasswordField && page.facts.bodyTextLength < 800) {
        page.warning = "this looks like a sign-in page. Do not copy it (rules.md).";
      }
      manifest.pages.push(page);
    }
  } finally {
    await browser.close();
  }

  if (role === "original") {
    writeFileSync(join(out, "assets.json"), JSON.stringify({ host, assets: [...assets.values()] }, null, 2));
    mkdirSync(out, { recursive: true });
    writeFileSync(join(out, "capture.json"), JSON.stringify(manifest, null, 2));
  } else {
    writeFileSync(join(out, "clone-capture.json"), JSON.stringify(manifest, null, 2));
  }
  return manifest;
}

if (isMain(import.meta.url)) {
  const { _, opts } = parseArgs(process.argv.slice(2), ["mirror", "ignore-robots", "help"]);
  if (opts.help || _.length === 0) {
    console.log(HELP);
    process.exit(opts.help ? 0 : 2);
  }
  try {
    const manifest = await capture(_, opts);
    for (const p of manifest.pages) {
      if (p.skipped) console.log(`skipped  ${p.url}  (${p.skipped})`);
      else {
        console.log(`captured ${p.url}  ${p.screenshots.length} screenshots, ${p.consoleErrors.length} console errors, ${p.failedRequests.length} failed requests`);
        if (p.warning) console.log(`  WARNING: ${p.warning}`);
      }
    }
  } catch (err) {
    console.error(`capture: ${err.message}`);
    process.exit(1);
  }
}
