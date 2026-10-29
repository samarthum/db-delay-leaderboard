import { rankingMetadata } from "@/lib/seo";
import { RankingPage } from "@/components/pages/RankingPage";

export const metadata = rankingMetadata("en");

export default function Page() {
  return <RankingPage lang="en" />;
}
