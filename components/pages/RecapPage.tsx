import type { Stats } from "@/lib/types";
import { fmt1, fmtInt, fmtShare1, spanLabel } from "@/lib/format";
import { route, type Lang } from "@/lib/i18n";
import { absoluteUrl, ogImagePath } from "@/lib/site";
import { makeT } from "@/lib/t";
import { Rich } from "../Rich";
import { ShareButton } from "../ShareButton";
import page from "./Page.module.css";
import styles from "./RecapPage.module.css";

export function RecapPage({ stats, lang }: { stats: Stats; lang: Lang }) {
  const t = makeT(lang);
  const { recap, window: w } = stats;
  const ld = recap.longDistance;
  const reg = recap.regional;
  const span = spanLabel(w.firstMonth, w.lastMonth, lang);
  const wide = ogImagePath(w.lastMonth, "recap", lang);
  const tall = ogImagePath(w.lastMonth, "recap-tall", lang);
  const facts: { value: string; unit?: string; label: string }[] = [
    { value: fmt1(ld.avgDelayMin, lang), unit: t("unit.min"), label: t("recap.fact.avg") },
    { value: fmtShare1(ld.latePct, lang), label: t("recap.fact.late") },
    { value: fmtShare1(ld.late60Pct, lang), label: t("recap.fact.late60") },
    { value: fmtShare1(ld.cancelledPct, lang), label: t("recap.fact.canc") },
  ];
  const shareText = t("recap.shareText", {
    span,
    avg: fmt1(ld.avgDelayMin, lang),
    late: fmtShare1(ld.latePct, lang),
    canc: fmtShare1(ld.cancelledPct, lang),
  });

  return (
    <main id="main" className={`container ${page.page}`}>
      <p className={styles.kicker}>{t("recap.kicker", { span, n: w.monthCount })}</p>
      <h1 className={page.title}>{t("recap.title")}</h1>
      <p className={page.sub}>{t("recap.lede", { measured: fmtInt(ld.measured, lang), runs: fmtInt(ld.runs, lang) })}</p>

      <dl className={styles.facts}>
        {facts.map((f) => (
          <div key={f.label} className={styles.fact}>
            <dt className={styles.label}>{f.label}</dt>
            <dd className={styles.value}>
              {f.value}
              {f.unit ? <span className={styles.unit}> {f.unit}</span> : null}
            </dd>
          </div>
        ))}
      </dl>

      <p className={styles.regional}>
        {t("recap.regional", { avg: fmt1(reg.avgDelayMin, lang), late: fmtShare1(reg.latePct, lang), canc: fmtShare1(reg.cancelledPct, lang) })}
      </p>

      <div className={styles.share}>
        <ShareButton lang={lang} title={`German Punctuality: ${span}`} text={shareText} url={absoluteUrl(route(lang, "recap"))} label={t("recap.share")} />
      </div>

      <h2 className={styles.h}>{t("recap.pictures")}</h2>
      <div className={styles.pictures}>
        <figure className={styles.figure}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={wide} width={1200} height={630} alt={t("recap.imgWide", { span })} className={styles.imgWide} />
          <figcaption>
            <a href={wide} download="german-punctuality-recap.png">
              {t("recap.dlWide")}
            </a>
          </figcaption>
        </figure>
        <figure className={styles.figure}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={tall} width={1080} height={1920} alt={t("recap.imgTall", { span })} className={styles.imgTall} loading="lazy" />
          <figcaption>
            <a href={tall} download="german-punctuality-recap-tall.png">
              {t("recap.dlTall")}
            </a>
          </figcaption>
        </figure>
      </div>

      <h2 className={styles.h}>{t("recap.how")}</h2>
      <p className={styles.text}>{t("recap.howText", { n: w.monthCount, span, late: stats.params.lateMinutes })}</p>
      <p className={styles.text}>
        <Rich text={t("recap.links", { home: absoluteUrl(route(lang, "home")), ranking: absoluteUrl(route(lang, "ranking")) })} />
      </p>
    </main>
  );
}
