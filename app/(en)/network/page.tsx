import { getStations } from "@/lib/data";
import { networkMetadata } from "@/lib/seo";
import { NetworkPage } from "@/components/pages/NetworkPage";

export const metadata = networkMetadata("en", getStations().stations.length);

export default function Page() {
  return <NetworkPage lang="en" />;
}
