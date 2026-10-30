import Link from "next/link";
import { route, type Lang } from "@/lib/i18n";
import { makeT } from "@/lib/t";
import { getStats } from "@/lib/data";
import { spanLabel } from "@/lib/format";
import { LangSwitch } from "./LangSwitch";
import { DesktopNav } from "./DesktopNav";
import styles from "./Shell.module.css";

export function SiteHeader({ lang }: { lang: Lang }) {
  const t = makeT(lang);
  const w = getStats().window;
  return (
    <>
      <div className={styles.headerWrap}>
        <header className={`container ${styles.header}`}>
          <Link href={route(lang, "home")} className={styles.brand}>
            <span className={styles.dot} aria-hidden="true" />
            {t("brand")}
          </Link>
          <DesktopNav lang={lang} />
          <LangSwitch lang={lang} />
        </header>
      </div>
      {/* What this site is, on every page: a stranger who lands on a shared route must not have to guess. */}
      <p className={`container ${styles.identity}`}>{t("identity", { span: spanLabel(w.firstMonth, w.lastMonth, lang) })}</p>
    </>
  );
}
