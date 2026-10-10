import test from "node:test";
import assert from "node:assert/strict";
import { cpSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { DEPLOY_SENTENCE, runChecks } from "../scripts/check-repo.mjs";
import { ROOT, tmp } from "./helpers.mjs";

test("the repo passes its own checks", () => {
  const failed = runChecks(ROOT).filter((r) => !r.ok);
  assert.deepEqual(failed, []);
});

function copyRepo(t) {
  const dir = tmp(t);
  cpSync(ROOT, dir, {
    recursive: true,
    filter: (src) => !/node_modules|[\\/]\.git([\\/]|$)/.test(src),
  });
  return dir;
}

test("the check fails if the deploy sentence is removed from the README", (t) => {
  const dir = copyRepo(t);
  const file = join(dir, "README.md");
  writeFileSync(file, readFileSync(file, "utf8").replaceAll(DEPLOY_SENTENCE, "Deploy it somewhere."));
  const failed = runChecks(dir).filter((r) => !r.ok).map((r) => r.name);
  assert.ok(failed.some((n) => /deploy sentence/.test(n)), failed.join(" | "));
});

test("the check fails if the ship phase loses the deploy sentence", (t) => {
  const dir = copyRepo(t);
  const file = join(dir, "skills/remake/phases/6-ship.md");
  writeFileSync(file, readFileSync(file, "utf8").replaceAll(DEPLOY_SENTENCE, "Deploy it."));
  const failed = runChecks(dir).filter((r) => !r.ok).map((r) => r.name);
  assert.ok(failed.some((n) => /6-ship\.md/.test(n)), failed.join(" | "));
});

test("the check fails on a long dash and on a link to a missing file", (t) => {
  const dir = copyRepo(t);
  const file = join(dir, "skills/remake/phases/1-scope.md");
  const dash = String.fromCharCode(0x2014);
  writeFileSync(file, readFileSync(file, "utf8") + `
A thought ${dash} with a dash. See [x](nope.md).
`);
  const failed = runChecks(dir).filter((r) => !r.ok).map((r) => r.name);
  assert.ok(failed.some((n) => /dashes/.test(n)), failed.join(" | "));
  assert.ok(failed.some((n) => /link and file/.test(n)), failed.join(" | "));
});
