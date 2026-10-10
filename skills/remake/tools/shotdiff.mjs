#!/usr/bin/env node
// Compares two screenshots of the same page at the same width.
//
//   pixel  exact comparison. For "mine" mode, where the copy should look identical.
//   layout compares where things are and ignores colour and wording. For "match"
//          mode, where the words, images and colours are meant to differ.
//
//   node shotdiff.mjs original.png clone.png [--mode pixel|layout] [--out diff.png]
//                     [--tolerance 8] [--edge 96] [--grid 32] [--min 90] [--json]

import { readFileSync, writeFileSync } from "node:fs";
import { decodePng, encodePng } from "./lib/png.mjs";
import { parseArgs, isMain } from "./lib/args.mjs";

const HELP = `shotdiff: score how closely a clone screenshot matches the original.

  node shotdiff.mjs original.png clone.png [options]

  --mode pixel|layout   pixel = exact (default for mine), layout = ignores colour and words (default)
  --out diff.png        write a picture of the differences
  --tolerance 8         pixel mode: how far a colour channel may differ (0 to 255)
  --edge 96             layout mode: how strong an edge must be to count
  --grid 32             layout mode: cell size in pixels
  --min 90              exit 1 when the score is below this
  --json                print the result as JSON

Both screenshots must be the same width. Take them at the same viewport.`;

function flatten(data, i) {
  const a = data[i + 3] / 255;
  return [
    data[i] * a + 255 * (1 - a),
    data[i + 1] * a + 255 * (1 - a),
    data[i + 2] * a + 255 * (1 - a),
  ];
}

function bands(cellBad, cellTotal, cols, rows, cell, width, height, minRatio) {
  const found = [];
  for (let cy = 0; cy < rows; cy++) {
    let bad = 0;
    let total = 0;
    let minX = Infinity;
    let maxX = -1;
    for (let cx = 0; cx < cols; cx++) {
      const ci = cy * cols + cx;
      const ratio = cellTotal[ci] ? cellBad[ci] / cellTotal[ci] : 0;
      if (ratio >= minRatio) {
        minX = Math.min(minX, cx * cell);
        maxX = Math.max(maxX, Math.min(width, (cx + 1) * cell));
      }
      bad += cellBad[ci];
      total += cellTotal[ci];
    }
    if (maxX >= 0) {
      found.push({
        x: minX,
        y: cy * cell,
        w: maxX - minX,
        h: Math.min(cell, height - cy * cell),
        differs: Math.round((1000 * bad) / Math.max(1, total)) / 10,
        weight: bad,
      });
    }
  }
  // Join neighbouring rows into one region.
  const merged = [];
  for (const row of found) {
    const last = merged[merged.length - 1];
    if (last && row.y === last.y + last.h) {
      const x = Math.min(last.x, row.x);
      const right = Math.max(last.x + last.w, row.x + row.w);
      last.x = x;
      last.w = right - x;
      last.h += row.h;
      last.weight += row.weight;
      last.differs = Math.max(last.differs, row.differs);
    } else merged.push({ ...row });
  }
  return merged
    .sort((p, q) => q.weight - p.weight)
    .slice(0, 8)
    .map(({ x, y, w, h, differs }) => ({ x, y, w, h, differs }));
}

function comparePixel(a, b, { tolerance = 8, grid = 64, diffImage = false } = {}) {
  const w = a.width;
  const hMin = Math.min(a.height, b.height);
  const hMax = Math.max(a.height, b.height);
  const cols = Math.ceil(w / grid);
  const rows = Math.ceil(hMax / grid);
  const cellBad = new Uint32Array(cols * rows);
  const cellTotal = new Uint32Array(cols * rows);
  const image = diffImage ? Buffer.alloc(w * hMax * 4) : null;
  let bad = 0;

  for (let y = 0; y < hMax; y++) {
    const rowBase = Math.floor(y / grid) * cols;
    for (let x = 0; x < w; x++) {
      const ci = rowBase + Math.floor(x / grid);
      cellTotal[ci]++;
      let mismatch = true;
      let faded = 255;
      if (y < hMin) {
        const i = (y * w + x) * 4;
        const [r1, g1, b1] = flatten(a.data, i);
        const [r2, g2, b2] = flatten(b.data, i);
        mismatch =
          Math.abs(r1 - r2) > tolerance ||
          Math.abs(g1 - g2) > tolerance ||
          Math.abs(b1 - b2) > tolerance;
        faded = 255 - (255 - (r1 + g1 + b1) / 3) * 0.25;
      }
      if (mismatch) {
        bad++;
        cellBad[ci]++;
      }
      if (image) {
        const o = (y * w + x) * 4;
        if (mismatch) {
          image[o] = 255; image[o + 1] = 0; image[o + 2] = 0;
        } else {
          image[o] = image[o + 1] = image[o + 2] = faded;
        }
        image[o + 3] = 255;
      }
    }
  }

  const score = Math.round(1000 * (1 - bad / (w * hMax))) / 10;
  return {
    mode: "pixel",
    score,
    verdict: score >= 99 ? "exact" : score >= 97 ? "near-exact" : score >= 90 ? "close" : "different",
    width: w,
    heightA: a.height,
    heightB: b.height,
    regions: bands(cellBad, cellTotal, cols, rows, grid, w, hMax, 0.02),
    image: image ? encodePng(w, hMax, image) : null,
  };
}

function edgeMap(img, threshold, height) {
  const { width: w, data } = img;
  const gray = new Float32Array(w * height);
  for (let y = 0; y < Math.min(height, img.height); y++) {
    for (let x = 0; x < w; x++) {
      const [r, g, b] = flatten(data, (y * w + x) * 4);
      gray[y * w + x] = 0.299 * r + 0.587 * g + 0.114 * b;
    }
  }
  const edges = new Uint8Array(w * height);
  const limit = Math.min(height, img.height);
  for (let y = 1; y < limit - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const gx =
        -gray[i - w - 1] - 2 * gray[i - 1] - gray[i + w - 1] +
        gray[i - w + 1] + 2 * gray[i + 1] + gray[i + w + 1];
      const gy =
        -gray[i - w - 1] - 2 * gray[i - w] - gray[i - w + 1] +
        gray[i + w - 1] + 2 * gray[i + w] + gray[i + w + 1];
      if (Math.abs(gx) + Math.abs(gy) > threshold) edges[i] = 1;
    }
  }
  return edges;
}

function compareLayout(a, b, { edge = 96, grid = 32, diffImage = false } = {}) {
  const w = a.width;
  const hMax = Math.max(a.height, b.height);
  const ea = edgeMap(a, edge, hMax);
  const eb = edgeMap(b, edge, hMax);
  // Where does content sit? A cell is occupied when enough of it is edge. Wording,
  // colour and rounding change what is inside a cell, not whether it is occupied,
  // so two pages with the same layout agree here. The score is how much of the
  // occupied area the two pages share (intersection over union), at a fine and a
  // coarse scale so a small shift and a moved section both show.
  const occupancy = (size) => {
    const cols = Math.ceil(w / size);
    const rows = Math.ceil(hMax / size);
    const ink = [new Uint32Array(cols * rows), new Uint32Array(cols * rows)];
    const area = new Uint32Array(cols * rows);
    for (let y = 0; y < hMax; y++) {
      const rowBase = Math.floor(y / size) * cols;
      for (let x = 0; x < w; x++) {
        const ci = rowBase + Math.floor(x / size);
        area[ci]++;
        ink[0][ci] += ea[y * w + x];
        ink[1][ci] += eb[y * w + x];
      }
    }
    const inA = new Uint8Array(cols * rows);
    const inB = new Uint8Array(cols * rows);
    let both = 0;
    let either = 0;
    for (let ci = 0; ci < cols * rows; ci++) {
      inA[ci] = ink[0][ci] / area[ci] >= 0.015 ? 1 : 0;
      inB[ci] = ink[1][ci] / area[ci] >= 0.015 ? 1 : 0;
      if (inA[ci] && inB[ci]) both++;
      if (inA[ci] || inB[ci]) either++;
    }
    return { cols, rows, inA, inB, iou: either === 0 ? 1 : both / either };
  };

  const fine = occupancy(Math.max(8, Math.round(grid / 2)));
  const coarse = occupancy(Math.round(grid * 1.5));
  const view = occupancy(grid); // for locating the worst regions
  const cols = view.cols;
  const rows = view.rows;
  const cellBad = new Uint32Array(cols * rows);
  const cellTotal = new Uint32Array(cols * rows);
  for (let ci = 0; ci < cols * rows; ci++) {
    if (!view.inA[ci] && !view.inB[ci]) continue;
    cellTotal[ci] = 1;
    cellBad[ci] = view.inA[ci] === view.inB[ci] ? 0 : 1;
  }

  const score = Math.round(500 * (fine.iou + coarse.iou)) / 10;
  let image = null;
  if (diffImage) {
    const out = Buffer.alloc(w * hMax * 4);
    for (let y = 0; y < hMax; y++) {
      for (let x = 0; x < w; x++) {
        const o = (y * w + x) * 4;
        const inA = ea[y * w + x] === 1;
        const inB = eb[y * w + x] === 1;
        // white = nothing, black = edge in both, red = only in the original,
        // blue = only in the clone
        let r = 255;
        let g = 255;
        let bl = 255;
        if (inA && inB) { r = 0; g = 0; bl = 0; }
        else if (inA) { g = 0; bl = 0; }
        else if (inB) { r = 0; g = 0; }
        out[o] = r;
        out[o + 1] = g;
        out[o + 2] = bl;
        out[o + 3] = 255;
      }
    }
    image = encodePng(w, hMax, out);
  }
  return {
    mode: "layout",
    score,
    verdict: score >= 90 ? "matches" : score >= 75 ? "close" : score >= 50 ? "partly" : "different",
    width: w,
    heightA: a.height,
    heightB: b.height,
    regions: bands(cellBad, cellTotal, cols, rows, grid, w, hMax, 0.25),
    image,
  };
}

/** Compare two decoded images ({ width, height, data }). */
export function compareImages(a, b, opts = {}) {
  if (a.width !== b.width) {
    throw new Error(
      `the screenshots are different widths (${a.width} and ${b.width}). Take both at the same viewport.`,
    );
  }
  return (opts.mode ?? "layout") === "pixel" ? comparePixel(a, b, opts) : compareLayout(a, b, opts);
}

export function compareFiles(fileA, fileB, opts = {}) {
  return compareImages(decodePng(readFileSync(fileA)), decodePng(readFileSync(fileB)), opts);
}

export function describe(result) {
  const lines = [
    `${result.mode} score ${result.score.toFixed(1)}  (${result.verdict})`,
    `size ${result.width}x${result.heightA} original, ${result.width}x${result.heightB} clone` +
      (result.heightA !== result.heightB
        ? `  (clone is ${Math.abs(result.heightB - result.heightA)}px ${result.heightB > result.heightA ? "longer" : "shorter"})`
        : ""),
  ];
  if (result.regions.length) {
    lines.push("worst regions, in the original's pixels:");
    for (const r of result.regions) lines.push(`  x=${r.x} y=${r.y} w=${r.w} h=${r.h}  ${r.differs}% differs`);
  }
  return lines.join("\n");
}

if (isMain(import.meta.url)) {
  const { _, opts } = parseArgs(process.argv.slice(2), ["json", "help"]);
  if (opts.help || _.length < 2) {
    console.log(HELP);
    process.exit(opts.help ? 0 : 2);
  }
  try {
    const result = compareFiles(_[0], _[1], {
      mode: opts.mode,
      tolerance: opts.tolerance !== undefined ? Number(opts.tolerance) : undefined,
      edge: opts.edge !== undefined ? Number(opts.edge) : undefined,
      grid: opts.grid !== undefined ? Number(opts.grid) : undefined,
      diffImage: Boolean(opts.out),
    });
    if (opts.out) writeFileSync(opts.out, result.image);
    const { image, ...plain } = result;
    console.log(opts.json ? JSON.stringify(plain, null, 2) : describe(result));
    if (opts.min !== undefined && result.score < Number(opts.min)) process.exit(1);
  } catch (err) {
    console.error(`shotdiff: ${err.message}`);
    process.exit(2);
  }
}
