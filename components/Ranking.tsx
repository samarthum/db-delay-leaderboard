"use client";

import { createContext, useContext, useMemo, useState } from "react";
import type { Category, Mode } from "@/lib/types";
import { Toggle } from "./Toggle";
import type { Lang } from "@/lib/i18n";
import { makeT } from "@/lib/t";
import { categoryCopy, modeCopy } from "./pageFormat";

interface RankingState {
  category: Category;
  mode: Mode;
  setCategory: (c: Category) => void;
  setMode: (m: Mode) => void;
}

const RankingCtx = createContext<RankingState | null>(null);

function useRanking(): RankingState {
  const ctx = useContext(RankingCtx);
  if (!ctx) throw new Error("useRanking must be used inside <RankingProvider>");
  return ctx;
}

/** Which list the leaderboard shows: long-distance trains or regional lines, by minutes or by % of trip. */
export function RankingProvider({ children }: { children: React.ReactNode }) {
  const [category, setCategory] = useState<Category>("longDistance");
  const [mode, setMode] = useState<Mode>("minutes");
  const value = useMemo(() => ({ category, mode, setCategory, setMode }), [category, mode]);
  return <RankingCtx.Provider value={value}>{children}</RankingCtx.Provider>;
}

export function RankingControls({ lang }: { lang: Lang }) {
  const { category, mode, setCategory, setMode } = useRanking();
  const t = makeT(lang);
  return (
    <>
      <Toggle
        label={t("ranking.toggleCat")}
        idPrefix="category"
        value={category}
        onChange={setCategory}
        options={[
          { value: "longDistance", label: categoryCopy(lang, "longDistance").tab },
          { value: "regional", label: categoryCopy(lang, "regional").tab },
        ]}
      />
      <Toggle
        label={t("ranking.toggleMode")}
        idPrefix="mode"
        value={mode}
        onChange={setMode}
        options={[
          { value: "minutes", label: modeCopy(lang, "minutes").tab },
          { value: "percent", label: modeCopy(lang, "percent").tab },
        ]}
      />
    </>
  );
}

/** Server-rendered list for one category and mode; only the active one is shown. Animates in after the first switch. */
export function RankingPanel({ category, mode, lang, children }: { category: Category; mode: Mode; lang: Lang; children: React.ReactNode }) {
  const t = makeT(lang);
  const active = useRanking();
  const [initial] = useState(`${active.category}/${active.mode}`);
  const [switched, setSwitched] = useState(false);
  const current = `${active.category}/${active.mode}`;
  if (!switched && current !== initial) setSwitched(true);

  return (
    <div
      role="tabpanel"
      aria-label={t("ranking.panel", { cat: categoryCopy(lang, category).tab, mode: modeCopy(lang, mode).tab })}
      hidden={current !== `${category}/${mode}`}
      data-switched={switched || undefined}
    >
      {children}
    </div>
  );
}
