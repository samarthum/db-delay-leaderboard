"use client";

import { useEffect, useState } from "react";
import { delayColor, LATE } from "@/lib/colors";
import type { Lang } from "@/lib/i18n";
import { makeT } from "@/lib/t";

/** Today's run of one train as /api/live/?train= sends it. Stamps are DB local time, yyMMddHHmm. */
export interface LiveRun {
  found: boolean;
  state?: "soon" | "running" | "arrived" | "cancelled";
  pd: string;
  late?: number | null;
  canc?: boolean;
  plat?: string | null;
  platChanged?: boolean;
  pa?: string | null;
  lateArr?: number | null;
  arrCanc?: boolean;
  asOf?: string;
}
type Answer = { ok: true; from: string; to: string; run: LiveRun | null } | { ok: false; error: string };

const REFRESH_MS = 60_000;
export const clockOf = (stamp: string) => `${stamp.slice(6, 8)}:${stamp.slice(8, 10)}`;

/** Fetches today's run of `train` once a minute while the tab is visible. null until there is something to show. */
export function useLiveRun(train: string | null): { run: LiveRun; from: string; to: string } | null {
  const [ans, setAns] = useState<{ run: LiveRun; from: string; to: string } | null>(null);
  useEffect(() => {
    if (!train) return;
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const load = async () => {
      try {
        const r = await fetch(`/api/live/?train=${encodeURIComponent(train)}`);
        const j = (await r.json()) as Answer;
        if (!alive) return;
        if (j.ok) setAns(j.run && j.run.found ? { run: j.run, from: j.from, to: j.to } : null);
      } catch {
        /* offline or no function on this host */
      }
      clearTimeout(timer);
      if (alive && document.visibilityState === "visible") timer = setTimeout(load, REFRESH_MS);
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        clearTimeout(timer);
        void load();
      }
    };
    void load();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      alive = false;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [train]);
  return ans;
}

/** "No delay reported" / "12 min late" / "Cancelled", with its colour. */
export function statusOf(run: LiveRun, t: ReturnType<typeof makeT>): { text: string; color: string } {
  if (run.canc) return { text: t("live.canc"), color: LATE };
  const n = run.late ?? 0;
  return { text: n > 0 ? t("live.late", { n }) : t("live.onTime"), color: delayColor(n) };
}

/**
 * Top of a train page when the train runs in the next hours (or is on its way): today's departure, platform and the
 * delay Deutsche Bahn reports now, then the arrival at the last stop. The history figure follows directly under it.
 * Renders nothing when the train is not running soon, the feed has no record of it, or live data is off.
 */
export function LiveNow({ train, lang }: { train: string; lang: Lang }) {
  const t = makeT(lang);
  const a = useLiveRun(train);
  if (!a) return null;
  const { run, from, to } = a;
  const s = statusOf(run, t);
  const arrival = run.canc
    ? null
    : run.arrCanc
      ? t("live.arrCanc", { to })
      : run.lateArr === null || run.lateArr === undefined
        ? null
        : run.lateArr > 0
          ? t("live.now.arrLate", { to, n: run.lateArr })
          : t("live.now.arrOn", { to });
  return (
    <section className="livenow" aria-label={t("live.now.title")} data-state={run.state}>
      <p className="ln-head">
        <span className="ln-dot" aria-hidden="true" />
        {t("live.now.title")} · {t("live.now.leaves", { time: clockOf(run.pd), from })}
        {run.plat ? ` · ${run.platChanged ? t("live.platNew", { p: run.plat }) : t("live.plat", { p: run.plat })}` : ""}
      </p>
      <p className="ln-status" style={{ ["--c" as string]: s.color }}>
        {s.text}
      </p>
      {arrival ? <p className="ln-arr">{arrival}</p> : null}
      <p className="ln-src">{t("live.now.src", { time: run.asOf ? clockOf(run.asOf) : "" })}</p>
    </section>
  );
}
