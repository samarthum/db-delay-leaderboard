"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { LATE, liveColor } from "@/lib/colors";
import { route, type Lang } from "@/lib/i18n";
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
  /** Trains from abroad: today's departure at the real origin, from Transitous. */
  abroad?: { from: string | null; pd: string; late: number | null; live: boolean; canc: boolean } | null;
  /** The run was found abroad but not yet in DB's timetable at the first German stop. */
  borderUnknown?: boolean;
}
/** When the train is not on now: its next planned start and when live times begin (stamps). */
export interface NextRun {
  pd: string;
  liveFrom: string;
}
type Answer = { ok: true; from: string; to: string; run: LiveRun | null; next?: NextRun | null } | { ok: false; error: string };

const REFRESH_MS = 60_000;

// The live lookup names stations by the site's short key, which for two stations is ambiguous to a reader.
const FULL_NAME: Record<string, string> = { Frankfurt: "Frankfurt (Oder)" };
/** A station name from /api/live/ as a reader should see it ("Frankfurt" there is Frankfurt (Oder)). */
export const liveName = (name: string) => FULL_NAME[name] ?? name;
export const clockOf = (stamp: string) => `${stamp.slice(6, 8)}:${stamp.slice(8, 10)}`;
/** The clock time `n` minutes after a DB stamp: the time DB now expects ("12:03" + 12 -> "12:15"). */
export function clockAfter(stamp: string, n: number): string {
  const m = (Number(stamp.slice(6, 8)) * 60 + Number(stamp.slice(8, 10)) + n) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

/** Fetches today's run of `train` once a minute while the tab is visible. null until there is something to show. */
export function useLiveRun(train: string | null): { run: LiveRun; from: string; to: string } | null {
  return useLiveAnswer(train).live;
}

/** Live run when the train is on now, else its next planned start (both null when unknown or live data is off). */
export function useLiveAnswer(train: string | null): {
  live: { run: LiveRun; from: string; to: string } | null;
  next: { next: NextRun; from: string } | null;
  /** Why there is no answer: "unknown" (no live lookup for this train), "busy"/"upstream" (try later), "disabled". */
  error: string | null;
} {
  const [ans, setAns] = useState<{ run: LiveRun; from: string; to: string } | null>(null);
  const [nxt, setNxt] = useState<{ next: NextRun; from: string } | null>(null);
  const [err, setErr] = useState<string | null>(null);
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
          setAns(j.run && j.run.found ? { run: j.run, from: liveName(j.from), to: liveName(j.to) } : null);
          setNxt(!j.run && j.next ? { next: j.next, from: liveName(j.from) } : null);
          setErr(null);
        } else setErr(j.error);
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
  return { live: ans, next: nxt, error: err };
}

/** "today" / "tomorrow" / "Tue" for a DB stamp, against Berlin's date now. */
export function dayWord(stamp: string, lang: Lang, t: ReturnType<typeof makeT>): string {
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
export function statusOf(run: LiveRun, t: ReturnType<typeof makeT>): { text: string; color: string; quiet: boolean } {
  if (run.canc) return { text: t("live.canc"), color: LATE, quiet: false };
  const n = run.late ?? 0;
  return { text: n > 0 ? t("live.lateAt", { n, time: clockAfter(run.pd, n) }) : t("live.onTime"), color: liveColor(n), quiet: n <= 0 };
}

/** Arrival status at the last station: delay, cancelled stop, "no delay reported", or no planned time from DB yet. */
export function arrivalOf(run: LiveRun, to: string, t: ReturnType<typeof makeT>): { text: string; color: string; known: boolean; quiet: boolean } | null {
  if (run.canc) return null;
  if (run.arrCanc) return { text: t("live.arrCanc", { to }), color: LATE, known: true, quiet: false };
  if (!run.pa) return { text: t("live.arrUnknown"), color: "var(--rule)", known: false, quiet: true };
  const n = run.lateArr ?? 0;
  return { text: n > 0 ? t("live.lateAt", { n, time: clockAfter(run.pa, n) }) : t("live.onTime"), color: liveColor(n), known: true, quiet: n <= 0 };
}

/**
 * Today's run of one train, at both ends: departure at its first station and arrival at its last, as Deutsche Bahn
 * reports them now. Top of a train page and of the search result card; the history figure follows under it.
 * Outside the live window it is one line with the next run. `quiet`: also say so when there are no live times for this
 * train or the feed is down (the search card, where a missing box would look like a fault). Live switched off = nothing.
 */
export function LiveNow({
  train,
  lang,
  quiet = false,
  dest,
  origin,
}: {
  train: string;
  lang: Lang;
  quiet?: boolean;
  /** The train's real final stop, when it goes on beyond the live data's last station (abroad). */
  dest?: string;
  /** The first station the page names; when live times start elsewhere, the box says so. */
  origin?: string;
}) {
  const t = makeT(lang);
  const { live: a, next, error } = useLiveAnswer(train);
  if (!a && next) {
    return (
      <p className="ln-next" aria-label={t("live.now.title")}>
        {t("live.next", { day: dayWord(next.next.pd, lang, t), time: clockOf(next.next.pd), from: next.from })}{" "}
        <span>{t("live.next.when", { time: clockOf(next.next.liveFrom) })}</span>
      </p>
    );
  }
  if (!a) {
    if (!quiet || !error || error === "disabled") return null;
    return <p className="ln-next ln-quiet">{error === "unknown" ? t("live.none") : t("live.unavailable")}</p>;
  }
  const { run, from, to } = a;
  const s = statusOf(run, t);
  const ab = run.abroad && run.abroad.from ? run.abroad : null;
  const abText = ab
    ? ab.canc
      ? t("live.abroad.canc", { from: ab.from as string, time: clockOf(ab.pd) })
      : !ab.live
        ? t("live.abroad.none", { from: ab.from as string, time: clockOf(ab.pd) })
        : (ab.late ?? 0) > 0
          ? t("live.abroad.late", { from: ab.from as string, time: clockOf(ab.pd), n: ab.late ?? 0 })
          : t("live.abroad.on", { from: ab.from as string, time: clockOf(ab.pd) })
    : null;
  const arr = arrivalOf(run, to, t);
  const plat = run.plat && !run.canc && !run.platChanged ? t("live.plat", { p: run.plat }) : "";
  // "Other trains": the route between the same two stops, opened at this train's time (its live board lists the next ones).
  const othersHref = `${route(lang, "home")}?${new URLSearchParams({ q: `${clockOf(run.pd)} ${from} ${lang === "de" ? "nach" : "to"} ${to}`, r: "1" }).toString()}`;
  const othersText = t("live.others", { from, to });
  const beyond = run.arrCanc ? t("live.arrCancNote", { to }) : dest && dest !== to ? t("live.beyond", { dest, to }) : null;
  return (
    <section className="livenow" aria-label={t("live.now.title")} data-state={run.state}>
      <p className="ln-head">
        <span className="ln-dot" aria-hidden="true" />
        {t("live.now.title")}
      </p>
      {abText ? <p className="ln-abroad">{abText}</p> : null}
      <div className="ln-leg">
        <p className="ln-where">
          <span className="ln-lab">{t("live.dep")}</span> <b>{clockOf(run.pd)}</b> {from}
          {plat ? <span className="ln-plat"> · {plat}</span> : null}
        </p>
        {origin && origin !== from && !run.abroad ? <p className="ln-beyond">{t("live.startsHere", { from, origin })}</p> : null}
        {run.platChanged && run.plat && !run.canc ? <p className="ln-platnew">{t("live.platChanged", { p: run.plat })}</p> : null}
        {run.borderUnknown ? (
          <p className="ln-status ln-unknown">{t("live.arrUnknown")}</p>
        ) : (
          <p className={s.quiet ? "ln-status ln-quietst" : "ln-status"} style={{ ["--c" as string]: s.color }}>
            {s.text}
          </p>
        )}
        {run.canc ? <p className="ln-beyond">{t("live.cancBoth", { from, to })}</p> : null}
        {run.canc ? (
          <p className="ln-after">
            <Link href={othersHref} prefetch={false}>
              {othersText}
            </Link>
            <Link href={route(lang, "compensation")} prefetch={false}>
              {t("live.claim")}
            </Link>
          </p>
        ) : null}
      </div>
      {arr ? (
        <div className="ln-leg">
          <p className="ln-where">
            <span className="ln-lab">{t("live.arr")}</span> {run.pa ? <b>{clockOf(run.pa)}</b> : null} {to}
          </p>
          <p className={!arr.known ? "ln-status ln-unknown" : arr.quiet ? "ln-status ln-quietst" : "ln-status"} style={{ ["--c" as string]: arr.color }}>
            {arr.text}
          </p>
          {beyond ? <p className="ln-beyond">{beyond}</p> : null}
        </div>
      ) : null}
      {run.arrCanc && !run.canc ? (
        <p className="ln-after">
          <Link href={othersHref} prefetch={false}>
            {othersText}
          </Link>
          <Link href={route(lang, "compensation")} prefetch={false}>
            {t("live.claim")}
          </Link>
        </p>
      ) : null}
      <p className="ln-src">
        {t("live.now.src", { time: run.asOf ? clockOf(run.asOf) : "" })}
        {ab ? ` ${t("live.abroad.src")}` : ""}
      </p>
    </section>
  );
}
