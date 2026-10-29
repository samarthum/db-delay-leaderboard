import { getStats } from "@/lib/data";
import { recapMetadata } from "@/lib/seo";
import { RecapPage } from "@/components/RecapPage";

export const metadata = recapMetadata();

export default function Recap() {
  return <RecapPage stats={getStats()} />;
}
