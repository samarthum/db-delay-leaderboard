"use client";

import { useEffect, useState, type ReactNode } from "react";
import { LATE, liveColor } from "@/lib/colors";
import { fmt1, fmtShare } from "@/lib/format";
import type { Lang } from "@/lib/i18n";
import { makeT, type Key } from "@/lib/t";
import { loadStops } from "@/lib/searchClient";
import { countryOf, hasHistory, type RawStop, type StopsIndex } from "@/lib/routeSearch";
import { shortStation } from "@/lib/routeSlug";
import { tripFromUrl, type TripParams } from "@/lib/trip";
import { clockAfter, clockOf } from "./LiveNow";

/** One end of today's trip as /api/live/?train=&on=&off= sends it (stamps are Berlin wall clock, yyMMddHHmm). */
export interface TripEnd {
  pt: string;
  late: number | null;
  live: boolean;
  canc: boolean;
  plat: string | null;
  platChanged: boolean;
  src: "db" | "transitous";
}
type TripAnswer =
  | { ok: true; train: string; run: { asOf: string; on: TripEnd | null; off: TripEnd | null; pd: string; pa: string; abroad: boolean } | null }
  | { ok: false; error: string };

const REFRESH_MS = 60_000;
const SOURCE_KEY: Record<string, Key> = { NL: "trip.srcNL", BE: "trip.srcBE" };

/** The visitor's own trip on a train page or search card: on/off stops from the address (?on=&off=). undefined until read. */
export function useTripParams(): TripParams | null | undefined {
  const [trip, setTrip] = useState<TripParams | null | undefined>(undefined);
  useEffect(() => {
    const read = () => setTrip(tripFromUrl(window.location.search));
    read();
    window.addEventListener("popstate", read);
    window.addEventListener("gp:url", read);
    return () => {
      window.removeEventListener("popstate", read);
      window.removeEventListener("gp:url", read);
    };
  }, []);
  return trip;
}

/** The stop records for `on` and `off` on this train, in running order, or null. */
export function tripRecords(idx: StopsIndex, train: string, on: string, off: string): { a: RawStop; b: RawStop } | null {
  const [type, num] = train.split(" ");
  const name = (s: RawStop) => idx.raw.stations[s[0]];
  for (const tr of idx.raw.trains) {
    if (tr[0] !== type || tr[1] !== num) continue;
    const a = tr[2].find((s) => name(s) === on && s[1] !== null);
    const b = a ? tr[2].find((s) => name(s) === off && s[2] !== null && s[8] > a[8]) : undefined;
    if (a && b) return { a, b };
  }
  return null;
}

const NAMED = new Set(["NL", "BE", "LU", "FR", "CH", "AT", "CZ", "PL", "DK", "SE", "IT", "HU", "SI", "HR", "SK"]);
export function countryName(cc: string, t: ReturnType<typeof makeT>): string {
  return t(NAMED.has(cc) ? (`cc.${cc}` as Key) : "cc.other");
}

/** "In the past: 6.4 min late on average here, 18 % of trips 15+ min late." or the honest reason there is no figure. */
function historyLine(idx: StopsIndex, s: RawStop, end: "on" | "off", lang: Lang, t: ReturnType<typeof makeT>): string {
  const cc = countryOf(idx, s[0]);
  if (cc && !hasHistory(idx, s[0])) return t("trip.histNone", { country: countryName(cc, t) });
  const avgText = (v: number) => (v < 0 ? t("res.early", { x: fmt1(-v, lang) }) : t("res.late", { x: fmt1(v, lang) }));
  // Where the train starts there is no arrival: abroad the departure figures, in Germany none (arrivals only).
  if (end === "on" && s[2] === null) {
    const d = s[9];
    if (d && d[1] !== null && d[2] !== null) return t("trip.histDep", { avg: avgText(d[2]), pct: fmtShare(d[1], lang) });
    return cc ? t("trip.histFew") : t("trip.histStart");
  }
  if (s[5] === null || s[6] === null) return t("trip.histFew");
  return t("trip.histArr", { avg: avgText(s[6]), pct: fmtShare(s[5], lang) });
}

function statusText(e: TripEnd, t: ReturnType<typeof makeT>): { text: string; color: string; quiet: boolean } {
  if (e.canc) return { text: t("live.canc"), color: LATE, quiet: false };
  if (!e.live) return { text: t("trip.liveNone"), color: "var(--rule)", quiet: true };
  const n = e.late ?? 0;
  return { text: n > 0 ? t("live.lateAt", { n, time: clockAfter(e.pt, n) }) : t("live.onTime"), color: liveColor(n), quiet: n <= 0 };
}

/**
 * "Your trip": the stop you get on and the stop you get off, on either side of the border, each with today's live
 * status (DB in Germany, Transitous abroad) and how late this train has usually been at that stop (DB's open data in
 * Germany, each country's own open data abroad, or the honest "no history abroad yet for Austria"). Shown on a train
 * page and on the search card when the address names the stops (?on=&off=, from a route search). Mobile first: the same
 * two-leg layout as the live box.
 */
export function TripEnds({ train, lang, trip }: { train: string; lang: Lang; trip: TripParams }) {
  const t = makeT(lang);
  const [idx, setIdx] = useState<StopsIndex | null>(null);
  const [ans, setAns] = useState<TripAnswer | null>(null);
  useEffect(() => {
    let on = true;
    loadStops().then((x) => on && setIdx(x), () => undefined);
    return () => {
      on = false;
    };
  }, []);
  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const load = async () => {
      try {
        const r = await fetch(`/api/live/?${new URLSearchParams({ train, on: trip.on, off: trip.off }).toString()}`);
        const j = (await r.json()) as TripAnswer;
        if (alive) setAns(j);
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
  }, [train, trip.on, trip.off]);
  const recs = idx ? tripRecords(idx, train, trip.on, trip.off) : null;
  if (!idx || !recs) return null;
  const run = ans && ans.ok ? ans.run : null;
  const liveOff = ans && !ans.ok && ans.error === "disabled";
  const ends: { key: "on" | "off"; s: RawStop; planned: number; e: TripEnd | null; label: Key }[] = [
    { key: "on", s: recs.a, planned: recs.a[1] as number, e: run ? run.on : null, label: "live.dep" },
    { key: "off", s: recs.b, planned: recs.b[2] as number, e: run ? run.off : null, label: "live.arr" },
  ];
  const clock = (m: number) => `${String(Math.floor(m / 60) % 24).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
  const abroadHere = ends.some((x) => countryOf(idx, x.s[0]) !== null);
  const srcs = ends
    .map((x) => countryOf(idx, x.s[0]))
    .filter((cc): cc is string => Boolean(cc && (idx.raw.sources ?? []).includes(cc) && SOURCE_KEY[cc]))
    .filter((cc, i, all) => all.indexOf(cc) === i);
  return (
    <section className="livenow trip" aria-labelledby="trip-h" data-state={run ? "live" : "plan"}>
      <p className="ln-head" id="trip-h">
        {run ? <span className="ln-dot" aria-hidden="true" /> : null}
        {t("trip.title")}: {shortStation(trip.on)} – {shortStation(trip.off)}
      </p>
      {ends.map(({ key, s, planned, e, label }) => {
        const st = e ? statusText(e, t) : null;
        const name = idx.raw.stations[s[0]];
        const plat = e && e.plat && !e.canc ? t("live.plat", { p: e.plat }) : "";
        return (
          <div className="ln-leg" key={key} data-end={key}>
            <p className="ln-where">
              <span className="ln-lab">{t(label)}</span> <b>{e ? clockOf(e.pt) : clock(planned)}</b> {name}
              {plat ? <span className="ln-plat"> · {plat}</span> : null}
            </p>
            {e && e.platChanged && e.plat && !e.canc ? <p className="ln-platnew">{t("live.platChanged", { p: e.plat })}</p> : null}
            {st ? (
              <p className={!e?.live && !e?.canc ? "ln-status ln-unknown" : st.quiet ? "ln-status ln-quietst" : "ln-status"} style={{ ["--c" as string]: st.color }}>
                {st.text}
              </p>
            ) : run ? (
              <p className="ln-status ln-unknown">{t("trip.liveNone")}</p>
            ) : null}
            <p className="ln-hist">{historyLine(idx, s, key, lang, t)}</p>
          </div>
        );
      })}
      {!run && ans && ans.ok && !liveOff ? <p className="ln-beyond">{t("trip.notNow")}</p> : null}
      <p className="ln-src">
        {run ? `${t("trip.src", { time: clockOf(run.asOf) })} ` : ""}
        {abroadHere ? `${t("trip.srcPlan")} ` : ""}
        {srcs.length ? t("trip.srcHist", { sources: srcs.map((cc) => t(SOURCE_KEY[cc])).join("; ") }) : ""}
      </p>
    </section>
  );
}

/**
 * The trip block when the address names two stops of this train, else `fallback` (the train's own live box from its
 * first to its last German station). Nothing until the address and, for a trip, the stop data are read.
 */
export function TripOrLive({ train, lang, fallback }: { train: string; lang: Lang; fallback: ReactNode }) {
  const trip = useTripParams();
  const [valid, setValid] = useState<boolean | null>(null);
  useEffect(() => {
    if (!trip) {
      setValid(false);
      return;
    }
    let on = true;
    setValid(null);
    loadStops().then(
      (idx) => on && setValid(Boolean(tripRecords(idx, train, trip.on, trip.off))),
      () => on && setValid(false),
    );
    return () => {
      on = false;
    };
  }, [trip, train]);
  if (trip === undefined || (trip && valid === null)) return null;
  if (trip && valid) return <TripEnds train={train} lang={lang} trip={trip} />;
  return <>{fallback}</>;
}
