import { compensationMetadata } from "@/lib/seo";
import { CompensationPage } from "@/components/pages/CompensationPage";

export const metadata = compensationMetadata("en");

export default function Page() {
  return <CompensationPage lang="en" />;
}
