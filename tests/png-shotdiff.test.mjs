import test from "node:test";
import assert from "node:assert/strict";
import { decodePng, encodePng } from "../skills/remake/tools/lib/png.mjs";
import { compareImages, describe } from "../skills/remake/tools/shotdiff.mjs";
import { image } from "./helpers.mjs";

test("a PNG survives a round trip", () => {
  const img = image(40, 30, [[5, 5, 10, 10, [200, 30, 30]]]);
  const back = decodePng(encodePng(img.width, img.height, img.data));
  assert.equal(back.width, 40);
  assert.equal(back.height, 30);
  assert.ok(back.data.equals(img.data));
});

test("something that is not a PNG is refused", () => {
  assert.throws(() => decodePng(Buffer.from("hello world, not an image")), /not a PNG/);
});

test("pixel mode: identical screenshots score 100", () => {
  const a = image(200, 300, [[10, 10, 80, 40, [10, 90, 200]]]);
  const result = compareImages(a, a, { mode: "pixel" });
  assert.equal(result.score, 100);
  assert.equal(result.verdict, "exact");
  assert.deepEqual(result.regions, []);
});

test("pixel mode: a changed block lowers the score and is located", () => {
  const a = image(256, 256, [[0, 0, 256, 256, [250, 250, 250]]]);
  const b = image(256, 256, [[0, 0, 256, 256, [250, 250, 250]], [64, 128, 64, 64, [255, 0, 0]]]);
  const result = compareImages(a, b, { mode: "pixel" });
  assert.ok(result.score < 100 && result.score > 90, `score ${result.score}`);
  assert.equal(result.regions[0].y, 128);
  assert.equal(result.regions[0].x, 64);
});

test("pixel mode: small colour noise inside the tolerance is ignored", () => {
  const a = image(100, 100, [], [200, 200, 200]);
  const b = image(100, 100, [], [204, 204, 204]);
  assert.equal(compareImages(a, b, { mode: "pixel", tolerance: 8 }).score, 100);
  assert.ok(compareImages(a, b, { mode: "pixel", tolerance: 2 }).score < 100);
});

test("a clone that is taller counts the extra rows as a difference", () => {
  const a = image(100, 100);
  const b = image(100, 150);
  const result = compareImages(a, b, { mode: "pixel" });
  assert.ok(result.score < 70);
  assert.match(describe(result), /50px longer/);
});

test("screenshots of different widths are refused", () => {
  assert.throws(() => compareImages(image(100, 50), image(120, 50)), /different widths/);
});

test("layout mode: same layout in other colours still matches", () => {
  const blocks = (color) => [
    [20, 20, 160, 30, color],
    [20, 80, 70, 70, color],
    [110, 80, 70, 70, color],
    [20, 180, 160, 20, color],
  ];
  const original = image(200, 240, blocks([0, 0, 0]));
  const clone = image(200, 240, blocks([10, 90, 200]), [250, 250, 245]);
  const result = compareImages(original, clone, { mode: "layout" });
  assert.ok(result.score >= 90, `score ${result.score}`);
});

test("layout mode: different words in the same layout still match", () => {
  // each "paragraph" is a stack of text-like stripes; the clone's lines are other lengths
  const paragraph = (x, y, lengths) => lengths.map((len, i) => [x, y + i * 14, len, 5, [40, 40, 40]]);
  const original = image(400, 300, [
    [20, 20, 220, 28, [0, 0, 0]],
    ...paragraph(20, 80, [340, 330, 345, 200]),
    ...paragraph(20, 180, [300, 320, 150]),
  ]);
  const clone = image(400, 300, [
    [20, 20, 190, 28, [30, 30, 30]],
    ...paragraph(20, 80, [320, 345, 310, 260]),
    ...paragraph(20, 180, [335, 280, 210]),
  ]);
  const result = compareImages(original, clone, { mode: "layout" });
  assert.ok(result.score >= 88, `score ${result.score}`);
});

test("layout mode: a moved section scores lower than a matching one", () => {
  const original = image(200, 240, [[20, 20, 160, 30, [0, 0, 0]], [20, 80, 160, 60, [0, 0, 0]]]);
  const same = image(200, 240, [[20, 20, 160, 30, [0, 0, 0]], [20, 80, 160, 60, [0, 0, 0]]]);
  const moved = image(200, 240, [[20, 20, 160, 30, [0, 0, 0]], [20, 170, 160, 60, [0, 0, 0]]]);
  const good = compareImages(original, same, { mode: "layout" }).score;
  const bad = compareImages(original, moved, { mode: "layout" }).score;
  assert.equal(good, 100);
  assert.ok(bad < good - 20, `${bad} should be well under ${good}`);
});

test("the diff picture is a PNG of the right size", () => {
  const a = image(80, 60);
  const b = image(80, 60, [[10, 10, 20, 20, [0, 0, 0]]]);
  for (const mode of ["pixel", "layout"]) {
    const result = compareImages(a, b, { mode, diffImage: true });
    const picture = decodePng(result.image);
    assert.equal(picture.width, 80);
    assert.equal(picture.height, 60);
  }
});
