// Reads lib/dict/{en,de}/*.ts into plain maps. Entries are one `"key": "value",` per line, so a regex is enough
// and the build scripts need no TypeScript loader.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ENTRY = /^\s*(?:"([^"]+)"|([A-Za-z_][\w]*))\s*:\s*"((?:[^"\\]|\\.)*)"\s*,?\s*$/;

export function loadDict(lang) {
  const dir = path.join(ROOT, "lib", "dict", lang);
  const map = new Map();
  const where = new Map();
  const dups = [];
  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith(".ts")).sort()) {
    for (const line of fs.readFileSync(path.join(dir, file), "utf8").split("\n")) {
      const m = ENTRY.exec(line);
      if (!m) continue;
      const key = m[1] ?? m[2];
      if (map.has(key)) dups.push(`${lang}: "${key}" is in ${where.get(key)} and ${file}`);
      map.set(key, m[3].replace(/\\"/g, '"').replace(/\\\\/g, "\\"));
      where.set(key, file);
    }
  }
  return { map, where, dups };
}

/** {name} placeholders are replaced from vars; a missing one is left visible. */
export function fill(template, vars = {}) {
  return template.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
}

export function makeT(lang) {
  const { map } = loadDict(lang);
  return (key, vars) => {
    if (!map.has(key)) throw new Error(`missing ${lang} string: ${key}`);
    return fill(map.get(key), vars);
  };
}
