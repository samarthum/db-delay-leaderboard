import Link from "next/link";
import type { Category, HistBin, UnitDetail } from "@/lib/types";
import { getLatePct, hasConnectionsFrom, getMonthly, getRoutes, getStats, getUnit } from "@/lib/data";
import { lateShareColor, delayColor, LATE } from "@/lib/colors";
import { fmt1, fmtDate, fmtDuration, fmtInt, fmtPct, fmtSigned1, fmtStat, fmtShare, fmtShare1, monthLabel, monthShort, spanLabel } from "@/lib/format";
import { route, type Lang } from "@/lib/i18n";
import { absoluteUrl, portraitPath, unitHref } from "@/lib/site";
import { rankSentence } from "@/lib/seo";
import { makeT } from "@/lib/t";
import { shortStation } from "@/lib/routeSlug";
import { Arrow, RouteName } from "../Arrow";
import { BackLink } from "../BackLink";
import { Figure } from "../Figure";
import { Rich } from "../Rich";
import { RouteText } from "../RouteText";
import { ShareButton } from "../ShareButton";
import { Columns, StopLine } from "../charts";
import { Search } from "../search/Search";
import { categoryCopy, unitKind } from "../pageFormat";

function shareOf(bins: HistBin[], from: number): number {
  return bins.filter((b) => b.lo !== null && b.lo >= from).reduce((s, b) => s + b.share, 0);
}

function onTimeShare(bins: HistBin[]): number {
  return bins.filter((b) => b.hi !== null && b.hi <= 5).reduce((s, b) => s + b.share, 0);
}

function biggestJump(t: UnitDetail) {
  let best: { i: number; from: string; to: string; delta: number } | null = null;
  for (let i = 1; i < t.stops.length; i++) {
    const delta = t.stops[i].avgDelay - t.stops[i - 1].avgDelay;
    if (delta > 0 && (!best || delta > best.delta)) best = { i, from: t.stops[i - 1].name, to: t.stops[i].name, delta };
  }
  return best;
}

/**
 * A train or regional line: the same skeleton as a route page. The answer with both rules, the visitor's own question,
 * (for a train) "Changing from this train?", then the distribution, where the delay builds and the months.
 */
export function UnitPage({ category, slug, lang }: { category: Category; slug: string; lang: Lang }) {
  const tr = makeT(lang);
  const t = getUnit(category, slug);
  const stats = getStats();
  const monthly = getMonthly();
  const url = absoluteUrl(unitHref(t, lang));
  const copy = categoryCopy(lang, category);
  const isLine = category === "regional";
  const w = stats.window;
  const span = spanLabel(w.firstMonth, w.lastMonth, lang);
  const min = tr("unit.min");

  const canChange = !isLine && hasConnectionsFrom(t.name);
  // Same number as the search result for this unit; the histogram is the fallback.
  const latePct = getLatePct(slug) ?? shareOf(t.histogram, 15);

  const measuredMonths = t.monthly.filter((m) => m.avg !== null);
  const worstMonth = measuredMonths.reduce<(typeof measuredMonths)[number] | null>((a, b) => (a === null || (b.avg ?? 0) > (a.avg ?? 0) ? b : a), null);
  const jump = biggestJump(t);
  const onTime = onTimeShare(t.histogram);
  const first = t.stops[0];
  const last = t.stops[t.stops.length - 1];

  const hourShare = shareOf(t.histogram, 60);
  const histHeadline = hourShare >= 10 ? tr("unit.hist.hour", { pct: fmtShare1(hourShare, lang) }) : tr("unit.hist.late", { pct: fmtShare1(shareOf(t.histogram, 15), lang) });
  const histItems = t.histogram.map((b, i) => ({
    label: b.lo === null ? tr("unit.hist.early") : b.hi === null ? `${b.lo}+` : b.label,
    value: b.share,
    color: i < 3 ? "#9AA0A8" : LATE,
  }));

  const net = new Map(monthly.series[category].map((m) => [m.month, m.avgDelayMin]));
  const monthItems = t.monthly.map((m) => ({ label: monthShort(m.month, lang).charAt(0), value: m.avg, color: m.month === worstMonth?.month ? "#14161A" : "#9AA0A8" }));
  const emptyMonths = t.monthly.filter((m) => m.avg === null).map((m) => monthLabel(m.month, lang));

  const where = tr(isLine ? "unit.where.line" : "unit.where.train", { o: shortStation(t.origin), d: shortStation(t.dest) });
  const shareText = tr("unit.shareText", { name: t.name, where, pct: fmtShare1(latePct, lang), avg: fmt1(t.minutes.avg, lang), rank: rankSentence(t, lang) }).trim();

  // Routes this train runs: route pages that list it, biggest first.
  const runs = isLine
    ? []
    : getRoutes()
        .routes.filter((r) => r.list.some((x) => `${x[0]} ${x[1]}` === t.name))
        .sort((a, b) => b.trips - a.trips)
        .slice(0, 5);

  const kindLine = t.rank.minutes !== null && !isLine ? tr("unit.rankLine", { kind: unitKind(t), n: t.rank.minutes }) : unitKind(t);

  const groups: { title: string; rows: [string, string][] }[] = [
    {
      title: tr("unit.g.minutes"),
      rows: [
        [tr("unit.r.avg"), `${fmtSigned1(t.minutes.avg, lang)} ${min}`],
        [tr("unit.r.median"), `${fmtStat(t.minutes.median, lang)} ${min}`],
        [tr("unit.r.p90"), `${fmtStat(t.minutes.p90, lang)} ${min}`],
        [tr("unit.r.sd"), `${fmt1(t.minutes.sd, lang)} ${min}`],
      ],
    },
    {
      title: tr("unit.g.percent"),
      rows: [
        [tr("unit.r.avg"), fmtPct(t.percent.avg, lang)],
        [tr("unit.r.medianShort"), `${fmtStat(t.percent.median, lang)}${lang === "de" ? "\u00a0%" : "%"}`],
        [tr("unit.r.p90Short"), `${fmtStat(t.percent.p90, lang)}${lang === "de" ? "\u00a0%" : "%"}`],
        [tr("unit.r.sdShort"), tr("unit.r.pts", { x: fmt1(t.percent.sd, lang) })],
      ],
    },
    {
      title: tr("unit.g.trips"),
      rows: [
        [tr("unit.r.runs"), fmtInt(t.runs, lang)],
        [tr("unit.r.measured"), fmtInt(t.measured, lang)],
        [tr("unit.r.measuredPct"), fmtInt(t.measuredPct, lang)],
        [tr("unit.r.planned"), fmtDuration(t.avgScheduledMin, lang)],
        [tr("unit.r.canc"), fmtShare1(t.fullCancelPct, lang)],
        [tr("unit.r.partial"), fmtShare1(t.partialCancelPct, lang)],
      ],
    },
  ];
  const routesNote = isLine
    ? tr("unit.routes.line", { n: fmtInt(t.routeVariants, lang) })
    : t.routeVariants === 1
      ? tr("unit.routes.one")
      : tr("unit.routes.many", { n: t.routeVariants });

  const nameWord = isLine ? tr("route.and") : tr("route.to");

  return (
    <main id="main" className="container page">
      <BackLink lang={lang} />

      <div className="two-col">
        <div className="main">
          <p className="basis" style={{ marginTop: 10, fontSize: 15, fontWeight: 600, color: "var(--ink-2)" }}>
            {kindLine}
          </p>
          <h1 className="h1" style={{ marginTop: 2 }}>
            {t.name}
          </h1>
          <p className="lead" style={{ marginTop: 8, fontSize: 16 }}>
            {isLine ? (
              <RouteText unit={t} lang={lang} />
            ) : (
              <>
                <RouteName from={shortStation(t.origin)} to={shortStation(t.dest)} word={nameWord} />, {fmtDuration(t.avgScheduledMin, lang)}
              </>
            )}
          </p>
          {t.alsoRunsAs.length > 0 ? <p className="basis">{tr("unit.alsoRunsAs", { list: t.alsoRunsAs.join(", ") })}</p> : null}

          <Figure
            pct={latePct}
            pct6={t.late6Pct}
            lang={lang}
            sentence={<Rich text={tr("res.figure")} />}
            basis={`${tr("res.exact", { pct: fmtShare1(latePct, lang), n: fmtInt(t.measured, lang) })} ${tr("res.basis", { span })}`}
          />

          <dl className="facts three">
            <div>
              <dt>{tr("unit.avgTile")}</dt>
              <dd>
                {fmt1(t.minutes.avg, lang)}
                <small>{min}</small>
              </dd>
            </div>
            <div>
              <dt>{tr("unit.cancTile")}</dt>
              <dd>
                {fmtShare1(t.fullCancelPct, lang)}
                <small>{tr("unit.cancNote", { n: fmtInt(t.runs, lang) })}</small>
              </dd>
            </div>
            {t.worstRun ? (
              <div>
                <dt>{tr("unit.worst")}</dt>
                <dd>
                  {fmtDuration(t.worstRun.delayMin, lang)}
                  <small>{fmtDate(t.worstRun.date, lang)}</small>
                </dd>
              </div>
            ) : null}
          </dl>

          <div className="actions">
            <ShareButton lang={lang} title={`${t.name} · German Punctuality`} text={shareText} url={url} label={tr(isLine ? "unit.shareLine" : "unit.shareTrain")} image={portraitPath(w.lastMonth, slug, lang)} filename={slug} />
          </div>

          <section className="sec" aria-labelledby="own">
            <h2 id="own">{tr("unit.ownTitle")}</h2>
            <Search lang={lang} variant="inline" />
          </section>
        </div>

        <div className="aside">
          {canChange ? (
            <section className="sec" aria-labelledby="change-from">
              <h2 id="change-from">{tr("conn.train.title", { train: t.name })}</h2>
              <p className="sec-sub">{tr("cx.train.sub")}</p>
              <Link href={`${route(lang, "change")}?t=${encodeURIComponent(t.name)}`} className="more" prefetch={false}>
                {tr("cx.train.link")} <Arrow />
              </Link>
            </section>
          ) : null}
        </div>
      </div>

      <div className="two-col">
        <div className="main">
          <section className="sec" aria-labelledby="distribution">
            <h2 id="distribution">{histHeadline}</h2>
            <p className="sec-sub">{tr("unit.hist.onTime", { pct: fmtShare1(onTime, lang) })}</p>
            <Columns
              items={histItems}
              lang={lang}
              unit="pct"
              threshold={3}
              thresholdLabel={lang === "de" ? "15 Min." : "15 min"}
              height={200}
              gap={6}
              label={tr("unit.hist.aria", { list: t.histogram.map((b) => `${b.label} ${fmtShare1(b.share, lang)}`).join(", ") })}
            />
            <p className="basis">{tr("unit.hist.cap")}</p>
          </section>

          <section className="sec" aria-labelledby="by-month">
            <h2 id="by-month">
              {worstMonth && worstMonth.avg !== null ? tr("unit.month.worst", { month: monthLabel(worstMonth.month, lang), avg: fmt1(worstMonth.avg, lang) }) : tr("unit.month.default")}
            </h2>
            <p className="sec-sub">{tr("unit.month.cap", { plural: copy.plural })}</p>
            <Columns
              items={monthItems}
              lang={lang}
              unit="min"
              reference={t.monthly.map((m) => net.get(m.month) ?? null)}
              height={190}
              gap={5}
              showValues={false}
              label={tr("unit.month.aria", { list: t.monthly.map((m) => `${monthLabel(m.month, lang)} ${m.avg === null ? "–" : fmt1(m.avg, lang)}`).join(", ") })}
            />
            {emptyMonths.length > 0 ? <p className="basis">{tr("unit.month.noTrips", { months: emptyMonths.join(", ") })}</p> : null}
          </section>
        </div>

        <div className="aside">
          {t.stops.length > 0 ? (
            <section className="sec" aria-labelledby="route">
              <h2 id="route">{jump ? tr("unit.route.jump", { from: shortStation(jump.from), to: shortStation(jump.to), delta: fmt1(jump.delta, lang) }) : tr("unit.route.default")}</h2>
              <p className="sec-sub">{tr("unit.stops.cap", { extra: isLine ? tr("unit.route.extra", { a: shortStation(first.name), b: shortStation(last.name) }) : "" })}</p>
              <StopLine
                points={t.stops.map((s) => ({ name: shortStation(s.name), value: s.avgDelay }))}
                lang={lang}
                unit="min"
                xmax={Math.max(20, Math.ceil(Math.max(...t.stops.map((s) => s.avgDelay)) / 10) * 10)}
                jump={jump?.i ?? null}
                rowh={28}
                labelW={160}
                label={tr("unit.curve.aria", { name: t.name, list: t.stops.map((s) => `${shortStation(s.name)} ${fmt1(s.avgDelay, lang)}`).join(", ") })}
              />
            </section>
          ) : null}
        </div>
      </div>

      {runs.length > 0 ? (
        <section className="sec" aria-labelledby="runs">
          <h2 id="runs">{tr("unit.routesTitle", { name: t.name })}</h2>
          <p className="sec-sub">{tr("unit.routesSub")}</p>
          <table className="bt">
            <colgroup>
              <col />
              <col style={{ width: 64 }} />
              <col style={{ width: 56 }} />
            </colgroup>
            <tbody>
              {runs.map((r) => (
                <tr key={r.slug} className="tap">
                  <td className="two">
                    <Link href={route(lang, "route", r.slug)} prefetch={false}>
                      <b>
                        <RouteName from={r.from} to={r.to} word={tr("route.to")} />
                      </b>
                      <span>{tr("home.top.trips", { n: fmtInt(r.trips, lang) })}</span>
                    </Link>
                  </td>
                  <td className="bar">
                    <span>
                      <i style={{ width: `${r.late}%`, background: lateShareColor(r.late) }} />
                    </span>
                  </td>
                  <td className="v">{fmtShare(r.late, lang)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}

      <details className="disc numbers">
        <summary>{tr("unit.numbers")}</summary>
        <div className="groups">
          {groups.map((g) => (
            <div key={g.title}>
              <h3>{g.title}</h3>
              <dl>
                {g.rows.map(([k, v]) => (
                  <div key={k}>
                    <dt>{k}</dt>
                    <dd>{v}</dd>
                  </div>
                ))}
              </dl>
            </div>
          ))}
        </div>
        <p className="note">
          {routesNote} {t.stops.length > 0 ? `${tr("unit.stopsFrom", { n: fmtInt(t.stopsSequenceRuns, lang), runs: fmtInt(t.runs, lang) })} ` : ""}
          {isLine ? "" : tr("unit.abroad")}
        </p>
      </details>
      <p className="basis" style={{ display: "none" }}>
        <Arrow />
        {delayColor(0)}
      </p>
    </main>
  );
}
