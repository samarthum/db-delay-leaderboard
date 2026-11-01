import Link from "next/link";
import { route, type Lang } from "@/lib/i18n";
import { makeT } from "@/lib/t";
import { LangSwitch } from "./LangSwitch";
import { DesktopNav } from "./DesktopNav";
import { SearchSheet } from "./SearchSheet";
import { PagesMenu } from "./PagesMenu";
import styles from "./Shell.module.css";

export function SiteHeader({ lang }: { lang: Lang }) {
  const t = makeT(lang);
  return (
    <>
      <div className={styles.headerWrap}>
        <header className={`container ${styles.header}`}>
          <Link href={route(lang, "home")} className={styles.brand}>
            <span className={styles.dot} aria-hidden="true" />
            <span className={styles.brandName}>{t("brand")}</span>
          </Link>
          <DesktopNav lang={lang} />
          <div className={styles.headerEnd}>
            <SearchSheet lang={lang} />
            <PagesMenu lang={lang} />
            <LangSwitch lang={lang} />
          </div>
        </header>
      </div>
    </>
  );
}
