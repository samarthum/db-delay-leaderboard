import Link from "next/link";
import type { Lang } from "@/lib/i18n";
import { makeT } from "@/lib/t";
import { FOOTER_LINKS } from "./nav";
import styles from "./Shell.module.css";

/** The pages that are not tabs, as a plain row of links at the end of every page. Phones only: from 960 px the header lists them. */
export function SiteFooter({ lang }: { lang: Lang }) {
  const t = makeT(lang);
  return (
    <nav className={styles.footer} aria-label={t("nav.other")}>
      <ul className={`container ${styles.footerList}`}>
        {FOOTER_LINKS.map((item) => (
          <li key={item.key}>
            <Link href={item.href(lang)} prefetch={false}>
              {t(item.label)}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
