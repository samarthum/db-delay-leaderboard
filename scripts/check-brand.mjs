// Fails when a copy of the brand mark drifts from its source in scripts/brand/:
//   components/brand/BrandMark.tsx must draw what scripts/brand/mark.svg draws (viewBox, shapes, stroke widths, fills);
//   app/icon.svg, app/favicon.ico and app/apple-icon.png must be exactly what scripts/brand-icons.mjs makes now.
// Fix: edit the source and BrandMark.tsx together, then `node scripts/brand-icons.mjs`.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { faviconSvg, faviconIco, appleIcon } from "./brand/icons-lib.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (f, enc = "utf8") => fs.readFileSync(path.join(root, f), enc);
const problems = [];

// Every drawing attribute, in document order, with JSX spellings and the ink colour normalised.
const ATTRS = "viewBox|d|cx|cy|r|x|y|width|height|rx|fill|stroke|strokeWidth|stroke-width|fillRule|fill-rule";
const geometry = (s) =>
  [...s.replace(/^[\s\S]*?<svg\b/, "<svg").matchAll(new RegExp(`(?<=\\s)(${ATTRS})=(?:"([^"]*)"|\\{"([^"]*)"\\})`, "g"))]
    .map((m) => {
      const name = m[1].replace("strokeWidth", "stroke-width").replace("fillRule", "fill-rule");
      const value = (m[2] ?? m[3]).replace(/^#14161a$/i, "currentColor");
      return `${name}=${value}`;
    })
    .join("|");

const tsx = read("components/brand/BrandMark.tsx");
const mark = read("scripts/brand/mark.svg");
if (geometry(tsx) !== geometry(mark)) problems.push("components/brand/BrandMark.tsx does not match scripts/brand/mark.svg");

const small = read("scripts/brand/mark-16.svg");
if (read("app/icon.svg") !== faviconSvg(small)) problems.push("app/icon.svg is stale");
if (!read("app/favicon.ico", null).equals(faviconIco(small))) problems.push("app/favicon.ico is stale");
if (!read("app/apple-icon.png", null).equals(appleIcon(mark))) problems.push("app/apple-icon.png is stale");

if (problems.length) {
  for (const p of problems) console.error(`brand: ${p} (see scripts/check-brand.mjs)`);
  process.exit(1);
}
console.log("brand: ok");
