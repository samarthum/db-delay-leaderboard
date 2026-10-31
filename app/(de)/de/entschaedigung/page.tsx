import { compensationMetadata } from "@/lib/seo";
import { CompensationPage } from "@/components/pages/CompensationPage";

export const metadata = compensationMetadata("de");

export default function Page() {
  return <CompensationPage lang="de" />;
}
