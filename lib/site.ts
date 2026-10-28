export const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://db-delay-leaderboard.vercel.app"
).replace(/\/+$/, "");

export const SITE_NAME = "DB Delay Leaderboard";

export const REPO_URL = "https://github.com/samarthum/db-delay-leaderboard";
export const DATA_SOURCE_URL = "https://github.com/piebro/deutsche-bahn-data";

export function absoluteUrl(path: string): string {
  return `${SITE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}

/** OG images are generated at build time into public/og/<lastMonth>/<name>.png. */
export function ogImagePath(lastMonth: string, name: string): string {
  return `/og/${lastMonth}/${name}.png`;
}

export const OG_SIZE = { width: 1200, height: 630 } as const;
