"use client";

import Link from "next/link";
import { useState } from "react";
import type { RouteTrain } from "@/lib/types";
import { lateShareColor } from "@/lib/colors";
import { fmtShare } from "@/lib/format";
import type { Lang } from "@/lib/i18n";
import { clock } from "@/lib/routeSearch";
import { makeT } from "@/lib/t";

const SHOWN = 10;

/** One row per train: departure over arrival, the train, its 15+ min share. `href` is null when the train has no page. */
export interface TrainRow {
  t: RouteTrain;
  href: string | null;
}

function Rows({ rows, lang }: { rows: TrainRow[]; lang: Lang }) {
  const t = makeT(lang);
  return (
    <>
      {rows.map(({ t: tr, href }) => {
        const name = `${tr[0]} ${tr[1]}`;
        return (
          <tr key={name + tr[2]} className={tr[4] === null ? "few ro" : "tap"}>
            <td className="time">
              {clock(tr[2])}
              <span>{clock(tr[3])}</span>
            </td>
            <td className="tn">{href ? <Link href={href} prefetch={false}>{name}</Link> : name}</td>
            <td className="bar">
              {tr[4] === null ? null : (
                <span>
                  <i style={{ width: `${tr[4]}%`, background: lateShareColor(tr[4]) }} />
                </span>
              )}
            </td>
            <td className="v">{tr[4] === null ? <small>{t("route.trains.few")}</small> : fmtShare(tr[4], lang)}</td>
          </tr>
        );
      })}
    </>
  );
}

function Table({ rows, lang, head }: { rows: TrainRow[]; lang: Lang; head?: boolean }) {
  const t = makeT(lang);
  return (
    <table className="bt tt">
      <colgroup>
        <col style={{ width: 72 }} />
        <col style={{ width: 84 }} />
        <col />
        <col style={{ width: 64 }} />
      </colgroup>
      {head ? (
        <thead>
          <tr>
            <th>{t("route.th.dep")}</th>
            <th>{t("route.th.train")}</th>
            <th />
            <th className="r">{t("route.th.late")}</th>
          </tr>
        </thead>
      ) : null}
      <tbody>
        <Rows rows={rows} lang={lang} />
      </tbody>
    </table>
  );
}

/**
 * "Which train do I take?": the route's trains in departure order, or most punctual first. One toggle swaps the
 * order in place; ten rows show, the rest open under them.
 */
export function TrainList({ rows, lang }: { rows: TrainRow[]; lang: Lang }) {
  const t = makeT(lang);
  const [best, setBest] = useState(false);
  const list = best
    ? [...rows].sort((a, b) => (a.t[4] === null ? 1 : 0) - (b.t[4] === null ? 1 : 0) || (a.t[4] ?? 0) - (b.t[4] ?? 0) || a.t[2] - b.t[2])
    : rows;
  const shown = list.slice(0, SHOWN);
  const rest = list.slice(SHOWN);
  return (
    <>
      <div className="seg c2 tight" role="group" aria-label={t("route.sort.label")}>
        <button type="button" aria-pressed={!best} onClick={() => setBest(false)}>
          {t("route.sort.time")}
        </button>
        <button type="button" aria-pressed={best} onClick={() => setBest(true)}>
          {t("route.sort.best")}
        </button>
      </div>
      <Table rows={shown} lang={lang} head />
      {rest.length > 0 ? (
        <details className="disc" key={best ? "b" : "t"}>
          <summary>{t("route.trains.more", { n: rows.length })}</summary>
          <Table rows={rest} lang={lang} />
        </details>
      ) : null}
    </>
  );
}
