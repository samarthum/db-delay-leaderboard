import type { Metadata } from "next";
import { getUnit, getUnitSlugs } from "@/lib/data";
import { unitMetadata } from "@/lib/seo";
import { UnitPage } from "@/components/UnitPage";

type Params = { slug: string };

export const dynamicParams = false;

export function generateStaticParams(): Params[] {
  return getUnitSlugs("longDistance").map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { slug } = await params;
  return unitMetadata(getUnit("longDistance", slug));
}

export default async function TrainPage({ params }: { params: Promise<Params> }) {
  const { slug } = await params;
  return <UnitPage category="longDistance" slug={slug} />;
}
