import type { Metadata } from "next";
import { RootShell } from "@/components/shell/RootShell";
import { manifestPath } from "@/lib/manifest";

export const metadata: Metadata = { manifest: manifestPath("de") };

export default function DeLayout({ children }: { children: React.ReactNode }) {
  return <RootShell lang="de">{children}</RootShell>;
}
