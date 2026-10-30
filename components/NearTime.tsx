"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { lateShareColor } from "@/lib/colors";
import { fmtShare1 } from "@/lib/format";
import type { Lang } from "@/lib/i18n";
import { clock, clockGap } from "@/lib/routeSearch";
import { parseTimeParam } from "@/lib/routePage";
import { makeT } from "@/lib/t";
import styles from "./pages/RoutePage.module.css";

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
 * closest to that time first. Without ?t it renders nothing, so the page is the same for everyone else.
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
    <section className={styles.section} aria-labelledby="near">
      <h2 id="near" className={styles.h2}>
        {t("route.near.title", { time: clock(time) })}
      </h2>
      <p className={styles.sub}>{t("route.near.sub", { from })}</p>
      <ul className={styles.trains}>
        {near.map((r) => {
          const body = (
            <>
              <span className={styles.trainName}>{r.name}</span>
              <span className={styles.trainTimes}>
                {clock(r.dep)} → {clock(r.arr)}
              </span>
              {r.late === null ? (
                <span className={styles.trainFew}>{t("route.trains.few")}</span>
              ) : (
                <span className={styles.trainPct} style={{ color: lateShareColor(r.late) }}>
                  {fmtShare1(r.late, lang)}
                </span>
              )}
            </>
          );
          return (
            <li key={r.name} className={styles.train}>
              {r.href ? (
                <Link href={r.href} prefetch={false}>
                  {body}
                </Link>
              ) : (
                <div>{body}</div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
