"use client";

import { useEffect, useState } from "react";
import { delayColor, LATE } from "@/lib/colors";
import type { Lang } from "@/lib/i18n";
import { makeT } from "@/lib/t";

/** Today's run of one train as /api/live/?train= sends it. Stamps are DB local time, yyMMddHHmm. */
export interface LiveRun {
  found: boolean;
  state?: "soon" | "running" | "arrived" | "cancelled";
  pd: string;
  late?: number | null;
  canc?: boolean;
  plat?: string | null;
  platChanged?: boolean;
  pa?: string | null;
  lateArr?: number | null;
  arrCanc?: boolean;
  asOf?: string;
}
/** When the train is not on now: its next planned start and when live times begin (stamps). */
export interface NextRun {
  pd: string;
  liveFrom: string;
}
type Answer = { ok: true; from: string; to: string; run: LiveRun | null; next?: NextRun | null } | { ok: false; error: string };

const REFRESH_MS = 60_000;
export const clockOf = (stamp: string) => `${stamp.slice(6, 8)}:${stamp.slice(8, 10)}`;

/** Fetches today's run of `train` once a minute while the tab is visible. null until there is something to show. */
export function useLiveRun(train: string | null): { run: LiveRun; from: string; to: string } | null {
  return useLiveAnswer(train).live;
}

/** Live run when the train is on now, else its next planned start (both null when unknown or live data is off). */
export function useLiveAnswer(train: string | null): { live: { run: LiveRun; from: string; to: string } | null; next: { next: NextRun; from: string } | null } {
  const [ans, setAns] = useState<{ run: LiveRun; from: string; to: string } | null>(null);
  const [nxt, setNxt] = useState<{ next: NextRun; from: string } | null>(null);
  useEffect(() => {
    if (!train) return;
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const load = async () => {
      try {
        const r = await fetch(`/api/live/?train=${encodeURIComponent(train)}`);
        const j = (await r.json()) as Answer;
        if (!alive) return;
        if (j.ok) {
          setAns(j.run && j.run.found ? { run: j.run, from: j.from, to: j.to } : null);
          setNxt(!j.run && j.next ? { next: j.next, from: j.from } : null);
        }
      } catch {
        /* offline or no function on this host */
      }
      clearTimeout(timer);
      if (alive && document.visibilityState === "visible") timer = setTimeout(load, REFRESH_MS);
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        clearTimeout(timer);
        void load();
      }
    };
    void load();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      alive = false;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [train]);
  return { live: ans, next: nxt };
}

/** "today" / "tomorrow" / "Tue" for a DB stamp, against Berlin's date now. */
function dayWord(stamp: string, lang: Lang, t: ReturnType<typeof makeT>): string {
  const d = Date.UTC(2000 + Number(stamp.slice(0, 2)), Number(stamp.slice(2, 4)) - 1, Number(stamp.slice(4, 6)));
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Berlin", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date()).map((x) => [x.type, x.value]),
  );
  const today = Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day));
  const k = Math.round((d - today) / 86400000);
  if (k === 0) return t("live.next.today");
  if (k === 1) return t("live.next.tomorrow");
  return new Intl.DateTimeFormat(lang === "de" ? "de-DE" : "en-GB", { weekday: "long", timeZone: "UTC" }).format(new Date(d));
}

/** "No delay reported" / "12 min late" / "Cancelled", with its colour. */
export function statusOf(run: LiveRun, t: ReturnType<typeof makeT>): { text: string; color: string } {
  if (run.canc) return { text: t("live.canc"), color: LATE };
  const n = run.late ?? 0;
  return { text: n > 0 ? t("live.late", { n }) : t("live.onTime"), color: delayColor(n) };
}

/**
 * Top of a train page when the train runs in the next hours (or is on its way): today's departure, platform and the
 * delay Deutsche Bahn reports now, then the arrival at the last stop. The history figure follows directly under it.
 * Renders nothing when the train is not running soon, the feed has no record of it, or live data is off.
 */
export function LiveNow({ train, lang }: { train: string; lang: Lang }) {
  const t = makeT(lang);
  const { live: a, next } = useLiveAnswer(train);
  if (!a && next) {
    return (
      <p className="ln-next" aria-label={t("live.now.title")}>
        {t("live.next", { day: dayWord(next.next.pd, lang, t), time: clockOf(next.next.pd), from: next.from })}{" "}
        <span>{t("live.next.when", { time: clockOf(next.next.liveFrom) })}</span>
      </p>
    );
  }
  if (!a) return null;
  const { run, from, to } = a;
  const s = statusOf(run, t);
  const arrival = run.canc
    ? null
    : run.arrCanc
      ? t("live.arrCanc", { to })
      : run.lateArr === null || run.lateArr === undefined
        ? null
        : run.lateArr > 0
          ? t("live.now.arrLate", { to, n: run.lateArr })
          : t("live.now.arrOn", { to });
  return (
    <section className="livenow" aria-label={t("live.now.title")} data-state={run.state}>
      <p className="ln-head">
        <span className="ln-dot" aria-hidden="true" />
        {t("live.now.title")} · {t("live.now.leaves", { time: clockOf(run.pd), from })}
        {run.plat ? ` · ${run.platChanged ? t("live.platNew", { p: run.plat }) : t("live.plat", { p: run.plat })}` : ""}
      </p>
      <p className="ln-status" style={{ ["--c" as string]: s.color }}>
        {s.text}
      </p>
      {arrival ? <p className="ln-arr">{arrival}</p> : null}
      <p className="ln-src">{t("live.now.src", { time: run.asOf ? clockOf(run.asOf) : "" })}</p>
    </section>
  );
}
