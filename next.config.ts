import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  // The app only ever runs under `next dev`, where the badge would sit on the status bar.
  // Compile and runtime errors still show without it.
  devIndicators: false,
  partialPrefetching: true,
};

export default nextConfig;
