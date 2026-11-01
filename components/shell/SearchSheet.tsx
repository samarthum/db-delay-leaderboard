"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { flushSync } from "react-dom";
import { isHome, readRecent, type Recent } from "@/lib/recent";
import { readSaved } from "@/lib/saved";
import { fmt1 } from "@/lib/format";
import type { Lang } from "@/lib/i18n";
import { makeT } from "@/lib/t";
import { Search } from "../search/Search";
import styles from "./Shell.module.css";

/**
 * The one way into search from any page: a magnifier in the header opens a full-screen sheet with the box focused and
 * the pages you looked at last under it. Replaces the "Your own trip?" box that sat at the end of every page.
 * Hidden on the home page, which is the search page.
 */
export function SearchSheet({ lang }: { lang: Lang }) {
  const t = makeT(lang);
  const pathname = usePathname() ?? "/";
  const [open, setOpen] = useState(false);
  const [recent, setRecent] = useState<Recent[]>([]);
  const [initial, setInitial] = useState<string | undefined>(undefined);

  useEffect(() => setOpen(false), [pathname]);
  // The home page's box opens this sheet on phones. Open and focus in the same tap, so phones show the keyboard.
  useEffect(() => {
    const go = (e: Event) => {
      const detail = (e as CustomEvent<string | undefined>).detail;
      flushSync(() => {
        setInitial(typeof detail === "string" ? detail : undefined);
        setOpen(true);
      });
      document.querySelector<HTMLInputElement>(`.${styles.sheet} input[type=search]`)?.focus();
    };
    const close = () => setOpen(false);
    window.addEventListener("gp:search", go);
    window.addEventListener("gp:url", close);
    return () => {
      window.removeEventListener("gp:search", go);
      window.removeEventListener("gp:url", close);
    };
  }, []);
  useEffect(() => {
    if (!open) return;
    // Starred trains and routes first (they are what a returning rider looks for), then pages looked at lately.
    const saved: Recent[] = readSaved(lang).map((s) => ({ href: s.href, title: s.title, sub: s.sub, value: t("list.avg", { x: fmt1(Math.max(0, s.avg), lang) }) }));
    const seen = new Set(saved.map((s) => s.href));
    setRecent([...saved, ...readRecent(lang).filter((r) => !seen.has(r.href))].filter((r) => r.href !== pathname).slice(0, 8));
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const id = window.setTimeout(() => (document.querySelector<HTMLInputElement>(`.${styles.sheet} input[type=search]`))?.focus(), 30);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", esc);
    return () => {
      document.body.style.overflow = prev;
      window.clearTimeout(id);
      window.removeEventListener("keydown", esc);
    };
  }, [open, lang, pathname]);

  const home = isHome(pathname);
  return (
    <>
      {home ? null : (
      <button type="button" className={styles.iconBtn} aria-label={t("nav.search")} aria-expanded={open} onClick={() => setOpen(true)}>
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="square" aria-hidden="true">
          <circle cx="10.5" cy="10.5" r="6" />
          <path d="M15 15l5.5 5.5" />
        </svg>
      </button>
      )}
      {open ? (
        <div className={styles.sheet} role="dialog" aria-modal="true" aria-label={t("nav.search")}>
          <div className={`container ${styles.sheetTop}`}>
            <span className={styles.sheetTitle}>{t("nav.search")}</span>
            <button type="button" className={styles.sheetClose} onClick={() => setOpen(false)}>
              {t("search.close")}
            </button>
          </div>
          <div className={`container ${styles.sheetBody}`}>
            <Search
              lang={lang}
              variant="sheet"
              initial={initial}
              shortcuts={
                recent.length > 0 ? (

                      <div className={styles.recent}>
                        <p className={styles.recentTitle}>{t("search.recent")}</p>
                        <ul>
                          {recent.map((r) => (
                            <li key={r.href}>
                              <Link href={r.href} prefetch={false} onClick={() => setOpen(false)}>
                                <span>
                                  <b>{r.title}</b>
                                  {r.sub ? <small>{r.sub}</small> : null}
                                </span>
                                {r.value ? <em>{r.value}</em> : null}
                              </Link>
                            </li>
                          ))}
                        </ul>
                      </div>

                ) : null
              }
            />
          </div>
        </div>
      ) : null}
    </>
  );
}
