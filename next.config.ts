import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  // Turbopack root is pinned so a parent directory (social/, which holds the
  // three source projects) is never inferred as the workspace root.
  turbopack: {
    root: path.join(__dirname),
  },

  // `next dev` otherwise writes AGENTS.md + CLAUDE.md at the project root on
  // every start (next/dist/server/lib/generate-agent-files.js, default true).
  // The repo's own agent instructions live outside this project, so the
  // generated pair is noise that reappears after every deletion.
  agentRules: false,
};

export default nextConfig;
