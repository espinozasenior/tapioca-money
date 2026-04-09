import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  compress: true,
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
          { key: "X-XSS-Protection", value: "1; mode=block" },
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
        ],
      },
    ];
  },
  serverExternalPackages: [
    "@morpho-org/simulation-sdk",
    "@morpho-org/blue-sdk",
    "@morpho-org/morpho-ts",
    "@zerodev/sdk",
    "@zerodev/permissions",
    "@zerodev/ecdsa-validator",
    "@zerodev/session-key",
    "ioredis",
    "@privy-io/node",
    "@neondatabase/serverless",
    "drizzle-orm",
    "libsodium-wrappers",
    "permissionless",
  ],
  experimental: {
    webpackBuildWorker: true,
    optimizePackageImports: [
      "@radix-ui/react-dialog",
      "@radix-ui/react-dropdown-menu",
      "@radix-ui/react-collapsible",
      "@radix-ui/react-scroll-area",
      "@heroicons/react",
      "lucide-react",
    ],
  },
  webpack: (config, { dev }) => {
    // Disable webpack cache in production (useless on Vercel's ephemeral builders)
    if (!dev) {
      config.cache = false;
    }

    return config;
  },
};

export default nextConfig;
