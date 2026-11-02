/**
 * The stops a visitor gets on and off at, carried in the address of a train page or search card: ?on=<station>&off=
 * <station> (station names as in the search data, e.g. "Amsterdam Centraal", "Düsseldorf Hbf"). A route search
 * ("Amsterdam to Düsseldorf") adds them when a train is picked, so the page shows live times and history at those two
 * stops instead of the train's first and last German station.
 */
export interface TripParams {
  on: string;
  off: string;
}

export function tripFromUrl(search: string): TripParams | null {
  const p = new URLSearchParams(search);
  const on = (p.get("on") ?? "").trim();
  const off = (p.get("off") ?? "").trim();
  return on && off && on !== off && on.length <= 80 && off.length <= 80 ? { on, off } : null;
}

/** "?on=…&off=…" (with a leading "&" when `join` is set), or "" without a trip. */
export function tripQuery(trip: TripParams | null | undefined, join = false): string {
  if (!trip) return "";
  const q = new URLSearchParams({ on: trip.on, off: trip.off }).toString();
  return `${join ? "&" : "?"}${q}`;
}
