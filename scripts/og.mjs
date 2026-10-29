import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import satori from "satori";
import { Resvg } from "@resvg/resvg-js";

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
  paper: "#f6f4ee",
  card: "#ffffff",
  ink: "#1f2430",
  muted: "#5f6675",
  line: "#e1ddd3",
  red: "#ec0016",
  board: "#ffffff",
  boardLine: "#d9d4c7",
  tile: "#f1eee5",
  tileEdge: "#cdc7b8",
  flap: "#1f2430",
  flapMuted: "#454c5b",
  redDark: "#b8000f",
};
const SANS = "Barlow";
const COND = "Barlow Condensed";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const monthLabel = (m) => `${MONTHS[Number(m.slice(5, 7)) - 1]} ${m.slice(0, 4)}`;
const fmtMin = (n) => String(Math.round(n));
const fmtPct = (n) => {
  const r = Math.round(n);
  return `${r >= 0 ? "+" : "−"}${Math.abs(r)}%`;
};
const clip = (s, max) => (s.length > max ? `${s.slice(0, max - 1).trimEnd()}…` : s);

function h(type, props, ...children) {
  const kids = children.flat(Infinity).filter((c) => c !== null && c !== undefined && c !== false);
  return {
    type,
    props: { ...props, children: kids.length === 0 ? undefined : kids.length === 1 ? kids[0] : kids },
  };
}

function frame(eyebrowText, main) {
  return h(
    "div",
    {
      style: {
        display: "flex",
        flexDirection: "column",
        width: W,
        height: H,
        background: C.paper,
        fontFamily: SANS,
        fontWeight: 500,
        color: C.ink,
      },
    },
    h("div", { style: { display: "flex", width: "100%", height: 12, background: C.red } }),
    h(
      "div",
      { style: { display: "flex", flexDirection: "column", flexGrow: 1, padding: "34px 60px 28px" } },
      eyebrow(eyebrowText),
      h(
        "div",
        {
          style: {
            display: "flex",
            flexGrow: 1,
            alignItems: "center",
            justifyContent: "space-between",
            marginTop: 18,
          },
        },
        main,
      ),
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
    h("div", { style: { display: "flex", width: 14, height: 14, background: C.red, marginRight: 14 } }),
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
      h("div", {
        style: { display: "flex", width: 22, height: 22, borderRadius: 6, background: C.red, marginRight: 12 },
      }),
      "German Punctuality",
    ),
  );
}

function arrow(size) {
  return h(
    "svg",
    { width: size, height: Math.round(size * 0.6), viewBox: "0 0 40 24", style: { margin: "0 12px" } },
    h("path", {
      d: "M2 12h33M25 3l10 9-10 9",
      stroke: C.red,
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
    {
      style: {
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        fontSize: size,
        fontWeight: 600,
        lineHeight: 1.2,
        marginTop: 14,
      },
    },
    h("div", {}, clip(t.origin, 30)),
    arrow(size),
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
        color: C.red,
        marginTop: 6,
      },
    },
    name,
  );
}

function tile(ch, w) {
  const tileH = Math.round(w * 1.4);
  return h(
    "div",
    {
      style: {
        display: "flex",
        position: "relative",
        width: w,
        height: tileH,
        alignItems: "center",
        justifyContent: "center",
        background: C.tile,
        border: `2px solid ${C.tileEdge}`,
        borderRadius: 12,
        margin: "0 6px",
      },
    },
    h(
      "div",
      { style: { fontFamily: COND, fontWeight: 800, fontSize: Math.round(w * 1.4), lineHeight: 1, color: C.flap } },
      ch,
    ),
    h("div", {
      style: {
        display: "flex",
        position: "absolute",
        left: 0,
        top: Math.round(tileH / 2) - 4,
        width: "100%",
        height: 4,
        background: C.tileEdge,
      },
    }),
  );
}

function board(t) {
  const digits = fmtMin(t.minutes.avg).split("");
  const w = digits.length > 2 ? 100 : 124;
  return h(
    "div",
    {
      style: {
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        width: 460,
        background: C.board,
        border: `2px solid ${C.boardLine}`,
        borderRadius: 24,
        padding: "32px 30px 28px",
      },
    },
    h("div", { style: { display: "flex" } }, digits.map((d) => tile(d, w))),
    h(
      "div",
      {
        style: {
          fontFamily: COND,
          fontWeight: 800,
          fontSize: 38,
          letterSpacing: 3,
          color: C.flap,
          textTransform: "uppercase",
          marginTop: 18,
        },
      },
      "Min late on average",
    ),
    h("div", { style: { display: "flex", width: "100%", height: 2, background: C.boardLine, margin: "20px 0 16px" } }),
    h(
      "div",
      { style: { display: "flex", alignItems: "center" } },
      h(
        "div",
        { style: { fontFamily: COND, fontWeight: 800, fontSize: 68, lineHeight: 1, color: C.redDark, marginRight: 16 } },
        fmtPct(t.percent.avg),
      ),
      h(
        "div",
        {
          style: {
            display: "flex",
            flexDirection: "column",
            fontSize: 20,
            fontWeight: 600,
            lineHeight: 1.2,
            letterSpacing: 1.5,
            textTransform: "uppercase",
            color: C.flapMuted,
          },
        },
        h("div", {}, "of the"),
        h("div", {}, "trip time"),
      ),
    ),
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
        color: filled ? "#ffffff" : C.ink,
        background: filled ? C.red : C.card,
        border: `2px solid ${filled ? C.red : C.ink}`,
      },
    },
    text,
  );
}

function homeCard(stats, span) {
  const t = stats.rankings.minutes[0];
  return frame(
    `Deutsche Bahn · ${span}`,
    [
      h(
        "div",
        { style: { display: "flex", flexDirection: "column", width: 600 } },
        h(
          "div",
          {
            style: {
              fontFamily: COND,
              fontWeight: 800,
              fontSize: 56,
              lineHeight: 1,
              letterSpacing: 1,
              textTransform: "uppercase",
            },
          },
          "Most delayed train",
        ),
        trainName(t.train),
        route(t),
      ),
      board(t),
    ],
  );
}

function trainCard(t, span) {
  const badges = [
    t.rank.minutes != null && pill(`No. ${t.rank.minutes} by minutes`, true),
    t.rank.percent != null && pill(`No. ${t.rank.percent} by % of trip`, t.rank.minutes == null),
  ].filter(Boolean);
  return frame(
    `Deutsche Bahn · ${span}`,
    [
      h(
        "div",
        { style: { display: "flex", flexDirection: "column", width: 600 } },
        badges.length > 0 && h("div", { style: { display: "flex", marginBottom: 10 } }, badges),
        trainName(t.train),
        route(t),
      ),
      board(t),
    ],
  );
}

async function readJson(file) {
  try {
    return JSON.parse(await fs.readFile(file, "utf8"));
  } catch (e) {
    throw new Error(`cannot read ${path.relative(ROOT, file)}: ${e.message}`);
  }
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

async function render(node, fonts, file) {
  const svg = await satori(node, { width: W, height: H, fonts });
  const png = new Resvg(svg, { fitTo: { mode: "width", value: W }, font: { loadSystemFonts: false } })
    .render()
    .asPng();
  await fs.writeFile(file, png);
}

async function main() {
  const started = performance.now();
  const stats = await readJson(path.join(DATA_DIR, "stats.json"));
  const { firstMonth, lastMonth } = stats.window ?? {};
  if (!/^\d{4}-\d{2}$/.test(lastMonth ?? "") || !/^\d{4}-\d{2}$/.test(firstMonth ?? "")) {
    throw new Error("stats.json window.firstMonth/lastMonth missing or malformed");
  }
  if (!stats.rankings?.minutes?.[0]) throw new Error("stats.json rankings.minutes is empty");

  const trainDir = path.join(DATA_DIR, "trains");
  const trainFiles = (await fs.readdir(trainDir)).filter((f) => f.endsWith(".json")).sort();
  if (trainFiles.length === 0) throw new Error("data/trains/ has no train files");
  const trains = await Promise.all(trainFiles.map((f) => readJson(path.join(trainDir, f))));
  trains.forEach((t, i) => {
    if (`${t.slug}.json` !== trainFiles[i]) throw new Error(`${trainFiles[i]} has slug "${t.slug}"`);
  });

  const fonts = await loadFonts();
  const span = `${monthLabel(firstMonth)} – ${monthLabel(lastMonth)}`;
  const dir = path.join(OUT_DIR, lastMonth);
  await fs.mkdir(dir, { recursive: true });

  const jobs = [["home", homeCard(stats, span)], ...trains.map((t) => [t.slug, trainCard(t, span)])];
  for (const [name, node] of jobs) {
    try {
      await render(node, fonts, path.join(dir, `${name}.png`));
    } catch (e) {
      throw new Error(`render ${name}.png failed: ${e.message}`);
    }
  }

  for (const entry of await fs.readdir(OUT_DIR, { withFileTypes: true })) {
    if (entry.isDirectory() && /^\d{4}-\d{2}$/.test(entry.name) && entry.name !== lastMonth) {
      await fs.rm(path.join(OUT_DIR, entry.name), { recursive: true, force: true });
    }
  }

  const ms = Math.round(performance.now() - started);
  console.log(`og: ${jobs.length} images -> public/og/${lastMonth}/ in ${ms} ms`);
}

main().catch((e) => {
  console.error(`og: FAILED: ${e.message}`);
  process.exit(1);
});
