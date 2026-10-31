import Link from "next/link";
import { route, type Lang } from "@/lib/i18n";
import { makeT } from "@/lib/t";
import { LangSwitch } from "./LangSwitch";
import { DesktopNav } from "./DesktopNav";
import { SearchSheet } from "./SearchSheet";
import styles from "./Shell.module.css";

export function SiteHeader({ lang }: { lang: Lang }) {
  const t = makeT(lang);
  return (
    <>
      <div className={styles.headerWrap}>
        <header className={`container ${styles.header}`}>
          <Link href={route(lang, "home")} className={styles.brand}>
            <span className={styles.dot} aria-hidden="true" />
            {t("brand")}
          </Link>
          <DesktopNav lang={lang} />
          <div className={styles.headerEnd}>
            <SearchSheet lang={lang} />
            <span className={styles.wideOnly}>
              <LangSwitch lang={lang} />
            </span>
          </div>
        </header>
      </div>
    </>
  );
}
