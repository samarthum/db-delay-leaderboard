"use client";

import { useEffect, useRef } from "react";
import type { VoiceError } from "@/lib/voice";
import { makeT, type Key } from "@/lib/t";
import type { Lang } from "@/lib/i18n";
import styles from "./VoicePanel.module.css";

export type VoiceView =
  | { phase: "idle" }
  | { phase: "starting" }
  | { phase: "listening"; partial: string }
  | { phase: "heard"; text: string }
  | { phase: "error"; error: VoiceError };

const BARS = 40;

/** A rolling level meter: one bar per animation frame, newest on the right. */
function Meter({ getLevel, live }: { getLevel: () => number; live: boolean }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const read = useRef(getLevel);
  read.current = getLevel;
  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    const w = c.clientWidth;
    const h = c.clientHeight;
    c.width = Math.round(w * dpr);
    c.height = Math.round(h * dpr);
    ctx.scale(dpr, dpr);
    const color = getComputedStyle(c).getPropertyValue("--bar").trim() || "#ffc72c";
    const history = new Array<number>(BARS).fill(0);
    let smooth = 0;
    let frame = 0;
    let raf = 0;
    const draw = () => {
      frame += 1;
      const raw = live ? read.current() : 0;
      // Fast attack, slow release, and a curve that makes quiet speech visible without clipping loud speech.
      const target = Math.min(1, Math.pow(raw * 2.4, 0.65));
      smooth = target > smooth ? target : smooth * 0.82 + target * 0.18;
      if (frame % 3 === 0) {
        history.shift();
        history.push(smooth);
      }
      ctx.clearRect(0, 0, w, h);
      const gap = 4;
      const bw = (w - gap * (BARS - 1)) / BARS;
      for (let i = 0; i < BARS; i++) {
        const v = history[i];
        const bh = Math.max(3, v * h);
        ctx.globalAlpha = 0.35 + 0.65 * (i / BARS);
        ctx.fillStyle = color;
        const x = i * (bw + gap);
        const y = (h - bh) / 2;
        ctx.beginPath();
        ctx.roundRect(x, y, bw, bh, Math.min(bw / 2, 3));
        ctx.fill();
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [live]);
  return <canvas ref={canvas} className={styles.meter} aria-hidden="true" />;
}

/**
 * What the visitor sees while the search box listens: a level meter, the words as they are recognised, and one big
 * Stop button. Errors replace the meter with a plain sentence and a way to try again.
 */
export function VoicePanel({
  view,
  lang,
  getLevel,
  onStop,
  onCancel,
  onRetry,
}: {
  view: VoiceView;
  lang: Lang;
  getLevel: () => number;
  onStop: () => void;
  onCancel: () => void;
  onRetry: () => void;
}) {
  const t = makeT(lang);
  if (view.phase === "idle") return null;

  if (view.phase === "error") {
    return (
      <div className={styles.panel} role="alert">
        <p className={styles.error}>{t(`voice.err.${view.error}` as Key)}</p>
        <div className={styles.row}>
          {view.error === "denied" || view.error === "unsupported" || view.error === "nomic" ? null : (
            <button type="button" className={styles.primary} onClick={onRetry}>
              {t("voice.retry")}
            </button>
          )}
          <button type="button" className={styles.link} onClick={onCancel}>
            {t("voice.close")}
          </button>
        </div>
      </div>
    );
  }

  const listening = view.phase === "listening";
  const words = view.phase === "listening" ? view.partial : view.phase === "heard" ? view.text : "";
  const status = view.phase === "starting" ? t("voice.starting") : view.phase === "heard" ? t("voice.heard") : t("voice.listening");
  return (
    <div className={styles.panel} data-phase={view.phase}>
      <div className={styles.top}>
        <span className={styles.dot} data-live={listening || undefined} aria-hidden="true" />
        <span className={styles.status} role="status">
          {status}
        </span>
      </div>
      <Meter getLevel={getLevel} live={listening} />
      <p className={styles.words} aria-live="polite">
        {words || <span className={styles.hint}>{t("voice.hint")}</span>}
      </p>
      {view.phase === "heard" ? null : (
        <div className={styles.row}>
          <button type="button" className={styles.stop} onClick={onStop} disabled={!listening}>
            <span className={styles.square} aria-hidden="true" />
            {t("voice.stop")}
          </button>
          <button type="button" className={styles.link} onClick={onCancel}>
            {t("voice.cancel")}
          </button>
        </div>
      )}
      <p className={styles.privacy}>{t("voice.privacy")}</p>
    </div>
  );
}
