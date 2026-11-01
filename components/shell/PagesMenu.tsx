"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import type { Lang } from "@/lib/i18n";
import { makeT } from "@/lib/t";
import { FOOTER_LINKS, isActive } from "./nav";
import styles from "./Shell.module.css";

/**
 * Phones only (the desktop header lists these pages itself): a "Menu" button in the header that drops a short list
 * of the pages that are not tabs, Compensation first. A disclosure, not an ARIA menu: plain links in a list, so
 * screen readers and Tab work as on any link list. Esc closes and returns focus to the button; a tap or focus outside
 * closes; the panel floats over the page, so opening it moves nothing.
 */
export function PagesMenu({ lang }: { lang: Lang }) {
  const t = makeT(lang);
  const pathname = usePathname() ?? "/";
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const id = useId();

  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (!open) return;
    const outside = (e: Event) => {
      if (wrap.current && e.target instanceof Node && !wrap.current.contains(e.target)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setOpen(false);
      btn.current?.focus();
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("focusin", outside);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("focusin", outside);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  return (
    <div ref={wrap} className={styles.menuWrap}>
      <button ref={btn} type="button" className={styles.menuBtn} data-here={FOOTER_LINKS.some((i) => isActive(i, pathname)) || undefined} aria-expanded={open} aria-controls={id} onClick={() => setOpen((o) => !o)}>
        {t("nav.pages")}
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true" focusable="false" className={styles.chev}>
          <path d="M2 4.5l4 4 4-4" />
        </svg>
      </button>
      <nav id={id} className={styles.menu} aria-label={t("nav.pages")} hidden={!open}>
        <ul>
          {FOOTER_LINKS.map((item) => (
            <li key={item.key}>
              <Link href={item.href(lang)} prefetch={false} aria-current={isActive(item, pathname) ? "page" : undefined} onClick={() => setOpen(false)}>
                <b>{t(item.label)}</b>
                {item.sub && <small>{t(item.sub)}</small>}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
