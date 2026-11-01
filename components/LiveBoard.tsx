"use client";

import { useEffect, useState } from "react";
import { LATE, liveColor } from "@/lib/colors";
import Link from "next/link";
import { route, type Lang } from "@/lib/i18n";
import { makeT } from "@/lib/t";
import { Rich } from "./Rich";

/** One train as /api/live/ sends it. Times are DB's local wall-clock stamps, yyMMddHHmm. */
export interface LiveTrain {
  cat: string;
  n: string;
  pd: string;
  late: number | null;
  canc: boolean;
  plat: string | null;
  platChanged: boolean;
  pa: string | null;
  lateArr: number | null;
  arrCanc: boolean;
}
type Answer = { ok: true; asOf: string; trains: LiveTrain[] } | { ok: false; error: string };

const REFRESH_MS = 60_000;

// The board's latest good answer, shared with other islands on the same page (the "closest to your time" list marks
// today's state of your train from it) without a second request.
let shared: { asOf: string; trains: LiveTrain[] } | null = null;
const listeners = new Set<() => void>();
function publish(a: { asOf: string; trains: LiveTrain[] }) {
  shared = a;
  listeners.forEach((f) => f());
}
export function useSharedBoard(): { asOf: string; trains: LiveTrain[] } | null {
  const [, bump] = useState(0);
  useEffect(() => {
    const f = () => bump((x) => x + 1);
    listeners.add(f);
    return () => {
      listeners.delete(f);
    };
  }, []);
  return shared;
}
const clockOf = (stamp: string) => `${stamp.slice(6, 8)}:${stamp.slice(8, 10)}`;

/**
 * "Next trains, live" on a route page: the long-distance trains that leave the first station for the second in the next two
 * hours, with the delay Deutsche Bahn reports right now. The page itself is static; this island asks the site's own function
 * (/api/live/), which holds the API key and caches. It renders nothing until the function answers, and nothing at all where
 * live data is switched off, so a preview or an unconfigured deploy shows the same page as before.
 */
export function LiveBoard({ from, to, lang }: { from: string; to: string; lang: Lang }) {
  const t = makeT(lang);
  const [answer, setAnswer] = useState<Answer | null>(null);

  useEffect(() => {
    let alive = true;
    let busy = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const url = `/api/live/?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;
    // One chain only: a refresh starts the next one when it ends, and a request in flight blocks a second one.
    const load = async () => {
      if (busy) return;
      busy = true;
      try {
        const r = await fetch(url);
        const j = (await r.json()) as Answer & { error?: string };
        if (!alive) return;
        // Keep the last good answer when a refresh fails; "disabled" means this deploy has no live data at all.
        if (j.ok) {
          setAnswer(j);
          publish(j);
        }
        else if (j.error !== "disabled") setAnswer((prev) => (prev && prev.ok ? prev : j));
      } catch {
        /* offline, or no function on this host: show nothing new */
      } finally {
        busy = false;
      }
      clearTimeout(timer);
      if (alive && document.visibilityState === "visible") timer = setTimeout(load, REFRESH_MS);
    };
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      clearTimeout(timer);
      void load();
    };
    void load();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      alive = false;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [from, to]);

  // High on the page now: only when there is something to see. No trains soon, or the feed is down = no block.
  if (!answer || !answer.ok || answer.trains.length === 0) return null;
  return (
    <section className="blk live" aria-labelledby="live">
      <h2 id="live">
        <span className="ln-dot" aria-hidden="true" />
        {t("live.title")}
      </h2>
      <p className="sec-sub" style={{ fontSize: 15 }}>{t("live.sub.short", { from })}</p>
      {!answer.ok ? (
        <p className="live-note">{t("live.unavailable")}</p>
      ) : answer.trains.length === 0 ? (
        <p className="live-note">{t("live.empty", { from, to })}</p>
      ) : (
        <table className="bt tt">
          <colgroup>
            <col style={{ width: 104 }} />
            <col style={{ width: 80 }} />
            <col />
          </colgroup>
          <tbody>
            {answer.trains.map((r) => {
              const status = r.canc ? t("live.canc") : r.late ? t("live.late", { n: r.late }) : t("live.onTime");
              const color = r.canc ? LATE : liveColor(r.late);
              const arrival = r.canc
                ? null
                : r.arrCanc
                  ? t("live.arrCanc", { to })
                  : r.lateArr === null
                    ? null
                    : r.lateArr > 0
                      ? t("live.arrLate", { n: r.lateArr })
                      : t("live.arrOn");
              return (
                <tr key={`${r.cat}${r.n}${r.pd}`} className={r.canc ? "cx" : undefined}>
                  <td className="time">
                    <span className="at">{clockOf(r.pd)}</span>
                    {r.plat ? <span>{r.platChanged ? t("live.platNew", { p: r.plat }) : t("live.plat", { p: r.plat })}</span> : null}
                  </td>
                  <td className="tn">
                    <Link href={`${route(lang, "home")}?q=${encodeURIComponent(`${r.cat} ${r.n}`)}`} prefetch={false}>
                      {r.cat} {r.n}
                    </Link>
                  </td>
                  <td className="st">
                    <b style={{ ["--c" as string]: color }}>{status}</b>
                    {arrival ? <small>{arrival}</small> : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      <p className="live-src">
        {answer.ok ? `${t("live.updated", { time: clockOf(answer.asOf) })} ` : null}
        <Rich text={t("live.source")} />
      </p>
    </section>
  );
}
