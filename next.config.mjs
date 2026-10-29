/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "export",
  trailingSlash: true,
  images: { unoptimized: true },
  reactStrictMode: true,
  // One 404 for both languages: each language has its own root layout, so there is no shared layout to hang it on.
  experimental: { globalNotFound: true },
};

export default nextConfig;
