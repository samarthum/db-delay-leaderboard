import Link from "next/link";
import { getCompensation, getRoutes } from "@/lib/data";
import { fmtInt, fmtShare, fmtShare1, monthLabel, monthShort, spanLabel } from "@/lib/format";
import { route, type Lang } from "@/lib/i18n";
import { makeT, type Key } from "@/lib/t";
import { RouteName } from "../Arrow";
import { Columns } from "../charts";
import { CompCalc } from "../CompCalc";
import s from "../Compensation.module.css";

const TOP = 8;
const CLAIM_URL = "https://www.bahn.de/service/informationen-buchung/fahrgastrechte";

/** Index of the highest value; the first wins a tie. */
function highest(values: number[]): number {
  return values.reduce((best, v, i) => (v > values[best] ? i : best), 0);
}

/** Where each rule was read; the EU text has a page per language. */
const SOURCES: { key: Key; href: (lang: Lang) => string }[] = [
  { key: "comp.src.eu", href: (l) => `https://eur-lex.europa.eu/legal-content/${l === "de" ? "DE" : "EN"}/TXT/?uri=CELEX:32021R0782` },
  { key: "comp.src.db", href: () => CLAIM_URL },
  { key: "comp.src.terms", href: () => "https://www.bahn.de/agb" },
  { key: "comp.src.soep", href: () => "https://soep-online.de/" },
  { key: "comp.src.eba", href: () => "https://www.eba.bund.de/DE/Themen/Fahrgastrechte/fahrgastrechte_node.html" },
];

const COUNTS: { ok: boolean; title: Key; body: Key }[] = [
  { ok: true, title: "comp2.c.missed", body: "comp2.c.missedSub" },
  { ok: true, title: "comp2.c.canc", body: "comp2.c.cancSub" },
  { ok: true, title: "comp2.c.cheap", body: "comp2.c.cheapSub" },
  { ok: false, title: "comp2.c.known", body: "comp2.c.knownSub" },
  { ok: false, title: "comp2.c.refund", body: "comp2.c.refundSub" },
  { ok: false, title: "comp2.c.small", body: "comp2.c.smallSub" },
];

const CAN: Key[] = ["comp2.no.weather", "comp2.no.health", "comp2.no.track", "comp2.no.cable", "comp2.no.police", "comp2.no.you"];
const MUST: Key[] = ["comp2.yes.strike", "comp2.yes.storm", "comp2.yes.others", "comp2.yes.infra", "comp2.yes.works"];

/**
 * Compensation for a late train, for people who have never read a regulation: the rule as one ruler (nothing / 25% /
 * 50%), a calculator, one trip drawn as a line, a ladder of what to do while it is late, who DB can and cannot blame,
 * three steps to claim, and how often trains are this late. The legal detail stays in folds. Rules from primary sources
 * read on the date on the page (references in the skill); numbers from data/compensation.json.
 */
export function CompensationPage({ lang }: { lang: Lang }) {
  const t = makeT(lang);
  const c = getCompensation();
  const w = c.window;
  const span = spanLabel(w.firstMonth, w.lastMonth, lang);
  const league = getRoutes().routes.filter((r) => r.rank !== null && c.routes[r.slug]);
  const top = league.sort((a, b) => (c.routes[b.slug][1] ?? 0) - (c.routes[a.slug][1] ?? 0)).slice(0, TOP);
  const topMax = Math.max(...top.map((r) => c.routes[r.slug][1] ?? 0), 1);
  const months = c.monthly;
  const worst = highest(months.map((m) => m.p60 ?? 0));
  const pc = lang === "de" ? "\u00a0%" : "%";
  // 100 dots: how many of 100 long-distance trains reached their last stop 60-119 / 120+ minutes late.
  const d120 = Math.round(c.network.p120);
  const d60 = Math.max(0, Math.round(c.network.p60) - d120);
  const oneIn = Math.round(100 / c.network.p60);

  return (
    <main id="main" className="container page">
      <div className={s.page}>
        <h1 className={s.h1}>{t("comp2.title")}</h1>
        <p className={s.sub}>{t("comp2.sub")}</p>

        {/* The rule as one ruler */}
        <div className={s.rule} role="img" aria-label={t("comp2.rule.aria")}>
          <div className={s.ruleBar}>
            <div className={s.bz0}>
              <b>0{pc}</b>
              <small>{t("comp2.rule.0")}</small>
            </div>
            <div className={s.bz60}>
              <b>25{pc}</b>
              <small>{t("comp2.rule.60")}</small>
            </div>
            <div className={s.bz120}>
              <b>50{pc}</b>
              <small>{t("comp2.rule.120")}</small>
            </div>
          </div>
          <div className={s.ruleTicks} aria-hidden="true">
            <span style={{ left: 0 }}>{t("comp2.rule.start")}</span>
            <span style={{ left: "33.33%" }}>{t("comp2.unit", { n: 60 })}</span>
            <span style={{ left: "66.67%" }}>{t("comp2.unit", { n: 120 })}</span>
            <span style={{ left: "100%" }}>{t("comp2.rule.more")}</span>
          </div>
        </div>

        <CompCalc lang={lang} />

        {/* How to claim */}
        <section className={s.block} id="claim" aria-labelledby="c-how">
          <h2 id="c-how" className={s.h2}>
            {t("comp2.how.title")}
          </h2>
          <ol className={s.steps}>
            <li>
              <span>
                <b>{t("comp2.how.1")}</b>
                <span>{t("comp2.how.1Sub")}</span>
              </span>
            </li>
            <li>
              <span>
                <b>{t("comp2.how.2")}</b>
                <span>{t("comp2.how.2Sub")}</span>
              </span>
            </li>
            <li>
              <span>
                <b>{t("comp2.how.3")}</b>
                <span>{t("comp2.how.3Sub")}</span>
              </span>
            </li>
          </ol>
          <a className={s.cta} href={CLAIM_URL} rel="noopener" target="_blank">
            {t("comp.cta")}
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="M8 6h10v10M18 6L6 18" />
            </svg>
          </a>
          <p className={s.refused}>
            <b>{t("comp2.how.refused")}</b> {t("comp2.how.refusedSub")}
          </p>
        </section>

        {/* What counts: one trip on a line */}
        <section className={s.block} aria-labelledby="c-counts">
          <h2 id="c-counts" className={s.h2}>
            {t("comp2.counts.title")}
          </h2>
          <p className={s.lead}>{t("comp2.counts.lead")}</p>
          <div className={s.trip} role="img" aria-label={t("comp2.trip.aria")}>
            <div className={s.tripLine}>
              <i className={`${s.dot} ${s.solid}`} style={{ left: "6%" }} />
              <i className={s.dot} style={{ left: "50%" }} />
              <span className={s.gap} style={{ left: "66%", width: "28%" }} />
              <i className={`${s.dot} ${s.solid}`} style={{ left: "94%" }} />
            </div>
            <div className={s.tripLabels}>
              <span>
                <b>{t("comp2.trip.start")}</b>
                {t("comp2.trip.startSub")}
              </span>
              <span>
                <b>{t("comp2.trip.change")}</b>
                {t("comp2.trip.changeSub")}
              </span>
              <span>
                <b>{t("comp2.trip.dest")}</b>
                {t("comp2.trip.destSub")}
              </span>
            </div>
          </div>
          <div className={s.split2}>
            {[true, false].map((yes) => (
              <div key={String(yes)}>
                <p className={s.colHead2}>
                  <span aria-hidden="true">{yes ? "✓" : "✕"}</span> {t(yes ? "comp2.c.yesHead" : "comp2.c.noHead")}
                </p>
                <ul className={s.facts}>
                  {COUNTS.filter((x) => x.ok === yes).map((x) => (
                    <li key={x.title}>
                      <b>{t(x.title)}</b>
                      {t(x.body)}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>

        {/* Running late now: a ladder of thresholds */}
        <section className={s.block} aria-labelledby="c-now">
          <h2 id="c-now" className={s.h2}>
            {t("comp2.now.title")}
          </h2>
          <p className={s.lead}>{t("comp2.now.lead")}</p>
          <ol className={s.ladder}>
            <li>
              <span className={s.step}>{t("comp2.unit", { n: 20 })}</span>
              <div>
                <h3>{t("comp2.now.20")}</h3>
                <p>{t("comp2.now.20Sub")}</p>
              </div>
            </li>
            <li>
              <span className={s.step}>{t("comp2.unit", { n: 60 })}</span>
              <div>
                <h3>{t("comp2.now.60")}</h3>
                <div className={s.opts}>
                  <span>
                    <b>{t("comp2.now.opt1")}</b> {t("comp2.now.opt1Sub")}
                  </span>
                  <span>
                    <b>{t("comp2.now.opt2")}</b> {t("comp2.now.opt2Sub")}
                  </span>
                  <span>
                    <b>{t("comp2.now.opt3")}</b> {t("comp2.now.opt3Sub")}
                  </span>
                </div>
                <p>{t("comp2.now.care")}</p>
              </div>
            </li>
            <li>
              <span className={s.step}>{t("comp2.unit", { n: 100 })}</span>
              <div>
                <h3>{t("comp2.now.100")}</h3>
                <p>{t("comp2.now.100Sub")}</p>
              </div>
            </li>
          </ol>
        </section>

        {/* Can DB say no? */}
        <section className={s.block} aria-labelledby="c-no">
          <h2 id="c-no" className={s.h2}>
            {t("comp2.no.title")}
          </h2>
          <p className={s.lead}>{t("comp2.no.lead")}</p>
          <div className={s.split2}>
            <div>
              <p className={s.colHead2}>
                <span aria-hidden="true">€</span>
                {t("comp2.yes.head")}
              </p>
              <ul className={s.facts}>
                {MUST.map((k) => (
                  <li key={k}>{t(k)}</li>
                ))}
              </ul>
            </div>
            <div>
              <p className={s.colHead2}>
                <span aria-hidden="true">✕</span>
                {t("comp2.no.head")}
              </p>
              <ul className={s.facts}>
                {CAN.map((k) => (
                  <li key={k}>{t(k)}</li>
                ))}
              </ul>
            </div>
          </div>
          <p className={s.fine}>{t("comp2.no.fine")}</p>
        </section>

        {/* How often */}
        <section className={s.block} aria-labelledby="c-often">
          <h2 id="c-often" className={s.h2}>
            {t("comp.often.title")}
          </h2>
          <div className={s.often}>
            <p className={s.oneIn}>
              {t("comp2.often.oneIn", { n: oneIn })}
              <small>{t("comp2.often.trains")}</small>
            </p>
            <p>{t("comp2.often.sub", { pct: fmtShare1(c.network.p60, lang), span })}</p>
          </div>
          <div className={s.dots} role="img" aria-label={t("comp2.often.aria", { a: d60 + d120, b: d120 })}>
            {Array.from({ length: 100 }, (_, i) => (
              <i key={i} className={i < d120 ? s.d120 : i < d120 + d60 ? s.d60 : undefined} />
            ))}
          </div>
          <p className={s.legend} aria-hidden="true">
            <span>
              <i style={{ background: "var(--z60)", boxShadow: "inset 0 0 0 1.5px var(--ink)" }} />
              {t("comp.row60")}
            </span>
            <span>
              <i style={{ background: "var(--z120)", boxShadow: "inset 0 0 0 1.5px var(--ink)" }} />
              {t("comp.row120")}
            </span>
          </p>
        </section>

        <div className="folds" style={{ marginTop: 36 }}>
          <details className="fold">
            <summary>
              <span>{t("comp.routes.title")}</span>
            </summary>
            <div className="body">
              <p className="sec-sub" style={{ marginTop: 0 }}>
                {t("comp.routes.sub", { n: fmtInt(getRoutes().params.leagueMinTrips, lang), span })}
              </p>
              <table className="bt">
                <colgroup>
                  <col />
                  <col style={{ width: 70 }} />
                  <col style={{ width: 54 }} />
                </colgroup>
                <tbody>
                  {top.map((r) => {
                    const p = c.routes[r.slug][1] ?? 0;
                    return (
                      <tr key={r.slug} className="tap">
                        <td className="two">
                          <Link href={route(lang, "route", r.slug)} prefetch={false}>
                            <b>
                              <RouteName from={r.from} to={r.to} word={t("route.to")} />
                            </b>
                          </Link>
                        </td>
                        <td className="bar">
                          <span>
                            <i style={{ width: `${(100 * p) / topMax}%`, background: "var(--ink)" }} />
                          </span>
                        </td>
                        <td className="v">{fmtShare(p, lang)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </details>
          <details className="fold">
            <summary>
              <span>{t("comp.months.title")}</span>
            </summary>
            <div className="body">
              <p className="sec-sub" style={{ marginTop: 0 }}>
                {t("comp.months.sub", { worst: monthLabel(months[worst].month, lang), pct: fmtShare1(months[worst].p60 ?? 0, lang) })}
              </p>
              <Columns
                items={months.map((m, i) => ({ label: monthShort(m.month, lang).charAt(0), value: m.p60, color: i === worst ? "#14161A" : "#9AA0A8" }))}
                lang={lang}
                unit="pct"
                ymax={12}
                height={210}
                gap={5}
                label={t("comp.months.aria")}
              />
              <p className="basis" style={{ marginTop: 10 }}>
                {t("comp.basis", { n: fmtInt(c.network.measured, lang), span })}
              </p>
            </div>
          </details>
          <details className="fold">
            <summary>
              <span>{t("comp.tickets.title")}</span>
            </summary>
            <div className="body">
              <ul className="plain">
                {(["comp.tickets.1", "comp.tickets.2", "comp.tickets.3", "comp.tickets.4"] as Key[]).map((k) => (
                  <li key={k}>{t(k)}</li>
                ))}
              </ul>
            </div>
          </details>
          <details className="fold">
            <summary>
              <span>{t("comp2.detail.title")}</span>
            </summary>
            <div className="body">
              <ul className="plain">
                {(["comp.claim.2", "comp.claim.6", "comp.expect.2", "comp.expect.3", "comp.expect.4", "comp.refuse.can", "comp.refuse.cannot", "comp.refuse.db", "comp.refuse.note", "comp.how.1", "comp.how.2", "comp.how.3", "comp.how.5"] as Key[]).map((k) => (
                  <li key={k}>{t(k)}</li>
                ))}
              </ul>
            </div>
          </details>
        </div>

        <section className="sec" aria-labelledby="src">
          <h2 id="src">{t("comp.src.title")}</h2>
          <ul className="plain">
            {SOURCES.map((x) => (
              <li key={x.key}>
                <a href={x.href(lang)} className="tl" rel="noopener" target="_blank">
                  {t(x.key)}
                </a>
              </li>
            ))}
          </ul>
          <p className="note" style={{ marginTop: 12 }}>
            {t("comp.checked")}
          </p>
        </section>
      </div>
    </main>
  );
}
