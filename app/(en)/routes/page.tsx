import type { Metadata } from "next";
import { routesMetadata } from "@/lib/seo";
import { RoutesPage } from "@/components/pages/RoutesPage";

export const metadata: Metadata = routesMetadata("en");

export default function Page() {
  return <RoutesPage lang="en" />;
}
