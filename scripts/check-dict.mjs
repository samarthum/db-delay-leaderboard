// Checks lib/dict/en/*.ts against lib/dict/de/*.ts without a build:
//  - every English key has a German string and the other way round
//  - {placeholders} match in both languages
//  - no key is defined in two files (the merged dictionary would silently keep the last one)
//  - no empty string, no leftover TODO
// Dictionary files hold one `"key": "value",` entry per line, which is what the regex reads.
import { loadDict } from "./dict-load.mjs";

const vars = (s) => [...new Set([...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]))].sort().join(",");
const en = loadDict("en");
const de = loadDict("de");
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
