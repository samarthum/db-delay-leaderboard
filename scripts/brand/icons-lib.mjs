// Pure functions that turn the brand sources (scripts/brand/mark.svg, mark-16.svg) into the app icon files.
// Used by scripts/brand-icons.mjs (writes them) and scripts/check-brand.mjs (checks the committed files are current).
import { Resvg } from "@resvg/resvg-js";

const PAPER = "#fafaf8";

function png(svg, width) {
  return new Resvg(svg, { fitTo: { mode: "width", value: width }, background: PAPER, font: { loadSystemFonts: false } }).render().asPng();
}

/** SVG favicon: the 16 px pixels, ink on light tab strips and paper on dark ones. */
export function faviconSvg(small) {
  const shapes = small.replace(/^<svg[^>]*>/, "").replace(/<\/svg>\s*$/, "").replace(/\s*\n\s*/g, "");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" shape-rendering="crispEdges"><style>g{fill:#14161a}@media (prefers-color-scheme:dark){g{fill:#fafaf8}}</style><g>${shapes}</g></svg>\n`;
}

/** favicon.ico: 16, 32 and 48 px PNG frames of the 16 px drawing (whole-number scales stay sharp) on paper. */
export function faviconIco(small) {
  const frames = [16, 32, 48].map((s) => ({ s, data: png(small, s) }));
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
    dir.writeUInt16LE(1, o + 4);
    dir.writeUInt16LE(32, o + 6);
    dir.writeUInt32LE(data.length, o + 8);
    dir.writeUInt32LE(offset, o + 12);
    offset += data.length;
  });
  return Buffer.concat([header, dir, ...frames.map((f) => f.data)]);
}

/** apple-icon.png: the line mark in ink, centred on a 180 px paper square (iOS rounds the corners). */
export function appleIcon(mark) {
  const [, , vw, vh] = mark.match(/viewBox="([^"]+)"/)[1].split(/\s+/).map(Number);
  const S = 180;
  const w = 124;
  const h = (w * vh) / vw;
  const inner = mark.replace(/^<svg[^>]*>/, "").replace(/<\/svg>\s*$/, "");
  const attrs = mark.match(/^<svg([^>]*)>/)[1].replace(/xmlns="[^"]*"/, "");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}" viewBox="0 0 ${S} ${S}"><rect width="${S}" height="${S}" fill="${PAPER}"/><svg x="${(S - w) / 2}" y="${(S - h) / 2 + 2}" width="${w}" height="${h}" ${attrs}>${inner}</svg></svg>`;
  return png(svg, S);
}
