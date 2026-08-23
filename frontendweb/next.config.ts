import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Emits .next/standalone — a self-contained server.js plus only the
  // node_modules files actually traced as needed. The Docker image copies that
  // instead of the whole node_modules tree (see frontendweb/Dockerfile).
  // Harmless for `npm run dev`; only `next build` produces it.
  output: "standalone",
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'res.cloudinary.com',
      },
    ],
  },
};

export default nextConfig;
