"use client";

import { useEffect, useState } from "react";
import { successColor } from "@/lib/colors";
import { readSlow, writeSlow } from "@/lib/connections";
import { fmtInt, fmtShare } from "@/lib/format";
import type { Lang } from "@/lib/i18n";
import { clock } from "@/lib/routeSearch";
import { shortStation } from "@/lib/routeSlug";
import { makeT } from "@/lib/t";

/** [departing train, usual planned change time, days, next train cancelled, worked with 2 min, worked with 6 min, departs (min), to] */
export type PairRow = [string, number, number, number, number, number, number, string];

/**
 * On a train's page, right after the figure: "Changing from ICE 1541?" Pick the station where you get off and see the
 * trains that leave soon after and how often each change worked. Nothing to type; the lists come with the page.
 */
export function ChangeFromTrain({ train, latePct, lists, lang }: { train: string; latePct: number; lists: Record<string, PairRow[]>; lang: Lang }) {
  const t = makeT(lang);
  const stations = Object.keys(lists);
  const [station, setStation] = useState<string>(stations[0] ?? "");
  const [slow, setSlow] = useState(false);
  useEffect(() => setSlow(readSlow()), []);
  if (stations.length === 0) return null;

  const rows = [...(lists[station] ?? [])].sort((a, b) => a[1] - b[1]);
  return (
    <section className="sec" aria-labelledby="change-from">
      <h2 id="change-from">{t("conn.train.title", { train })}</h2>
      <p className="sec-sub">{t("conn.train.sub")}</p>

      <div className="seg c2" role="group" aria-label={t("conn.station")}>
        {stations.map((s) => (
          <button key={s} type="button" aria-pressed={station === s} onClick={() => setStation(s)}>
            {shortStation(s)}
          </button>
        ))}
      </div>
      <div className="seg c2" role="group" aria-label={t("conn.q3")}>
        {([false, true] as const).map((v) => (
          <button
            key={String(v)}
            type="button"
            aria-pressed={slow === v}
            onClick={() => {
              setSlow(v);
              writeSlow(v);
            }}
          >
            {t(v ? "conn.p6" : "conn.p2")}
          </button>
        ))}
      </div>

      {rows.length === 0 ? (
        <p className="note" style={{ marginTop: 12 }}>
          {t("conn.train.none", { station: shortStation(station) })}
        </p>
      ) : (
        <table className="bt">
          <colgroup>
            <col />
            <col style={{ width: 64 }} />
            <col style={{ width: 52 }} />
          </colgroup>
          <thead>
            <tr>
              <th>{t("conn.train.th", { station: shortStation(station) })}</th>
              <th />
              <th className="r">{t("conn.worked")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const pct = (100 * (slow ? r[5] : r[4])) / r[2];
              return (
                <tr key={r[0] + r[6]} className="tap">
                  <td className="two">
                    <b>{t("conn.train.row", { time: clock(r[6]), train: r[0], dest: shortStation(r[7] || "—") })}</b>
                    <span>{t("conn.train.usual", { gap: r[1], n: fmtInt(r[2], lang) })}</span>
                  </td>
                  <td className="bar">
                    <span>
                      <i style={{ width: `${Math.max(0.8, pct)}%`, background: successColor(pct) }} />
                    </span>
                  </td>
                  <td className="v">{fmtShare(pct, lang)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      <p className="note" style={{ marginTop: 10 }}>
        {t("conn.train.note", { train, pct: fmtShare(latePct, lang) })}
      </p>
    </section>
  );
}
