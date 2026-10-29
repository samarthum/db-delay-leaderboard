// Copies the search index written by compute.py (data/search/) to public/search/, where the browser fetches it.
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FROM = path.join(ROOT, "data", "search");
const TO = path.join(ROOT, "public", "search");

await fs.rm(TO, { recursive: true, force: true });
await fs.mkdir(TO, { recursive: true });
let files = 0;
let bytes = 0;
for (const name of await fs.readdir(FROM)) {
  // index.json is imported into the page bundle at build time; the browser only fetches shards and number lists.
  if (!/^(s|n)-.+\.json$/.test(name)) continue;
  await fs.copyFile(path.join(FROM, name), path.join(TO, name));
  bytes += (await fs.stat(path.join(FROM, name))).size;
  files += 1;
}
console.log(`search: ${files} files, ${(bytes / 1e6).toFixed(1)} MB copied to public/search`);
