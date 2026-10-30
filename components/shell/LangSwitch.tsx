"use client";

import { usePathname } from "next/navigation";
import { otherLangPath, type Lang } from "@/lib/i18n";
import { makeT } from "@/lib/t";
import styles from "./Shell.module.css";

/** One link to the same page in the other language. It keeps the search and the place on the page in the address. */
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
    <a href={other.path} hrefLang={to} lang={to} className={styles.langLink} onClick={go}>
      {to === "de" ? t("lang.de") : t("lang.en")}
    </a>
  );
}
