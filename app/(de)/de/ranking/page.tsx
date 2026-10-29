import { rankingMetadata } from "@/lib/seo";
import { RankingPage } from "@/components/pages/RankingPage";

export const metadata = rankingMetadata("de");

export default function Page() {
  return <RankingPage lang="de" />;
}
