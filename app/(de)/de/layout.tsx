import { RootShell } from "@/components/shell/RootShell";

export default function DeLayout({ children }: { children: React.ReactNode }) {
  return <RootShell lang="de">{children}</RootShell>;
}
