import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Heavy server-only packages stay external to the bundle.
  serverExternalPackages: ["playwright", "simple-git", "execa", "@modelcontextprotocol/sdk"],
};

export default nextConfig;
