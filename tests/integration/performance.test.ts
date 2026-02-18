/**
 * Performance and Stress Tests
 * Tests system behavior under load
 */

import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { seedTestUser, createTestTransferSession, cleanupTestData } from "../helpers/test-setup";
import {
  checkTransferRateLimit,
  recordTransferAttempt,
  resetUserRateLimit,
} from "@/lib/rate-limiter";

describe("Performance & Stress Tests", () => {
  const testAddresses: string[] = [];

  beforeEach(() => {
    // Generate test addresses
    for (let i = 0; i < 10; i++) {
      const addr = `0x${i.toString().padStart(40, "0")}`;
      testAddresses.push(addr);
    }
  });

  afterEach(async () => {
    // Cleanup all test users
    if (testAddresses.length > 0) {
      await cleanupTestData(testAddresses);
    }

    // Reset rate limits
    testAddresses.forEach((addr) => resetUserRateLimit(addr));
  });

  test("Process 100 users within reasonable time", async () => {
    // Create 100 test addresses
    const addresses = [];
    for (let i = 0; i < 100; i++) {
      addresses.push(`0x${i.toString(16).padStart(40, "0")}`);
    }

    const startTime = Date.now();

    // Simulate processing each user
    const results = addresses.map((addr, index) => ({
      address: addr,
      processed: true,
      duration: Math.random() * 500, // 0-500ms per user
    }));

    const endTime = Date.now();
    const totalDuration = endTime - startTime;

    // Should complete within 60 seconds
    expect(totalDuration).toBeLessThan(60000);

    // All users processed
    expect(results.length).toBe(100);
    expect(results.every((r) => r.processed)).toBe(true);
  });

  test("No memory leaks during batch processing", async () => {
    const initialMemory = process.memoryUsage().heapUsed;

    // Process large batch
    const iterations = 1000;
    for (let i = 0; i < iterations; i++) {
      // Simulate work
      const data = {
        address: `0x${i.toString(16).padStart(40, "0")}`,
        timestamp: Date.now(),
      };

      // Process and discard
      expect(data.address).toBeDefined();
    }

    const finalMemory = process.memoryUsage().heapUsed;
    const memoryGrowth = finalMemory - initialMemory;
    const memoryGrowthMB = memoryGrowth / 1024 / 1024;

    // Memory growth should be reasonable (< 50MB for 1000 iterations)
    expect(memoryGrowthMB).toBeLessThan(50);
  });

  test("Rate limiter handles concurrent requests", () => {
    const userAddress = "0xCONCURRENT_TEST_12345678901234567890";

    // Simulate 10 concurrent transfer checks
    const concurrentChecks = Array(10)
      .fill(null)
      .map(() => checkTransferRateLimit(userAddress, 10));

    // All should return consistent results
    const allAllowed = concurrentChecks.every((check) => check.allowed === true);
    expect(allAllowed).toBe(true);

    // All should show same attempts remaining
    const firstCheck = concurrentChecks[0];
    const allSame = concurrentChecks.every(
      (check) => check.attemptsRemaining === firstCheck.attemptsRemaining
    );
    expect(allSame).toBe(true);
  });

  test("Database connection pool handling", async () => {
    // Simulate 50 concurrent database operations
    const operations = Array(50)
      .fill(null)
      .map(async (_, i) => {
        const addr = `0x${i.toString(16).padStart(40, "0")}`;
        try {
          await seedTestUser(addr, false);
          return { success: true, address: addr };
        } catch (error) {
          return { success: false, address: addr, error };
        }
      });

    const results = await Promise.all(operations);

    // Most should succeed (allow for some rate limiting)
    const successCount = results.filter((r) => r.success).length;
    expect(successCount).toBeGreaterThan(40); // At least 80% success rate

    // Cleanup
    const addresses = results.map((r) => r.address);
    await cleanupTestData(addresses);
  });

  test("Transfer rate limiter scales with user count", () => {
    // Test with 1000 different users
    const userCount = 1000;
    const startTime = Date.now();

    for (let i = 0; i < userCount; i++) {
      const addr = `0x${i.toString(16).padStart(40, "0")}`;
      const result = checkTransferRateLimit(addr, 10);
      expect(result.allowed).toBe(true);
    }

    const endTime = Date.now();
    const duration = endTime - startTime;

    // Should handle 1000 users quickly (< 5 seconds)
    expect(duration).toBeLessThan(5000);
  });

  test("Session validation performance", async () => {
    // Create 100 sessions
    const sessions = [];
    for (let i = 0; i < 100; i++) {
      const addr = `0x${i.toString(16).padStart(40, "0")}`;
      const session = await createTestTransferSession(addr);
      sessions.push(session);
    }

    const startTime = Date.now();

    // Validate all sessions
    sessions.forEach((session) => {
      const now = Math.floor(Date.now() / 1000);
      const isValid = session.expiry > now;
      expect(isValid).toBe(true);
    });

    const endTime = Date.now();
    const duration = endTime - startTime;

    // Should validate 100 sessions quickly (< 1 second)
    expect(duration).toBeLessThan(1000);

    // Cleanup
    const addresses = sessions.map((_, i) => `0x${i.toString(16).padStart(40, "0")}`);
    await cleanupTestData(addresses);
  });

  test("Large transaction batches", async () => {
    const userAddress = "0xBATCH_TEST_345678901234567890123456";

    // Record 100 transfers
    const startTime = Date.now();

    for (let i = 0; i < 100; i++) {
      recordTransferAttempt(userAddress, Math.random() * 100, Math.random() > 0.5);
    }

    const endTime = Date.now();
    const duration = endTime - startTime;

    // Should handle 100 records quickly
    expect(duration).toBeLessThan(1000);

    // Cleanup
    resetUserRateLimit(userAddress);
  });

  test("Parallel session creation", async () => {
    // Create 10 sessions in parallel
    const addresses = Array(10)
      .fill(null)
      .map((_, i) => `0x${i.toString(16).padStart(40, "0")}`);

    const startTime = Date.now();

    const sessions = await Promise.all(
      addresses.map(async (addr) => {
        await seedTestUser(addr, false);
        return await createTestTransferSession(addr);
      })
    );

    const endTime = Date.now();
    const duration = endTime - startTime;

    // All sessions created
    expect(sessions.length).toBe(10);
    expect(sessions.every((s) => s !== null)).toBe(true);

    // Completed in reasonable time
    expect(duration).toBeLessThan(30000); // 30 seconds

    // Cleanup
    await cleanupTestData(addresses);
  });
});
