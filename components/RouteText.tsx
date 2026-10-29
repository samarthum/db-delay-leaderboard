import type { UnitSummary } from "@/lib/types";
import { routeArrow } from "./pageFormat";

export function RouteText({ unit: u }: { unit: Pick<UnitSummary, "category" | "origin" | "dest"> }) {
  const arrow = routeArrow(u.category);
  return (
    <>
      {u.origin} <span aria-hidden="true">{arrow.symbol}</span>
      <span className="visually-hidden"> {arrow.words} </span> {u.dest}
    </>
  );
}
