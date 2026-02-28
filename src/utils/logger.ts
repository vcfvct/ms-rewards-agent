import { appendFileSync, existsSync, mkdirSync } from 'fs';
import { dirname } from 'path';
import type { ActionResult } from '../types';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  action: string;
  selector?: string;
  query?: string;
  result?: 'success' | 'fail' | 'skip';
  durationMs?: number;
  meta?: Record<string, unknown>;
  error?: string;
  stack?: string;
}

/**
 * Structured JSON logger for observability.
 * Outputs JSON lines format for easy parsing.
 * Uses synchronous file writes to ensure data is immediately available.
 */
export class Logger {
  private filePath: string | null = null;
  private consoleEnabled: boolean;
  private minLevel: LogLevel;

  private levelPriority: Record<LogLevel, number> = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3,
  };

  constructor(options?: {
    filePath?: string;
    consoleEnabled?: boolean;
    minLevel?: LogLevel;
  }) {
    this.consoleEnabled = options?.consoleEnabled ?? true;
    this.minLevel = options?.minLevel ?? 'info';

    if (options?.filePath) {
      this.initLogFile(options.filePath);
    }
  }

  private initLogFile(filePath: string): void {
    try {
      const dir = dirname(filePath);
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }
      this.filePath = filePath;
    } catch (error) {
      console.error('[Logger] Failed to initialize log file:', error);
    }
  }

  private shouldLog(level: LogLevel): boolean {
    return this.levelPriority[level] >= this.levelPriority[this.minLevel];
  }

  private log(level: LogLevel, action: string, details?: Partial<Omit<LogEntry, 'timestamp' | 'level' | 'action'>>): void {
    if (!this.shouldLog(level)) return;

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      action,
      ...details,
    };

    // Write to file (JSON lines) - synchronous for reliability
    if (this.filePath) {
      try {
        appendFileSync(this.filePath, JSON.stringify(entry) + '\n');
      } catch (error) {
        console.error('[Logger] Failed to write to log file:', error);
      }
    }

    // Console output (formatted)
    if (this.consoleEnabled) {
      this.consoleLog(entry);
    }
  }

  private consoleLog(entry: LogEntry): void {
    const levelColors: Record<LogLevel, string> = {
      debug: '\x1b[90m', // gray
      info: '\x1b[36m',  // cyan
      warn: '\x1b[33m',  // yellow
      error: '\x1b[31m', // red
    };
    const reset = '\x1b[0m';
    const color = levelColors[entry.level];

    const timeStr = entry.timestamp.split('T')[1]?.split('.')[0] || '';
    const resultIcon = entry.result === 'success' ? '✓' : entry.result === 'fail' ? '✗' : '○';
    const durationStr = entry.durationMs ? ` (${entry.durationMs}ms)` : '';

    let message = `${color}[${timeStr}] [${entry.level.toUpperCase()}]${reset} ${entry.action}`;

    if (entry.result) {
      message += ` ${resultIcon}`;
    }
    if (entry.selector) {
      message += ` | selector: ${entry.selector}`;
    }
    if (entry.query) {
      message += ` | query: "${entry.query}"`;
    }
    message += durationStr;

    if (entry.error) {
      message += `\n  Error: ${entry.error}`;
    }

    console.log(message);
  }

  // Public logging methods
  debug(action: string, details?: Partial<Omit<LogEntry, 'timestamp' | 'level' | 'action'>>): void {
    this.log('debug', action, details);
  }

  info(action: string, details?: Partial<Omit<LogEntry, 'timestamp' | 'level' | 'action'>>): void {
    this.log('info', action, details);
  }

  warn(action: string, details?: Partial<Omit<LogEntry, 'timestamp' | 'level' | 'action'>>): void {
    this.log('warn', action, details);
  }

  error(action: string, error?: Error | string, details?: Partial<Omit<LogEntry, 'timestamp' | 'level' | 'action'>>): void {
    const errorDetails: Partial<LogEntry> = { ...details };

    if (error instanceof Error) {
      errorDetails.error = error.message;
      errorDetails.stack = error.stack;
    } else if (typeof error === 'string') {
      errorDetails.error = error;
    }

    this.log('error', action, errorDetails);
  }

  /**
   * Logs an ActionResult from a handler.
   */
  logResult(handlerName: string, result: ActionResult): void {
    const logResult = result.status === 'ok' ? 'success' : result.status === 'failed' ? 'fail' : 'skip';

    this.info(`${handlerName}:complete`, {
      result: logResult,
      durationMs: result.durationMs,
      meta: {
        attempts: result.attempts,
        ...result.meta,
      },
    });
  }

  /**
   * Closes the logger. With sync writes, this is a no-op but kept for API compatibility.
   */
  close(): void {
    this.filePath = null;
  }
}

// Default singleton instance
let defaultLogger: Logger | null = null;

export function initLogger(options?: ConstructorParameters<typeof Logger>[0]): Logger {
  if (defaultLogger) {
    defaultLogger.close();
  }
  defaultLogger = new Logger(options);
  return defaultLogger;
}
