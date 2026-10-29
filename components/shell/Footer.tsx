import Link from "next/link";
import { DATA_SOURCE_URL, REPO_URL } from "@/lib/site";
import { route, type Lang } from "@/lib/i18n";
import { fmtDate } from "@/lib/format";
import { makeT } from "@/lib/t";
import { Rich } from "../Rich";
import styles from "./Shell.module.css";

export function Footer({ lang, generatedAt }: { lang: Lang; generatedAt: string }) {
  const t = makeT(lang);
  return (
    <footer className={styles.footer}>
      <div className={`container ${styles.footerInner}`}>
        <p className={styles.footerBrand}>{t("brand")}</p>
        <ul className={styles.credits}>
          <li>
            <Link href={route(lang, "recap")} prefetch={false}>
              {t("footer.recap")}
            </Link>
          </li>
          <li>
            <Rich text={t("footer.data", { dataUrl: DATA_SOURCE_URL })} />
          </li>
          <li>
            <Rich text={t("footer.stations")} />
          </li>
          <li>
            <Rich text={t("footer.map")} />
          </li>
          <li>{t("footer.affiliation")}</li>
          <li>
            <Rich text={t("footer.source", { repoUrl: REPO_URL })} />
          </li>
        </ul>
        <p className={styles.updated}>{t("footer.updated", { date: fmtDate(generatedAt, lang) })}</p>
      </div>
    </footer>
  );
}
