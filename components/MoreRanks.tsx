"use client";

import { useId, useState } from "react";
import styles from "./MoreRanks.module.css";

/** Expander for the ranks below the headline top list. The rows are server-rendered children. */
export function MoreRanks({ label, children }: { label: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <div className={styles.more}>
      <button
        type="button"
        className={styles.button}
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((o) => !o)}
      >
        {open ? "Hide" : "Show"} {label}
        <span className={styles.chevron} aria-hidden="true" />
      </button>
      <div id={id} hidden={!open} className={styles.body}>
        {children}
      </div>
    </div>
  );
}
