"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Lang } from "@/lib/i18n";
import { makeT } from "@/lib/t";
import { TABS, isActive } from "./nav";
import styles from "./Shell.module.css";

/** Bottom bar, phones only: four places, one thumb. Hidden from 960 px, where the header carries the same links. */
export function TabBar({ lang }: { lang: Lang }) {
  const pathname = usePathname() ?? "/";
  const t = makeT(lang);
  return (
    <nav className={styles.tabbar} aria-label={t("nav.label")}>
      <ul className={styles.tabs}>
        {TABS.map((item) => (
          <li key={item.key} className={styles.tabItem}>
            <Link href={item.href(lang)} className={styles.tab} aria-current={isActive(item, pathname) ? "page" : undefined} prefetch={false}>
              {t(item.label)}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
