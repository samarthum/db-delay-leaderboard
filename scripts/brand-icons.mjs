// Draws the app icons from the brand mark sources in scripts/brand/. Run by hand after changing the mark:
//   node scripts/brand-icons.mjs
// Writes (committed, not part of the build):
//   app/icon.svg       the SVG favicon from mark-16.svg: ink on light tab strips, paper on dark ones.
//   app/favicon.ico    16, 32, 48 px from mark-16.svg on paper, for browsers without SVG favicons (paper keeps it
//                      visible on dark tab strips).
//   app/apple-icon.png 180 px home-screen icon: the line mark (mark.svg) in ink on paper.
//   public/icons/icon-192.png, icon-512.png   the same for Android and installs, listed in the web manifests
//                      (app/(en)/manifest.webmanifest, app/(de)/de/manifest.webmanifest).
//   public/icons/icon-maskable-512.png        the Android launcher icon: the mark inside the safe circle, so any mask
//                      shape keeps all of it.
// Then run `npm run build` to copy them into out/. `node scripts/check-brand.mjs` (part of `npm run check`) fails if
// these files or components/brand/BrandMark.tsx no longer match the sources.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { faviconSvg, faviconIco, appleIcon, manifestIcon, maskableIcon } from "./brand/icons-lib.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (f) => fs.readFileSync(path.join(root, "scripts/brand", f), "utf8");
const small = read("mark-16.svg");
fs.writeFileSync(path.join(root, "app/icon.svg"), faviconSvg(small));
fs.writeFileSync(path.join(root, "app/favicon.ico"), faviconIco(small));
const mark = read("mark.svg");
fs.writeFileSync(path.join(root, "app/apple-icon.png"), appleIcon(mark));
fs.mkdirSync(path.join(root, "public/icons"), { recursive: true });
fs.writeFileSync(path.join(root, "public/icons/icon-192.png"), manifestIcon(mark, 192));
fs.writeFileSync(path.join(root, "public/icons/icon-512.png"), manifestIcon(mark, 512));
fs.writeFileSync(path.join(root, "public/icons/icon-maskable-512.png"), maskableIcon(mark));
console.log("wrote app/icon.svg, app/favicon.ico (16, 32, 48), app/apple-icon.png (180) and public/icons/ (192, 512, maskable 512)");
