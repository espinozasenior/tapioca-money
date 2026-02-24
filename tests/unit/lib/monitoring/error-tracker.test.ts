import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  ErrorTracker,
  ErrorSeverity,
  categorizeError,
  getSeverity,
} from "@/lib/monitoring/error-tracker";

// 1. Define mock implementation first
const { mockSql } = vi.hoisted(() => ({ mockSql: vi.fn() }));

// 2. Mock modules
vi.mock("@neondatabase/serverless", () => ({
  neon: () => mockSql,
}));

describe("Error Tracker", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await ErrorTracker.clearErrors();
    process.env.DATABASE_URL = "postgres://user:pass@host/db";

    // Default SQL mock
    mockSql.mockResolvedValue([]);
  });

  describe("Logging", () => {
    it("should log error to memory store", async () => {
      await ErrorTracker.logError({
        severity: ErrorSeverity.LOW,
        category: "api",
        message: "Test error",
      });

      const count = await ErrorTracker.getErrorCount();
      expect(count).toBe(1);

      const recent = await ErrorTracker.getRecentErrors();
      expect(recent[0].message).toBe("Test error");
    });

    it("should persist CRITICAL errors to DB", async () => {
      await ErrorTracker.logError({
        severity: ErrorSeverity.CRITICAL,
        category: "database",
        message: "DB Down",
      });

      // Check manually because tagged template literal args are hard to match exactly
      const calls = mockSql.mock.calls;
      expect(calls.length).toBe(1);

      const [strings, userId, actionType, status, message, metadata] = calls[0];

      expect(strings[0]).toContain("INSERT INTO agent_actions");
      expect(actionType).toBe("error_database");
      expect(status).toBe("failed");
      expect(message).toBe("DB Down");
      expect(JSON.parse(metadata).severity).toBe("critical");
    });

    it("should NOT persist LOW errors to DB", async () => {
      await ErrorTracker.logError({
        severity: ErrorSeverity.LOW,
        category: "api",
        message: "API Timeout",
      });

      expect(mockSql).not.toHaveBeenCalled();
    });

    it("should handle DB failure gracefully", async () => {
      mockSql.mockRejectedValue(new Error("DB Connection Failed"));

      // Should not throw
      await ErrorTracker.logError({
        severity: ErrorSeverity.CRITICAL,
        category: "database",
        message: "Critical Error",
      });

      const count = await ErrorTracker.getErrorCount();
      expect(count).toBe(1);
    });
  });

  describe("Retrieval & Filtering", () => {
    beforeEach(async () => {
      await ErrorTracker.logError({
        severity: ErrorSeverity.LOW,
        category: "api",
        message: "Low API",
      });
      await ErrorTracker.logError({
        severity: ErrorSeverity.HIGH,
        category: "execution",
        message: "High Exec",
      });
      await ErrorTracker.logError({
        severity: ErrorSeverity.CRITICAL,
        category: "database",
        message: "Crit DB",
      });
    });

    it("should filter by category", async () => {
      const apiErrors = await ErrorTracker.getErrorsByCategory("api");
      expect(apiErrors).toHaveLength(1);
      expect(apiErrors[0].message).toBe("Low API");
    });

    it("should filter by severity", async () => {
      const highErrors = await ErrorTracker.getErrorsBySeverity(ErrorSeverity.HIGH);
      expect(highErrors).toHaveLength(1);
      expect(highErrors[0].message).toBe("High Exec");
    });

    it("should calculate error rate", async () => {
      const rate = await ErrorTracker.getErrorRate(60); // 3 errors in last hour
      expect(rate).toBeCloseTo(3 / 60);
    });
  });

  describe("Helpers", () => {
    it("should categorize errors correctly", () => {
      expect(categorizeError(new Error("simulation failed"))).toBe("simulation");
      expect(categorizeError(new Error("zerodev error"))).toBe("zerodev");
      expect(categorizeError(new Error("sql error"))).toBe("database");
      expect(categorizeError(new Error("unknown"))).toBe("execution");
    });

    it("should determine severity correctly", () => {
      expect(getSeverity(new Error("fatal error"), "execution")).toBe(ErrorSeverity.CRITICAL);
      expect(getSeverity(new Error("failed to execute"), "execution")).toBe(ErrorSeverity.HIGH);
      expect(getSeverity(new Error("timeout"), "api")).toBe(ErrorSeverity.MEDIUM);
      expect(getSeverity(new Error("minor"), "api")).toBe(ErrorSeverity.LOW);
    });
  });
});
