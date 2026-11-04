import type { Metadata } from "next";
import { getStats } from "./data";
import { spanLabel } from "./format";
import { route, type Lang } from "./i18n";
import { DATA_SOURCE_URL, REPO_URL, SITE_NAME, SITE_URL, absoluteUrl } from "./site";
import { makeT } from "./t";

/**
 * Structured data (schema.org JSON-LD) for search engines and answer engines. Every value comes from the same
 * data and dictionary as the visible page; nothing here is shown to visitors. Pages emit it through
 * components/PageLd.tsx.
 */

export type Crumb = { name: string; path: string };
export type PageKind = "WebPage" | "CollectionPage" | "AboutPage" | "FAQPage";
export type Faq = { q: string; a: string };

const CC_BY = "https://creativecommons.org/licenses/by/4.0/";
const ORG_ID = `${SITE_URL}/#organization`;
const SITE_ID = `${SITE_URL}/#website`;
const DATASET_ID = `${SITE_URL}/#dataset`;

const LOCALE_TAG: Record<Lang, string> = { en: "en-GB", de: "de-DE" };

const organization = () => ({
  "@type": "Organization",
  "@id": ORG_ID,
  name: SITE_NAME,
  url: SITE_URL,
  logo: { "@type": "ImageObject", url: absoluteUrl("/icons/icon-512.png"), width: 512, height: 512 },
  sameAs: [REPO_URL],
});

const websiteRef = () => ({ "@type": "WebSite", "@id": SITE_ID, name: SITE_NAME, url: SITE_URL });

/** "2026-09" -> "2026-09-30" */
function lastDayOf(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
}

/** The title without the " · Zugmonitor" suffix the layout adds, as a plain string. */
export function titleText(title: Metadata["title"]): string {
  const raw = !title ? SITE_NAME : typeof title === "string" ? title : "absolute" in title && title.absolute ? title.absolute : "default" in title && title.default ? title.default : SITE_NAME;
  return raw.replace(new RegExp(`\\s·\\s${SITE_NAME}$`), "");
}

/** The first Open Graph image of a page's metadata, if any. */
function imageOf(meta: Metadata): string | undefined {
  const images = meta.openGraph?.images;
  const first = Array.isArray(images) ? images[0] : images;
  if (!first) return undefined;
  if (typeof first === "string") return first;
  if (first instanceof URL) return first.toString();
  return first.url.toString();
}

/** Markdown-ish dictionary text ("[label](url)", "**bold**") as the plain sentence a reader sees. */
export function plainText(s: string): string {
  return s.replace(/\[([^\]]+)\]\(https?:\/\/[^)\s]+\)/g, "$1").replace(/\*\*([^*]+)\*\*/g, "$1");
}

/** The page node, its breadcrumb trail (Zugmonitor > ...trail > this page) and, for a FAQ page, its visible questions. */
export function pageLd(p: { lang: Lang; path: string; meta: Metadata; name: string; trail?: Crumb[]; kind?: PageKind; faq?: Faq[] }) {
  const url = absoluteUrl(p.path);
  const description = typeof p.meta.description === "string" ? p.meta.description : undefined;
  const image = imageOf(p.meta);
  const home = route(p.lang, "home");
  // The home page is its own trail: Zugmonitor, and nothing after it.
  const crumbs: Crumb[] = p.path === home ? [{ name: SITE_NAME, path: home }] : [{ name: SITE_NAME, path: home }, ...(p.trail ?? []), { name: p.name, path: p.path }];
  const kind: PageKind = p.faq && p.faq.length > 0 ? "FAQPage" : (p.kind ?? "WebPage");
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": kind,
        "@id": `${url}#webpage`,
        url,
        name: titleText(p.meta.title),
        ...(description ? { description } : {}),
        inLanguage: LOCALE_TAG[p.lang],
        isPartOf: websiteRef(),
        dateModified: getStats().generatedAt,
        breadcrumb: { "@id": `${url}#breadcrumb` },
        ...(image ? { primaryImageOfPage: { "@type": "ImageObject", url: image } } : {}),
        ...(kind === "FAQPage"
          ? { mainEntity: (p.faq ?? []).map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })) }
          : {}),
      },
      {
        "@type": "BreadcrumbList",
        "@id": `${url}#breadcrumb`,
        itemListElement: crumbs.map((c, i) => ({ "@type": "ListItem", position: i + 1, name: c.name, item: absoluteUrl(c.path) })),
      },
    ],
  };
}

/** The whole site as one entity: the publisher, the website and the delay statistics as a citable open dataset. */
export function siteLd(lang: Lang) {
  const t = makeT(lang);
  const w = getStats().window;
  const first = `${w.firstMonth}-01`;
  const last = lastDayOf(w.lastMonth);
  return {
    "@context": "https://schema.org",
    "@graph": [
      organization(),
      {
        "@type": "WebSite",
        "@id": SITE_ID,
        url: SITE_URL,
        name: SITE_NAME,
        description: t("seo.app.desc"),
        inLanguage: [LOCALE_TAG.en, LOCALE_TAG.de],
        publisher: { "@id": ORG_ID },
      },
      {
        "@type": "Dataset",
        "@id": DATASET_ID,
        name: `Deutsche Bahn train delays in Germany, ${spanLabel(w.firstMonth, w.lastMonth, "en")}`,
        description:
          "How late long-distance and regional trains in Germany arrived at their last stop, per train, regional line and route: average delay in minutes, the share of trips 15 or more minutes late, the share 6 or more minutes late (Deutsche Bahn's own rule) and the share of cancelled trips. Computed from Deutsche Bahn's published train data and refreshed weekly.",
        url: absoluteUrl(route("en", "home")),
        keywords: ["Deutsche Bahn", "train delays", "Verspätung", "Pünktlichkeit", "ICE", "IC", "Regionalverkehr", "Germany"],
        license: CC_BY,
        isAccessibleForFree: true,
        creator: { "@type": "Organization", "@id": ORG_ID, name: SITE_NAME, url: SITE_URL },
        isBasedOn: { "@type": "Dataset", name: "deutsche-bahn-data", url: DATA_SOURCE_URL, license: CC_BY },
        temporalCoverage: `${first}/${last}`,
        spatialCoverage: { "@type": "Place", name: "Germany" },
        inLanguage: ["en", "de"],
        dateModified: getStats().generatedAt,
        variableMeasured: [
          { "@type": "PropertyValue", name: "Average delay at the last stop", unitText: "minutes" },
          { "@type": "PropertyValue", name: "Share of trips 15 or more minutes late", unitText: "percent" },
          { "@type": "PropertyValue", name: "Share of trips 6 or more minutes late (Deutsche Bahn's own rule)", unitText: "percent" },
          { "@type": "PropertyValue", name: "Share of trips cancelled", unitText: "percent" },
        ],
        distribution: [
          {
            "@type": "DataDownload",
            encodingFormat: "application/json",
            contentUrl: `${REPO_URL.replace("github.com", "raw.githubusercontent.com")}/main/data/stats.json`,
          },
        ],
        citation: `${SITE_NAME} (${SITE_URL}), delay statistics ${spanLabel(w.firstMonth, w.lastMonth, "en")}, from Deutsche Bahn data (CC BY 4.0).`,
      },
    ],
  };
}
