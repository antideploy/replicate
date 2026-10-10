import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { encodePng } from "../skills/remake/tools/lib/png.mjs";

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
export const TOOLS = join(ROOT, "skills", "remake", "tools");

/** A folder that is removed when the test ends. */
export function tmp(t, prefix = "remake-test-") {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

export function put(dir, relative, content) {
  const file = join(dir, relative);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, content);
  return file;
}

/** An RGBA image, white, with filled rectangles: [x, y, w, h, [r, g, b]]. */
export function image(width, height, rects = [], background = [255, 255, 255]) {
  const data = Buffer.alloc(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    data[i * 4] = background[0];
    data[i * 4 + 1] = background[1];
    data[i * 4 + 2] = background[2];
    data[i * 4 + 3] = 255;
  }
  for (const [rx, ry, rw, rh, color] of rects) {
    for (let y = ry; y < Math.min(height, ry + rh); y++) {
      for (let x = rx; x < Math.min(width, rx + rw); x++) {
        const o = (y * width + x) * 4;
        data[o] = color[0];
        data[o + 1] = color[1];
        data[o + 2] = color[2];
      }
    }
  }
  return { width, height, data };
}

export function pngBuffer(img) {
  return encodePng(img.width, img.height, img.data);
}
