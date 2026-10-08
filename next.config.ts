import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  experimental: {
    // proxy.ts runs on /api routes and buffers request bodies, by default only
    // up to 10 MB. Series uploads (/api/v1/analyses) allow up to 50 MB of
    // images plus multipart overhead, so the buffer must be larger or the
    // route handler would receive a truncated body.
    proxyClientMaxBodySize: "55mb",
  },
};

export default nextConfig;
