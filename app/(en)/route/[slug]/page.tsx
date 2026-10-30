import type { Metadata } from "next";
import { getRoute, getRoutes } from "@/lib/data";
import { routeMetadata } from "@/lib/seo";
import { RoutePage } from "@/components/pages/RoutePage";

type Params = { slug: string };

export const dynamicParams = false;

export function generateStaticParams(): Params[] {
  return getRoutes().routes.map((r) => ({ slug: r.slug }));
}

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { slug } = await params;
  return routeMetadata(getRoute(slug), "en");
}

export default async function Page({ params }: { params: Promise<Params> }) {
  const { slug } = await params;
  return <RoutePage r={getRoute(slug)} lang="en" />;
}
