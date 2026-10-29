"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Lang } from "@/lib/i18n";
import { makeT } from "@/lib/t";
import { NAV, isActive } from "./nav";
import styles from "./Shell.module.css";

/** Bottom tab bar, phones only: four places, one thumb. */
export function TabBar({ lang }: { lang: Lang }) {
  const pathname = usePathname() ?? "/";
  const t = makeT(lang);
  return (
    <nav className={styles.tabbar} aria-label={t("nav.label")}>
      <ul className={styles.tabs}>
        {NAV.map((item) => {
          const active = isActive(item, lang, pathname);
          return (
            <li key={item.key} className={styles.tabItem}>
              <Link href={item.href(lang)} className={styles.tab} aria-current={active ? "page" : undefined} prefetch={false}>
                <span className={styles.tabLabel}>{t(item.label)}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
