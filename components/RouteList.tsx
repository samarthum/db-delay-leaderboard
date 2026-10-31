import Link from "next/link";
import type { RouteEntry } from "@/lib/types";
import { delayColor, lateShareColor } from "@/lib/colors";
import { fmt1, fmtShare } from "@/lib/format";
import { route, type Lang } from "@/lib/i18n";
import { makeT } from "@/lib/t";
import { RouteName } from "./Arrow";

/** Bar scale for average minutes late: the busiest routes run from about 3 to 33 min. */
const SCALE = 35;

/**
 * A list of routes, one row each: the route name, a bar and the average delay in minutes. `by="late"` shows the
 * share 15+ min late instead (Rankings, "Most often late"). `rank` prints the position; `wideOnlyFrom` hides rows
 * from that index on phones.
 */
export function RouteList({ rows, lang, by = "avg", rank = false, db = false, wideOnlyFrom }: { rows: RouteEntry[]; lang: Lang; by?: "avg" | "late"; rank?: boolean; db?: boolean; wideOnlyFrom?: number }) {
  const t = makeT(lang);
  return (
    <table className="bt">
      <colgroup>
        {rank ? <col style={{ width: 28 }} /> : null}
        <col />
        <col style={{ width: 44 }} />
        <col style={{ width: 92 }} />
      </colgroup>
      <tbody>
        {rows.map((r, i) => {
          const v = by === "avg" ? r.avg : r.late;
          const w = by === "avg" ? Math.min(100, (100 * Math.max(0, r.avg)) / SCALE) : r.late;
          const color = by === "avg" ? delayColor(r.avg) : lateShareColor(r.late);
          return (
            <tr key={r.slug} className={`tap${wideOnlyFrom !== undefined && i >= wideOnlyFrom ? " wide-only" : ""}`}>
              {rank ? <td className="rk">{i + 1}</td> : null}
              <td className="two">
                <Link href={route(lang, "route", r.slug)} prefetch={false}>
                  <b>
                    <RouteName from={r.from} to={r.to} word={t("route.to")} />
                  </b>
                </Link>
              </td>
              <td className="bar">
                <span>
                  <i style={{ width: `${Math.max(2, w)}%`, background: color }} />
                </span>
              </td>
              <td className="v">
                {by === "avg" ? t("list.avg", { x: fmt1(v, lang) }) : fmtShare(v, lang)}
                {db && by === "late" ? <small>{t("rank.db", { pct: fmtShare(r.late6, lang) })}</small> : null}
                {by === "avg" ? <small className="wrap">{t("list.late15", { pct: fmtShare(r.late, lang) })}</small> : null}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
