"use client";

import { usePathname } from "next/navigation";
import { otherLangPath, type Lang } from "@/lib/i18n";
import { makeT } from "@/lib/t";
import styles from "./Shell.module.css";

/** EN | DE. Goes to the same page in the other language and keeps the search in the address. */
export function LangSwitch({ lang }: { lang: Lang }) {
  const pathname = usePathname() ?? "/";
  const t = makeT(lang);
  const other = otherLangPath(pathname);
  const to: Lang = other.lang;

  function go(e: React.MouseEvent<HTMLAnchorElement>) {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    e.preventDefault();
    window.location.assign(`${other.path}${window.location.search}${window.location.hash}`);
  }

  return (
    <div className={styles.lang} role="group" aria-label={t("lang.label")}>
      {(["en", "de"] as const).map((l) =>
        l === lang ? (
          <span key={l} className={`${styles.langItem} ${styles.langOn}`} aria-current="true" lang={l}>
            {l.toUpperCase()}
          </span>
        ) : (
          <a
            key={l}
            href={other.path}
            hrefLang={to}
            lang={to}
            className={styles.langItem}
            onClick={go}
            aria-label={to === "de" ? t("lang.de") : t("lang.en")}
          >
            {l.toUpperCase()}
          </a>
        ),
      )}
    </div>
  );
}
