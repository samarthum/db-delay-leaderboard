import type { UnitSummary } from "@/lib/types";
import type { Lang } from "@/lib/i18n";
import { routeArrow } from "./pageFormat";

export function RouteText({ unit: u, lang = "en" }: { unit: Pick<UnitSummary, "category" | "origin" | "dest">; lang?: Lang }) {
  const arrow = routeArrow(lang, u.category);
  return (
    <>
      {u.origin} <span aria-hidden="true">{arrow.symbol}</span>
      <span className="visually-hidden"> {arrow.words} </span> {u.dest}
    </>
  );
}
