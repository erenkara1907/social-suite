import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  // Turbopack root is pinned so a parent directory (social/, which holds the
  // three source projects) is never inferred as the workspace root.
  turbopack: {
    root: path.join(__dirname),
  },
};

export default nextConfig;
