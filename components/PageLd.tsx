import type { Metadata } from "next";
import { pageLd, siteLd, type Crumb, type Faq, type PageKind } from "@/lib/jsonld";
import type { Lang } from "@/lib/i18n";

/** One <script type="application/ld+json">. "<" is escaped so no string in the data can close the tag. */
function Script({ data }: { data: object }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, "\\u003c") }} />;
}

/** Structured data of one page: the page, its breadcrumb trail and (on a FAQ page) its visible questions. Renders nothing visible. */
export function PageLd(p: { lang: Lang; path: string; meta: Metadata; name: string; trail?: Crumb[]; kind?: PageKind; faq?: Faq[] }) {
  return <Script data={pageLd(p)} />;
}

/** Structured data of the whole site (publisher, website, open dataset): once, on the home page of each language. */
export function SiteLd({ lang }: { lang: Lang }) {
  return <Script data={siteLd(lang)} />;
}
