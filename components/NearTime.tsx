"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { lateShareColor } from "@/lib/colors";
import { fmtShare } from "@/lib/format";
import type { Lang } from "@/lib/i18n";
import { clock, clockGap } from "@/lib/routeSearch";
import { parseTimeParam } from "@/lib/routePage";
import { makeT } from "@/lib/t";

export interface NearRow {
  name: string;
  href: string | null;
  dep: number;
  arr: number;
  late: number | null;
}

const SHOWN = 3;

/**
 * "8:14 Köln to Berlin" opens the route page with ?t=08:14. This island reads it and lists the trains that leave
 * closest to that time, directly under the figure: the visitor typed a time, so the first screen answers it.
 * Without ?t it renders nothing, so the page is the same for everyone else.
 */
export function NearTime({ rows, from, lang }: { rows: NearRow[]; from: string; lang: Lang }) {
  const t = makeT(lang);
  const [time, setTime] = useState<number | null>(null);
  useEffect(() => {
    setTime(parseTimeParam(new URLSearchParams(window.location.search).get("t")));
  }, []);
  if (time === null) return null;
  const near = [...rows].sort((a, b) => clockGap(a.dep, time) - clockGap(b.dep, time) || a.dep - b.dep).slice(0, SHOWN);
  return (
    <section className="sec" aria-labelledby="near">
      <h2 id="near">{t("route.near.title", { time: clock(time) })}</h2>
      <p className="sec-sub">{t("route.near.sub", { from })}</p>
      <table className="bt tt">
        <colgroup>
          <col style={{ width: 72 }} />
          <col style={{ width: 84 }} />
          <col />
          <col style={{ width: 64 }} />
        </colgroup>
        <tbody>
          {near.map((r) => (
            <tr key={r.name} className={r.late === null ? "few ro" : "tap"}>
              <td className="time">
                {clock(r.dep)}
                <span>{clock(r.arr)}</span>
              </td>
              <td className="tn">{r.href ? <Link href={r.href} prefetch={false}>{r.name}</Link> : r.name}</td>
              <td className="bar">
                {r.late === null ? null : (
                  <span>
                    <i style={{ width: `${r.late}%`, background: lateShareColor(r.late) }} />
                  </span>
                )}
              </td>
              <td className="v">{r.late === null ? <small>{t("route.trains.few")}</small> : fmtShare(r.late, lang)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
