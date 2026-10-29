// Checks lib/dict/en/*.ts against lib/dict/de/*.ts without a build:
//  - every English key has a German string and the other way round
//  - {placeholders} match in both languages
//  - no key is defined in two files (the merged dictionary would silently keep the last one)
//  - no empty string, no leftover TODO
// Dictionary files hold one `"key": "value",` entry per line, which is what the regex reads.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIR = path.join(ROOT, "lib", "dict");
const ENTRY = /^\s*(?:"([^"]+)"|([A-Za-z_][\w]*))\s*:\s*"((?:[^"\\]|\\.)*)"\s*,?\s*$/;

function read(lang) {
  const out = new Map();
  const where = new Map();
  const dups = [];
  for (const file of fs.readdirSync(path.join(DIR, lang)).filter((f) => f.endsWith(".ts")).sort()) {
    for (const line of fs.readFileSync(path.join(DIR, lang, file), "utf8").split("\n")) {
      const m = ENTRY.exec(line);
      if (!m) continue;
      const key = m[1] ?? m[2];
      if (out.has(key)) dups.push(`${lang}: "${key}" is in ${where.get(key)} and ${file}`);
      out.set(key, m[3]);
      where.set(key, file);
    }
  }
  return { map: out, where, dups };
}

const vars = (s) => [...new Set([...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]))].sort().join(",");
const en = read("en");
const de = read("de");
const problems = [...en.dups, ...de.dups];

for (const [k, v] of en.map) {
  if (!de.map.has(k)) problems.push(`missing in German: "${k}" (${en.where.get(k)})`);
  else if (vars(v) !== vars(de.map.get(k))) problems.push(`placeholders differ for "${k}": en {${vars(v)}} vs de {${vars(de.map.get(k))}}`);
  if (v.trim() === "") problems.push(`empty English string: "${k}"`);
}
for (const [k, v] of de.map) {
  if (!en.map.has(k)) problems.push(`German key with no English: "${k}" (${de.where.get(k)})`);
  if (v.trim() === "" && !(en.map.get(k) ?? "").includes("{x}")) problems.push(`empty German string: "${k}"`);
  if (/TODO|FIXME|XXX/.test(v)) problems.push(`placeholder text in German: "${k}"`);
}

console.log(`dictionary: ${en.map.size} English keys, ${de.map.size} German keys`);
if (problems.length) {
  console.error(problems.join("\n"));
  process.exit(1);
}
console.log("dictionary: ok");
