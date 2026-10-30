/**
 * Turns what a person says into what the search box takes.
 *
 *   "Wie pünktlich ist der Zug von Düsseldorf nach Amsterdam um acht Uhr vierzehn?"  ->  "08:14 Düsseldorf nach Amsterdam"
 *   "Is the train from Cologne to Berlin on time? 08:14, please."                    ->  "08:14 Cologne to Berlin"
 *   "How late is ICE 1541?"                                                          ->  "ICE 1541"
 *
 * Station names are matched against the same index the typed search uses, so "Cologne", "Munich" and "Köln" all work.
 * No model: the sentence is cut at "to / nach / bis", the words next to the cut that name a station are kept, the rest
 * ("is the train from", "on time please") is dropped.
 */
import { clock, extractTime, foreignFor, parseRoute, stationsFor, type StopsIndex } from "./routeSearch";
import type { Lang } from "./i18n";

export interface Heard {
  /** What to put in the search box. */
  text: string;
  kind: "route" | "train" | "other";
}

// ---------------------------------------------------------------- number words (0-59), German and English

const UNITS: Record<string, number> = {
  null: 0, zero: 0, ein: 1, eins: 1, eine: 1, one: 1, zwei: 2, two: 2, drei: 3, three: 3, vier: 4, four: 4, funf: 5, five: 5,
  sechs: 6, six: 6, sieben: 7, seven: 7, acht: 8, eight: 8, neun: 9, nine: 9, zehn: 10, ten: 10, elf: 11, eleven: 11,
  zwolf: 12, twelve: 12, dreizehn: 13, thirteen: 13, vierzehn: 14, fourteen: 14, funfzehn: 15, fifteen: 15, sechzehn: 16,
  sixteen: 16, siebzehn: 17, seventeen: 17, achtzehn: 18, eighteen: 18, neunzehn: 19, nineteen: 19,
};
const TENS: Record<string, number> = { zwanzig: 20, twenty: 20, dreissig: 30, thirty: 30, vierzig: 40, forty: 40, funfzig: 50, fifty: 50 };

const plain = (s: string) => s.toLowerCase().replace(/ä/g, "a").replace(/ö/g, "o").replace(/ü/g, "u").replace(/ß/g, "ss");

/** "vierzehn" -> 14, "einundvierzig" -> 41, "twenty one" -> 21, "14" -> 14; null when it is no number below 60. */
function num(words: string): number | null {
  const w = plain(words).trim().replace(/-/g, " ");
  if (/^\d{1,2}$/.test(w)) return Number(w) < 60 ? Number(w) : null;
  if (w in UNITS) return UNITS[w];
  if (w in TENS) return TENS[w];
  const de = /^(\w+?)und(\w+)$/.exec(w);
  if (de && de[1] in UNITS && de[2] in TENS && UNITS[de[1]] >= 1 && UNITS[de[1]] <= 9) return TENS[de[2]] + UNITS[de[1]];
  const en = /^(\w+) (\w+)$/.exec(w);
  if (en && en[1] in TENS && en[2] in UNITS && UNITS[en[2]] >= 1 && UNITS[en[2]] <= 9) return TENS[en[1]] + UNITS[en[2]];
  return null;
}

const NUMW = "(?:\\d{1,2}|(?:twenty|thirty|forty|fifty)[- ][a-z]+|[a-zäöüß]+)";

/** Pulls a spoken time out of the text. Returns minutes after midnight and the text without it. */
function spokenTime(input: string): { time: number | null; rest: string } {
  // Digits first: "8:14", "08.14", "8 Uhr", "20h".
  const d = extractTime(input);
  let time = d.time;
  let rest = d.rest;
  const cut = (m: RegExpExecArray) => (input.slice(0, m.index) + " " + input.slice(m.index + m[0].length)).replace(/\s+/g, " ").trim();
  if (time === null) {
    const low = input;
    let m: RegExpExecArray | null;
    const hour = (w: string) => {
      const n = num(w);
      return n !== null && n >= 1 && n <= 24 ? n : null;
    };
    if ((m = new RegExp(`\\b(?:halb|half past)\\s+(${NUMW})\\b`, "i").exec(low)) && hour(m[1]) !== null) {
      // German "halb neun" is 8:30; English "half past eight" is 8:30 too: say the same hour either way.
      const h = hour(m[1])!;
      time = /halb/i.test(m[0]) ? ((h + 23) % 24) * 60 + 30 : h * 60 + 30;
      rest = cut(m);
    } else if ((m = new RegExp(`\\b(?:viertel nach|quarter past)\\s+(${NUMW})\\b`, "i").exec(low)) && hour(m[1]) !== null) {
      time = hour(m[1])! * 60 + 15;
      rest = cut(m);
    } else if ((m = new RegExp(`\\b(?:viertel vor|quarter to)\\s+(${NUMW})\\b`, "i").exec(low)) && hour(m[1]) !== null) {
      time = ((hour(m[1])! + 23) % 24) * 60 + 45;
      rest = cut(m);
    } else if ((m = new RegExp(`\\b(${NUMW})\\s+uhr(?:\\s+(${NUMW}))?\\b`, "i").exec(low)) && hour(m[1]) !== null) {
      const min = m[2] ? num(m[2]) : 0;
      if (min !== null) {
        time = hour(m[1])! * 60 + min;
        rest = cut(m);
      }
    } else if ((m = new RegExp(`\\b(${NUMW})\\s+o['’]?clock\\b`, "i").exec(low)) && hour(m[1]) !== null) {
      time = hour(m[1])! * 60;
      rest = cut(m);
    } else if ((m = new RegExp(`\\b(?:at|around|about|for|by|leaving)\\s+(${NUMW})\\s+(?:oh\\s+)?(${NUMW})\\b`, "i").exec(low)) && hour(m[1]) !== null && num(m[2]) !== null) {
      time = hour(m[1])! * 60 + num(m[2])!;
      rest = cut(m);
    } else if ((m = new RegExp(`\\b(?:at|around|about|um|gegen)\\s+(${NUMW})\\s+(?=(?:in the|am (?:morgen|vormittag|nachmittag|abend)|pm|a\\.m\\.|p\\.m\\.|morgens|abends|vormittags|nachmittags))`, "i").exec(low)) && hour(m[1]) !== null) {
      time = hour(m[1])! * 60;
      rest = cut(m);
    }
  }
  if (time === null) return { time: null, rest: input };
  // "8:14 p.m.", "9 in the evening", "abends": afternoon and evening hours are 12-23.
  const after = /\b(p\.?m\.?|in the (?:afternoon|evening)|am nachmittag|am abend|nachmittags|abends|tonight)\b/i.exec(rest);
  const before = /\b(a\.?m\.?|in the morning|am morgen|am vormittag|morgens|vormittags)\b/i.exec(rest);
  if (after) {
    if (time < 12 * 60) time += 12 * 60;
    rest = rest.replace(after[0], " ");
  } else if (before) {
    rest = rest.replace(before[0], " ");
  }
  return { time: time % (24 * 60), rest: rest.replace(/\s+/g, " ").trim() };
}

// ---------------------------------------------------------------- the sentence

const TRAIN = /\b(ice|ic|ec|ece|rj|rjx|nj|flx|tgv|ir)\s*-?\s*(\d{1,5})\b/i;
const SEPARATORS = new Set(["to", "nach", "bis", "->", "→", "till", "until"]);
const MAX_WORDS = 4;

const title = (w: string) => w.charAt(0).toLocaleUpperCase() + w.slice(1);

/** The longest run of words that names a station, taken from the end of `words` (the "from" side) or the start (the "to" side). */
function name(idx: StopsIndex, words: string[], side: "from" | "to"): string | null {
  for (let k = Math.min(MAX_WORDS, words.length); k >= 1; k--) {
    const part = side === "from" ? words.slice(words.length - k) : words.slice(0, k);
    const text = part.join(" ");
    if (k === 1 && part[0].length < 3) continue; // "an", "in", "um" start many station names
    if (stationsFor(idx, text).length > 0 || (side === "to" && foreignFor(idx, text).length > 0)) return text;
  }
  return null;
}

export function interpretSpoken(idx: StopsIndex | null, raw: string, lang: Lang): Heard {
  const clean = raw
    .replace(/[?!,;"„“”«»]+/g, " ")
    .replace(/\.(?=\s|$)/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!clean) return { text: "", kind: "other" };

  const { time, rest } = spokenTime(clean);
  const tokens = rest.split(" ").filter(Boolean);
  const sep = lang === "de" ? "nach" : "to";

  if (idx) {
    for (let i = 1; i < tokens.length - 1; i++) {
      if (!SEPARATORS.has(tokens[i].toLowerCase())) continue;
      const left = tokens.slice(0, i).filter((w) => !/^(?:from|von|ab|aus)$/i.test(w) || false);
      const from = name(idx, left, "from");
      const to = name(idx, tokens.slice(i + 1), "to");
      if (!from || !to) continue;
      const q = `${from} ${sep} ${to}`;
      if (!parseRoute(idx, q)) continue;
      const shown = `${from.split(" ").map(title).join(" ")} ${sep} ${to.split(" ").map(title).join(" ")}`;
      return { text: `${time !== null ? clock(time) + " " : ""}${shown}`, kind: "route" };
    }
  }

  const train = TRAIN.exec(rest);
  if (train) return { text: `${train[1].toUpperCase()} ${train[2]}`, kind: "train" };

  // A station on its own ("Köln Hauptbahnhof") or something we do not know: hand the words over unchanged.
  return { text: clean, kind: "other" };
}
