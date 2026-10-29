"use client";

import { useRef, useState } from "react";
import type { Mode } from "@/lib/types";
import { useMode } from "./ModeContext";
import { MODES as MODE_COPY } from "./pageFormat";
import styles from "./ModeToggle.module.css";

const MODES: Mode[] = ["minutes", "percent"];

export function ModeToggle() {
  const { mode, setMode } = useMode();
  const refs = useRef<Record<Mode, HTMLButtonElement | null>>({ minutes: null, percent: null });

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight" && e.key !== "Home" && e.key !== "End") return;
    e.preventDefault();
    const next = e.key === "Home" ? MODES[0] : e.key === "End" ? MODES[1] : mode === "minutes" ? "percent" : "minutes";
    setMode(next);
    refs.current[next]?.focus();
  }

  return (
    <div className={styles.toggle} role="tablist" aria-label="Rank trains" data-mode={mode}>
      <span className={styles.thumb} aria-hidden="true" />
      {MODES.map((m) => (
        <button
          key={m}
          ref={(el) => {
            refs.current[m] = el;
          }}
          type="button"
          role="tab"
          id={`tab-${m}`}
          aria-selected={mode === m}
          aria-controls={`panel-${m}`}
          tabIndex={mode === m ? 0 : -1}
          className={styles.tab}
          onClick={() => setMode(m)}
          onKeyDown={onKeyDown}
        >
          {MODE_COPY[m].tab}
        </button>
      ))}
    </div>
  );
}

/** Server-rendered ranking for one mode; only the active one is shown. Animates in after the first switch. */
export function ModePanel({ mode, children }: { mode: Mode; children: React.ReactNode }) {
  const { mode: active } = useMode();
  const [initial] = useState(active);
  const [switched, setSwitched] = useState(false);
  if (!switched && active !== initial) setSwitched(true);

  return (
    <div
      role="tabpanel"
      id={`panel-${mode}`}
      aria-labelledby={`tab-${mode}`}
      hidden={active !== mode}
      data-switched={switched || undefined}
    >
      {children}
    </div>
  );
}
