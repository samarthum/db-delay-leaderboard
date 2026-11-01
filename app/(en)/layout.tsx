import type { Metadata } from "next";
import { RootShell } from "@/components/shell/RootShell";
import { manifestPath } from "@/lib/manifest";

export const metadata: Metadata = { manifest: manifestPath("en") };

export default function EnLayout({ children }: { children: React.ReactNode }) {
  return <RootShell lang="en">{children}</RootShell>;
}
