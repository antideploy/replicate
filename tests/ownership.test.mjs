import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { hasMetaToken, newToken, verifyLive } from "../skills/remake/tools/ownership.mjs";

function serve(t, routes) {
  const server = createServer((req, res) => {
    const body = routes[req.url];
    if (body === undefined) {
      res.writeHead(404).end("no");
      return;
    }
    res.writeHead(200, { "content-type": "text/html" }).end(body);
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      t.after(() => server.close());
      resolve(`http://127.0.0.1:${server.address().port}`);
    });
  });
}

test("tokens are long, random and prefixed", () => {
  const a = newToken();
  assert.match(a, /^remake-[0-9a-f]{24}$/);
  assert.notEqual(a, newToken());
});

test("the meta tag is found in either attribute order, and a wrong value is not", () => {
  const token = "remake-abc";
  assert.ok(hasMetaToken(`<head><meta name="remake-site-verification" content="${token}"></head>`, token));
  assert.ok(hasMetaToken(`<meta content='${token}' name='remake-site-verification'>`, token));
  assert.ok(!hasMetaToken(`<meta name="remake-site-verification" content="other">`, token));
  assert.ok(!hasMetaToken(`<meta name="description" content="${token}">`, token));
});

test("a site with the meta tag on its home page is verified", async (t) => {
  const token = newToken();
  const base = await serve(t, { "/": `<html><head><meta name="remake-site-verification" content="${token}"></head></html>` });
  const result = await verifyLive({ host: "x", token }, base);
  assert.equal(result.ok, true);
  assert.match(result.where, /meta tag/);
});

test("a site with the token file is verified", async (t) => {
  const token = newToken();
  const base = await serve(t, { "/": "<html></html>", "/.well-known/remake.txt": `${token}\n` });
  const result = await verifyLive({ host: "x", token }, base);
  assert.equal(result.ok, true);
  assert.match(result.where, /well-known/);
});

test("a site without the token is not verified, and the reasons are given", async (t) => {
  const base = await serve(t, { "/": "<html></html>" });
  const result = await verifyLive({ host: "x", token: newToken() }, base);
  assert.equal(result.ok, false);
  assert.ok(result.detail.length >= 2);
});
