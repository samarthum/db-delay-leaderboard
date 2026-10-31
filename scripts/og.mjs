// Share images, built at deploy time with satori + resvg, English and German:
//   public/og/<lastMonth>/<name>.png        English (home, recap, recap-tall, one per train and line)
//   public/og/<lastMonth>/de/<name>.png     German
//   public/og/routes/<lastMonth>/[de/]<slug>[-portrait].png   one wide and one portrait card per route, plus the ranking
// Every number comes from data/; every sentence from lib/dict/{en,de}, so the cards say what the site says.
// Look: the site's. Paper, ink, Archivo; one big number; two bars on one scale (our 15-minute count, Deutsche Bahn's
// 6-minute rule, hatched); colour only on the bars and dots that carry data.
//
//   node scripts/og.mjs                      everything (deploy)
//   OG_SAMPLE=/some/dir node scripts/og.mjs  a fixed handful of hard cases into that folder, nothing else touched
import fs from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import satori from "satori";
import { Resvg } from "@resvg/resvg-js";

// Route cards are flat colours with a few accents: a palette PNG is a third of the size and looks the same.
// Without sharp the build still works, the files are just bigger.
let sharp = null;
try {
  sharp = (await import("sharp")).default;
} catch {
  console.warn("og: sharp not installed, route cards are written uncompressed");
}
import { makeT } from "./dict-load.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DATA_DIR = path.join(ROOT, "data");
const FONT_DIR = path.join(ROOT, "scripts", "fonts");
const OUT_DIR = path.join(ROOT, "public", "og");
const SAMPLE = process.env.OG_SAMPLE || "";
const W = 1200;
const H = 630;

// Static cuts: satori cannot use a variable font's width axis, so the narrow headline is the Condensed family.
const FONTS = [
  { file: "Archivo-Medium.ttf", name: "Archivo", weight: 500 },
  { file: "Archivo-SemiBold.ttf", name: "Archivo", weight: 600 },
  { file: "ArchivoCondensed-Bold.ttf", name: "Archivo Condensed", weight: 700 },
  { file: "ArchivoCondensed-ExtraBold.ttf", name: "Archivo Condensed", weight: 800 },
];
const SANS = "Archivo";
const COND = "Archivo Condensed";

const C = {
  paper: "#fafaf8",
  ink: "#14161a",
  ink2: "#40464f",
  muted: "#5d646e",
  rule: "#dadde1",
  track: "#eceef0",
  safe: "#1d7a49",
  fair: "#7f9a1c",
  warn: "#d46a00",
  late: "#c42b1c",
};

const MONTHS = {
  en: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
  de: ["Jan.", "Feb.", "März", "Apr.", "Mai", "Juni", "Juli", "Aug.", "Sept.", "Okt.", "Nov.", "Dez."],
};
const NBSP = "\u00a0";
const monthLabel = (m, lang) => `${MONTHS[lang][Number(m.slice(5, 7)) - 1]} ${m.slice(0, 4)}`;
const spanLabel = (a, b, lang) => `${monthLabel(a, lang)} ${lang === "de" ? "bis" : "to"} ${monthLabel(b, lang)}`;
const dec = (lang) => (lang === "de" ? "," : ".");
const fmt1 = (n, lang) => n.toFixed(1).replace(".", dec(lang));
const fmtShare = (n, lang) => (lang === "de" ? `${Math.round(n)}${NBSP}%` : `${Math.round(n)}%`);
const fmtShare1 = (n, lang) => (lang === "de" ? `${fmt1(n, lang)}${NBSP}%` : `${fmt1(n, lang)}%`);
const fmtInt = (n, lang) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, lang === "de" ? "." : ",");
const clip = (s, max) => (s.length > max ? `${s.slice(0, max - 1).trimEnd()}…` : s);

/** Same steps as the site's lateShareColor. */
function lateColor(pct) {
  if (pct < 20) return C.safe;
  if (pct < 35) return C.fair;
  if (pct < 50) return C.warn;
  return C.late;
}

/** Average minutes late: same steps as the site's DELAY_SCALE. */
function delayColor(min) {
  if (min < 5) return C.safe;
  if (min < 15) return C.fair;
  if (min < 30) return C.warn;
  return C.late;
}

function h(type, props, ...children) {
  const kids = children.flat(Infinity).filter((c) => c !== null && c !== undefined && c !== false);
  return { type, props: { ...props, children: kids.length === 0 ? undefined : kids.length === 1 ? kids[0] : kids } };
}

/** A flex box: satori needs display:flex on anything with more than one child. */
const d = (style, ...kids) => h("div", { style: { display: "flex", ...style } }, ...kids);

const SITE_HOST = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://german-punctuality.vercel.app").replace(/^https?:\/\//, "").replace(/\/+$/, "");

// ---------------------------------------------------------------- building blocks

/** Words as separate boxes so a sentence wraps at any space; **bold** parts are semibold. */
function rich(text, size, color = C.ink, bold = 600) {
  const words = [];
  text.split("**").forEach((part, i) => {
    part
      .split(/\s+/)
      .filter(Boolean)
      .forEach((w) => words.push({ w, b: i % 2 === 1 }));
  });
  return d(
    { flexWrap: "wrap", fontSize: size, lineHeight: 1.22, color },
    words.map((x, i) => d({ marginRight: Math.round(size * 0.27), fontWeight: x.b ? bold : 500 }, x.w)),
  );
}

function arrow(size, color = C.ink, bothWays = false) {
  return h(
    "svg",
    { width: size, height: size, viewBox: "0 0 24 24", style: { flexShrink: 0 } },
    h("path", {
      d: bothWays ? "M3 12h18M9 6l-6 6 6 6M15 6l6 6-6 6" : "M2 12h18M13 5l7 7-7 7",
      fill: "none",
      stroke: color,
      strokeWidth: 2.6,
      strokeLinecap: "square",
      strokeLinejoin: "miter",
    }),
  );
}

function watermark(size = 34) {
  return d(
    { alignItems: "center", fontFamily: COND, fontWeight: 800, fontSize: size, color: C.ink },
    h(
      "svg",
      { width: Math.round(size * 0.62), height: Math.round(size * 0.62), viewBox: "0 0 20 20", style: { marginRight: 12 } },
      h("circle", { cx: 10, cy: 10, r: 4.2, fill: C.ink }),
      h("circle", { cx: 10, cy: 10, r: 8.4, fill: "none", stroke: C.ink, strokeWidth: 1.8 }),
    ),
    "German Punctuality",
  );
}

function topBar(right, w) {
  return d(
    { width: w, alignItems: "center", justifyContent: "space-between", paddingBottom: 16, borderBottom: `3px solid ${C.ink}`, fontSize: 24, fontWeight: 500, color: C.ink2 },
    watermark(),
    d({}, right),
  );
}

function footer(w, t, small = 20) {
  return d(
    { width: w, alignItems: "flex-end", justifyContent: "space-between", paddingTop: 14, borderTop: `2px solid ${C.rule}`, fontSize: small, color: C.muted, lineHeight: 1.3 },
    d({ flexDirection: "column", maxWidth: w - 400 }, t("card.data")),
    d({ fontSize: small + 4, fontWeight: 600, color: C.ink }, SITE_HOST),
  );
}

/** Page: top bar, content, footer. */
function sheet(w, hh, pad, right, t, ...content) {
  return d(
    { flexDirection: "column", width: w, height: hh, background: C.paper, fontFamily: SANS, fontWeight: 500, color: C.ink },
    d(
      { flexDirection: "column", flexGrow: 1, padding: `${pad[0]}px ${pad[1]}px ${pad[2]}px` },
      topBar(right, w - 2 * pad[1]),
      d({ flexDirection: "column", flexGrow: 1 }, ...content),
      footer(w - 2 * pad[1], t, w > 1100 && hh > 1300 ? 24 : 20),
    ),
  );
}

/** One of the two bars. */
function ruleBar(label, small, value, text, o) {
  const color = lateColor(o.colorFrom ?? value);
  const fill = o.db
    ? { backgroundImage: `repeating-linear-gradient(135deg, ${color} 0px, ${color} 7px, #ffffff 7px, #ffffff 12px)` }
    : { background: color };
  return d(
    { alignItems: "center", marginTop: o.gap },
    d(
      { flexDirection: "column", width: o.labelW, fontSize: o.fs, fontWeight: 600, lineHeight: 1.15 },
      d({}, label),
      d({ fontSize: Math.round(o.fs * 0.82), fontWeight: 500, color: C.muted }, small),
    ),
    d(
      { flexGrow: 1, height: o.barH, background: C.track, position: "relative" },
      d({ position: "absolute", left: 0, top: 0, bottom: 0, width: `${Math.max(0.8, Math.min(100, value))}%`, ...fill }),
    ),
    d({ width: o.valW, justifyContent: "flex-end", fontFamily: COND, fontWeight: 800, fontSize: Math.round(o.fs * 1.7), lineHeight: 1 }, text),
  );
}

/** The answer: big number, what it counts, then both bars. */
function figure(avg, pct, pct6, sentence, t, lang, o) {
  const num = String(Math.max(0, Math.round(avg)));
  const big = d(
    { alignItems: "flex-end", fontFamily: COND, fontWeight: 800, fontSize: o.big, lineHeight: 0.8, letterSpacing: -4, color: C.ink },
    num,
    d({ fontSize: Math.round(o.big * 0.36), lineHeight: 1, marginLeft: 10, marginBottom: Math.round(o.big * 0.04), letterSpacing: 0 }, t("unit.min")),
  );
  return d(
    { flexDirection: "column", width: o.width },
    o.stack
      ? d({ flexDirection: "column" }, big, d({ marginTop: 18 }, rich(sentence, o.sentence)))
      : d({ alignItems: "flex-end" }, big, d({ flexGrow: 1, marginLeft: o.gapText, paddingBottom: 4 }, rich(sentence, o.sentence))),
    d(
      { flexDirection: "column", marginTop: o.barsTop },
      ruleBar(t("rule.ours"), t("rule.ours15"), pct, fmtShare(pct, lang), { ...o.bar, db: false }),
      pct6 !== null && pct6 !== undefined ? ruleBar(t("rule.db"), t("rule.db6"), pct6, fmtShare(pct6, lang), { ...o.bar, db: true, colorFrom: pct }) : null,
    ),
  );
}

const WIDE_FIG = { width: 560, stack: true, big: 190, sentence: 29, gapText: 22, barsTop: 26, bar: { gap: 14, labelW: 190, valW: 100, barH: 26, fs: 20 } };
const TALL_FIG = { width: 952, big: 330, sentence: 44, gapText: 30, barsTop: 40, bar: { gap: 22, labelW: 290, valW: 150, barH: 34, fs: 30 } };

const rule = (w, color = C.rule, hh = 2) => d({ width: w, height: hh, background: color });
const vrule = () => d({ width: 2, background: C.rule, alignSelf: "stretch", margin: "0 40px" });

// ---------------------------------------------------------------- names

const SHORT = (n) => n.replace("Hauptbahnhof", "Hbf");

/** Names as printed on a card: "Frankfurt am Main Flughafen Fernbahnhof" would not fit at any size worth reading. */
function cardName(n) {
  return SHORT(n)
    .replace(/^Frankfurt am Main Flughafen Fernbahnhof$/, "Frankfurt Flughafen")
    .replace(/^Frankfurt \(Main\) /, "Frankfurt ")
    .replace(/^Frankfurt \(Main\)$/, "Frankfurt")
    .replace(/ \(Westf\)/, "")
    .replace(/ \(Breisgau\)/, "")
    .replace(/ \(Saale\)/, "")
    .replace(/ \(Oder\)/, "");
}

/** Font size (px) at which both lines fit `width` px on one line: the second line also carries the arrow. */
function nameSize(r, width, max) {
  const chars = Math.max(cardName(r.from).length, cardName(r.to).length + 1.5);
  return Math.max(46, Math.min(max, Math.floor(width / (0.5 * chars))));
}

function routeNames(r, size) {
  return d(
    { flexDirection: "column", fontFamily: COND, fontWeight: 800, fontSize: size, lineHeight: 0.98 },
    d({ whiteSpace: "nowrap" }, cardName(r.from)),
    d({ alignItems: "center", whiteSpace: "nowrap" }, arrow(Math.round(size * 0.72)), d({ marginLeft: Math.round(size * 0.12) }, cardName(r.to))),
  );
}

function trainName(name, width, max) {
  return d({ fontFamily: COND, fontWeight: 800, fontSize: Math.max(60, Math.min(max, Math.floor(width / (0.5 * name.length)))), lineHeight: 0.95 }, name);
}

// ---------------------------------------------------------------- cards

function homeCard(stats, t, lang) {
  const w = stats.window;
  const ld = stats.recap.longDistance;
  const span = spanLabel(w.firstMonth, w.lastMonth, lang);
  return sheet(
    W,
    H,
    [34, 60, 26],
    span,
    t,
    d(
      { flexGrow: 1, alignItems: "center" },
      d(
        { flexDirection: "column", width: 480 },
        d({ fontFamily: COND, fontWeight: 800, fontSize: lang === "de" ? 84 : 92, lineHeight: 0.98 }, t("home.title")),
        d({ fontSize: 24, color: C.ink2, marginTop: 22, lineHeight: 1.3 }, t("home.networkBasis", { trips: fmtInt(ld.measured, lang), span })),
      ),
      vrule(),
      figure(ld.avgDelayMin, ld.latePct, ld.late6Pct, t("fig.home"), t, lang, WIDE_FIG),
    ),
  );
}

function unitCard(u, late, span, t, lang) {
  const kind = u.category === "longDistance" ? t("res.kind.0") : t("res.kind.1");
  const kindLine = u.rank.minutes != null && u.category === "longDistance" ? t("unit.rankLine", { kind, n: u.rank.minutes }) : kind;
  const regional = u.category === "regional";
  return sheet(
    W,
    H,
    [34, 60, 26],
    span,
    t,
    d(
      { flexGrow: 1, alignItems: "center" },
      d(
        { flexDirection: "column", width: 480 },
        d({ fontSize: 22, fontWeight: 600, color: C.ink2, marginBottom: 10 }, kindLine),
        trainName(u.name, 480, 150),
        d(
          { flexWrap: "wrap", alignItems: "center", fontSize: 28, fontWeight: 500, lineHeight: 1.25, marginTop: 18, color: C.ink2 },
          d({ marginRight: 10 }, clip(cardName(u.origin), 28)),
          d({ marginRight: 10, alignItems: "center" }, arrow(26, C.ink2, regional)),
          d({}, clip(cardName(u.dest), 28)),
        ),
        d({ fontSize: 22, color: C.muted, marginTop: 16 }, t("home.networkBasis", { trips: fmtInt(u.measured, lang), span }).replace(/,.*$/, "")),
      ),
      vrule(),
      figure(u.minutes.avg, late, u.late6Pct, t("fig.unit"), t, lang, WIDE_FIG),
    ),
  );
}

/** Portrait card for a train or a regional line: the same skeleton as a route card (name, answer, then what is behind it). */
function unitPortrait(u, late, span, t, lang) {
  const kind = u.category === "longDistance" ? t("res.kind.0") : t("res.kind.1");
  const kindLine = u.rank.minutes != null && u.category === "longDistance" ? t("unit.rankLine", { kind, n: u.rank.minutes }) : kind;
  const regional = u.category === "regional";
  const min = t("unit.min");
  const stops = u.stops ?? [];
  const chart = stops.length >= 3 ? curveChart(stops.map((x) => [cardName(x.name), x.avgDelay]), 952, 180, { color: delayColor, ymax: (top) => Math.max(20, Math.ceil((top * 1.15) / 10) * 10) }) : null;
  const pts = chart ? stops : [];
  const bottom = chart
    ? [
        d({ justifyContent: "space-between", fontSize: 24, fontWeight: 600, color: C.ink2, marginBottom: 8 }, d({}, t("unit.stops.cap", { extra: "" }).replace(/\.$/, "")), d({}, t("route.card.scale", { pct: `${chart.ymax} ${min}` }))),
        chart.svg,
        d({ justifyContent: "space-between", fontSize: 26, fontWeight: 600, marginTop: 6 }, d({}, clip(cardName(pts[0].name), 26)), d({}, clip(cardName(pts[pts.length - 1].name), 26))),
      ]
    : d(
        { flexDirection: "column", borderTop: `3px solid ${C.ink}` },
        factRow(`${fmt1(u.minutes.avg, lang)} ${min}`, t("unit.avgTile"), 34),
        factRow(fmtShare1(u.fullCancelPct, lang), t("unit.cancTile"), 34),
        u.worstRun ? factRow(`${fmtInt(u.worstRun.delayMin, lang)} ${min}`, t("unit.worst"), 34) : null,
      );
  return sheet(
    1080,
    1350,
    [56, 64, 44],
    span,
    t,
    d({ fontSize: 28, fontWeight: 600, color: C.ink2, marginTop: 34 }, kindLine),
    d({ marginTop: 6 }, trainName(u.name, 952, 190)),
    d(
      { flexWrap: "wrap", alignItems: "center", fontSize: 38, fontWeight: 500, lineHeight: 1.2, marginTop: 14, color: C.ink2 },
      d({ marginRight: 12 }, clip(cardName(u.origin), 30)),
      d({ marginRight: 12, alignItems: "center" }, arrow(34, C.ink2, regional)),
      d({}, clip(cardName(u.dest), 30)),
    ),
    d({ fontSize: 26, color: C.muted, marginTop: 14 }, t("home.networkBasis", { trips: fmtInt(u.measured, lang), span }).replace(/,.*$/, "")),
    d({ marginTop: 30 }, figure(u.minutes.avg, late, u.late6Pct, t("fig.unit"), t, lang, { ...TALL_FIG, big: 290, sentence: 40, barsTop: 30 })),
    d({ flexDirection: "column", flexGrow: 1, justifyContent: "flex-end", marginBottom: 18 }, bottom),
  );
}

function recapFacts(stats, t, lang) {
  return { span: spanLabel(stats.window.firstMonth, stats.window.lastMonth, lang), ld: stats.recap.longDistance, reg: stats.recap.regional };
}

function factRow(value, label, size) {
  return d(
    { alignItems: "baseline", justifyContent: "space-between", padding: `${Math.round(size * 0.32)}px 0`, borderBottom: `2px solid ${C.rule}`, fontSize: size },
    d({ color: C.ink2, maxWidth: "70%" }, label),
    d({ fontFamily: COND, fontWeight: 800, fontSize: Math.round(size * 1.6) }, value),
  );
}

function recapWide(f, t, lang) {
  return sheet(
    W,
    H,
    [34, 60, 26],
    f.span,
    t,
    d(
      { flexGrow: 1, alignItems: "center" },
      d(
        { flexDirection: "column", width: 480 },
        d({ fontFamily: COND, fontWeight: 800, fontSize: 70, lineHeight: 0.98 }, t("recap.title")),
        d({ flexDirection: "column", marginTop: 22 }, [
          factRow(`${fmt1(f.ld.avgDelayMin, lang)} ${t("unit.min")}`, t("recap.fact.avg"), 22),
          factRow(fmtShare1(f.ld.late60Pct, lang), t("recap.fact.late60"), 22),
          factRow(fmtShare1(f.ld.cancelledPct, lang), t("recap.fact.canc"), 22),
        ]),
      ),
      vrule(),
      figure(f.ld.avgDelayMin, f.ld.latePct, f.ld.late6Pct, t("fig.home"), t, lang, WIDE_FIG),
    ),
  );
}

function recapTall(f, t, lang) {
  return sheet(
    1080,
    1920,
    [60, 64, 54],
    f.span,
    t,
    d({ fontFamily: COND, fontWeight: 800, fontSize: 124, lineHeight: 0.96, marginTop: 56 }, t("recap.title")),
    d({ fontSize: 32, color: C.ink2, marginTop: 20 }, t("home.networkBasis", { trips: fmtInt(f.ld.measured, lang), span: f.span })),
    d({ marginTop: 80 }, figure(f.ld.avgDelayMin, f.ld.latePct, f.ld.late6Pct, t("fig.home"), t, lang, { ...TALL_FIG, big: 420, sentence: 48 })),
    d(
      { flexDirection: "column", marginTop: 90 },
      factRow(`${fmt1(f.ld.avgDelayMin, lang)} ${t("unit.min")}`, t("recap.fact.avg"), 36),
      factRow(fmtShare1(f.ld.late60Pct, lang), t("recap.fact.late60"), 36),
      factRow(fmtShare1(f.ld.cancelledPct, lang), t("recap.fact.canc"), 36),
    ),
    d(
      { fontSize: 32, lineHeight: 1.3, color: C.ink2, marginTop: 40, marginBottom: 20 },
      t("recap.regional", { avg: fmt1(f.reg.avgDelayMin, lang), late: fmtShare1(f.reg.latePct, lang), canc: fmtShare1(f.reg.cancelledPct, lang) }),
    ),
  );
}

// ---------------------------------------------------------------- route cards

/** Late share stop by stop: one ink line, a dot per stop coloured by its share. Returns the svg and its scale. */
function curveChart(points, w, hh, o = {}) {
  const vals = points.map((p) => p[1]);
  const top = Math.max(...vals);
  const color = o.color ?? lateColor;
  const ymax = o.ymax ? o.ymax(top) : Math.min(100, Math.max(40, Math.ceil((top * 1.18) / 10) * 10));
  const padX = 20;
  const padY = 20;
  const x = (i) => padX + (i * (w - 2 * padX)) / (points.length - 1);
  const y = (v) => hh - padY - (v / ymax) * (hh - 2 * padY);
  const grid = [0, 0.5, 1].map((f) => h("path", { d: `M${padX} ${y(ymax * f)}H${w - padX}`, stroke: C.rule, strokeWidth: 2, strokeDasharray: f === 0 ? undefined : "6 8" }));
  const line = h("path", { d: points.map((p, i) => `${i === 0 ? "M" : "L"}${x(i)} ${y(p[1])}`).join(" "), stroke: C.ink, strokeWidth: 5, fill: "none", strokeLinejoin: "round" });
  const dots = points.map((p, i) => h("circle", { cx: x(i), cy: y(p[1]), r: i === points.length - 1 ? 12 : 8, fill: color(p[1]), stroke: C.paper, strokeWidth: 3 }));
  return { ymax, svg: h("svg", { width: w, height: hh, viewBox: `0 0 ${w} ${hh}` }, grid, line, dots) };
}

function pickRow(label, pick, color, lang) {
  const [type, num, pct] = pick;
  return d(
    { alignItems: "center", justifyContent: "space-between", padding: "10px 0", borderBottom: `2px solid ${C.rule}` },
    d({ flexDirection: "column" }, d({ fontSize: 24, fontWeight: 600, color: C.ink2 }, label), d({ fontFamily: COND, fontWeight: 800, fontSize: 52, lineHeight: 1.05 }, `${type} ${num}`)),
    d({ fontFamily: COND, fontWeight: 800, fontSize: 72, color }, fmtShare1(pct, lang)),
  );
}

function routePortrait(r, t, lang, span) {
  const chart = r.curve ? curveChart(r.curve.points, 952, 180) : null;
  const pts = r.curve ? r.curve.points : [];
  const picks =
    !chart && r.bestTrain && r.worstTrain
      ? d(
          { flexDirection: "column", borderTop: `3px solid ${C.ink}` },
          d({ fontSize: 26, fontWeight: 600, color: C.ink2, margin: "14px 0 4px" }, t("route.picks.title")),
          pickRow(t("route.picks.best"), r.bestTrain, lateColor(r.bestTrain[2]), lang),
          pickRow(t("route.picks.worst"), r.worstTrain, lateColor(r.worstTrain[2]), lang),
        )
      : null;
  return sheet(
    1080,
    1350,
    [56, 64, 44],
    span,
    t,
    d({ marginTop: 34 }, routeNames(r, nameSize(r, 950, 140))),
    d({ fontSize: 28, color: C.ink2, marginTop: 16 }, t("route.card.facts", { trains: fmtInt(r.trains, lang), trips: fmtInt(r.trips, lang) })),
    d({ marginTop: 34 }, figure(r.avg, r.late, r.late6, t("fig.route", { to: cardName(r.to) }), t, lang, { ...TALL_FIG, big: 290, sentence: 40, barsTop: 32 })),
    d(
      { flexDirection: "column", flexGrow: 1, justifyContent: "flex-end", marginBottom: 18 },
      chart
        ? [
            d({ justifyContent: "space-between", fontSize: 24, fontWeight: 600, color: C.ink2, marginBottom: 8 }, d({}, t("route.card.curve", { train: r.curve.train })), d({}, t("route.card.scale", { pct: `${chart.ymax}%` }))),
            chart.svg,
            d({ justifyContent: "space-between", fontSize: 26, fontWeight: 600, marginTop: 6 }, d({}, clip(pts[0][0], 26)), d({}, clip(pts[pts.length - 1][0], 26))),
          ]
        : picks,
    ),
  );
}

function routeWide(r, t, lang, span) {
  return sheet(
    W,
    H,
    [34, 60, 26],
    span,
    t,
    d(
      { flexGrow: 1, alignItems: "center" },
      d(
        { flexDirection: "column", width: 480 },
        routeNames(r, nameSize(r, 480, 88)),
        d({ fontSize: 24, color: C.ink2, marginTop: 22 }, t("route.card.facts", { trains: fmtInt(r.trains, lang), trips: fmtInt(r.trips, lang) })),
      ),
      vrule(),
      figure(r.avg, r.late, r.late6, t("fig.route", { to: cardName(r.to) }), t, lang, WIDE_FIG),
    ),
  );
}

function leagueRow(r, i, top, o) {
  const color = delayColor(r.avg);
  const barW = Math.max(3, Math.round((r.avg / top) * 100));
  return d(
    { alignItems: "center", height: o.rowH, borderBottom: `2px solid ${C.rule}` },
    d({ width: o.rankW, fontFamily: COND, fontWeight: 800, fontSize: o.fs + 6, color: C.ink2 }, String(i)),
    d(
      { flexDirection: "column", flexGrow: 1 },
      d({ alignItems: "center", fontFamily: COND, fontWeight: 800, fontSize: o.fs, lineHeight: 1.05, whiteSpace: "nowrap" }, clip(cardName(r.from), 19), d({ margin: "0 8px" }, arrow(Math.round(o.fs * 0.74))), clip(cardName(r.to), 19)),
      d({ width: o.barW, height: o.barH, background: C.track, marginTop: 6, position: "relative" }, d({ position: "absolute", left: 0, top: 0, bottom: 0, width: `${barW}%`, background: color })),
    ),
    d({ flexDirection: "column", alignItems: "flex-end", width: o.valW }, d({ fontFamily: COND, fontWeight: 800, fontSize: o.fs + 12, lineHeight: 1 }, `${fmt1(r.avg, o.lang)} ${o.min}`), o.db ? d({ fontSize: o.fs * 0.55, color: C.muted, marginTop: 2 }, `${fmtShare(r.late, o.lang)} 15+`) : null),
  );
}

function leaguePortrait(worst, best, t, lang, span, n) {
  const top = Math.max(...worst.map((r) => r.avg));
  const o = { rowH: 104, rankW: 64, fs: 40, barW: 560, barH: 14, valW: 210, lang, db: true, min: t("unit.min") };
  const o2 = { ...o, rowH: 84, fs: 34, barW: 560, db: true };
  return sheet(
    1080,
    1350,
    [56, 64, 44],
    span,
    t,
    d({ fontFamily: COND, fontWeight: 800, fontSize: lang === "de" ? 100 : 116, lineHeight: 0.96, marginTop: 34 }, t("routes.card.title")),
    d({ fontSize: 28, color: C.ink2, marginTop: 14, marginBottom: 22 }, t("routes.card.sub", { n })),
    d({ flexDirection: "column", borderTop: `3px solid ${C.ink}` }, worst.map((r, i) => leagueRow(r, i + 1, top, o))),
    d({ fontFamily: COND, fontWeight: 800, fontSize: 36, marginTop: 24, marginBottom: 4, color: C.safe }, t("routes.card.best")),
    d({ flexDirection: "column", flexGrow: 1 }, best.map((r, i) => leagueRow(r, n - best.length + i + 1, top, o2))),
  );
}

function leagueWide(worst, t, lang, span, n) {
  const top = Math.max(...worst.map((r) => r.avg));
  const o = { rowH: 78, rankW: 48, fs: 31, barW: 380, barH: 12, valW: 160, lang, db: true, min: t("unit.min") };
  return sheet(
    W,
    H,
    [34, 60, 26],
    span,
    t,
    d(
      { flexGrow: 1, alignItems: "center" },
      d(
        { flexDirection: "column", width: 400 },
        d({ fontFamily: COND, fontWeight: 800, fontSize: 80, lineHeight: 0.98 }, t("routes.card.title")),
        d({ fontSize: 22, color: C.ink2, marginTop: 18, lineHeight: 1.3 }, t("routes.card.sub", { n })),
      ),
      vrule(),
      d({ flexDirection: "column", width: 600, borderTop: `3px solid ${C.ink}` }, worst.slice(0, 5).map((r, i) => leagueRow(r, i + 1, top, o))),
    ),
  );
}

// ---------------------------------------------------------------- io

async function readUnits(folder) {
  const dir = path.join(DATA_DIR, folder);
  const files = (await fs.readdir(dir)).filter((f) => f.endsWith(".json")).sort();
  if (files.length === 0) throw new Error(`data/${folder}/ has no files`);
  const units = await Promise.all(files.map((f) => readJson(path.join(dir, f))));
  units.forEach((u, i) => {
    if (`${u.slug}.json` !== files[i]) throw new Error(`${folder}/${files[i]} has slug "${u.slug}"`);
  });
  return units;
}

async function readJson(file) {
  try {
    return JSON.parse(await fs.readFile(file, "utf8"));
  } catch (e) {
    throw new Error(`cannot read ${path.relative(ROOT, file)}: ${e.message}`);
  }
}

/** slug -> share of measured trips 15+ min late, from the search shards (the same number the site shows). */
async function lateBySlug() {
  const dir = path.join(DATA_DIR, "search");
  const map = new Map();
  for (const name of await fs.readdir(dir)) {
    if (!/^s-.+\.json$/.test(name)) continue;
    for (const r of await readJson(path.join(dir, name))) if (typeof r[12] === "string") map.set(r[12], r[6]);
  }
  return map;
}

async function loadFonts() {
  return Promise.all(
    FONTS.map(async ({ file, name, weight }) => {
      const p = path.join(FONT_DIR, file);
      try {
        return { name, weight, style: "normal", data: await fs.readFile(p) };
      } catch {
        throw new Error(`missing font ${path.relative(ROOT, p)} (static TTFs must be committed in scripts/fonts/)`);
      }
    }),
  );
}

/**
 * A card whose content runs past the bottom edge still renders: satori just lays the overflow outside the canvas, so
 * a footer can vanish and the file looks fine in a thumbnail. Every card has an empty strip at the bottom; fail the
 * build when anything is drawn in it.
 */
function assertBottomMargin(rendered, file) {
  const { width, height, pixels } = rendered;
  const strip = 10;
  const bg = [0xfa, 0xfa, 0xf8];
  for (let y = height - strip; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      if (Math.abs(pixels[i] - bg[0]) + Math.abs(pixels[i + 1] - bg[1]) + Math.abs(pixels[i + 2] - bg[2]) > 24) {
        throw new Error(`content touches the bottom edge of ${path.basename(file)} at y=${y}`);
      }
    }
  }
}

// Drawing a card takes ~0.17 s and there are ~2,900 of them: a deploy that changed only code should not redraw them.
// A card is cached under a hash of everything that decides its pixels (the element tree, size, fonts, options), in
// .next/cache, which Vercel keeps between builds. Cards not used by this run are deleted at the end, so it cannot grow.
const CACHE_DIR = path.join(ROOT, ".next", "cache", "og-cards");
const RENDER_VERSION = "3";
const cacheUsed = new Set();
const cacheStats = { hit: 0, drawn: 0 };
let fontKey = "";

async function render(node, fonts, file, w = W, hh = H, compress = false) {
  const packed = compress && sharp ? 1 : 0;
  const key = createHash("sha1").update(RENDER_VERSION).update(fontKey).update(`${w}x${hh}:${packed}:`).update(JSON.stringify(node)).digest("hex").slice(0, 28);
  const cached = path.join(CACHE_DIR, `${key}.png`);
  if (!SAMPLE) cacheUsed.add(cached);
  try {
    await fs.copyFile(cached, file);
    cacheStats.hit += 1;
    return;
  } catch {
    // not cached yet
  }
  const svg = await satori(node, { width: w, height: hh, fonts });
  const rendered = new Resvg(svg, { fitTo: { mode: "width", value: w }, font: { loadSystemFonts: false } }).render();
  assertBottomMargin(rendered, file);
  const png = rendered.asPng();
  const out = packed ? await sharp(png).png({ palette: true, quality: 92, effort: 5, compressionLevel: 9, colours: 160, dither: 0.5 }).toBuffer() : png;
  await fs.writeFile(file, out);
  if (!SAMPLE) await fs.writeFile(cached, out);
  cacheStats.drawn += 1;
}

async function pruneCache() {
  let removed = 0;
  for (const name of await fs.readdir(CACHE_DIR).catch(() => [])) {
    const f = path.join(CACHE_DIR, name);
    if (!cacheUsed.has(f)) {
      await fs.rm(f, { force: true });
      removed += 1;
    }
  }
  return removed;
}

// Hard cases for a quick look: the longest names, a short one, a route with and without stops in between, German.
const SAMPLE_UNITS = new Set(["ice-1541", "rb-28-bad-koetzting-cham-oberpf", "re-49-friedrichsfeld-niederrhein-wuppertal-hbf", "re-25-muenchen-hbf-furth-im-wald", "ic-306"]);
const SAMPLE_ROUTES = new Set(["koeln-hbf-berlin-hbf", "berlin-suedkreuz-lutherstadt-wittenberg-hbf", "muenchen-hbf-nuernberg-hbf", "aschaffenburg-hbf-frankfurt-flughafen"]);

async function main() {
  const started = performance.now();
  const stats = await readJson(path.join(DATA_DIR, "stats.json"));
  const { firstMonth, lastMonth } = stats.window ?? {};
  if (!/^\d{4}-\d{2}$/.test(lastMonth ?? "") || !/^\d{4}-\d{2}$/.test(firstMonth ?? "")) {
    throw new Error("stats.json window.firstMonth/lastMonth missing or malformed");
  }
  if (!stats.recap?.longDistance) throw new Error("stats.json recap is missing");

  const units = [...(await readUnits("trains")), ...(await readUnits("lines"))];
  const late = await lateBySlug();
  const fonts = await loadFonts();
  fontKey = createHash("sha1").update(Buffer.concat(fonts.map((f) => Buffer.from(f.data)))).digest("hex");

  const dir = SAMPLE || path.join(OUT_DIR, lastMonth);
  if (SAMPLE) {
    await fs.mkdir(SAMPLE, { recursive: true });
  } else {
    await fs.mkdir(CACHE_DIR, { recursive: true });
    await fs.rm(dir, { recursive: true, force: true });
    await fs.mkdir(path.join(dir, "de"), { recursive: true });
  }
  const where = (base, lang, name) => (SAMPLE ? path.join(SAMPLE, `${lang}-${name}.png`) : path.join(lang === "de" ? path.join(base, "de") : base, `${name}.png`));

  let count = 0;
  for (const lang of ["en", "de"]) {
    const t = makeT(lang);
    const span = spanLabel(firstMonth, lastMonth, lang);
    const facts = recapFacts(stats, t, lang);
    const jobs = [
      ["home", homeCard(stats, t, lang), W, H],
      ["recap", recapWide(facts, t, lang), W, H],
      ["recap-tall", recapTall(facts, t, lang), 1080, 1920],
      ...units
        .filter((u) => !SAMPLE || SAMPLE_UNITS.has(u.slug))
        .map((u) => {
          const share = late.get(u.slug);
          if (share === undefined) throw new Error(`no search record for ${u.slug}, cannot read its late share`);
          return [[u.slug, unitCard(u, share, span, t, lang), W, H], [`${u.slug}-portrait`, unitPortrait(u, share, span, t, lang), 1080, 1350, true]];
        })
        .flat(),
    ];
    for (const [name, node, w, hh, packed] of jobs) {
      try {
        await render(node, fonts, where(dir, lang, name), w, hh, Boolean(packed));
        count += 1;
      } catch (e) {
        throw new Error(`render ${lang}/${name}.png failed: ${e.message}`);
      }
    }
  }

  // Route cards: one wide (link previews) and one portrait (to share) per route and language, plus the ranking.
  let routeCount = 0;
  const routesFile = path.join(DATA_DIR, "routes.json");
  const hasRoutes = await fs.stat(routesFile).then(() => true, () => false);
  if (hasRoutes) {
    const rd = await readJson(routesFile);
    const rdir = path.join(OUT_DIR, "routes", lastMonth);
    if (!SAMPLE) {
      await fs.rm(path.join(OUT_DIR, "routes"), { recursive: true, force: true });
      await fs.mkdir(path.join(rdir, "de"), { recursive: true });
    }
    const league = rd.routes.filter((r) => r.rank !== null).sort((a, b) => b.avg - a.avg);
    for (const lang of ["en", "de"]) {
      const t = makeT(lang);
      const span = spanLabel(rd.window.firstMonth, rd.window.lastMonth, lang);
      const jobs = [
        ["ranking", leagueWide(league.slice(0, 5), t, lang, span, league.length), W, H],
        ["ranking-portrait", leaguePortrait(league.slice(0, 5), league.slice(-3), t, lang, span, league.length), 1080, 1350],
        ...rd.routes
          .filter((r) => !SAMPLE || SAMPLE_ROUTES.has(r.slug))
          .flatMap((r) => [
            [r.slug, routeWide(r, t, lang, span), W, H],
            [`${r.slug}-portrait`, routePortrait(r, t, lang, span), 1080, 1350],
          ]),
      ];
      for (const [name, node, w, hh] of jobs) {
        try {
          await render(node, fonts, where(rdir, lang, name), w, hh, true);
          routeCount += 1;
        } catch (e) {
          throw new Error(`render routes/${lang}/${name}.png failed: ${e.message}`);
        }
      }
    }
  }

  if (!SAMPLE) {
    for (const entry of await fs.readdir(OUT_DIR, { withFileTypes: true })) {
      if (entry.isDirectory() && /^\d{4}-\d{2}$/.test(entry.name) && entry.name !== lastMonth) {
        await fs.rm(path.join(OUT_DIR, entry.name), { recursive: true, force: true });
      }
    }
  }

  const pruned = SAMPLE ? 0 : await pruneCache();
  const ms = Math.round(performance.now() - started);
  console.log(`og: ${count} images -> ${SAMPLE ? SAMPLE : `public/og/${lastMonth}/`}, ${routeCount} route images in ${ms} ms (${cacheStats.hit} from cache, ${cacheStats.drawn} drawn, ${pruned} stale cache files removed)`);
}

main().catch((e) => {
  console.error(`og: FAILED: ${e.message}`);
  process.exit(1);
});
