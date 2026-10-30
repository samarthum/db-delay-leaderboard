import Link from "next/link";
import { getStats } from "@/lib/data";
import { fmtInt, spanLabel } from "@/lib/format";
import { route, type Lang } from "@/lib/i18n";
import { makeT } from "@/lib/t";
import { Search } from "../search/Search";
import { LateLead } from "../LateLead";
import { ConnectionCard } from "../ConnectionCard";
import styles from "./HomePage.module.css";

/** The home page: one promise, one box, and one line about the whole network under it. */
export function HomePage({ lang }: { lang: Lang }) {
  const t = makeT(lang);
  const stats = getStats();
  const ld = stats.recap.longDistance;
  const w = stats.window;
  const idle = (
    <>
    <ConnectionCard lang={lang} />
    <section className={styles.network} aria-label={t("home.networkRest")}>
      <LateLead
        pct={ld.latePct}
        lang={lang}
        rest={t("home.networkRest")}
        basis={t("home.networkBasis", { trips: fmtInt(ld.measured, lang), span: spanLabel(w.firstMonth, w.lastMonth, lang) })}
      />
      <Link href={route(lang, "recap")} className={styles.recap} prefetch={false}>
        {t("home.recap")} <span aria-hidden="true">→</span>
      </Link>
      <Link href={route(lang, "routes")} className={styles.recap} prefetch={false}>
        {t("home.routes")} <span aria-hidden="true">→</span>
      </Link>
    </section>
    </>
  );
  return (
    <main id="main" className={`container ${styles.page}`}>
      <Search lang={lang} idle={idle} title={t("home.title")} sub={t("home.sub")} />
    </main>
  );
}
