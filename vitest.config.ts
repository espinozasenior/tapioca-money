import { defineConfig } from "vitest/config";
import path from "path";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "node", // Use 'happy-dom' for React component tests
    globals: true,
    setupFiles: ["./tests/setup.ts"],
    include: ["tests/**/*.{test,spec}.{js,ts,jsx,tsx}"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html", "lcov"],
      include: [
        "lib/**/*.{ts,tsx,js,jsx}",
        "app/api/**/*.{ts,tsx,js,jsx}",
        "hooks/**/*.{ts,tsx,js,jsx}",
      ],
      exclude: [
        "**/*.test.ts",
        "**/*.spec.ts",
        "**/node_modules/**",
        "**/*.bak",
        "**/*.md",
        "lib/morpho/graphql-types.ts", // Auto-generated
      ],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 75,
        statements: 80,
      },
    },
    testTimeout: 45000, // 45s for integration tests
    // Ensure integration tests run sequentially to avoid DB concurrency issues
    fileParallelism: false,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./"),
    },
  },
});
