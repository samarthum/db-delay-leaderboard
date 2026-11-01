import { randomBytes } from "node:crypto";

// One id per build, shared by the page bundles and /version.txt (lib/deploy.ts compares them to spot a newer deploy).
// Set on process.env so Next's build workers, which load this file again, see the same value.
process.env.GP_BUILD_ID ||= `${Date.now().toString(36)}-${randomBytes(4).toString("hex")}`;

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "export",
  trailingSlash: true,
  images: { unoptimized: true },
  reactStrictMode: true,
  env: { GP_BUILD_ID: process.env.GP_BUILD_ID },
  // One 404 for both languages: each language has its own root layout, so there is no shared layout to hang it on.
  experimental: { globalNotFound: true },
};

export default nextConfig;
