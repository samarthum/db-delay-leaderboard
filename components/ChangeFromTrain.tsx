"use client";

import { useEffect, useState } from "react";
import { lateShareColor } from "@/lib/colors";
import { WALK_FAST, WALK_SLOW, readSlow, writeSlow } from "@/lib/connections";
import { fmtShare } from "@/lib/format";
import type { Lang } from "@/lib/i18n";
import { clock } from "@/lib/routeSearch";
import { shortStation } from "@/lib/routeSlug";
import { makeT } from "@/lib/t";
import styles from "./ConnectionCard.module.css";

/** [departing train, usual planned change time, days, next train cancelled, worked with 2 min, worked with 6 min, departs (min), to] */
export type PairRow = [string, number, number, number, number, number, number, string];

/**
 * On a train's page: "Changing from ICE 1541?" Pick the station where you get off, see the trains that leave soon
 * after and how often each change worked. Nothing to type; the lists come with the page.
 */
export function ChangeFromTrain({ train, lists, lang }: { train: string; lists: Record<string, PairRow[]>; lang: Lang }) {
  const t = makeT(lang);
  const stations = Object.keys(lists);
  const [station, setStation] = useState<string>(stations[0] ?? "");
  const [slow, setSlow] = useState(false);
  useEffect(() => setSlow(readSlow()), []);
  if (stations.length === 0) return null;

  const rows = lists[station] ?? [];
  return (
    <section className={styles.trainSection} aria-labelledby="change-from">
      <h2 id="change-from" className={styles.trainTitle}>
        {t("conn.train.title", { train })}
      </h2>
      <p className={styles.sub}>{t("conn.train.sub")}</p>

      <div className={styles.stations} role="group" aria-label={t("conn.station")}>
        {stations.map((s) => (
          <button key={s} type="button" className={styles.chip} aria-pressed={station === s} onClick={() => setStation(s)}>
            {shortStation(s)}
          </button>
        ))}
      </div>

      {rows.length === 0 ? (
        <p className={styles.note}>{t("conn.train.none", { station: shortStation(station) })}</p>
      ) : (
        <ul className={styles.pairs}>
          {rows.map((r) => {
            const pct = (100 * (slow ? r[5] : r[4])) / r[2];
            return (
              <li key={r[0] + r[6]} className={styles.pair}>
                <span className={styles.pairMain}>{t("conn.train.row", { time: clock(r[6]), train: r[0], dest: shortStation(r[7] || "—") })}</span>
                <span className={styles.pairSub}>{t("conn.train.usual", { gap: r[1] })}</span>
                <span className={styles.pairPct} style={{ color: lateShareColor(100 - pct) }}>
                  {t("conn.train.pct", { pct: fmtShare(pct, lang), n: r[2] })}
                </span>
              </li>
            );
          })}
        </ul>
      )}

      <label className={styles.toggle}>
        <input
          type="checkbox"
          checked={slow}
          onChange={(e) => {
            setSlow(e.target.checked);
            writeSlow(e.target.checked);
          }}
        />
        <span>{t("conn.walk")}</span>
      </label>
      <p className={styles.note}>{t("conn.walkHint", { fast: WALK_FAST, slow: WALK_SLOW })}</p>
    </section>
  );
}
