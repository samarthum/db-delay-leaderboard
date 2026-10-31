import Link from "next/link";
import type { Stats } from "@/lib/types";
import { fmt1, fmtInt, fmtShare1, spanLabel } from "@/lib/format";
import { route, type Lang } from "@/lib/i18n";
import { absoluteUrl, ogImagePath } from "@/lib/site";
import { makeT } from "@/lib/t";
import { Arrow } from "../Arrow";
import { Figure } from "../Figure";
import { Rich } from "../Rich";
import { ShareButton } from "../ShareButton";

export function RecapPage({ stats, lang }: { stats: Stats; lang: Lang }) {
  const t = makeT(lang);
  const { recap, window: w } = stats;
  const ld = recap.longDistance;
  const reg = recap.regional;
  const span = spanLabel(w.firstMonth, w.lastMonth, lang);
  const shareText = t("recap.shareText", { span, avg: fmt1(ld.avgDelayMin, lang), late: fmtShare1(ld.latePct, lang), canc: fmtShare1(ld.cancelledPct, lang) });

  return (
    <main id="main" className="container page">
      <p className="basis" style={{ marginTop: 18, fontWeight: 600, color: "var(--ink-2)", fontSize: 15 }}>
        {t("recap.kicker", { span, n: w.monthCount })}
      </p>
      <h1 className="h1" style={{ marginTop: 2 }}>
        {t("recap.title")}
      </h1>
      <p className="lead" style={{ marginTop: 8, fontSize: 16 }}>
        {t("recap.lede", { measured: fmtInt(ld.measured, lang), runs: fmtInt(ld.runs, lang) })}
      </p>

      <div className="two-col">
        <div className="main">
          <Figure avg={ld.avgDelayMin} pct={ld.latePct} pct6={ld.late6Pct} lang={lang} sentence={<Rich text={t("fig.home")} />} basis={t("home.basis", { trips: fmtInt(ld.measured, lang), span })} />
        </div>
        <div className="aside">
          <section className="sec" aria-labelledby="facts">
            <h2 id="facts">{t("recap.facts")}</h2>
            <dl className="plain">
              <div>
                <dt>{t("recap.fact.avg")}</dt>
                <dd>
                  {fmt1(ld.avgDelayMin, lang)} {t("unit.min")}
                </dd>
              </div>
              <div>
                <dt>{t("recap.fact.late60")}</dt>
                <dd>{fmtShare1(ld.late60Pct, lang)}</dd>
              </div>
              <div>
                <dt>{t("recap.fact.canc")}</dt>
                <dd>{fmtShare1(ld.cancelledPct, lang)}</dd>
              </div>
            </dl>
            <p className="note" style={{ marginTop: 12 }}>
              {t("recap.regional", { avg: fmt1(reg.avgDelayMin, lang), late: fmtShare1(reg.latePct, lang), canc: fmtShare1(reg.cancelledPct, lang) })}
            </p>
          </section>
        </div>
      </div>

      <div className="actions">
        <ShareButton lang={lang} title={`German Punctuality: ${span}`} text={shareText} url={absoluteUrl(route(lang, "recap"))} label={t("recap.share")} image={ogImagePath(w.lastMonth, "recap-tall", lang)} filename="german-punctuality-recap" />
      </div>

      <section className="sec" aria-labelledby="how">
        <h2 id="how">{t("recap.how")}</h2>
        <p className="sec-sub">{t("recap.howText", { n: w.monthCount, span, late: stats.params.lateMinutes })}</p>
        <p className="sec-sub">
          <Rich text={t("recap.links", { home: absoluteUrl(route(lang, "home")), ranking: absoluteUrl(route(lang, "ranking")) })} />
        </p>
        <Link href={route(lang, "home")} className="more" prefetch={false}>
          {t("more.next")} <Arrow />
        </Link>
      </section>
    </main>
  );
}
