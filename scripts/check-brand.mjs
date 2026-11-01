// Fails when the copies of the brand mark drift from their sources in scripts/brand/:
//   components/brand/BrandMark.tsx must draw the same shapes as scripts/brand/mark.svg (same viewBox, paths, circles);
//   app/icon.svg must hold the same pixels as scripts/brand/mark-16.svg.
// Fix by editing the source and the copy together, then `node scripts/brand-icons.mjs` for the icon files.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (f) => fs.readFileSync(path.join(root, f), "utf8");
const problems = [];

// Geometry only: viewBox plus every d / cx / cy / r / x / y / width / height value, in order.
const geometry = (s) => [...s.matchAll(/(?<=\s)(viewBox|d|cx|cy|r|x|y|width|height)="([^"]*)"/g)].map((m) => `${m[1]}=${m[2]}`).join("|");

const tsx = read("components/brand/BrandMark.tsx");
const mark = read("scripts/brand/mark.svg");
if (geometry(tsx) !== geometry(mark)) problems.push("components/brand/BrandMark.tsx does not match scripts/brand/mark.svg");

const icon = read("app/icon.svg");
const small = read("scripts/brand/mark-16.svg").replace(/^<svg[^>]*>/, "");
if (geometry(icon.replace(/^<svg[^>]*>/, "")) !== geometry(small)) problems.push("app/icon.svg does not match scripts/brand/mark-16.svg (run node scripts/brand-icons.mjs)");

if (problems.length) {
  for (const p of problems) console.error("brand: " + p);
  process.exit(1);
}
console.log("brand: ok");
