import type { MetadataRoute } from "next";
import { route, type Lang } from "./i18n";
import { SITE_NAME } from "./site";
import { makeT } from "./t";

const PAPER = "#fafaf8";

/** Where each language's web manifest is served; the root layouts link to it. */
export function manifestPath(lang: Lang): string {
  return lang === "de" ? "/de/manifest.webmanifest" : "/manifest.webmanifest";
}

/**
 * The web manifest for "Add to home screen" and installs: one per language, so the German site opens on its own home
 * page. Both cover the whole site (scope "/"), so switching language stays inside the installed app.
 * Icons come from scripts/brand-icons.mjs.
 */
export function webManifest(lang: Lang): MetadataRoute.Manifest {
  const t = makeT(lang);
  const home = route(lang, "home");
  return {
    id: home,
    name: SITE_NAME,
    short_name: "Punctuality",
    description: t("seo.app.desc"),
    lang: lang === "de" ? "de-DE" : "en-GB",
    dir: "ltr",
    start_url: home,
    scope: "/",
    display: "standalone",
    background_color: PAPER,
    theme_color: PAPER,
    categories: ["travel"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}

/** The manifest as a static file response (application/manifest+json). */
export function manifestResponse(lang: Lang): Response {
  return new Response(`${JSON.stringify(webManifest(lang), null, 2)}\n`, {
    headers: { "Content-Type": "application/manifest+json; charset=utf-8" },
  });
}
