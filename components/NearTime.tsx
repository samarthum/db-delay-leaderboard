"use client";

import Link from "next/link";
import { Fragment, useEffect, useState } from "react";
import { delayColor, LATE, liveColor } from "@/lib/colors";
import { fmt1, fmtShare } from "@/lib/format";
import { route, type Lang } from "@/lib/i18n";
import { clock, clockGap } from "@/lib/routeSearch";
import { parseTimeParam } from "@/lib/routePage";
import { makeT } from "@/lib/t";
import { useSharedBoard } from "./LiveBoard";
import { clockAfter } from "./LiveNow";

export interface NearRow {
  name: string;
  /** The train's page, or null: then the row opens its search result card. */
  href: string | null;
  dep: number;
  arr: number;
  /** Share 15+ min late at this route's destination; null = too few trips. */
  late: number | null;
  /** Average minutes late at this route's destination; null when not computed. */
  avg: number | null;
}

const SHOWN = 5;

/**
 * "8:14 Köln to Berlin" opens the route page with ?t=08:14. This island reads it and lists the trains that leave
 * closest to that time, in departure order, with the nearest one marked: the visitor typed a time, so the first screen
 * answers it. When the marked train leaves within the live board's two hours, today's state at both ends sits under it.
 * Without ?t it renders nothing, so the page is the same for everyone else.
 */
export function NearTime({ rows, from, to, lang }: { rows: NearRow[]; from: string; to: string; lang: Lang }) {
  const t = makeT(lang);
  const [time, setTime] = useState<number | null>(null);
  useEffect(() => {
    setTime(parseTimeParam(new URLSearchParams(window.location.search).get("t")));
  }, []);
  const board = useSharedBoard();
  if (time === null) return null;
  const byGap = [...rows].sort((a, b) => clockGap(a.dep, time) - clockGap(b.dep, time) || a.dep - b.dep);
  const hit = byGap[0];
  // Departure order, read from the typed time so 23:50 and 00:10 sort around midnight correctly.
  const rel = (m: number) => (((m - time + 720) % 1440) + 1440) % 1440;
  const near = byGap.slice(0, SHOWN).sort((a, b) => rel(a.dep) - rel(b.dep));
  const live = hit && board ? board.trains.find((x) => `${x.cat} ${x.n}` === hit.name && Number(x.pd.slice(6, 8)) * 60 + Number(x.pd.slice(8, 10)) === hit.dep) : null;
  return (
    <section className="sec near" aria-labelledby="near">
      <h2 id="near">{t("route.near.title", { time: clock(time) })}</h2>
      <p className="sec-sub">{t("route.near.sub2", { from })}</p>
      <table className="bt tt">
        <colgroup>
          <col style={{ width: 72 }} />
          <col style={{ width: 84 }} />
          <col />
          <col style={{ width: 92 }} />
        </colgroup>
        <tbody>
          {near.map((r) => {
            const href = r.href ?? `${route(lang, "home")}?q=${encodeURIComponent(r.name)}`;
            const mine = r === hit;
            return (
              <Fragment key={r.name + r.dep}>
              <tr className={`tap${mine ? " near-hit" : ""}`} aria-current={mine || undefined}>
                <td className="time">
                  {clock(r.dep)}
                  <span>{clock(r.arr)}</span>
                </td>
                <td className="tn">
                  <Link href={href} prefetch={false}>
                    {r.name}
                  </Link>
                </td>
                <td className="bar">
                  {r.late === null || r.avg === null ? null : (
                    <span>
                      <i style={{ width: `${Math.max(2, Math.min(100, (100 * Math.max(0, r.avg)) / 45))}%`, background: delayColor(r.avg) }} />
                    </span>
                  )}
                </td>
                <td className="v">
                  {r.late === null ? (
                    <small>{t("route.trains.few")}</small>
                  ) : r.avg !== null ? (
                    <>
                      {t("list.avg", { x: fmt1(Math.max(0, r.avg), lang) })}
                      <small className="wrap">{t("list.late15", { pct: fmtShare(r.late, lang) })}</small>
                    </>
                  ) : (
                    <small className="wrap">{t("list.late15", { pct: fmtShare(r.late, lang) })}</small>
                  )}
                </td>
              </tr>
              {mine && live ? (
                <tr className="near-liverow">
                  <td colSpan={4}>
                    <span className="near-today">{t("route.near.today2")}</span>
                    <span style={{ ["--c" as string]: live.canc ? LATE : liveColor(live.late) }} className="near-st">
                      {live.canc ? t("live.canc") : (live.late ?? 0) > 0 ? t("yt.depLateAt", { n: live.late ?? 0, time: clockAfter(live.pd, live.late ?? 0) }) : t("yt.depOn")}
                    </span>
                    {!live.canc && (live.arrCanc || live.pa) ? (
                      <span className="near-st" style={{ ["--c" as string]: live.arrCanc ? LATE : liveColor(live.lateArr) }}>
                        {live.arrCanc ? t("live.arrCanc", { to }) : (live.lateArr ?? 0) > 0 ? (live.pa ? t("yt.arrLateAt", { to, n: live.lateArr ?? 0, time: clockAfter(live.pa, live.lateArr ?? 0) }) : t("live.now.arrLate", { to, n: live.lateArr ?? 0 })) : t("live.now.arrOn", { to })}
                      </span>
                    ) : null}
                  </td>
                </tr>
              ) : null}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}
