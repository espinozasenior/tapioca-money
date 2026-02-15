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
  ],
  webpack: (config) => {
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
