"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Lang } from "@/lib/i18n";
import { makeT } from "@/lib/t";
import { TABS, isActive, type NavItem } from "./nav";
import styles from "./Shell.module.css";

/** Plain line icons, 24 px grid, drawn in the current text colour. The current tab gets a heavier line. */
function Icon({ name, on }: { name: NonNullable<NavItem["icon"]>; on: boolean }) {
  const common = { width: 24, height: 24, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: on ? 2.4 : 1.8, strokeLinecap: "square", strokeLinejoin: "miter", "aria-hidden": true, focusable: false } as const;
  if (name === "search")
    return (
      <svg {...common}>
        <circle cx="10.5" cy="10.5" r="6" />
        <path d="M15 15l5.5 5.5" />
      </svg>
    );
  if (name === "change")
    return (
      <svg {...common}>
        <path d="M3.5 8h16M15.5 4l4 4-4 4M20.5 16h-16M8.5 12l-4 4 4 4" />
      </svg>
    );
  if (name === "ranking")
    return (
      <svg {...common}>
        <path d="M6 20v-8M12 20V4M18 20v-5" strokeWidth={on ? 3.4 : 2.8} />
      </svg>
    );
  return (
    <svg {...common}>
      <path d="M5 18L12 6l7 12" />
      <circle cx="5" cy="18" r="2.3" fill="var(--paper)" />
      <circle cx="12" cy="6" r="2.3" fill="var(--paper)" />
      <circle cx="19" cy="18" r="2.3" fill="var(--paper)" />
    </svg>
  );
}

/** Bottom bar, phones only: four places, one thumb. Hidden from 960 px, where the header carries the same links. */
export function TabBar({ lang }: { lang: Lang }) {
  const pathname = usePathname() ?? "/";
  const t = makeT(lang);
  return (
    <nav className={styles.tabbar} aria-label={t("nav.label")}>
      <ul className={styles.tabs}>
        {TABS.map((item) => {
          const on = isActive(item, pathname);
          return (
            <li key={item.key} className={styles.tabItem}>
              <Link href={item.href(lang)} className={styles.tab} aria-current={on ? "page" : undefined} prefetch={false}>
                {item.icon && <Icon name={item.icon} on={on} />}
                <span>{t(item.label)}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
