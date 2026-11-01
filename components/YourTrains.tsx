"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { delayColor, LATE, liveColor } from "@/lib/colors";
import { fmt1 } from "@/lib/format";
import type { Lang } from "@/lib/i18n";
import { onSavedChange, readSaved, type Saved } from "@/lib/saved";
import { readRecent } from "@/lib/recent";
import { loadRouteTable, runSearch } from "@/lib/searchClient";
import { unitName } from "@/lib/searchCore";
import { makeT } from "@/lib/t";
import type { LiveTrain } from "./LiveBoard";
import { clockAfter, clockOf, dayWord, liveName, useLiveAnswer } from "./LiveNow";

const LIVE_ROWS = 4; // live lookups per visit: the API's call budget is shared by every visitor
const RECENT_ROWS = 3;

interface Row {
  kind: "train" | "route";
  href: string;
  title: string;
  sub: string;
  live?: string;
}

type T = ReturnType<typeof makeT>;

/**
 * The usual delay, read now from the same data the search and the pages use (never a number stored when the item was
 * saved, which would go stale at the next data update). Nothing when the data has no entry.
 */
function useUsual(r: Row): number | null {
  const [avg, setAvg] = useState<number | null>(null);
  useEffect(() => {
    let on = true;
    if (r.kind === "route") {
      const slug = /\/(?:route|strecke)\/([^/]+)\//.exec(r.href)?.[1];
      if (slug) loadRouteTable().then((tb) => on && setAvg(tb[slug]?.a ?? null), () => undefined);
    } else {
      runSearch(r.title).then(
        (o) => {
          const m = o.matches.filter((u) => unitName(u) === r.title);
          if (on) setAvg(m.length === 1 ? m[0].avg : null);
        },
        () => undefined,
      );
    }
    return () => {
      on = false;
    };
  }, [r.kind, r.href, r.title]);
  return avg;
}

function Usual({ avg, lang }: { avg: number | null; lang: Lang }) {
  const t = makeT(lang);
  if (avg === null) return null;
  return (
    <span className="yt-avg">
      <em style={{ ["--c" as string]: delayColor(avg) }}>{t("list.avg", { x: fmt1(Math.max(0, avg), lang) })}</em>
      <small>{t("yt.usualLabel")}</small>
    </span>
  );
}

/** One status line: a coloured square for a reported delay or a cancellation, grey and lighter when nothing is reported. */
function St({ text, minutes, canc, small = false }: { text: string; minutes: number | null | undefined; canc: boolean; small?: boolean }) {
  const loud = canc || (minutes ?? 0) > 0;
  return (
    <span className={`yt-st${loud ? "" : " yt-quiet"}${small ? " yt-arr" : ""}`} style={{ ["--c" as string]: canc ? LATE : liveColor(minutes) }}>
      {text}
    </span>
  );
}

/** "München Hbf" and "ICE 949" never break across lines. */
export const nb = (s: string) => s.replace(/ (Hbf|\d)/g, "\u00a0$1");

function arrText(t: T, to: string, pa: string | null | undefined, lateArr: number | null | undefined, arrCanc: boolean): string {
  if (arrCanc) return t("live.arrCanc", { to: nb(to) });
  return (lateArr ?? 0) > 0 && pa ? t("yt.arrLateAt", { to: nb(to), time: clockAfter(pa, lateArr ?? 0), n: lateArr ?? 0 }) : t("live.now.arrOn", { to: nb(to) });
}
function depText(t: T, pd: string, late: number | null | undefined, canc: boolean | undefined): string {
  if (canc) return t("live.canc");
  return (late ?? 0) > 0 ? t("yt.depLateAt", { time: clockAfter(pd, late ?? 0), n: late ?? 0 }) : t("yt.depOn");
}

/** A train: today's run at both ends when it is on, its next departure when it runs later; its usual delay on the right. */
function TrainRow({ r, lang, live }: { r: Row; lang: Lang; live: boolean }) {
  const t = makeT(lang);
  const usual = useUsual(r);
  const { live: a, next, error } = useLiveAnswer(live && r.live ? r.live : null);
  const down = error === "busy" || error === "upstream";
  const on = a && !a.run.borderUnknown ? a.run : null;
  let sub = r.sub;
  if (a) sub = t("yt.today", { time: clockOf(a.run.pd), from: nb(a.from) });
  else if (next) sub = t("yt.next", { day: dayWord(next.next.pd, lang, t), time: clockOf(next.next.pd) });
  return (
    <li>
      <Link href={r.href} prefetch={false}>
        <span className="yt-main">
          <b>{nb(r.title)}</b>
          <small>{sub}</small>
        </span>
        <Usual avg={usual} lang={lang} />
        {on && a ? (
          <span className="yt-live">
            <St text={depText(t, on.pd, on.late, on.canc)} minutes={on.late} canc={Boolean(on.canc)} />
            {on.canc ? <span className="yt-hint">{t("yt.cancHint")}</span> : null}
            {on.platChanged && on.plat && !on.canc ? <span className="yt-st yt-plat">{t("live.platChanged", { p: on.plat })}</span> : null}
            {!on.canc && on.pa ? <St text={arrText(t, a.to, on.pa, on.lateArr, Boolean(on.arrCanc))} minutes={on.lateArr} canc={Boolean(on.arrCanc)} small /> : null}
          </span>
        ) : down ? (
          <span className="yt-live">
            <span className="yt-down">{t("yt.liveDown")}</span>
          </span>
        ) : null}
      </Link>
    </li>
  );
}

/** A saved route: the next long-distance train on it in the next two hours, at both ends, from the route page's board feed. */
function RouteRow({ r, lang, live }: { r: Row; lang: Lang; live: boolean }) {
  const t = makeT(lang);
  const usual = useUsual(r);
  const [from, to] = r.title.split(" → ");
  const [first, setFirst] = useState<LiveTrain | null>(null);
  const [down, setDown] = useState(false);
  useEffect(() => {
    if (!live || !from || !to) return;
    let on = true;
    fetch(`/api/live/?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`)
      .then((x) => x.json())
      .then((j: { ok: boolean; error?: string; asOf?: string; trains?: LiveTrain[] }) => {
        if (!on) return;
        if (j.ok && j.trains) {
          // The board keeps a train for two minutes after it left: the next one that has not gone yet.
          const now = j.asOf ?? "";
          setFirst(j.trains.find((x) => !x.canc && x.pd >= now) ?? j.trains[0] ?? null);
        } else if (j.error === "busy" || j.error === "upstream") {
          setDown(true);
        }
      })
      .catch(() => undefined);
    return () => {
      on = false;
    };
  }, [from, to, live]);
  return (
    <li>
      <Link href={r.href} prefetch={false}>
        <span className="yt-main">
          <b>{nb(r.title)}</b>
          <small>{first ? t("yt.routeNext", { time: clockOf(first.pd), train: `${first.cat}\u00a0${first.n}` }) : r.sub}</small>
        </span>
        <Usual avg={usual} lang={lang} />
        {first ? (
          <span className="yt-live">
            <St text={depText(t, first.pd, first.late, first.canc)} minutes={first.late} canc={first.canc} />
            {!first.canc && first.pa ? <St text={arrText(t, liveName(to), first.pa, first.lateArr, first.arrCanc)} minutes={first.lateArr} canc={first.arrCanc} small /> : null}
          </span>
        ) : down ? (
          <span className="yt-live">
            <span className="yt-down">{t("yt.liveDown")}</span>
          </span>
        ) : null}
      </Link>
    </li>
  );
}

/**
 * "Your trains" on the home page, directly under the search box: what the visitor starred, then what they looked up
 * lately. A train that runs in the next hours shows today's departure and arrival as Deutsche Bahn reports them now; one
 * that runs later shows its next departure; a starred route shows its next train. The usual delay sits on the right.
 * Renders nothing for a first visit.
 */
export function YourTrains({ lang }: { lang: Lang }) {
  const t = makeT(lang);
  const [saved, setSaved] = useState<Row[]>([]);
  const [recent, setRecent] = useState<Row[]>([]);
  useEffect(() => {
    const read = () => {
      const s: Saved[] = readSaved(lang);
      setSaved(s.map((x) => ({ kind: x.kind, href: x.href, title: x.title, sub: x.sub, live: x.live })));
      const seen = new Set(s.map((x) => x.href));
      setRecent(
        readRecent(lang)
          .filter((x) => !seen.has(x.href))
          .slice(0, RECENT_ROWS)
          .map((x) => ({ kind: /\/(route|strecke)\//.test(x.href) ? "route" : "train", href: x.href, title: x.title, sub: x.sub ?? "", live: x.live })),
      );
    };
    read();
    return onSavedChange(read);
  }, [lang]);
  if (saved.length === 0 && recent.length === 0) return null;
  let liveLeft = LIVE_ROWS;
  let routeLive = 1; // one route board per visit
  const list = (rows: Row[]) => (
    <ul>
      {rows.map((r) => {
        if (r.kind === "route") {
          const live = routeLive-- > 0 && liveLeft-- > 0;
          return <RouteRow key={r.href} r={r} lang={lang} live={live} />;
        }
        const live = Boolean(r.live) && liveLeft-- > 0;
        return <TrainRow key={r.href} r={r} lang={lang} live={live} />;
      })}
    </ul>
  );
  return (
    <div className="yt-wrap">
      {saved.length > 0 ? (
        <section className="yt" aria-labelledby="yt-h">
          <h2 id="yt-h">{t("save.title")}</h2>
          {list(saved)}
        </section>
      ) : null}
      {recent.length > 0 ? (
        <section className="yt" aria-labelledby="yt-r">
          <h2 id="yt-r">{t("yt.recent")}</h2>
          {list(recent)}
        </section>
      ) : null}
    </div>
  );
}
