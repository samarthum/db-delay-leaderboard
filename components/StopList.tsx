"use client";

import { Children, useRef, useState, type ReactNode } from "react";
import type { Lang } from "@/lib/i18n";
import { makeT } from "@/lib/t";
import styles from "./RouteStrip.module.css";

export interface StopListProps {
  children: ReactNode;
  className?: string;
  "aria-label"?: string;
  lang?: Lang;
  total: number;
  collapsible: boolean;
  /** Position of the "show all" row; items marked data-mid are hidden on phones until expanded. */
  moreIndex: number;
}

/** Client island for RouteStrip: every stop stays in the HTML, phones see the middle collapsed. */
export function StopList({ children, className, total, collapsible, moreIndex, lang = "en", ...aria }: StopListProps) {
  const t = makeT(lang);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLOListElement>(null);
  const items = Children.toArray(children);
  const collapsed = collapsible && !open;

  const expand = () => {
    setOpen(true);
    requestAnimationFrame(() => ref.current?.querySelector<HTMLElement>("[data-mid]")?.focus());
  };

  return (
    <ol ref={ref} className={className} data-collapsed={collapsed || undefined} {...aria}>
      {items.slice(0, moreIndex)}
      {collapsed && (
        <li className={styles.more}>
          <span className={styles.moreRail} aria-hidden="true" />
          <button type="button" className={styles.moreButton} aria-expanded={false} onClick={expand}>
            {t("strip.showAll", { n: total })}
          </button>
        </li>
      )}
      {items.slice(moreIndex)}
    </ol>
  );
}
