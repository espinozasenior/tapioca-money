import { config } from "dotenv";
import { beforeAll, afterAll, afterEach } from "vitest";

// Load environment variables from .env file
config();

// Load test environment variables
beforeAll(() => {
  // Set test-specific env vars
  process.env.AGENT_SIMULATION_MODE = "true";
  process.env.DATABASE_URL = process.env.DATABASE_URL_TEST || process.env.DATABASE_URL;
  process.env.ZERODEV_PROJECT_ID = "test_project_id";
  process.env.ZERODEV_BUNDLER_URL = "https://test.bundler.url";
  process.env.NEXT_PUBLIC_PRIVY_APP_ID = "test_privy_app_id";
  process.env.CRON_SECRET = "test_secret_12345678901234567890";

  // Encryption key for session key encryption tests (any valid 32-byte hex)
  if (!process.env.DATABASE_ENCRYPTION_KEY) {
    process.env.DATABASE_ENCRYPTION_KEY = "a".repeat(64);
  }

  console.log("[Test Setup] Environment configured for testing");
});

// Cleanup after each test
afterEach(() => {
  // Will be extended by individual test suites
});

afterAll(() => {
  console.log("[Test Setup] Tests completed");
});
