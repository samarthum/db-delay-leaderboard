// Draws the app icons from the brand mark sources in scripts/brand/. Run by hand after changing the mark:
//   node scripts/brand-icons.mjs
// Writes (committed, not part of the build):
//   app/icon.svg       the SVG favicon from mark-16.svg: ink on light tab strips, paper on dark ones.
//   app/favicon.ico    16, 32, 48 px from mark-16.svg on paper, for browsers without SVG favicons (paper keeps it
//                      visible on dark tab strips).
//   app/apple-icon.png 180 px home-screen icon: the line mark (mark.svg) in ink on paper.
// Then run `npm run build` to copy them into out/. `node scripts/check-brand.mjs` (part of `npm run check`) fails if
// these files or components/brand/BrandMark.tsx no longer match the sources.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { faviconSvg, faviconIco, appleIcon } from "./brand/icons-lib.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (f) => fs.readFileSync(path.join(root, "scripts/brand", f), "utf8");
const small = read("mark-16.svg");
fs.writeFileSync(path.join(root, "app/icon.svg"), faviconSvg(small));
fs.writeFileSync(path.join(root, "app/favicon.ico"), faviconIco(small));
fs.writeFileSync(path.join(root, "app/apple-icon.png"), appleIcon(read("mark.svg")));
console.log("wrote app/icon.svg, app/favicon.ico (16, 32, 48) and app/apple-icon.png (180)");
