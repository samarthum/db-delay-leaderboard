import { DATA_SOURCE_URL, REPO_URL } from "@/lib/site";
import type { Lang } from "@/lib/i18n";
import { fmtDate } from "@/lib/format";
import { makeT } from "@/lib/t";
import { Rich } from "./Rich";

/** Data credits and licences. A licence term (CC BY, ODbL), so it must exist; it lives on "How we measure" only. */
export function Credits({ lang, generatedAt }: { lang: Lang; generatedAt: string }) {
  const t = makeT(lang);
  return (
    <section className="sec" aria-labelledby="credits" style={{ maxWidth: 760 }}>
      <h2 id="credits">{t("credits.title")}</h2>
      <ul className="credits">
        <li>
          <Rich text={t("footer.data", { dataUrl: DATA_SOURCE_URL })} />
        </li>
        <li>
          <Rich text={t("footer.stations")} />
        </li>
        <li>
          <Rich text={t("footer.live")} />
        </li>
        <li>
          <Rich text={t("footer.liveAbroad")} />
        </li>
        <li>
          <Rich text={t("footer.histAbroad")} />
        </li>
        <li>
          <Rich text={t("footer.map")} />
        </li>
        <li>{t("footer.affiliation")}</li>
        <li>
          <Rich text={t("footer.source", { repoUrl: REPO_URL })} />
        </li>
        <li>{t("footer.updated", { date: fmtDate(generatedAt, lang) })}</li>
      </ul>
    </section>
  );
}
