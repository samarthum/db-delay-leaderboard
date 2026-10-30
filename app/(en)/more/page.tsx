import { moreMetadata } from "@/lib/seo";
import { MorePage } from "@/components/pages/MorePage";

export const metadata = moreMetadata("en");

export default function Page() {
  return <MorePage lang="en" />;
}
