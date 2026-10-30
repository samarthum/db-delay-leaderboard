import { changeMetadata } from "@/lib/seo";
import { ChangePage } from "@/components/pages/ChangePage";

export const metadata = changeMetadata("de");

export default function Page() {
  return <ChangePage lang="de" />;
}
