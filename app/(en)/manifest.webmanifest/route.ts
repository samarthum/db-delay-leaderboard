import { manifestResponse } from "@/lib/manifest";

export const dynamic = "force-static";

export function GET() {
  return manifestResponse("en");
}
