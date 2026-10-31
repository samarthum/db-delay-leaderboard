import Link from "next/link";
import { getCompensation, getRoutes } from "@/lib/data";
import { fmtInt, fmtShare, fmtShare1, monthLabel, monthShort, spanLabel } from "@/lib/format";
import { route, type Lang } from "@/lib/i18n";
import { makeT, type Key } from "@/lib/t";
import { Arrow, RouteName } from "../Arrow";
import { Columns } from "../charts";

const TOP = 8;

/** Index of the highest value; the first wins a tie. */
function highest(values: number[]): number {
  return values.reduce((best, v, i) => (v > values[best] ? i : best), 0);
}

/** Where each rule was read; the EU text has a page per language. */
const SOURCES: { key: Key; href: (lang: Lang) => string }[] = [
  { key: "comp.src.eu", href: (l) => `https://eur-lex.europa.eu/legal-content/${l === "de" ? "DE" : "EN"}/TXT/?uri=CELEX:32021R0782` },
  { key: "comp.src.db", href: () => "https://www.bahn.de/service/informationen-buchung/fahrgastrechte" },
  { key: "comp.src.terms", href: () => "https://www.bahn.de/agb" },
  { key: "comp.src.soep", href: () => "https://soep-online.de/" },
  { key: "comp.src.eba", href: () => "https://www.eba.bund.de/DE/Themen/Fahrgastrechte/fahrgastrechte_node.html" },
];

const CLAIM: Key[] = ["comp.claim.1", "comp.claim.2", "comp.claim.3", "comp.claim.4", "comp.claim.5", "comp.claim.6"];
const EXPECT: Key[] = ["comp.expect.1", "comp.expect.2", "comp.expect.3", "comp.expect.4"];
const REFUSE: Key[] = ["comp.refuse.can", "comp.refuse.cannot", "comp.refuse.db", "comp.refuse.note"];
const TICKETS: Key[] = ["comp.tickets.1", "comp.tickets.2", "comp.tickets.3", "comp.tickets.4"];
const HOW: Key[] = ["comp.how.4", "comp.how.1", "comp.how.5", "comp.how.2", "comp.how.3"];

/**
 * Compensation for a late train: the two steps of the rule (60 and 120 minutes), how often trips reached them, then what
 * the rules say, when DB can refuse and how to claim. The rules are written from primary sources read on the date shown
 * on the page; the numbers come from data/compensation.json.
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

  const list = (keys: Key[]) => (
    <ul className="plain">
      {keys.map((k) => (
        <li key={k}>{t(k)}</li>
      ))}
    </ul>
  );

  return (
    <main id="main" className="container page">
      <h1 className="h1" style={{ marginTop: 20 }}>
        {t("comp.title")}
      </h1>
      <p className="lead" style={{ marginTop: 8, fontSize: 16, maxWidth: "62ch" }}>
        {t("comp.sub")}
      </p>

      <div style={{ maxWidth: 640 }}>
        <dl className="answer">
          <div>
            <dt>{t("comp.row60")}</dt>
            <dd>
              {lang === "de" ? "25\u00a0%" : "25%"}
              <small>{t("comp.ofFare")}</small>
            </dd>
          </div>
          <div>
            <dt>{t("comp.row120")}</dt>
            <dd>
              {lang === "de" ? "50\u00a0%" : "50%"}
              <small>{t("comp.ofFare")}</small>
            </dd>
          </div>
          <div>
            <dt>
              {t("comp.within")}
              <small>{t("comp.withinSub")}</small>
            </dt>
            <dd>
              3<small>{t("comp.months3")}</small>
            </dd>
          </div>
        </dl>
        <a className="cta" href="https://www.bahn.de/service/informationen-buchung/fahrgastrechte" rel="noopener" target="_blank">
          {t("comp.cta")}
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path d="M8 6h10v10M18 6L6 18" />
          </svg>
        </a>

        <div className="folds" style={{ marginTop: 28 }}>
        <details className="fold">
          <summary>
            <span>{t("comp.claim.title")}</span>
          </summary>
          <div className="body">{list(CLAIM)}</div>
        </details>
        <details className="fold">
          <summary>
            <span>{t("comp.expect.title")}</span>
          </summary>
          <div className="body">{list(EXPECT)}</div>
        </details>
        <details className="fold">
          <summary>
            <span>{t("comp.refuse.title")}</span>
          </summary>
          <div className="body">{list(REFUSE)}</div>
        </details>
        <details className="fold">
          <summary>
            <span>{t("comp.tickets.title")}</span>
          </summary>
          <div className="body">{list(TICKETS)}</div>
        </details>
        <details className="fold">
          <summary>
            <span>{t("comp.how.title")}</span>
          </summary>
          <div className="body">{list(HOW)}</div>
        </details>
        <details className="fold">
          <summary>
            <span>{t("comp.often.title")}</span>
          </summary>
          <div className="body">
            <dl className="kv" style={{ marginTop: 0 }}>
              <div>
                <dt>
                  {t("comp.tile60")}
                  <small>{t("comp.tile60Sub")}</small>
                </dt>
                <dd>{fmtShare1(c.network.p60, lang)}</dd>
              </div>
              <div>
                <dt>
                  {t("comp.tile120")}
                  <small>{t("comp.tile120Sub")}</small>
                </dt>
                <dd>{fmtShare1(c.network.p120, lang)}</dd>
              </div>
            </dl>
            <p className="basis" style={{ marginTop: 10 }}>
              {t("comp.basis", { n: fmtInt(c.network.measured, lang), span })}
            </p>
            <p className="note" style={{ marginTop: 6 }}>
              {t("comp.guide")}
            </p>
            <h3 style={{ marginTop: 24, fontSize: 17 }}>{t("comp.routes.title")}</h3>
        
        <p className="sec-sub" style={{ marginTop: 14 }}>{t("comp.routes.sub", { n: fmtInt(getRoutes().params.leagueMinTrips, lang), span })}</p>
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
                      <span>{t("home.top.trips", { n: fmtInt(c.routes[r.slug][0], lang) })}</span>
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
      
            <h3 style={{ marginTop: 24, fontSize: 17 }}>{t("comp.months.title")}</h3>
        
        <p className="sec-sub" style={{ marginTop: 14 }}>{t("comp.months.sub", { worst: monthLabel(months[worst].month, lang), pct: fmtShare1(months[worst].p60 ?? 0, lang) })}</p>
        <Columns
          items={months.map((m, i) => ({ label: monthShort(m.month, lang).charAt(0), value: m.p60, color: i === worst ? "#14161A" : "#9AA0A8" }))}
          lang={lang}
          unit="pct"
          ymax={12}
          height={210}
          gap={5}
          label={t("comp.months.aria")}
        />
      </div>
        </details>
        </div>
      </div>

      <section className="sec" aria-labelledby="src">
        <h2 id="src">{t("comp.src.title")}</h2>
        <ul className="plain">
          {SOURCES.map((s) => (
            <li key={s.key}>
              <a href={s.href(lang)} className="tl" rel="noopener" target="_blank">
                {t(s.key)}
              </a>
            </li>
          ))}
        </ul>
        <p className="note" style={{ marginTop: 12 }}>
          {t("comp.checked")}
        </p>
      </section>

    </main>
  );
}
