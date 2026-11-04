import type { Metadata } from "next";
import { RootShell } from "@/components/shell/RootShell";
import { manifestPath } from "@/lib/manifest";
import { SITE_NAME } from "@/lib/site";

export const metadata: Metadata = { manifest: manifestPath("de"), title: { template: `%s · ${SITE_NAME}`, default: SITE_NAME } };

export default function DeLayout({ children }: { children: React.ReactNode }) {
  return <RootShell lang="de">{children}</RootShell>;
}
