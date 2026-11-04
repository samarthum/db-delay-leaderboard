import { getCompensation, getRoutes, getStats } from "./data";
import { fmt1, fmtInt, fmtShare1, spanLabel } from "./format";
import { route, type Lang, type RouteKey } from "./i18n";
import { plainText } from "./jsonld";
import { methodItems } from "./methodFaq";
import { shortStation } from "./routeSlug";
import { DATA_SOURCE_URL, REPO_URL, SITE_NAME, SITE_URL, absoluteUrl, unitHref } from "./site";
import { makeT } from "./t";

/**
 * /llms.txt and /llms-full.txt (https://llmstxt.org): a plain-text map of the site for language models and answer
 * engines. Generated from the same data files and dictionary as the pages, so a number here is the number on the page.
 * Written in English, with the German page addresses listed too.
 */

const RAW_STATS = `${REPO_URL.replace("github.com", "raw.githubusercontent.com")}/main/data/stats.json`;

type Page = { key: RouteKey; name: string; about: string };

const PAGES: Page[] = [
  { key: "home", name: "Home: search a train, route or station", about: "How late a train is today (live, from Deutsche Bahn's own API) and how late it has run before." },
  { key: "ranking", name: "Rankings", about: "The most delayed routes, long-distance trains and regional lines, by average delay." },
  { key: "routes", name: "All routes", about: "Every long-distance route with its own page, ranked and listed A to Z." },
  { key: "change", name: "Change trains", about: "How often a change between two long-distance trains worked, by station and planned change time." },
  { key: "compensation", name: "Compensation for a late train", about: "What you can claim from Deutsche Bahn: 25% of the fare from 60 minutes late, 50% from 120, and how to claim." },
  { key: "recap", name: "Recap", about: "Long-distance trains in Germany in numbers over the whole period." },
  { key: "network", name: "Network", about: "Delay by station on a map and month by month." },
  { key: "method", name: "How we measure", about: "Where the data comes from, how delay is counted and what the numbers leave out." },
];

const url = (lang: Lang, key: RouteKey, slug?: string) => absoluteUrl(route(lang, key, slug));

function facts() {
  const stats = getStats();
  const w = stats.window;
  const ld = stats.recap.longDistance;
  const comp = getCompensation();
  return { stats, w, ld, comp, span: spanLabel(w.firstMonth, w.lastMonth, "en") };
}

/** The ten routes with the highest average delay among the busiest ones, as markdown list items. */
function topRoutes(n: number): string[] {
  return getRoutes()
    .routes.filter((r) => r.rank !== null)
    .sort((a, b) => b.avg - a.avg)
    .slice(0, n)
    .map((r) => `- [${r.from} → ${r.to}](${url("en", "route", r.slug)}): ${fmt1(r.avg)} min late on average, ${fmtShare1(r.late)} of ${fmtInt(r.trips)} trips 15+ min late, ${fmtShare1(r.late6)} 6+ min late, ${fmtShare1(r.canc)} cancelled`);
}

function topTrains(n: number): string[] {
  return getStats()
    .rankings.longDistance.minutes.slice(0, n)
    .map((u) => `- [${u.name}](${absoluteUrl(unitHref(u, "en"))}) (${shortStation(u.origin)} → ${shortStation(u.dest)}): ${fmt1(u.minutes.avg)} min late on average over ${fmtInt(u.measured)} trips`);
}

function topLines(n: number): string[] {
  return getStats()
    .rankings.regional.minutes.slice(0, n)
    .map((u) => `- [${u.name} ${shortStation(u.origin)} ↔ ${shortStation(u.dest)}](${absoluteUrl(unitHref(u, "en"))}): ${fmt1(u.minutes.avg)} min late on average over ${fmtInt(u.measured)} trips`);
}

function header(): string[] {
  const { ld, span, stats } = facts();
  return [
    `# ${SITE_NAME}`,
    "",
    `> ${SITE_NAME} (${SITE_URL}) shows how late trains of Deutsche Bahn (DB) in Germany are: today's delay of a train, and how late that train, route or regional line has run before. English and German. Independent; not affiliated with Deutsche Bahn. Free, no account.`,
    "",
    `Headline numbers, ${span}: long-distance trains (ICE, IC, EC and similar) arrived ${fmt1(ld.avgDelayMin)} minutes late on average at their last stop. ${fmtShare1(ld.latePct)} of ${fmtInt(ld.measured)} measured trips were 15 or more minutes late, ${fmtShare1(ld.late6Pct)} were 6 or more minutes late (DB's own punctuality threshold), ${fmtShare1(ld.late60Pct)} were an hour or more late, and ${fmtShare1(ld.cancelledPct)} of scheduled trips were cancelled.`,
    "",
    `How to read it: "late" means arrival at the train's last stop (for trains leaving Germany, its last stop in Germany) compared with the timetable. Two thresholds are always shown side by side: 15+ minutes (this site's count) and 6+ minutes (DB's own rule). The history is computed offline from open data and refreshed weekly (last refresh ${stats.generatedAt.slice(0, 10)}). Live status for a train today is fetched in the visitor's browser from DB's Timetables API; it is not part of the static page text, so do not quote today's delay from this file or from a cached page.`,
  ];
}

export function llmsTxt(): string {
  const { span } = facts();
  const lines = [
    ...header(),
    "",
    "## Pages",
    "",
    ...PAGES.map((p) => `- [${p.name}](${url("en", p.key)}): ${p.about}`),
    "",
    "## Deutsch",
    "",
    ...PAGES.map((p) => `- [${makeT("de")(navLabel(p.key))}](${url("de", p.key)})`),
    "",
    `## The most delayed routes (${span})`,
    "",
    ...topRoutes(10),
    "",
    "## Data and citation",
    "",
    `- [Full text version with method and rankings](${absoluteUrl("/llms-full.txt")}): everything above plus the method Q&A and longer rankings in one file.`,
    `- [Statistics as JSON](${RAW_STATS}): the numbers behind the site (CC BY 4.0 data, MIT code).`,
    `- [Source code](${REPO_URL}): pipeline, data files and the licence of each source.`,
    `- [Source data](${DATA_SOURCE_URL}): Deutsche Bahn data collected by piebro, CC BY 4.0.`,
    `- Page addresses: /route/<from>-<to>/ for a route, /train/<type>-<number>/ for a long-distance train (for example /train/ice-1541/), /line/<name>-<stations>/ for a regional line. German: /de/strecke/, /de/zug/, /de/linie/.`,
    "",
    `Cite as: "${SITE_NAME}, ${SITE_URL}, delay statistics ${span}, from Deutsche Bahn data (CC BY 4.0)". Link to the page the number came from.`,
    "",
  ];
  return lines.join("\n");
}

function navLabel(key: RouteKey) {
  const map = { home: "nav.search", ranking: "nav.ranking", routes: "routes.title", change: "nav.change", compensation: "nav.compensation", recap: "nav.recap", network: "nav.network", method: "nav.method" } as const;
  return map[key as keyof typeof map];
}

export function llmsFullTxt(): string {
  const { comp, span } = facts();
  const t = makeT("en");
  const out: string[] = [
    ...header(),
    "",
    "## Pages",
    "",
    ...PAGES.map((p) => `- [${p.name}](${url("en", p.key)}) · [Deutsch](${url("de", p.key)}): ${p.about}`),
    "",
    `## The 25 most delayed routes among the ${fmtInt(getRoutes().leagueSize)} busiest (${span})`,
    "",
    ...topRoutes(25),
    "",
    "## The 25 most delayed long-distance trains",
    "",
    ...topTrains(25),
    "",
    "## The 15 most delayed regional lines",
    "",
    ...topLines(15),
    "",
    "## Compensation, in one paragraph",
    "",
    `${t("comp2.rule.aria")} ${t("comp2.sub")} In the period measured, ${fmtShare1(comp.network.p60)} of long-distance trips reached their last stop 60+ minutes late and ${fmtShare1(comp.network.p120)} 120+ minutes late. Details and how to claim: ${url("en", "compensation")}`,
    "",
    "## How we measure (questions and answers)",
    "",
  ];
  for (const item of methodItems("en")) {
    out.push(`### ${item.q}`, "", ...item.paras.map(plainText), ...(item.bullets ? item.bullets.map((b) => `- ${b}`) : []), "");
  }
  out.push("## Licence", "", `Data: Deutsche Bahn via piebro/deutsche-bahn-data, CC BY 4.0. Station coordinates: Trainline stations (ODbL). Code: MIT. See ${REPO_URL} for each source and its licence.`, "");
  return out.join("\n");
}
