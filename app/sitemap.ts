import type { MetadataRoute } from "next";
import type { Category } from "@/lib/types";
import { getStats, getUnitSlugs } from "@/lib/data";
import { absoluteUrl, unitHref } from "@/lib/site";

export const dynamic = "force-static";

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = getStats().generatedAt;
  const categories: Category[] = ["longDistance", "regional"];
  return [
    { url: absoluteUrl("/"), lastModified },
    ...categories.flatMap((category) =>
      getUnitSlugs(category).map((slug) => ({ url: absoluteUrl(unitHref({ category, slug })), lastModified })),
    ),
  ];
}
