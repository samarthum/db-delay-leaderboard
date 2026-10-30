// Share images, built at deploy time with satori + resvg, English and German:
//   public/og/<lastMonth>/<name>.png        English (home, recap, recap-tall, one per train and line)
//   public/og/<lastMonth>/de/<name>.png     German
// Every number comes from data/; every sentence from lib/dict/{en,de}, so the cards say what the site says.
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import satori from "satori";
import { Resvg } from "@resvg/resvg-js";

// Route cards are flat dark colours with a few accents: a 128-colour palette PNG is a third of the size and looks the same.
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
const W = 1200;
const H = 630;

const FONTS = [
  { file: "BarlowCondensed-ExtraBold.ttf", name: "Barlow Condensed", weight: 800 },
  { file: "Barlow-Medium.ttf", name: "Barlow", weight: 500 },
  { file: "Barlow-SemiBold.ttf", name: "Barlow", weight: 600 },
];

const C = {
  paper: "#0a0c0f",
  card: "#13171d",
  board: "#13171d",
  boardLine: "#2b323c",
  tile: "#232a34",
  tileEdge: "#323a46",
  ink: "#f4f1e8",
  ink2: "#cfccc2",
  muted: "#a1a7b2",
  line: "#262c35",
  amber: "#ffc72c",
};
const SANS = "Barlow";
const COND = "Barlow Condensed";

const MONTHS = {
  en: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
  de: ["Jan.", "Feb.", "März", "Apr.", "Mai", "Juni", "Juli", "Aug.", "Sept.", "Okt.", "Nov.", "Dez."],
};
const NBSP = "\u00a0";
const monthLabel = (m, lang) => `${MONTHS[lang][Number(m.slice(5, 7)) - 1]} ${m.slice(0, 4)}`;
const spanLabel = (a, b, lang) => `${monthLabel(a, lang)} ${lang === "de" ? "bis" : "to"} ${monthLabel(b, lang)}`;
const dec = (lang) => (lang === "de" ? "," : ".");
const fmt1 = (n, lang) => n.toFixed(1).replace(".", dec(lang));
const fmtShare1 = (n, lang) => (lang === "de" ? `${fmt1(n, lang)}${NBSP}%` : `${fmt1(n, lang)}%`);
const fmtInt = (n, lang) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, lang === "de" ? "." : ",");
const clip = (s, max) => (s.length > max ? `${s.slice(0, max - 1).trimEnd()}…` : s);

function lateColor(pct) {
  if (pct < 10) return "#34c36b";
  if (pct < 20) return "#a6d43a";
  if (pct < 35) return C.amber;
  if (pct < 55) return "#ff8a2b";
  return "#ff4b3e";
}

function h(type, props, ...children) {
  const kids = children.flat(Infinity).filter((c) => c !== null && c !== undefined && c !== false);
  return {
    type,
    props: { ...props, children: kids.length === 0 ? undefined : kids.length === 1 ? kids[0] : kids },
  };
}

const SITE_HOST = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://german-punctuality.vercel.app")
  .replace(/^https?:\/\//, "")
  .replace(/\/+$/, "");

// ---------------------------------------------------------------- building blocks

function frame(eyebrowText, main, w = W, hh = H) {
  return h(
    "div",
    {
      style: {
        display: "flex",
        flexDirection: "column",
        width: w,
        height: hh,
        background: C.paper,
        fontFamily: SANS,
        fontWeight: 500,
        color: C.ink,
      },
    },
    h(
      "div",
      { style: { display: "flex", flexDirection: "column", flexGrow: 1, padding: "40px 60px 28px" } },
      eyebrow(eyebrowText),
      h("div", { style: { display: "flex", flexGrow: 1, alignItems: "center", justifyContent: "space-between" } }, main),
      footer(),
    ),
  );
}

function eyebrow(text) {
  return h(
    "div",
    {
      style: {
        display: "flex",
        alignItems: "center",
        fontSize: 22,
        fontWeight: 600,
        letterSpacing: 3,
        color: C.muted,
        textTransform: "uppercase",
      },
    },
    h("div", { style: { display: "flex", width: 14, height: 14, borderRadius: 7, background: C.amber, marginRight: 14 } }),
    text,
  );
}

function footer() {
  return h(
    "div",
    {
      style: {
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        borderTop: `2px solid ${C.line}`,
        paddingTop: 16,
      },
    },
    h(
      "div",
      {
        style: {
          display: "flex",
          alignItems: "center",
          fontFamily: COND,
          fontWeight: 800,
          fontSize: 30,
          letterSpacing: 2,
          textTransform: "uppercase",
        },
      },
      h("div", { style: { display: "flex", width: 16, height: 16, borderRadius: 8, background: C.amber, marginRight: 12 } }),
      "German Punctuality",
    ),
    h("div", { style: { display: "flex", fontSize: 24, fontWeight: 600, color: C.muted } }, SITE_HOST),
  );
}

/** One-way arrow for a train, two-way for a line. */
function arrow(size, bothWays) {
  return h(
    "svg",
    { width: size, height: Math.round(size * 0.6), viewBox: "0 0 40 24", style: { margin: "0 12px" } },
    h("path", {
      d: bothWays ? "M5 12h30M14 3l-9 9 9 9M26 3l9 9-9 9" : "M2 12h33M25 3l10 9-10 9",
      stroke: C.amber,
      strokeWidth: 4,
      fill: "none",
      strokeLinecap: "round",
      strokeLinejoin: "round",
    }),
  );
}

function route(t) {
  const len = t.origin.length + t.dest.length;
  const size = len <= 30 ? 34 : len <= 40 ? 30 : 26;
  return h(
    "div",
    { style: { display: "flex", flexWrap: "wrap", alignItems: "center", fontSize: size, fontWeight: 600, lineHeight: 1.2, marginTop: 14 } },
    h("div", {}, clip(t.origin, 30)),
    arrow(size, t.category === "regional"),
    h("div", {}, clip(t.dest, 30)),
  );
}

function trainName(name) {
  return h(
    "div",
    {
      style: {
        fontFamily: COND,
        fontWeight: 800,
        fontSize: name.length <= 8 ? 140 : 116,
        lineHeight: 0.95,
        color: C.amber,
        marginTop: 6,
      },
    },
    name,
  );
}

function tile(ch, w, color) {
  const tileH = Math.round(w * 1.4);
  return h(
    "div",
    {
      style: {
        display: "flex",
        position: "relative",
        width: ch === "%" ? Math.round(w * 1.15) : w,
        height: tileH,
        alignItems: "center",
        justifyContent: "center",
        background: C.tile,
        border: `2px solid ${C.tileEdge}`,
        borderRadius: 12,
        margin: "0 5px",
      },
    },
    h("div", { style: { fontFamily: COND, fontWeight: 800, fontSize: Math.round(w * 1.4), lineHeight: 1, color } }, ch),
    h("div", {
      style: { display: "flex", position: "absolute", left: 0, top: Math.round(tileH / 2) - 2, width: "100%", height: 4, background: "#000000" },
    }),
  );
}

/** The one number every card leads with: the share of trips that arrive 15+ min late, on split-flap tiles. */
function lateBoard(pct, t, sub) {
  const text = `${pct > 0 && pct < 1 ? pct.toFixed(1) : Math.round(pct)}%`;
  const chars = Array.from(text);
  const w = chars.length > 3 ? 84 : chars.length > 2 ? 110 : 134;
  const color = lateColor(pct);
  return h(
    "div",
    {
      style: {
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        width: 470,
        background: C.board,
        border: `2px solid ${C.boardLine}`,
        borderRadius: 24,
        padding: "34px 28px 28px",
      },
    },
    h("div", { style: { display: "flex" } }, chars.map((c) => tile(c, w, color))),
    h(
      "div",
      {
        style: {
          display: "flex",
          justifyContent: "center",
          textAlign: "center",
          fontFamily: COND,
          fontWeight: 800,
          fontSize: 38,
          lineHeight: 1.05,
          letterSpacing: 1,
          color: C.ink,
          textTransform: "uppercase",
          marginTop: 22,
        },
      },
      t("res.leadRest").toUpperCase(),
    ),
    sub
      ? [
          h("div", { style: { display: "flex", width: "100%", height: 2, background: C.boardLine, margin: "18px 0 14px" } }),
          h("div", { style: { display: "flex", textAlign: "center", fontSize: 22, fontWeight: 600, color: C.muted } }, sub),
        ]
      : null,
  );
}

function pill(text, filled) {
  return h(
    "div",
    {
      style: {
        display: "flex",
        fontFamily: COND,
        fontWeight: 800,
        fontSize: 28,
        letterSpacing: 1.5,
        textTransform: "uppercase",
        padding: "4px 16px",
        borderRadius: 999,
        marginRight: 12,
        color: filled ? "#14110a" : C.ink2,
        background: filled ? C.amber : C.card,
        border: `2px solid ${filled ? C.amber : C.boardLine}`,
      },
    },
    text,
  );
}

// ---------------------------------------------------------------- cards

function homeCard(stats, t, lang) {
  const w = stats.window;
  const ld = stats.recap.longDistance;
  const span = spanLabel(w.firstMonth, w.lastMonth, lang);
  return frame(
    `Deutsche Bahn · ${span}`,
    [
      h(
        "div",
        { style: { display: "flex", flexDirection: "column", width: 600 } },
        h(
          "div",
          { style: { display: "flex", fontFamily: COND, fontWeight: 800, fontSize: 84, lineHeight: 0.98, letterSpacing: 1, textTransform: "uppercase" } },
          t("home.title"),
        ),
        h(
          "div",
          { style: { display: "flex", fontSize: 30, fontWeight: 600, lineHeight: 1.25, marginTop: 24, color: C.muted } },
          t("home.networkBasis", { trips: fmtInt(ld.measured, lang), span }),
        ),
      ),
      lateBoard(ld.latePct, t, null),
    ],
  );
}

function unitCard(u, late, span, t, lang) {
  const badges = [
    u.rank.minutes != null && pill(t("unit.rankMinutes", { n: u.rank.minutes }), true),
    u.rank.percent != null && pill(t("unit.rankPercent", { n: u.rank.percent }), u.rank.minutes == null),
  ].filter(Boolean);
  const kind = u.category === "longDistance" ? t("res.kind.0") : t("res.kind.1");
  return frame(
    `${kind} · ${span}`,
    [
      h(
        "div",
        { style: { display: "flex", flexDirection: "column", width: 600 } },
        badges.length > 0 && h("div", { style: { display: "flex", marginBottom: 10 } }, badges),
        trainName(u.name),
        route(u),
      ),
      lateBoard(late, t, t("res.exact", { pct: fmtShare1(late, lang), n: fmtInt(u.measured, lang) })),
    ],
  );
}

function recapFacts(stats, t, lang) {
  const ld = stats.recap.longDistance;
  const reg = stats.recap.regional;
  return {
    span: spanLabel(stats.window.firstMonth, stats.window.lastMonth, lang),
    ld,
    reg,
    stats: [
      { value: fmtShare1(ld.latePct, lang), unit: "", label: t("recap.fact.late"), color: lateColor(ld.latePct) },
      { value: fmt1(ld.avgDelayMin, lang), unit: t("unit.min"), label: t("recap.fact.avg"), color: C.amber },
      { value: fmtShare1(ld.late60Pct, lang), unit: "", label: t("recap.fact.late60"), color: "#ff4b3e" },
      { value: fmtShare1(ld.cancelledPct, lang), unit: "", label: t("recap.fact.canc"), color: C.amber },
    ],
  };
}

function recapStat(s, big, gap) {
  return h(
    "div",
    { style: { display: "flex", flexDirection: "column", marginBottom: gap } },
    h(
      "div",
      { style: { display: "flex", alignItems: "baseline", fontFamily: COND, fontWeight: 800, lineHeight: 1, color: s.color, fontSize: big } },
      s.value,
      s.unit && h("div", { style: { display: "flex", fontSize: Math.round(big * 0.45), marginLeft: 10, color: C.ink } }, s.unit),
    ),
    h("div", { style: { display: "flex", fontSize: Math.round(big * 0.3), fontWeight: 600, color: C.muted, marginTop: 4 } }, s.label),
  );
}

function recapWide(f, t, lang) {
  const box = (s, i) =>
    h(
      "div",
      {
        style: {
          display: "flex",
          flexDirection: "column",
          width: 270,
          height: 168,
          padding: "20px 22px",
          marginLeft: i % 2 === 0 ? 0 : 16,
          background: C.card,
          border: `2px solid ${C.boardLine}`,
          borderRadius: 18,
        },
      },
      h(
        "div",
        { style: { display: "flex", alignItems: "baseline", fontFamily: COND, fontWeight: 800, fontSize: 68, lineHeight: 1, color: s.color } },
        s.value,
        s.unit && h("div", { style: { display: "flex", fontSize: 28, marginLeft: 8, color: C.ink } }, s.unit),
      ),
      h("div", { style: { display: "flex", fontSize: 21, fontWeight: 600, lineHeight: 1.2, marginTop: 8, color: C.muted } }, s.label),
    );
  const row = (items, first) => h("div", { style: { display: "flex", marginTop: first ? 0 : 16 } }, items.map((s, i) => box(s, i)));
  return frame(
    `Deutsche Bahn · ${f.span}`,
    [
      h(
        "div",
        { style: { display: "flex", flexDirection: "column", width: 440 } },
        h(
          "div",
          { style: { display: "flex", fontFamily: COND, fontWeight: 800, fontSize: 64, lineHeight: 0.98, textTransform: "uppercase" } },
          t("recap.title"),
        ),
        h(
          "div",
          { style: { display: "flex", fontSize: 26, fontWeight: 600, lineHeight: 1.25, marginTop: 18, color: C.muted } },
          t("home.networkBasis", { trips: fmtInt(f.ld.measured, lang), span: f.span }),
        ),
      ),
      h("div", { style: { display: "flex", flexDirection: "column" } }, row(f.stats.slice(0, 2), true), row(f.stats.slice(2, 4), false)),
    ],
  );
}

function recapTall(f, t, lang) {
  return frame(
    `Deutsche Bahn · ${f.span}`,
    h(
      "div",
      { style: { display: "flex", flexDirection: "column", width: "100%" } },
      h(
        "div",
        { style: { display: "flex", fontFamily: COND, fontWeight: 800, fontSize: 116, lineHeight: 0.95, textTransform: "uppercase", marginBottom: 14 } },
        t("recap.title"),
      ),
      h(
        "div",
        { style: { display: "flex", fontSize: 34, fontWeight: 600, color: C.muted, marginBottom: 56 } },
        t("home.networkBasis", { trips: fmtInt(f.ld.measured, lang), span: f.span }),
      ),
      f.stats.map((s) => recapStat(s, 170, 40)),
      h(
        "div",
        { style: { display: "flex", flexDirection: "column", borderTop: `2px solid ${C.line}`, paddingTop: 26, marginTop: 6 } },
        h(
          "div",
          { style: { display: "flex", fontSize: 32, fontWeight: 600, color: C.ink, lineHeight: 1.25 } },
          t("recap.regional", { avg: fmt1(f.reg.avgDelayMin, lang), late: fmtShare1(f.reg.latePct, lang), canc: fmtShare1(f.reg.cancelledPct, lang) }),
        ),
      ),
    ),
    1080,
    1920,
  );
}


// ---------------------------------------------------------------- route cards

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
  const chars = Math.max(cardName(r.from).length, cardName(r.to).length + 1.6);
  return Math.max(60, Math.min(max, Math.floor(width / (0.46 * chars))));
}

/** Late share stop by stop, drawn as one line that changes colour with the share. Returns the svg and its scale. */
function curveChart(points, w, hh) {
  const vals = points.map((p) => p[1]);
  const top = Math.max(...vals);
  const ymax = Math.min(100, Math.max(40, Math.ceil((top * 1.18) / 10) * 10));
  const padX = 22;
  const padY = 22;
  const x = (i) => padX + (i * (w - 2 * padX)) / (points.length - 1);
  const y = (v) => hh - padY - (v / ymax) * (hh - 2 * padY);
  const grid = [0, 0.5, 1].map((f) => h("path", { d: `M${padX} ${y(ymax * f)}H${w - padX}`, stroke: C.line, strokeWidth: 2, strokeDasharray: f === 0 ? undefined : "6 8" }));
  const area = h("path", {
    d: `M${x(0)} ${y(0)} ${points.map((p, i) => `L${x(i)} ${y(p[1])}`).join(" ")} L${x(points.length - 1)} ${y(0)}Z`,
    fill: "#ffffff",
    fillOpacity: 0.05,
  });
  const segs = points.slice(1).map((p, i) =>
    h("path", {
      d: `M${x(i)} ${y(points[i][1])}L${x(i + 1)} ${y(p[1])}`,
      stroke: lateColor((points[i][1] + p[1]) / 2),
      strokeWidth: 9,
      strokeLinecap: "round",
    }),
  );
  const dots = points.map((p, i) =>
    h("circle", { cx: x(i), cy: y(p[1]), r: i === points.length - 1 ? 13 : 8, fill: lateColor(p[1]), stroke: C.paper, strokeWidth: 4 }),
  );
  return { ymax, svg: h("svg", { width: w, height: hh, viewBox: `0 0 ${w} ${hh}` }, grid, area, segs, dots) };
}

function bigTile(ch, w, color) {
  const tileH = Math.round(w * 1.36);
  return h(
    "div",
    {
      style: {
        display: "flex",
        position: "relative",
        width: ch === "%" ? Math.round(w * 1.1) : w,
        height: tileH,
        alignItems: "center",
        justifyContent: "center",
        background: C.tile,
        border: `3px solid ${C.tileEdge}`,
        borderRadius: 18,
        margin: "0 6px",
      },
    },
    h("div", { style: { fontFamily: COND, fontWeight: 800, fontSize: Math.round(w * 1.38), lineHeight: 1, color } }, ch),
    h("div", { style: { display: "flex", position: "absolute", left: 0, top: Math.round(tileH / 2) - 3, width: "100%", height: 6, background: "#000000" } }),
  );
}

/** Portrait card shell: same structure as frame(), which is known to lay out right. */
function portraitFrame(top, middle, bottom) {
  return h(
    "div",
    { style: { display: "flex", flexDirection: "column", width: 1080, height: 1350, background: C.paper, fontFamily: SANS, fontWeight: 500, color: C.ink } },
    h(
      "div",
      { style: { display: "flex", flexDirection: "column", flexGrow: 1, justifyContent: "space-between", padding: "54px 64px 40px" } },
      top,
      middle,
      bottom,
      footer(),
    ),
  );
}

function routeNames(r, size) {
  return h(
    "div",
    { style: { display: "flex", flexDirection: "column", fontFamily: COND, fontWeight: 800, fontSize: size, lineHeight: 0.93, textTransform: "uppercase" } },
    h("div", { style: { display: "flex", whiteSpace: "nowrap" } }, cardName(r.from)),
    h("div", { style: { display: "flex", alignItems: "center", color: C.amber, whiteSpace: "nowrap" } }, h("div", { style: { display: "flex", marginLeft: -10 } }, arrow(Math.round(size * 0.62), false)), cardName(r.to)),
  );
}

function routePortrait(r, t, lang, span) {
  const pct = Math.round(r.late);
  const chars = Array.from(`${pct}%`);
  const color = lateColor(r.late);
  const tileW = chars.length > 3 ? 150 : 178;
  const chart = r.curve ? curveChart(r.curve.points, 952, 150) : null;
  const pts = r.curve ? r.curve.points : [];
  const board = h(
    "div",
    {
      style: {
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        background: C.board,
        border: `3px solid ${C.boardLine}`,
        borderRadius: 30,
        padding: "34px 30px 30px",
      },
    },
    h("div", { style: { display: "flex" } }, chars.map((c) => bigTile(c, tileW, color))),
    h(
      "div",
      { style: { display: "flex", fontFamily: COND, fontWeight: 800, fontSize: 52, letterSpacing: 1, textTransform: "uppercase", marginTop: 22, textAlign: "center" } },
      t("res.leadRest"),
    ),
    h("div", { style: { display: "flex", width: "100%", height: 2, background: C.boardLine, margin: "20px 0 16px" } }),
    h("div", { style: { display: "flex", fontSize: 30, fontWeight: 600, color: C.muted, textAlign: "center" } }, t("route.card.db6", { pct: fmtShare1(r.late6, lang) })),
  );
  const picks =
    !chart && r.bestTrain && r.worstTrain
      ? h(
          "div",
          { style: { display: "flex", flexDirection: "column", marginBottom: 10 } },
          pickRow(t("route.picks.best"), r.bestTrain, r.to, lateColor(r.bestTrain[2]), lang),
          pickRow(t("route.picks.worst"), r.worstTrain, r.to, lateColor(r.worstTrain[2]), lang),
        )
      : null;
  const curve = chart
    ? h(
        "div",
        { style: { display: "flex", flexDirection: "column" } },
        h(
          "div",
          { style: { display: "flex", justifyContent: "space-between", fontSize: 25, fontWeight: 600, color: C.muted, marginTop: 14, marginBottom: 6 } },
          h("div", { style: { display: "flex" } }, t("route.card.curve", { train: r.curve.train })),
          h("div", { style: { display: "flex" } }, t("route.card.scale", { pct: `${chart.ymax}%` })),
        ),
        chart.svg,
        h(
          "div",
          { style: { display: "flex", justifyContent: "space-between", fontSize: 27, fontWeight: 600, color: C.ink2, marginTop: 4, marginBottom: 14 } },
          h("div", { style: { display: "flex" } }, clip(pts[0][0], 26)),
          h("div", { style: { display: "flex" } }, clip(pts[pts.length - 1][0], 26)),
        ),
      )
    : null;
  return portraitFrame(
    h(
      "div",
      { style: { display: "flex", flexDirection: "column" } },
      eyebrow(`Deutsche Bahn · ${span}`),
      h("div", { style: { display: "flex", marginTop: 30 } }, routeNames(r, nameSize(r, 950, 168))),
      h("div", { style: { display: "flex", fontSize: 30, fontWeight: 600, color: C.muted, marginTop: 18, marginBottom: 18 } }, t("route.card.facts", { trains: fmtInt(r.trains, lang), trips: fmtInt(r.trips, lang) })),
    ),
    board,
    curve ?? picks ?? h("div", { style: { display: "flex" } }),
  );
}

/** Used when the route has no stops in between (München → Nürnberg): the best and the worst train on it. */
function pickRow(label, pick, to, color, lang) {
  const [type, num, pct, n] = pick;
  return h(
    "div",
    { style: { display: "flex", alignItems: "center", justifyContent: "space-between", height: 88, padding: "0 28px", borderRadius: 18, background: C.card, border: `2px solid ${C.boardLine}`, marginBottom: 12 } },
    h(
      "div",
      { style: { display: "flex", flexDirection: "column" } },
      h("div", { style: { display: "flex", fontSize: 22, fontWeight: 600, letterSpacing: 2, textTransform: "uppercase", color: C.muted } }, label),
      h("div", { style: { display: "flex", fontFamily: COND, fontWeight: 800, fontSize: 44, lineHeight: 1.05, color: C.amber } }, `${type} ${num}`),
    ),
    h("div", { style: { display: "flex", fontFamily: COND, fontWeight: 800, fontSize: 64, color } }, fmtShare1(pct, lang)),
  );
}

function routeWide(r, t, lang, span) {
  return frame(
    `Deutsche Bahn · ${span}`,
    [
      h(
        "div",
        { style: { display: "flex", flexDirection: "column", width: 600 } },
        routeNames(r, nameSize(r, 590, 100)),
        h("div", { style: { display: "flex", fontSize: 28, fontWeight: 600, color: C.muted, marginTop: 22 } }, t("route.card.facts", { trains: fmtInt(r.trains, lang), trips: fmtInt(r.trips, lang) })),
        h("div", { style: { display: "flex", fontSize: 25, fontWeight: 600, color: C.muted, marginTop: 8 } }, t("route.card.db6", { pct: fmtShare1(r.late6, lang) })),
      ),
      lateBoard(r.late, t, null),
    ],
  );
}

function leagueRow(r, i, top, tone, big) {
  const color = lateColor(r.late);
  const barW = Math.max(6, Math.round((r.late / top) * 100));
  return h(
    "div",
    { style: { display: "flex", alignItems: "center", height: big ? 88 : 66, position: "relative", marginBottom: 10, borderRadius: 14, background: C.card, border: `2px solid ${C.boardLine}`, overflow: "hidden" } },
    h("div", { style: { display: "flex", position: "absolute", left: 0, top: 0, bottom: 0, width: `${barW}%`, background: color, opacity: 0.2 } }),
    h("div", { style: { display: "flex", width: big ? 70 : 54, justifyContent: "center", fontFamily: COND, fontWeight: 800, fontSize: big ? 44 : 34, color: tone } }, String(i)),
    h(
      "div",
      { style: { display: "flex", alignItems: "center", flexGrow: 1, fontFamily: COND, fontWeight: 800, fontSize: big ? 42 : 32, textTransform: "uppercase", letterSpacing: 0.5 } },
      clip(cardName(r.from), 19),
      arrow(big ? 36 : 28, false),
      clip(cardName(r.to), 19),
    ),
    h("div", { style: { display: "flex", width: big ? 150 : 110, justifyContent: "flex-end", paddingRight: 22, fontFamily: COND, fontWeight: 800, fontSize: big ? 56 : 40, color } }, `${Math.round(r.late)}%`),
  );
}

function leaguePortrait(worst, best, t, lang, span, n) {
  const top = Math.max(...worst.map((r) => r.late));
  return portraitFrame(
    h(
      "div",
      { style: { display: "flex", flexDirection: "column" } },
      eyebrow(`Deutsche Bahn · ${span}`),
      h("div", { style: { display: "flex", fontFamily: COND, fontWeight: 800, fontSize: lang === "de" ? 98 : 124, lineHeight: 0.92, textTransform: "uppercase", marginTop: 30 } }, t("routes.card.title")),
      h("div", { style: { display: "flex", fontSize: 29, fontWeight: 600, color: C.muted, marginTop: 18, marginBottom: 30 } }, t("routes.card.sub", { n })),
    ),
    h("div", { style: { display: "flex", flexDirection: "column" } }, worst.map((r, i) => leagueRow(r, i + 1, top, "#ff4b3e", true))),
    h(
      "div",
      { style: { display: "flex", flexDirection: "column" } },
      h("div", { style: { display: "flex", fontFamily: COND, fontWeight: 800, fontSize: 36, letterSpacing: 2, textTransform: "uppercase", color: "#34c36b", marginTop: 8, marginBottom: 12 } }, t("routes.card.best")),
      best.map((r, i) => leagueRow(r, n - best.length + i + 1, top, "#34c36b", false)),
    ),
  );
}

function leagueWide(worst, t, lang, span, n) {
  const top = Math.max(...worst.map((r) => r.late));
  return frame(
    `Deutsche Bahn · ${span}`,
    [
      h(
        "div",
        { style: { display: "flex", flexDirection: "column", width: 420 } },
        h("div", { style: { display: "flex", fontFamily: COND, fontWeight: 800, fontSize: 84, lineHeight: 0.96, textTransform: "uppercase" } }, t("routes.card.title")),
        h("div", { style: { display: "flex", fontSize: 25, fontWeight: 600, color: C.muted, marginTop: 18 } }, t("routes.card.sub", { n })),
      ),
      h("div", { style: { display: "flex", flexDirection: "column", width: 640 } }, worst.slice(0, 5).map((r, i) => leagueRow(r, i + 1, top, "#ff4b3e", false))),
    ],
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
  const strip = 14;
  const bg = [0x0a, 0x0c, 0x0f];
  for (let y = height - strip; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      if (Math.abs(pixels[i] - bg[0]) + Math.abs(pixels[i + 1] - bg[1]) + Math.abs(pixels[i + 2] - bg[2]) > 24) {
        throw new Error(`content touches the bottom edge of ${path.basename(file)} at y=${y}`);
      }
    }
  }
}

async function render(node, fonts, file, w = W, hh = H, compress = false) {
  const svg = await satori(node, { width: w, height: hh, fonts });
  const rendered = new Resvg(svg, { fitTo: { mode: "width", value: w }, font: { loadSystemFonts: false } }).render();
  assertBottomMargin(rendered, file);
  const png = rendered.asPng();
  await fs.writeFile(file, compress && sharp ? await sharp(png).png({ palette: true, quality: 90, effort: 5, compressionLevel: 9, colours: 128, dither: 0.6 }).toBuffer() : png);
}

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
  const dir = path.join(OUT_DIR, lastMonth);
  await fs.rm(dir, { recursive: true, force: true });
  await fs.mkdir(path.join(dir, "de"), { recursive: true });

  let count = 0;
  for (const lang of ["en", "de"]) {
    const t = makeT(lang);
    const out = lang === "de" ? path.join(dir, "de") : dir;
    const span = spanLabel(firstMonth, lastMonth, lang);
    const facts = recapFacts(stats, t, lang);
    const jobs = [
      ["home", homeCard(stats, t, lang), W, H],
      ["recap", recapWide(facts, t, lang), W, H],
      ["recap-tall", recapTall(facts, t, lang), 1080, 1920],
      ...units.map((u) => {
        const share = late.get(u.slug);
        if (share === undefined) throw new Error(`no search record for ${u.slug}, cannot read its late share`);
        return [u.slug, unitCard(u, share, span, t, lang), W, H];
      }),
    ];
    for (const [name, node, w, hh] of jobs) {
      try {
        await render(node, fonts, path.join(out, `${name}.png`), w, hh);
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
    await fs.rm(path.join(OUT_DIR, "routes"), { recursive: true, force: true });
    await fs.mkdir(path.join(rdir, "de"), { recursive: true });
    const league = rd.routes.filter((r) => r.rank !== null).sort((a, b) => a.rank - b.rank);
    for (const lang of ["en", "de"]) {
      const t = makeT(lang);
      const out = lang === "de" ? path.join(rdir, "de") : rdir;
      const span = spanLabel(rd.window.firstMonth, rd.window.lastMonth, lang);
      const jobs = [
        ["ranking", leagueWide(league.slice(0, 5), t, lang, span, league.length), W, H],
        ["ranking-portrait", leaguePortrait(league.slice(0, 5), league.slice(-3), t, lang, span, league.length), 1080, 1350],
        ...rd.routes.flatMap((r) => [
          [r.slug, routeWide(r, t, lang, span), W, H],
          [`${r.slug}-portrait`, routePortrait(r, t, lang, span), 1080, 1350],
        ]),
      ];
      for (const [name, node, w, hh] of jobs) {
        try {
          await render(node, fonts, path.join(out, `${name}.png`), w, hh, true);
          routeCount += 1;
        } catch (e) {
          throw new Error(`render routes/${lang}/${name}.png failed: ${e.message}`);
        }
      }
    }
  }

  for (const entry of await fs.readdir(OUT_DIR, { withFileTypes: true })) {
    if (entry.isDirectory() && /^\d{4}-\d{2}$/.test(entry.name) && entry.name !== lastMonth) {
      await fs.rm(path.join(OUT_DIR, entry.name), { recursive: true, force: true });
    }
  }

  const ms = Math.round(performance.now() - started);
  console.log(`og: ${count} images -> public/og/${lastMonth}/, ${routeCount} route images -> public/og/routes/ in ${ms} ms`);
}

main().catch((e) => {
  console.error(`og: FAILED: ${e.message}`);
  process.exit(1);
});
