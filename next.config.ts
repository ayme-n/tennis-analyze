import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The app binds to 0.0.0.0 and uses only relative browser -> server URLs,
  // so it works behind hosted previews/proxies without extra config.
  eslint: { ignoreDuringBuilds: true },
  // Dev-mode asset loading behind hosted previews (e.g. *.e2b.app).
  allowedDevOrigins: ["*.e2b.app"],
};

export default nextConfig;
