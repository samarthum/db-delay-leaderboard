import type { MetadataRoute } from "next";
import { getStats, getTrainSlugs } from "@/lib/data";
import { absoluteUrl } from "@/lib/site";

export const dynamic = "force-static";

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = getStats().generatedAt;
  return [
    { url: absoluteUrl("/"), lastModified },
    ...getTrainSlugs().map((slug) => ({ url: absoluteUrl(`/train/${slug}/`), lastModified })),
  ];
}
