// Share images, built at deploy time with satori + resvg, English and German:
//   public/og/<lastMonth>/<name>.png        English (home, recap, recap-tall, one per train and line)
//   public/og/<lastMonth>/de/<name>.png     German
// Every number comes from data/; every sentence from lib/dict/{en,de}, so the cards say what the site says.
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import satori from "satori";
import { Resvg } from "@resvg/resvg-js";
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

async function render(node, fonts, file, w = W, hh = H) {
  const svg = await satori(node, { width: w, height: hh, fonts });
  const png = new Resvg(svg, { fitTo: { mode: "width", value: w }, font: { loadSystemFonts: false } }).render().asPng();
  await fs.writeFile(file, png);
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

  for (const entry of await fs.readdir(OUT_DIR, { withFileTypes: true })) {
    if (entry.isDirectory() && /^\d{4}-\d{2}$/.test(entry.name) && entry.name !== lastMonth) {
      await fs.rm(path.join(OUT_DIR, entry.name), { recursive: true, force: true });
    }
  }

  const ms = Math.round(performance.now() - started);
  console.log(`og: ${count} images -> public/og/${lastMonth}/ in ${ms} ms`);
}

main().catch((e) => {
  console.error(`og: FAILED: ${e.message}`);
  process.exit(1);
});
