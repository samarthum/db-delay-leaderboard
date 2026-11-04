import type { MetadataRoute } from "next";
import { absoluteUrl } from "@/lib/site";

export const dynamic = "force-static";

/**
 * Search and answer-engine crawlers, named on purpose. The data is open (CC BY 4.0) and the site wants to be quoted and
 * linked, so each one is allowed explicitly and a blanket rule added later cannot shut them out by accident.
 *   index a page for search or answers: Googlebot, Bingbot, OAI-SearchBot, Claude-SearchBot, PerplexityBot, Applebot
 *   fetch a page when a user asks:      ChatGPT-User, Claude-User, Perplexity-User
 *   model training / grounding:         GPTBot, ClaudeBot, Google-Extended, Applebot-Extended, CCBot
 */
const NAMED_BOTS = [
  "Googlebot",
  "Bingbot",
  "OAI-SearchBot",
  "ChatGPT-User",
  "GPTBot",
  "Claude-SearchBot",
  "Claude-User",
  "ClaudeBot",
  "PerplexityBot",
  "Perplexity-User",
  "Google-Extended",
  "Applebot",
  "Applebot-Extended",
  "CCBot",
];

export default function robots(): MetadataRoute.Robots {
  // /api/ is the live-status function, not a page. Everything else stays open, including /_next/ (Google needs it to render).
  const rule = { allow: "/", disallow: "/api/" };
  return {
    rules: [{ userAgent: NAMED_BOTS, ...rule }, { userAgent: "*", ...rule }],
    sitemap: absoluteUrl("/sitemap.xml"),
  };
}
