import type { Metadata } from "next";
import { getLatePct, getUnit, getUnitSlugs } from "@/lib/data";
import { unitMetadata } from "@/lib/seo";
import { UnitPage } from "@/components/pages/UnitPage";

type Params = { slug: string };

export const dynamicParams = false;

export function generateStaticParams(): Params[] {
  return getUnitSlugs("regional").map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { slug } = await params;
  const u = getUnit("regional", slug);
  return unitMetadata(u, "de", getLatePct(slug) ?? 0);
}

export default async function Page({ params }: { params: Promise<Params> }) {
  const { slug } = await params;
  return <UnitPage category="regional" slug={slug} lang="de" />;
}
