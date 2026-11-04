import type { Metadata } from "next";
import { RootShell } from "@/components/shell/RootShell";
import { manifestPath } from "@/lib/manifest";
import { SITE_NAME } from "@/lib/site";

export const metadata: Metadata = { manifest: manifestPath("en"), title: { template: `%s · ${SITE_NAME}`, default: SITE_NAME } };

export default function EnLayout({ children }: { children: React.ReactNode }) {
  return <RootShell lang="en">{children}</RootShell>;
}
