import { getStats } from "@/lib/data";
import { recapMetadata } from "@/lib/seo";
import { RecapPage } from "@/components/pages/RecapPage";

export const metadata = recapMetadata("de");

export default function Page() {
  return <RecapPage stats={getStats()} lang="de" />;
}
