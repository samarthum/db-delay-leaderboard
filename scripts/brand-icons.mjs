// Draws the app icons from the brand mark sources in scripts/brand/. Run by hand after changing the mark:
//   node scripts/brand-icons.mjs
// Writes (committed, not part of the build):
//   app/favicon.ico    16, 32, 48 px from the hand-drawn 16 px mark (mark-16.svg) on paper, for browsers without
//                      SVG favicons. Paper behind it so it stays visible on dark tab strips.
//   app/apple-icon.png 180 px home-screen icon: the line mark (mark.svg) in ink on paper; iOS rounds the corners.
//   app/icon.svg       the SVG favicon from mark-16.svg: ink on light tab strips, paper on dark ones.
// Then run `npm run build` to copy them into out/. `node scripts/check-brand.mjs` (part of `npm run check`) fails if
// components/brand/BrandMark.tsx or app/icon.svg no longer match these sources.
import { Resvg } from "@resvg/resvg-js";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PAPER = "#fafaf8";
const read = (f) => fs.readFileSync(path.join(root, "scripts/brand", f), "utf8");

function png(svg, width) {
  return new Resvg(svg, { fitTo: { mode: "width", value: width }, background: PAPER, font: { loadSystemFonts: false } }).render().asPng();
}

// The 16 px drawing scales by whole numbers only, so every pixel stays sharp.
const small = read("mark-16.svg");

// SVG favicon: the same pixels, coloured by the browser's colour scheme (dark tab strips get paper).
export function faviconSvg(src) {
  const shapes = src.replace(/^<svg[^>]*>/, "").replace(/<\/svg>\s*$/, "").replace(/\s*\n\s*/g, "");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" shape-rendering="crispEdges"><style>g{fill:#14161a}@media (prefers-color-scheme:dark){g{fill:#fafaf8}}</style><g>${shapes}</g></svg>\n`;
}
fs.writeFileSync(path.join(root, "app/icon.svg"), faviconSvg(small));
const frames = [16, 32, 48].map((s) => ({ s, data: png(small, s) }));

// ICO with PNG entries (supported by every browser that still asks for /favicon.ico).
const header = Buffer.alloc(6);
header.writeUInt16LE(0, 0);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(frames.length, 4);
const dir = Buffer.alloc(16 * frames.length);
let offset = 6 + dir.length;
frames.forEach(({ s, data }, i) => {
  const o = i * 16;
  dir.writeUInt8(s, o);
  dir.writeUInt8(s, o + 1);
  dir.writeUInt8(0, o + 2);
  dir.writeUInt8(0, o + 3);
  dir.writeUInt16LE(1, o + 4);
  dir.writeUInt16LE(32, o + 6);
  dir.writeUInt32LE(data.length, o + 8);
  dir.writeUInt32LE(offset, o + 12);
  offset += data.length;
});
fs.writeFileSync(path.join(root, "app/favicon.ico"), Buffer.concat([header, dir, ...frames.map((f) => f.data)]));

// Home-screen icon: the line mark centred on paper with room around it (iOS crops the corners).
const mark = read("mark.svg");
const [, , vw, vh] = mark.match(/viewBox="([^"]+)"/)[1].split(/\s+/).map(Number);
const S = 180;
const w = 124;
const h = (w * vh) / vw;
const inner = mark.replace(/^<svg[^>]*>/, "").replace(/<\/svg>\s*$/, "");
const attrs = mark.match(/^<svg([^>]*)>/)[1].replace(/xmlns="[^"]*"/, "");
const apple = `<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}" viewBox="0 0 ${S} ${S}"><rect width="${S}" height="${S}" fill="${PAPER}"/><svg x="${(S - w) / 2}" y="${(S - h) / 2 + 2}" width="${w}" height="${h}" ${attrs}>${inner}</svg></svg>`;
fs.writeFileSync(path.join(root, "app/apple-icon.png"), png(apple, S));
console.log("wrote app/icon.svg, app/favicon.ico (16, 32, 48) and app/apple-icon.png (180)");
