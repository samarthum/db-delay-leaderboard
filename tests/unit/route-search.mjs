// Unit tests for route search across the border (lib/routeSearch.ts + lib/typeahead.ts) on a small synthetic index in
// the exact layout of public/search/stops.json (scripts/copy-search.mjs): German stops plus stops abroad placed by
// planned time, a train whose stops abroad are unknown (only its destination label), and a train the other way.
//
//   node tests/unit/route-search.mjs
//
// Compiles the two TypeScript files with the project's own tsc into a temp folder (CommonJS) and checks: aliases and
// spellings (Düsseldorf/Dusseldorf/Duesseldorf, Bruxelles/Brussel/Brüssel/Brussels, Praha/Prag/Prague, Wien/Vienna,
// Köln/Cologne, Zürich/Zurich), direction (A to B lists only trains that reach B after A), foreign-to-German,
// German-to-foreign and foreign-to-foreign on one through train, the label fallback, and the no-history flag.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const OUT = fs.mkdtempSync(path.join(os.tmpdir(), "gp-unit-"));
execFileSync(process.execPath, [path.join(ROOT, "node_modules/typescript/bin/tsc"), "--outDir", OUT, "--module", "commonjs", "--target", "es2022", "--moduleResolution", "node", "--skipLibCheck", path.join(ROOT, "lib/routeSearch.ts")], { stdio: "inherit" });
const require = createRequire(import.meta.url);
const rs = require(path.join(OUT, "routeSearch.js"));

let pass = 0;
let fail = 0;
const ok = (c, m) => {
  if (c) pass++;
  else {
    fail++;
    console.log("FAIL", m);
  }
};

// stations 0-4 German, 5-9 abroad (copy-search appends them after the German ones)
const stations = ["Düsseldorf Hbf", "Köln Hbf", "Frankfurt (Main) Hbf", "Basel Bad Bf", "München Hbf", "Amsterdam Centraal", "Utrecht Centraal", "Basel SBB", "Bruxelles Midi", "Wien Hbf", "Praha hl.n.", "Zürich HB"];
const S = (i, dep, arr, off, hist = [0, 0, null, null, 0], dep3) => {
  const r = [i, dep, arr, hist[0], hist[1], hist[2], hist[3], hist[4], off];
  if (dep3) r.push(dep3);
  return r;
};
const raw = {
  window: { firstMonth: "2025-11", lastMonth: "2026-09", monthCount: 11 },
  params: { minStopRuns: 20, lateMinutes: 15 },
  stations,
  foreign: ["Amsterdam Centraal", "Wien Hbf", "Zürich HB"],
  abroad: { 5: "NL", 6: "NL", 7: "CH", 8: "BE", 9: "AT", 10: "CZ", 11: "CH" },
  sources: ["NL"],
  trains: [
    // ICE 105 Amsterdam -> Utrecht -> Düsseldorf -> Köln -> Frankfurt -> Basel Bad Bf -> Basel SBB
    ["ICE", "105", [S(5, 360, null, 300, [300, 0, null, null, 1], [290, 2.1, 1.4]), S(6, 388, 385, 325, [300, 290, 9.0, 3.2, 1]), S(0, 492, 490, 430, [280, 270, 18.5, 6.1, 2]), S(1, 520, 515, 455, [280, 270, 20.1, 7.0, 2]), S(2, 590, 585, 525, [280, 270, 25.0, 9.0, 2]), S(3, 760, 755, 695, [280, 260, 30.0, 11.0, 3]), S(7, null, 770, 710)], null, 0],
    // ICE 104 the other way: Basel SBB -> ... -> Amsterdam
    ["ICE", "104", [S(7, 600, null, 600), S(3, 612, 610, 610, [280, 270, 10, 3, 1]), S(1, 840, 835, 835, [280, 270, 12, 4, 1]), S(0, 868, 865, 865, [280, 270, 13, 4, 1]), S(6, 975, 972, 972, [290, 280, 15.5, 5.5, 1]), S(5, null, 1000, 1000, [290, 280, 16.0, 6.0, 1])], 0, 2],
    // ICE 14 Köln -> Bruxelles Midi (no source in BE)
    ["ICE", "14", [S(1, 600, null, 600), S(8, null, 710, 710)]],
    // RJ 60 München -> Wien Hbf, stops abroad NOT known: only the destination label (field 3 = Wien Hbf)
    ["RJ", "60", [S(4, 555, null, 555), [3, 700, 698, 3, 3, 0, 0, 0, 698]], 1],
    // EC 175 Berlin... -> Praha with its stop abroad
    ["EC", "175", [S(1, 500, null, 500), S(10, null, 800, 800)]],
  ],
};
// RJ 60 above: München Hbf (dep) -> Basel Bad Bf stand-in as its last German stop, label Wien Hbf.
const idx = rs.buildStops(raw);
const route = (text) => {
  const q = rs.parseRoute(idx, text);
  return q ? rs.findTrains(idx, q) : null;
};
const names = (hits) => (hits || []).map((h) => `${h.type} ${h.num}`).sort();

// Aliases and spellings
for (const [a, b] of [["Düsseldorf", "Dusseldorf"], ["Duesseldorf", "Düsseldorf"], ["Köln", "Cologne"], ["Koeln", "Köln"]]) ok(rs.stationsFor(idx, a).join() === rs.stationsFor(idx, b).join() && rs.stationsFor(idx, a).length > 0, `alias ${a} = ${b}`);
for (const w of ["Bruxelles", "Brussel", "Brüssel", "Brussels"]) ok(rs.stationsFor(idx, w).includes(8), `alias ${w} -> Bruxelles Midi`);
for (const w of ["Praha", "Prag", "Prague"]) ok(rs.stationsFor(idx, w).includes(10), `alias ${w} -> Praha hl.n.`);
for (const w of ["Wien", "Vienna"]) ok(rs.stationsFor(idx, w).includes(9), `alias ${w} -> Wien Hbf`);
for (const w of ["Zürich", "Zurich"]) ok(rs.stationsFor(idx, w).includes(11), `alias ${w} -> Zürich HB`);
ok(rs.stationsFor(idx, "Amsterdam Central").includes(5), "Amsterdam Central -> Centraal");

// Direction and pairs across the border
ok(names(route("amsterdam to dusseldorf")).join() === "ICE 105", `amsterdam to dusseldorf: ${names(route("amsterdam to dusseldorf"))}`);
ok(names(route("düsseldorf amsterdam")).join() === "ICE 104", `düsseldorf amsterdam: ${names(route("düsseldorf amsterdam"))}`);
ok(names(route("Amsterdam to Basel")).join() === "ICE 105", "foreign to foreign on one through train (Amsterdam -> Basel)");
ok(names(route("Basel Frankfurt")).length === 0 || names(route("Basel Frankfurt")).every((n) => n !== "ICE 105"), "Basel Frankfurt does not list the train going the other way");
ok(names(route("Basel Köln")).join() === "ICE 104", `Basel Köln: ${names(route("Basel Köln"))}`);
ok(names(route("Köln Bruxelles")).join() === "ICE 14", "Köln Bruxelles");
ok(names(route("Köln Praha")).join() === "EC 175", "Köln Praha");
const ab = route("amsterdam to dusseldorf")[0];
ok(ab.fromCc === "NL" && ab.toCc === null && ab.fromName === "Amsterdam Centraal" && ab.toName === "Düsseldorf Hbf" && ab.dep === 360, `Amsterdam hit fields ${JSON.stringify(ab)}`);
ok(ab.late === 18.5 && !ab.noHistory, "figure at Düsseldorf");
const bx = route("Köln Bruxelles")[0];
ok(bx.toCc === "BE" && bx.noHistory === true && bx.late === null, "no history abroad for Belgium flagged");
const ut = route("Düsseldorf to Utrecht")[0];
ok(ut && ut.toCc === "NL" && ut.late === 15.5 && !ut.noHistory, "German to foreign with Dutch history");

// Label fallback: a train whose stops abroad are unknown still answers "München to Wien", measured at the border.
const mw = route("München Wien");
ok(names(mw).join() === "RJ 60" && mw[0].abroad === true && mw[0].toName === "Basel Bad Bf", `München Wien via the label: ${JSON.stringify(mw)}`);

// Destinations offered after "Amsterdam to"
const d = rs.destinations(idx, "Amsterdam to ");
ok(d && d.options.some((o) => o.name === "Düsseldorf Hbf"), `destinations from Amsterdam ${JSON.stringify(d && d.options)}`);
const d2 = rs.destinations(idx, "Amsterdam to Bas");
ok(d2 && d2.options.map((o) => o.name).join() === "Basel Bad Bf,Basel SBB", `"Amsterdam to Bas" offers both Basel stations ${JSON.stringify(d2 && d2.options)}`);
ok(d && !d.options.some((o) => o.name === "Amsterdam Centraal"), "no destination equal to the start");

fs.rmSync(OUT, { recursive: true, force: true });
console.log(`route search: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
