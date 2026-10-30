import { moreMetadata } from "@/lib/seo";
import { MorePage } from "@/components/pages/MorePage";

export const metadata = moreMetadata("de");

export default function Page() {
  return <MorePage lang="de" />;
}
