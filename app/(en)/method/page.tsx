import { methodMetadata } from "@/lib/seo";
import { MethodPage } from "@/components/pages/MethodPage";

export const metadata = methodMetadata("en");

export default function Page() {
  return <MethodPage lang="en" />;
}
