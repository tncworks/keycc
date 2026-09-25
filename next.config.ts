import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // keep verification screenshots free of the dev overlay badge
  devIndicators: false,
};

export default nextConfig;
