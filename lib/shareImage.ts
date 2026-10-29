import { SITE_URL } from "./site";
import { fmt1, fmtInt } from "./format";
import { unitName, type SearchUnit } from "./searchCore";

/** What the card needs besides the record: the data window and the kind of unit, in words. */
export interface CardInfo {
  kind: string;
  span: string;
}

const W = 1200;
const H = 630;
const SCALE = 2;
const C = {
  paper: "#f6f4ee",
  card: "#ffffff",
  ink: "#1f2430",
  muted: "#5f6675",
  line: "#e1ddd3",
  red: "#ec0016",
  redDark: "#b8000f",
};

function cssFont(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

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
  const display = cssFont("--font-display");
  const body = cssFont("--font-body");
  await Promise.all([document.fonts.load(`800 100px ${display}`), document.fonts.load(`600 30px ${body}`), document.fonts.load(`500 30px ${body}`)]);

  const canvas = document.createElement("canvas");
  canvas.width = W * SCALE;
  canvas.height = H * SCALE;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas is not available");
  ctx.scale(SCALE, SCALE);
  ctx.textBaseline = "alphabetic";

  ctx.fillStyle = C.paper;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = C.red;
  ctx.fillRect(0, 0, W, 12);

  // eyebrow
  ctx.fillStyle = C.red;
  ctx.fillRect(60, 56, 14, 14);
  ctx.fillStyle = C.muted;
  ctx.font = `600 22px ${body}`;
  ctx.fillText(`${info.kind.toUpperCase()} · ${info.span.toUpperCase()}`, 88, 71);

  // name and route
  const nameWidth = 620;
  ctx.fillStyle = C.red;
  const name = unitName(u);
  fit(ctx, name, (px) => `800 ${px}px ${display}`, nameWidth, 150, 90);
  ctx.fillText(name, 60, 250);

  ctx.fillStyle = C.ink;
  const arrow = u.kind === 1 ? "↔" : "→";
  const route = `${u.origin} ${arrow} ${u.dest}`;
  fit(ctx, route, (px) => `600 ${px}px ${body}`, nameWidth, 34, 24);
  ctx.fillText(clipText(ctx, route, nameWidth), 60, 310);

  // the numbers under the route
  const facts = [
    `${fmt1(u.late)}% arrive 15 minutes or more late`,
    `${fmt1(u.cancelled)}% cancelled`,
    `${fmtInt(u.measured)} trips measured`,
  ];
  ctx.fillStyle = C.muted;
  ctx.font = `500 30px ${body}`;
  facts.forEach((f, i) => ctx.fillText(clipText(ctx, f, nameWidth), 60, 392 + i * 46));

  // the board on the right
  const bx = 700;
  const by = 120;
  const bw = 440;
  const bh = 390;
  ctx.fillStyle = C.card;
  ctx.strokeStyle = "#d9d4c7";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(bx, by, bw, bh, 24);
  ctx.fill();
  ctx.stroke();

  const early = u.avg < 0;
  const digits = fmt1(Math.abs(u.avg));
  ctx.textAlign = "center";
  ctx.fillStyle = C.red;
  fit(ctx, digits, (px) => `800 ${px}px ${display}`, bw - 60, 200, 100);
  ctx.fillText(digits, bx + bw / 2, by + 215);
  ctx.fillStyle = C.ink;
  ctx.font = `800 38px ${display}`;
  ctx.fillText(early ? "MIN EARLY ON AVERAGE" : "MIN LATE ON AVERAGE", bx + bw / 2, by + 275);
  ctx.fillStyle = C.line;
  ctx.fillRect(bx + 40, by + 305, bw - 80, 2);
  ctx.fillStyle = C.muted;
  ctx.font = `600 24px ${body}`;
  ctx.fillText(`Delay at the last stop`, bx + bw / 2, by + 350);
  ctx.textAlign = "left";

  // footer
  ctx.fillStyle = C.line;
  ctx.fillRect(60, 566, W - 120, 2);
  ctx.fillStyle = C.red;
  ctx.beginPath();
  ctx.roundRect(60, 590, 22, 22, 6);
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
