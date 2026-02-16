import type { NextConfig } from "next";
const { IgnorePlugin } = require("webpack");

const nextConfig: NextConfig = {
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
    turbo: {
      resolveAlias: {
        "@solana/kit": "./utils/empty-module.ts",
        "@solana/web3.js": "./utils/empty-module.ts",
        "@solana/accounts": "./utils/empty-module.ts",
        "@solana/addresses": "./utils/empty-module.ts",
        "@solana/codecs": "./utils/empty-module.ts",
        "@solana/programs": "./utils/empty-module.ts",
        "@solana/rpc": "./utils/empty-module.ts",
        "@solana/rpc-api": "./utils/empty-module.ts",
        "@solana/rpc-types": "./utils/empty-module.ts",
        "@solana/signers": "./utils/empty-module.ts",
        "@solana/transactions": "./utils/empty-module.ts",
        "@solana/transaction-messages": "./utils/empty-module.ts",
        "@solana-program/token": "./utils/empty-module.ts",
        "@solana-program/system": "./utils/empty-module.ts",
        "@solana-program/memo": "./utils/empty-module.ts",
        "@solana-program/compute-budget": "./utils/empty-module.ts",
        "@solana-program/associated-token-account": "./utils/empty-module.ts",
        "react-native": "./utils/empty-module.ts",
        "@react-native-async-storage/async-storage": "./utils/empty-module.ts",
        "react-native-url-polyfill": "./utils/empty-module.ts",
      },
    },
  },
  webpack: (config, { dev }) => {
    // Disable webpack cache in production (useless on Vercel's ephemeral builders)
    if (!dev) {
      config.cache = false;
    }
    // Exclude React Native transitive dependencies (completely unused in this EVM project)
    config.plugins.push(
      new IgnorePlugin({ resourceRegExp: /^react-native$/ }),
      new IgnorePlugin({ resourceRegExp: /^@react-native/ }),
    );

    // Stub out heavy Solana transitive deps from @crossmint/client-sdk-react-ui
    // These are resolved to empty modules instead of being ignored, so require() won't throw
    config.resolve.alias = {
      ...config.resolve.alias,
      "@solana/kit": false,
      "@solana/web3.js": false,
      "@solana/accounts": false,
      "@solana/addresses": false,
      "@solana/codecs": false,
      "@solana/programs": false,
      "@solana/rpc": false,
      "@solana/rpc-api": false,
      "@solana/rpc-types": false,
      "@solana/signers": false,
      "@solana/transactions": false,
      "@solana/transaction-messages": false,
      "@solana-program/token": false,
      "@solana-program/system": false,
      "@solana-program/memo": false,
      "@solana-program/compute-budget": false,
      "@solana-program/associated-token-account": false,
    };

    config.resolve.fallback = {
      ...config.resolve.fallback,
      "@react-native-async-storage/async-storage": false,
      "react-native": false,
      "react-native-url-polyfill": false,
    };

    return config;
  },
};

export default nextConfig;
