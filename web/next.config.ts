import type { NextConfig } from "next";

// This nonsecret destination is compiled into the rewrite manifest. No build-time fetch.
const backend = new URL(process.env.BACKEND_INTERNAL_URL ?? "http://127.0.0.1:8000");
if (
  !["http:", "https:"].includes(backend.protocol) ||
  backend.username || backend.password || backend.search || backend.hash ||
  backend.pathname !== "/"
) {
  throw new Error("BACKEND_INTERNAL_URL must be an HTTP(S) origin without credentials or a path");
}

const nextConfig: NextConfig = {
  /* config options here */
  experimental: {
    agentFeedback: true,
    proxyClientMaxBodySize: 21 * 1024 * 1024,
    proxyTimeout: 30_000,
  },
  async rewrites(): Promise<Array<{ source: string; destination: string }>> {
    return [{ source: "/api/:path*", destination: `${backend.origin}/api/:path*` }];
  },
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
