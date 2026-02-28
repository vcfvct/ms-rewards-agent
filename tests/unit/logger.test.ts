import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { existsSync, unlinkSync, rmdirSync, readFileSync } from 'fs';
import { Logger, initLogger } from '../../src/utils/logger';

describe('Logger', () => {
  const testLogPath = './test-data/logs/test.jsonl';

  afterEach(() => {
    // Clean up test files
    if (existsSync(testLogPath)) {
      unlinkSync(testLogPath);
    }
    try {
      rmdirSync('./test-data/logs');
      rmdirSync('./test-data');
    } catch {
      // Ignore
    }
  });

  describe('basic logging', () => {
    it('should log to console when enabled', () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const logger = new Logger({ consoleEnabled: true, minLevel: 'debug' });
      logger.info('Test action');

      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it('should not log to console when disabled', () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const logger = new Logger({ consoleEnabled: false });
      logger.info('Test action');

      expect(consoleSpy).not.toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it('should respect minimum log level', () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const logger = new Logger({ consoleEnabled: true, minLevel: 'warn' });
      logger.debug('Debug message'); // Should not log
      logger.info('Info message');   // Should not log
      logger.warn('Warn message');   // Should log
      logger.error('Error message'); // Should log

      expect(consoleSpy).toHaveBeenCalledTimes(2);
      consoleSpy.mockRestore();
    });
  });

  describe('file logging', () => {
    it('should write to file when path provided', () => {
      const logger = new Logger({
        filePath: testLogPath,
        consoleEnabled: false
      });

      logger.info('Test action', { selector: '#test' });
      logger.close();

      expect(existsSync(testLogPath)).toBe(true);

      const content = readFileSync(testLogPath, 'utf-8');
      const lines = content.trim().split('\n');
      expect(lines.length).toBe(1);

      const entry = JSON.parse(lines[0]!);
      expect(entry.action).toBe('Test action');
      expect(entry.selector).toBe('#test');
    });

    it('should write valid JSON lines', () => {
      const logger = new Logger({
        filePath: testLogPath,
        consoleEnabled: false
      });

      logger.info('Action 1');
      logger.warn('Action 2');
      logger.error('Action 3', new Error('Test error'));
      logger.close();

      const content = readFileSync(testLogPath, 'utf-8');
      const lines = content.trim().split('\n');

      // Each line should be valid JSON
      for (const line of lines) {
        expect(() => JSON.parse(line)).not.toThrow();
      }
    });

    it('should include timestamp in entries', () => {
      const logger = new Logger({
        filePath: testLogPath,
        consoleEnabled: false
      });

      logger.info('Test');
      logger.close();

      const content = readFileSync(testLogPath, 'utf-8');
      const entry = JSON.parse(content.trim());

      expect(entry.timestamp).toBeDefined();
      expect(new Date(entry.timestamp).getTime()).not.toBeNaN();
    });
  });

  describe('error logging', () => {
    it('should include error message and stack', () => {
      const logger = new Logger({
        filePath: testLogPath,
        consoleEnabled: false
      });

      const error = new Error('Test error message');
      logger.error('Operation failed', error);
      logger.close();

      const content = readFileSync(testLogPath, 'utf-8');
      const entry = JSON.parse(content.trim());

      expect(entry.error).toBe('Test error message');
      expect(entry.stack).toBeDefined();
    });

    it('should handle string errors', () => {
      const logger = new Logger({
        filePath: testLogPath,
        consoleEnabled: false
      });

      logger.error('Operation failed', 'Something went wrong');
      logger.close();

      const content = readFileSync(testLogPath, 'utf-8');
      const entry = JSON.parse(content.trim());

      expect(entry.error).toBe('Something went wrong');
    });
  });

  describe('logResult', () => {
    it('should log ActionResult correctly', () => {
      const logger = new Logger({
        filePath: testLogPath,
        consoleEnabled: false
      });

      logger.logResult('TestHandler', {
        type: 'click',
        status: 'ok',
        attempts: 3,
        durationMs: 1500,
        meta: { clicked: 2 },
      });
      logger.close();

      const content = readFileSync(testLogPath, 'utf-8');
      const entry = JSON.parse(content.trim());

      expect(entry.action).toBe('TestHandler:complete');
      expect(entry.result).toBe('success');
      expect(entry.durationMs).toBe(1500);
      expect(entry.meta!.attempts).toBe(3);
    });
  });

  describe('singleton', () => {
    it('should allow reinitializing via initLogger', () => {
      const logger1 = initLogger({ consoleEnabled: false });
      const logger2 = initLogger({ consoleEnabled: false });

      expect(logger1).not.toBe(logger2);
      logger2.close();
    });
  });
});
