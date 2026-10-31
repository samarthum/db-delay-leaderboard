import type { MetadataRoute } from "next";
import type { Category } from "@/lib/types";
import { getRoutes, getStats, getUnitSlugs } from "@/lib/data";
import { LANGS, route, type Lang, type RouteKey } from "@/lib/i18n";
import { absoluteUrl, unitHref } from "@/lib/site";

export const dynamic = "force-static";

const PAGES: RouteKey[] = ["home", "change", "ranking", "routes", "network", "method", "recap", "compensation"];

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = getStats().generatedAt;
  const categories: Category[] = ["longDistance", "regional"];
  const entry = (path: (l: Lang) => string) =>
    LANGS.map((l) => ({
      url: absoluteUrl(path(l)),
      lastModified,
      alternates: { languages: { en: absoluteUrl(path("en")), de: absoluteUrl(path("de")) } },
    }));
  return [
    ...PAGES.flatMap((key) => entry((l) => route(l, key))),
    ...getRoutes().routes.flatMap((r) => entry((l) => route(l, "route", r.slug))),
    ...categories.flatMap((category) => getUnitSlugs(category).flatMap((slug) => entry((l) => unitHref({ category, slug }, l)))),
  ];
}
