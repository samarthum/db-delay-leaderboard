import type { Metadata } from "next";
import { getLatePct, getUnit, getUnitSlugs } from "@/lib/data";
import { unitMetadata } from "@/lib/seo";
import { UnitPage } from "@/components/pages/UnitPage";

type Params = { slug: string };

export const dynamicParams = false;

export function generateStaticParams(): Params[] {
  return getUnitSlugs("longDistance").map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { slug } = await params;
  const u = getUnit("longDistance", slug);
  return unitMetadata(u, "en", getLatePct(slug) ?? 0);
}

export default async function Page({ params }: { params: Promise<Params> }) {
  const { slug } = await params;
  return <UnitPage category="longDistance" slug={slug} lang="en" />;
}
