import { SITE_URL } from "./site";
import { fmt1, fmtInt, fmtShare1 } from "./format";
import type { Lang } from "./i18n";
import { makeT } from "./t";
import { lateShareColor } from "./colors";
import { unitName, type SearchUnit } from "./searchCore";

/** What the card needs besides the record: the data window and the kind of unit, in words. */
export interface CardInfo {
  kind: string;
  span: string;
  lang: Lang;
}

const W = 1200;
const H = 630;
const SCALE = 2;
const C = {
  paper: "#0a0c0f",
  card: "#13171d",
  tile: "#232a34",
  tileEdge: "#323a46",
  ink: "#f4f1e8",
  muted: "#a1a7b2",
  line: "#262c35",
  amber: "#ffc72c",
};

// Plain family names. The page's CSS variables also list next/font's size-adjusted fallbacks, and loading
// one of those fails in browsers without a local Arial, which would stop the whole image.
const DISPLAY = `"Barlow Condensed", "Arial Narrow", "Helvetica Neue", Arial, sans-serif`;
const BODY = `Barlow, system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif`;

function fit(ctx: CanvasRenderingContext2D, text: string, font: (px: number) => string, maxWidth: number, start: number, min: number): number {
  let px = start;
  ctx.font = font(px);
  while (px > min && ctx.measureText(text).width > maxWidth) {
    px -= 2;
    ctx.font = font(px);
  }
  return px;
}

function clipText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let s = text;
  while (s.length > 1 && ctx.measureText(`${s}…`).width > maxWidth) s = s.slice(0, -1);
  return `${s.trimEnd()}…`;
}

/** A 1200x630 card for one search result, drawn in the browser so it can be posted as an image. */
export async function renderResultCard(u: SearchUnit, info: CardInfo): Promise<Blob> {
  const display = DISPLAY;
  const body = BODY;
  const lang = info.lang;
  const t = makeT(lang);
  // A font that fails to load only changes the look of the card, so it must not stop the image.
  await Promise.allSettled([
    document.fonts.load("800 100px 'Barlow Condensed'"),
    document.fonts.load("600 30px Barlow"),
    document.fonts.load("500 30px Barlow"),
  ]);

  const canvas = document.createElement("canvas");
  canvas.width = W * SCALE;
  canvas.height = H * SCALE;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas is not available");
  ctx.scale(SCALE, SCALE);
  ctx.textBaseline = "alphabetic";

  ctx.fillStyle = C.paper;
  ctx.fillRect(0, 0, W, H);

  // eyebrow
  ctx.fillStyle = C.amber;
  ctx.beginPath();
  ctx.arc(67, 63, 7, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = C.muted;
  ctx.font = `600 22px ${body}`;
  ctx.fillText(`${info.kind.toUpperCase()} · ${info.span.toUpperCase()}`, 88, 71);

  // name and route
  const nameWidth = 560;
  ctx.fillStyle = C.amber;
  const name = unitName(u);
  fit(ctx, name, (px) => `800 ${px}px ${display}`, nameWidth, 150, 90);
  ctx.fillText(name, 60, 235);

  ctx.fillStyle = C.ink;
  const arrow = u.kind === 1 ? "↔" : "→";
  const route = `${u.origin} ${arrow} ${u.dest}`;
  fit(ctx, route, (px) => `600 ${px}px ${body}`, nameWidth, 32, 22);
  ctx.fillText(clipText(ctx, route, nameWidth), 60, 292);

  // the numbers under the route
  const facts = [
    t("res.exact", { pct: fmtShare1(u.late, lang), n: fmtInt(u.measured, lang) }),
    t("res.basis", { span: info.span }),
    `${t("res.cancelled")}: ${fmtShare1(u.cancelled, lang)}`,
  ];
  ctx.fillStyle = C.muted;
  ctx.font = `500 26px ${body}`;
  facts.forEach((f, i) => ctx.fillText(clipText(ctx, f, nameWidth), 60, 372 + i * 42));

  // the board on the right: the share that arrives 15+ min late
  const bx = 660;
  const by = 100;
  const bw = 480;
  const bh = 420;
  ctx.fillStyle = C.card;
  ctx.strokeStyle = C.tileEdge;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(bx, by, bw, bh, 20);
  ctx.fill();
  ctx.stroke();

  const text = `${Math.round(u.late)}%`;
  const color = lateShareColor(u.late);
  const tileW = Math.min(110, (bw - 80) / text.length - 8);
  const tileH = tileW * 1.38;
  const gap = 8;
  const totalW = text.length * tileW + (text.length - 1) * gap;
  let x = bx + (bw - totalW) / 2;
  const ty = by + 50;
  ctx.textAlign = "center";
  for (const ch of text) {
    ctx.fillStyle = C.tile;
    ctx.strokeStyle = C.tileEdge;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(x, ty, tileW, tileH, tileW * 0.12);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#000";
    ctx.fillRect(x, ty + tileH / 2 - 1, tileW, 2);
    ctx.fillStyle = color;
    ctx.font = `700 ${tileW * 1.22}px ${display}`;
    ctx.fillText(ch, x + tileW / 2, ty + tileH / 2 + tileW * 0.44);
    x += tileW + gap;
  }
  ctx.fillStyle = C.ink;
  const rest = t("res.leadRest").toUpperCase();
  const words = rest.split(" ");
  const lines: string[] = [];
  ctx.font = `800 34px ${display}`;
  let cur = "";
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (ctx.measureText(next).width > bw - 70 && cur) {
      lines.push(cur);
      cur = w;
    } else cur = next;
  }
  if (cur) lines.push(cur);
  lines.slice(0, 3).forEach((l, i) => ctx.fillText(l, bx + bw / 2, by + 50 + tileH + 56 + i * 40));
  ctx.textAlign = "left";

  // footer
  ctx.fillStyle = C.line;
  ctx.fillRect(60, 566, W - 120, 2);
  ctx.fillStyle = C.amber;
  ctx.beginPath();
  ctx.arc(71, 601, 8, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = C.ink;
  ctx.font = `800 30px ${display}`;
  ctx.fillText("GERMAN PUNCTUALITY", 94, 613);
  ctx.textAlign = "right";
  ctx.fillStyle = C.muted;
  ctx.font = `600 24px ${body}`;
  ctx.fillText(SITE_URL.replace(/^https?:\/\//, ""), W - 60, 612);

  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("could not make the image"))), "image/png"),
  );
}
