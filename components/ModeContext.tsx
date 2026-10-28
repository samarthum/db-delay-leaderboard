"use client";

import { createContext, useContext, useMemo, useState } from "react";
import type { Mode } from "@/lib/types";

interface ModeState {
  mode: Mode;
  setMode: (m: Mode) => void;
}

const ModeCtx = createContext<ModeState | null>(null);

/** Shared minutes/percent toggle. The leaderboard and the map both follow it. */
export function ModeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setMode] = useState<Mode>("minutes");
  const value = useMemo(() => ({ mode, setMode }), [mode]);
  return <ModeCtx.Provider value={value}>{children}</ModeCtx.Provider>;
}

export function useMode(): ModeState {
  const ctx = useContext(ModeCtx);
  if (!ctx) throw new Error("useMode must be used inside <ModeProvider>");
  return ctx;
}
