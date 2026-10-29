import { homeMetadata } from "@/lib/seo";
import { HomePage } from "@/components/pages/HomePage";

export const metadata = homeMetadata("de");

export default function Start() {
  return <HomePage lang="de" />;
}
