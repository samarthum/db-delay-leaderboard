// /version.txt: this build's id (next.config.mjs). An open tab compares it with the id in its own bundle to notice a
// newer deploy and then opens pages with a full load (lib/deploy.ts).
export const dynamic = "force-static";

export function GET() {
  return new Response(`${process.env.GP_BUILD_ID ?? ""}\n`, { headers: { "content-type": "text/plain; charset=utf-8" } });
}
