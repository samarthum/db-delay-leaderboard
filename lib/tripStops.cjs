// One train's stops on both sides of the border, in running order: the German stops from data/stops.json (the
// site's history) and the stops abroad from data/foreign-stops.json (Transitous timetables), placed by planned time.
// Shared by scripts/copy-search.mjs (route search index) and api/live.js (live times at the stops a visitor names),
// so both put a stop abroad at the same planned time. CommonJS so the Vercel Function can require it.

/** Folded name for comparing spellings: "Frankfurt(Main)Hbf" = "Frankfurt (Main) Hbf", "Liège" = "Liege". */
function fold(s) {
  return String(s).toLowerCase().replace(/ß/g, "ss").normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/hauptbahnhof/g, "hbf").replace(/[^a-z0-9]/g, "");
}

// One spelling per station across the site: DB's own label where our data already names the place (the destination
// labels in stops.json `foreign`, "Bruxelles Midi", "Praha hl.n."), else a fixed spelling for feeds in another language.
const PRETTY = {
  "Brussel-Zuid": "Bruxelles Midi", "Bruxelles-Midi": "Bruxelles Midi", "Brussels-Midi": "Bruxelles Midi", "Brussel-Noord": "Bruxelles Nord",
  "Bruxelles-Nord": "Bruxelles Nord", "Bruxelles-Central": "Bruxelles Central", "Brussel-Centraal": "Bruxelles Central",
  "Luik-Guillemins": "Liège-Guillemins", "Liège, Guillemins Bf": "Liège-Guillemins", "Brussels Airport - Zaventem": "Brussels Airport", "Liege-Guillemins": "Liège-Guillemins", "Antwerpen-Centraal": "Antwerpen Centraal",
  "Koebenhavn H": "København H", "Kobenhavn H": "København H", "Koebenhavns Lufthavn st": "Københavns Lufthavn", "Praha hlavni nadrazi": "Praha hl.n.", "Praha hl. n.": "Praha hl.n.",
};
/** The site's spelling of a station name from a feed abroad. `labels`: stops.json `foreign`. */
function canonical(name, labels) {
  let n = String(name).trim();
  // Capitals only ("MILANO CENTRALE", "LUGANO"): words as names, short codes kept ("SBB", "HB").
  if (n === n.toUpperCase() && /[A-Z]{3}/.test(n)) n = n.toLowerCase().replace(/(^|[\s\-/(])(\p{L})(\p{L}*)/gu, (m, a, b, c) => a + b.toUpperCase() + c).replace(/\b(Sbb|Hb|Ffs|Cff|Ch)\b/g, (w) => w.toUpperCase());
  n = n.replace(/\s+st$/, ""); // Danish feeds: "Kolding st" (station)
  if (PRETTY[n]) return PRETTY[n];
  const k = stationKey(n);
  for (const l of labels || []) if (stationKey(l) === k) return PRETTY[l] || l;
  return n;
}

/**
 * One key per station whatever the feed's spelling: "BASEL SBB" = "Basel SBB", "Praha hlavní nádraží" = "Praha hl.n.",
 * "Liège, Guillemins Bf" = "Liège-Guillemins", "Bolzano, Stazione di Bolzano" = "Bolzano/Bozen", "Salzburg
 * Hauptbahnhof" = "Salzburg Hbf", "Padborg st" = "Padborg", "Koebenhavn H" = "København H".
 */
function stationKey(name) {
  let n = String(name).toLowerCase().replace(/ß/g, "ss").replace(/ø/g, "o").replace(/æ/g, "ae").replace(/å/g, "a");
  n = n.normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
  n = n.replace(/,\s*stazione di .*$/, "").replace(/\/.*$/, "");
  n = n.replace(/hauptbahnhof/g, "hbf").replace(/hlavni\s+nadrazi|\bhl\.?\s*n\.?(?=\s|$)/g, " hln ");
  n = n.replace(/koebenhavn/g, "kobenhavn").replace(/ae/g, "a").replace(/oe/g, "o").replace(/ue/g, "u"); // Zuerich = Zürich
  n = n.replace(/\b(stazione|bahnhof|station|st|bf|gare)\b/g, " ");
  return n.replace(/[^a-z0-9]/g, "");
}

/** How a spelling reads to a visitor (lower is better): no capitals-only names, no "Stazione di", "Hbf" over "Hauptbahnhof". */
function spellingCost(name) {
  const n = String(name);
  let c = 0;
  if (n === n.toUpperCase() && /[A-Z]{3}/.test(n)) c += 8;
  if (/stazione|bahnhof\b|, .* bf$/i.test(n) && !/hauptbahnhof/i.test(n)) c += 4;
  if (/hauptbahnhof|hlavní nádraží|hlavni nadrazi/i.test(n)) c += 2;
  if (/ st$/.test(n)) c += 2;
  return c + n.length / 100;
}

const mod = (m) => ((m % 1440) + 1440) % 1440;

/**
 * [{ name, dep, arr, off, cc, de }] for train "ICE 121": dep/arr planned minutes after midnight (null where the train
 * does not leave / arrive there), off minutes on the run's own clock (comparable within the train), cc the country of
 * a stop abroad (null in Germany), de the index of the German stop in the stops.json record (null abroad).
 * Returns null when stops.json has no record of the train. `record`: one stops.json train record to use.
 */
function tripStops(stops, foreignStops, train, record) {
  const [tt, num] = train.split(" ");
  // A number can have several timetable variants: the caller may name the record, else the one with the most stops.
  const tr = record || stops.trains.filter((t) => t[0] === tt && t[1] === num).sort((x, y) => y[2].length - x[2].length)[0];
  if (!tr) return null;
  const st = tr[2];
  const out = st.map((s, i) => ({ name: stops.stations[s[0]], dep: s[1], arr: s[2], off: s[8], cc: null, de: i }));
  const f = foreignStops && foreignStops.trains ? foreignStops.trains[train] : null;
  if (!f) return out;
  const a = st.find((s) => stops.stations[s[0]] === f.at);
  if (!a) return out;
  // The anchor's offset is measured at its arrival (stops.py: arrival, else departure); the offsets abroad count from
  // its departure: add the planned stop there.
  const dwell = a[1] !== null && a[2] !== null ? mod(a[1] - a[2]) : 0;
  const base = a[8] + (dwell < 60 ? dwell : 0);
  const here = new Set(out.map((s) => stationKey(s.name)));
  for (const [name, arr, dep] of f.s) {
    if (here.has(stationKey(name))) continue;
    here.add(stationKey(name));
    const cc = foreignStops.stations && foreignStops.stations[name] ? foreignStops.stations[name][0] : null;
    out.push({ name, dep: dep === null ? null : mod(f.t + dep), arr: arr === null ? null : mod(f.t + arr), off: base + (arr ?? dep), cc, de: null });
  }
  out.sort((x, y) => x.off - y.off);
  return out;
}

module.exports = { fold, stationKey, spellingCost, canonical, tripStops };
