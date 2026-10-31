"use client";

import { useState } from "react";
import type { RouteEntry } from "@/lib/types";
import type { Lang } from "@/lib/i18n";
import { makeT } from "@/lib/t";
import { RouteList } from "./RouteList";

/** Rankings, Routes tab: the busiest routes ranked by average delay, or by how often trips are 15+ min late. */
export function RouteRanking({ league, lang }: { league: RouteEntry[]; lang: Lang }) {
  const t = makeT(lang);
  const [by, setBy] = useState<"avg" | "late">("avg");
  const rows = [...league].sort((a, b) => (by === "avg" ? b.avg - a.avg : b.late - a.late)).slice(0, 10);
  return (
    <>
      <div className="seg c2 tight" role="group" aria-label={t("rank.sort.label")} style={{ marginTop: 14 }}>
        <button type="button" aria-pressed={by === "avg"} onClick={() => setBy("avg")}>
          {t("rank.sort.avg")}
        </button>
        <button type="button" aria-pressed={by === "late"} onClick={() => setBy("late")}>
          {t("rank.sort.late")}
        </button>
      </div>
      <p className="sec-sub" style={{ marginTop: 12 }}>
        {t(by === "avg" ? "rank.avg.sub" : "rank.late.sub", { n: league.length })}
      </p>
      <RouteList rows={rows} lang={lang} by={by} rank db />
    </>
  );
}
