/**
 * Error Tracking System for Agent Operations
 * Logs errors with severity levels and provides metrics
 */

import { neon } from '@neondatabase/serverless';

export enum ErrorSeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical',
}

export type ErrorCategory =
  | 'simulation'
  | 'execution'
  | 'database'
  | 'api'
  | 'zerodev'
  | 'authorization'
  | 'gas_estimation';

export interface ErrorLog {
  id: string;
  severity: ErrorSeverity;
  category: ErrorCategory;
  message: string;
  userAddress?: string;
  stack?: string;
  metadata?: Record<string, any>;
  timestamp: number;
}

/**
 * In-memory error storage (for MVP)
 * In production, this should be replaced with persistent storage
 * or external service like Sentry/DataDog
 */
class ErrorStore {
  private errors: ErrorLog[] = [];
  private maxErrors = 1000; // Keep last 1000 errors

  add(error: ErrorLog): void {
    this.errors.push(error);

    // Keep only recent errors
    if (this.errors.length > this.maxErrors) {
      this.errors = this.errors.slice(-this.maxErrors);
    }

    // Log to console for debugging
    const prefix = `[${error.severity.toUpperCase()}] [${error.category}]`;
    if (error.severity === ErrorSeverity.CRITICAL || error.severity === ErrorSeverity.HIGH) {
      console.error(prefix, error.message, error.metadata || '');
    } else {
      console.warn(prefix, error.message);
    }
  }

  getRecent(limit: number): ErrorLog[] {
    return this.errors.slice(-limit).reverse();
  }

  getByCategory(category: ErrorCategory, limit: number = 50): ErrorLog[] {
    return this.errors
      .filter(e => e.category === category)
      .slice(-limit)
      .reverse();
  }

  getBySeverity(severity: ErrorSeverity, limit: number = 50): ErrorLog[] {
    return this.errors
      .filter(e => e.severity === severity)
      .slice(-limit)
      .reverse();
  }

  getErrorRate(windowMinutes: number): number {
    const windowMs = windowMinutes * 60 * 1000;
    const cutoff = Date.now() - windowMs;
    const recentErrors = this.errors.filter(e => e.timestamp >= cutoff);
    return recentErrors.length / windowMinutes; // Errors per minute
  }

  clear(): void {
    this.errors = [];
  }

  get count(): number {
    return this.errors.length;
  }
}

/**
 * Persist CRITICAL and HIGH severity errors to agent_actions table.
 * Best-effort — DB failures are caught and logged, never thrown.
 */
async function persistErrorToDatabase(error: ErrorLog): Promise<void> {
  if (error.severity !== ErrorSeverity.CRITICAL && error.severity !== ErrorSeverity.HIGH) {
    return;
  }

  try {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) return;

    const sql = neon(databaseUrl);

    // Look up user_id if userAddress is provided
    let userId: string | null = null;
    if (error.userAddress) {
      const userResult = await sql`
        SELECT id FROM users WHERE LOWER(wallet_address) = LOWER(${error.userAddress})
      `;
      userId = userResult[0]?.id ?? null;
    }

    await sql`
      INSERT INTO agent_actions (user_id, action_type, status, error_message, metadata)
      VALUES (
        ${userId},
        ${`error_${error.category}`},
        ${'failed'},
        ${error.message},
        ${JSON.stringify({
          severity: error.severity,
          category: error.category,
          errorId: error.id,
          stack: error.stack,
          ...error.metadata,
        })}::jsonb
      )
    `;
  } catch (dbError) {
    // Best-effort persistence — never let DB failures break error tracking
    console.error('[ErrorTracker] Failed to persist error to database:', dbError);
  }
}

const errorStore = new ErrorStore();

/**
 * Error Tracker - Central error logging and monitoring
 */
export class ErrorTracker {
  /**
   * Log an error with context
   */
  static async logError(error: Omit<ErrorLog, 'id' | 'timestamp'>): Promise<void> {
    const errorLog: ErrorLog = {
      id: `err_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: Date.now(),
      ...error,
    };

    errorStore.add(errorLog);

    // Persist CRITICAL and HIGH errors to database (best-effort, non-blocking)
    persistErrorToDatabase(errorLog).catch(() => {});

    // In production, send to external monitoring service
    // await sendToSentry(errorLog);
    // await sendToDataDog(errorLog);
  }

  /**
   * Log an error from exception
   */
  static async logException(
    exception: Error,
    severity: ErrorSeverity,
    category: ErrorCategory,
    metadata?: Record<string, any>
  ): Promise<void> {
    await this.logError({
      severity,
      category,
      message: exception.message,
      stack: exception.stack,
      metadata: {
        ...metadata,
        exceptionName: exception.name,
      },
    });
  }

  /**
   * Get recent errors
   */
  static async getRecentErrors(limit: number = 50): Promise<ErrorLog[]> {
    return errorStore.getRecent(limit);
  }

  /**
   * Get errors by category
   */
  static async getErrorsByCategory(
    category: ErrorCategory,
    limit: number = 50
  ): Promise<ErrorLog[]> {
    return errorStore.getByCategory(category, limit);
  }

  /**
   * Get errors by severity
   */
  static async getErrorsBySeverity(
    severity: ErrorSeverity,
    limit: number = 50
  ): Promise<ErrorLog[]> {
    return errorStore.getBySeverity(severity, limit);
  }

  /**
   * Get error rate (errors per minute in time window)
   */
  static async getErrorRate(windowMinutes: number = 60): Promise<number> {
    return errorStore.getErrorRate(windowMinutes);
  }

  /**
   * Clear all errors (for testing)
   */
  static async clearErrors(): Promise<void> {
    errorStore.clear();
  }

  /**
   * Get error count
   */
  static async getErrorCount(): Promise<number> {
    return errorStore.count;
  }

  /**
   * Get recent errors from database (persisted CRITICAL/HIGH errors)
   */
  static async getPersistedErrors(limit: number = 50): Promise<any[]> {
    try {
      const databaseUrl = process.env.DATABASE_URL;
      if (!databaseUrl) return [];

      const sql = neon(databaseUrl);
      const results = await sql`
        SELECT id, action_type, status, error_message, metadata, created_at
        FROM agent_actions
        WHERE action_type LIKE 'error_%'
        ORDER BY created_at DESC
        LIMIT ${limit}
      `;
      return results;
    } catch {
      return [];
    }
  }

  /**
   * Get error rate from database for a time window
   */
  static async getPersistedErrorRate(windowMinutes: number = 60): Promise<number> {
    try {
      const databaseUrl = process.env.DATABASE_URL;
      if (!databaseUrl) return 0;

      const sql = neon(databaseUrl);
      const result = await sql`
        SELECT COUNT(*) as count
        FROM agent_actions
        WHERE action_type LIKE 'error_%'
          AND created_at >= NOW() - INTERVAL '1 minute' * ${windowMinutes}
      `;
      return parseInt(result[0]?.count ?? '0') / windowMinutes;
    } catch {
      return 0;
    }
  }
}

/**
 * Helper to categorize errors based on message
 */
export function categorizeError(error: Error): ErrorCategory {
  const message = error.message.toLowerCase();

  if (message.includes('simulation') || message.includes('estimate')) {
    return 'simulation';
  }
  if (message.includes('zerodev') || message.includes('bundler')) {
    return 'zerodev';
  }
  if (message.includes('authorization') || message.includes('7702')) {
    return 'authorization';
  }
  if (message.includes('database') || message.includes('sql')) {
    return 'database';
  }
  if (message.includes('gas')) {
    return 'gas_estimation';
  }
  if (message.includes('api') || message.includes('fetch')) {
    return 'api';
  }

  return 'execution';
}

/**
 * Helper to determine severity based on error
 */
export function getSeverity(error: Error, category: ErrorCategory): ErrorSeverity {
  const message = error.message.toLowerCase();

  // Critical errors
  if (
    category === 'database' ||
    message.includes('critical') ||
    message.includes('fatal')
  ) {
    return ErrorSeverity.CRITICAL;
  }

  // High severity
  if (
    category === 'authorization' ||
    category === 'execution' ||
    message.includes('failed to execute')
  ) {
    return ErrorSeverity.HIGH;
  }

  // Medium severity
  if (
    category === 'zerodev' ||
    category === 'gas_estimation' ||
    message.includes('timeout')
  ) {
    return ErrorSeverity.MEDIUM;
  }

  // Low severity (simulation, API errors)
  return ErrorSeverity.LOW;
}
