"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { route, type Lang } from "@/lib/i18n";
import { timeParam } from "@/lib/routePage";
import { clock, type RawStop } from "@/lib/routeSearch";
import { routeSlug, shortStation } from "@/lib/routeSlug";
import { loadRouteTable, loadStops } from "@/lib/searchClient";
import { makeT } from "@/lib/t";

interface Stop {
  name: string;
  /** Planned departure (or arrival at the last stop), minutes after midnight. */
  time: number | null;
}

/**
 * "Getting on or off at another station?" under the live box of a train page or search card: the train's own German
 * stops in running order, from the per-stop data. Tap where you get on, then where you get off; that opens the route
 * between your two stops with this train's time, where the live board shows both of your ends and the train's own
 * average for exactly that pair (no per-stop figures here: they come from a different set of runs and would not match).
 * Renders nothing when the per-stop data has no record of the train.
 */
export function OwnStops({ train, lang }: { train: string; lang: Lang }) {
  const t = makeT(lang);
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [stops, setStops] = useState<Stop[] | null>(null);
  const [on, setOn] = useState<number | null>(null);
  useEffect(() => {
    let alive = true;
    const [type, num] = train.split(" ");
    loadStops().then(
      (idx) => {
        // A number can have several timetable variants: take the one with the most stops.
        const runs = idx.raw.trains.filter((x) => x[0] === type && x[1] === num).sort((a, b) => b[2].length - a[2].length);
        if (!alive || !runs[0]) return;
        setStops(runs[0][2].map((s: RawStop) => ({ name: idx.raw.stations[s[0]], time: s[1] ?? s[2] })));
      },
      () => undefined,
    );
    return () => {
      alive = false;
    };
  }, [train]);
  if (!stops || stops.length < 3) return null;

  function pick(i: number) {
    if (on === null) return setOn(i);
    if (i <= on || !stops) return;
    const a = stops[on];
    const b = stops[i];
    const time = a.time;
    loadRouteTable().then((table) => {
      const slug = routeSlug(a.name, b.name);
      if (table[slug]) router.push(route(lang, "route", slug) + (time !== null ? `?t=${timeParam(time)}` : ""));
      else {
        const q = `${time !== null ? `${clock(time)} ` : ""}${shortStation(a.name)} ${lang === "de" ? "nach" : "to"} ${shortStation(b.name)}`;
        router.push(`${route(lang, "home")}?${new URLSearchParams({ q, r: "1" }).toString()}`);
      }
    });
  }

  return (
    <section className="own" aria-labelledby="own-h">
      <button type="button" className="own-toggle" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span id="own-h">{t("own.toggle")}</span>
        <small>{t("own.toggleSub")}</small>
      </button>
      {open ? (
        <div className="own-body">
          <p className="own-step" aria-live="polite">
            {on === null ? t("own.stepOn", { train }) : t("own.stepOff", { from: shortStation(stops[on].name) })}
            {on !== null ? (
              <button type="button" className="own-reset" onClick={() => setOn(null)}>
                {t("own.reset")}
              </button>
            ) : null}
          </p>
          <ol className="own-list">
            {stops.map((s, i) => {
              const chosen = i === on;
              const usable = on === null ? i < stops.length - 1 : i > on;
              return (
                <li key={`${s.name}${i}`}>
                  <button type="button" className={chosen ? "own-row own-on" : "own-row"} disabled={!usable && !chosen} aria-pressed={chosen} onClick={() => pick(i)}>
                    <span className="own-time">{s.time === null ? "" : clock(s.time)}</span>
                    <span className="own-name">{shortStation(s.name)}</span>
                  </button>
                </li>
              );
            })}
          </ol>
          <p className="own-fine">{t("own.fine")}</p>
        </div>
      ) : null}
    </section>
  );
}
