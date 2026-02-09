import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QuizHandler } from '../../src/handlers/quiz-handler';
import type { BrowserAdapter } from '../../src/core/browser-adapter';

// Mock the humanizer and storage modules
vi.mock('../../src/utils/humanizer', () => ({
  randomDelay: vi.fn().mockResolvedValue(undefined),
}));

// Mock QACache as a class
vi.mock('../../src/utils/storage', () => {
  return {
    QACache: class MockQACache {
      lookup = vi.fn().mockReturnValue(null);
      store = vi.fn();
      record = vi.fn();
      getConfidence = vi.fn().mockReturnValue(0);
      hashQuestion = vi.fn().mockReturnValue('abc123');
    },
  };
});

describe('QuizHandler', () => {
  let mockBrowser: BrowserAdapter;
  let mockPage: any;
  let mockLocator: any;
  let mockContext: any;

  beforeEach(() => {
    vi.clearAllMocks();

    mockLocator = {
      count: vi.fn().mockResolvedValue(0),
      first: vi.fn().mockReturnThis(),
      nth: vi.fn().mockReturnThis(),
      click: vi.fn().mockResolvedValue(undefined),
      textContent: vi.fn().mockResolvedValue('Test text'),
      scrollIntoViewIfNeeded: vi.fn().mockResolvedValue(undefined),
      locator: vi.fn().mockReturnThis(),
    };

    mockContext = {
      pages: vi.fn().mockReturnValue([mockPage]),
    };

    mockPage = {
      locator: vi.fn().mockReturnValue(mockLocator),
      context: vi.fn().mockReturnValue(mockContext),
      url: vi.fn().mockReturnValue('https://rewards.bing.com/'),
      content: vi.fn().mockResolvedValue('<html></html>'),
    };

    mockBrowser = {
      goto: vi.fn().mockResolvedValue(undefined),
      getPage: vi.fn().mockReturnValue(mockPage),
      clickHuman: vi.fn().mockResolvedValue(undefined),
      typeHuman: vi.fn().mockResolvedValue(undefined),
    } as unknown as BrowserAdapter;
  });

  describe('constructor', () => {
    it('should use default config values', () => {
      const handler = new QuizHandler(mockBrowser);
      expect(handler.name).toBe('QuizHandler');
    });

    it('should accept custom config', () => {
      const handler = new QuizHandler(mockBrowser, {
        dryRun: true,
      });
      expect(handler.name).toBe('QuizHandler');
    });
  });

  describe('run', () => {
    it('should navigate to rewards page', async () => {
      const handler = new QuizHandler(mockBrowser, { dryRun: true });
      await handler.run(mockPage);

      expect(mockBrowser.goto).toHaveBeenCalledWith('https://rewards.bing.com/');
    });

    it('should return correct result type', async () => {
      const handler = new QuizHandler(mockBrowser, { dryRun: true });
      const result = await handler.run(mockPage);

      expect(result.type).toBe('quiz');
    });

    it('should skip when no quizzes found', async () => {
      const handler = new QuizHandler(mockBrowser, { dryRun: true });
      const result = await handler.run(mockPage);

      expect(result.status).toBe('skipped');
      expect(result.meta).toHaveProperty('reason');
    });

    it('should track duration', async () => {
      const handler = new QuizHandler(mockBrowser, { dryRun: true });
      const result = await handler.run(mockPage);

      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });

    it('should handle errors gracefully', async () => {
      mockBrowser.goto = vi.fn().mockRejectedValue(new Error('Network error'));

      const handler = new QuizHandler(mockBrowser);
      const result = await handler.run(mockPage);

      expect(result.status).toBe('failed');
      expect(result.meta).toHaveProperty('error');
    });
  });

  describe('dry-run mode', () => {
    it('should not click in dry-run mode', async () => {
      const handler = new QuizHandler(mockBrowser, { dryRun: true });
      await handler.run(mockPage);

      expect(mockLocator.click).not.toHaveBeenCalled();
    });
  });

  describe('quiz detection', () => {
    it('should detect quiz activities by selector', async () => {
      // Setup: mock finding quiz cards
      const mockQuizLocator = {
        ...mockLocator,
        count: vi.fn().mockResolvedValue(2),
      };

      mockPage.locator = vi.fn().mockImplementation((selector: string) => {
        if (selector.includes('quiz')) {
          return mockQuizLocator;
        }
        return mockLocator;
      });

      const handler = new QuizHandler(mockBrowser, { dryRun: true });
      const result = await handler.run(mockPage);

      // Should have attempted to find quizzes
      expect(mockPage.locator).toHaveBeenCalled();
    });
  });

  describe('result tracking', () => {
    it('should track quiz completion statistics', async () => {
      // When no quizzes are found, should have reason in meta
      const handler = new QuizHandler(mockBrowser, { dryRun: true });
      const result = await handler.run(mockPage);

      // When skipped due to no quizzes, should have reason
      expect(result.status).toBe('skipped');
      expect(result.meta).toHaveProperty('reason');
      expect(result.meta?.reason).toBe('No quiz activities found');
    });
  });
});
