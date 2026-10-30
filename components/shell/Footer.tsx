import { DATA_SOURCE_URL, REPO_URL } from "@/lib/site";
import type { Lang } from "@/lib/i18n";
import { fmtDate } from "@/lib/format";
import { makeT } from "@/lib/t";
import { Rich } from "../Rich";
import styles from "./Shell.module.css";

/** Three lines: where the data comes from, that this is not DB, and the source. The credits are a licence term. */
export function Footer({ lang, generatedAt }: { lang: Lang; generatedAt: string }) {
  const t = makeT(lang);
  return (
    <footer className={styles.footer}>
      <div className={`container ${styles.footerInner}`}>
        <p>
          <Rich text={t("footer.data", { dataUrl: DATA_SOURCE_URL })} />. <Rich text={t("footer.stations")} />. <Rich text={t("footer.map")} />.
        </p>
        <p>
          {t("footer.affiliation")} <Rich text={t("footer.source", { repoUrl: REPO_URL })} />. {t("footer.updated", { date: fmtDate(generatedAt, lang) })}
        </p>
      </div>
    </footer>
  );
}
