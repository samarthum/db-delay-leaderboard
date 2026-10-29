import { homeMetadata } from "@/lib/seo";
import { HomePage } from "@/components/pages/HomePage";

export const metadata = homeMetadata("en");

export default function Home() {
  return <HomePage lang="en" />;
}
