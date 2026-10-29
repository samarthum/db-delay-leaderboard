"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Lang } from "@/lib/i18n";
import { makeT } from "@/lib/t";
import { NAV, isActive } from "./nav";
import styles from "./Shell.module.css";

/** Links in the header on wide screens. Phones get the bottom tab bar instead. */
export function DesktopNav({ lang }: { lang: Lang }) {
  const pathname = usePathname() ?? "/";
  const t = makeT(lang);
  return (
    <nav className={styles.desktopNav} aria-label={t("nav.label")}>
      {NAV.map((item) => (
        <Link
          key={item.key}
          href={item.href(lang)}
          className={styles.desktopLink}
          aria-current={isActive(item, lang, pathname) ? "page" : undefined}
          prefetch={false}
        >
          {t(item.label)}
        </Link>
      ))}
    </nav>
  );
}
