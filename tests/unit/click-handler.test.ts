import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ClickHandler, SelectorNotFoundError } from '../../src/handlers/click-handler';
import type { BrowserAdapter } from '../../src/core/browser-adapter';

// Mock the humanizer module to avoid real delays in tests
vi.mock('../../src/utils/humanizer', () => ({
  randomDelay: vi.fn().mockResolvedValue(undefined),
  generateMousePath: vi.fn().mockReturnValue([{ x: 0, y: 0 }]),
  Humanizer: vi.fn().mockImplementation(() => ({
    clickHuman: vi.fn().mockResolvedValue(undefined),
    typeHuman: vi.fn().mockResolvedValue(undefined),
  })),
}));

describe('ClickHandler', () => {
  let mockBrowser: BrowserAdapter;
  let mockPage: any;
  let mockLocator: any;
  let mockContext: any;

  beforeEach(() => {
    // Reset all mocks
    vi.clearAllMocks();

    // Create mock locator that simulates finding activity cards
    mockLocator = {
      count: vi.fn().mockResolvedValue(0),
      nth: vi.fn().mockReturnThis(),
      first: vi.fn().mockReturnThis(),
      all: vi.fn().mockResolvedValue([]),
      isVisible: vi.fn().mockResolvedValue(true),
      textContent: vi.fn().mockResolvedValue('Test Activity'),
      boundingBox: vi.fn().mockResolvedValue({ x: 100, y: 100, width: 50, height: 30 }),
      scrollIntoViewIfNeeded: vi.fn().mockResolvedValue(undefined),
      locator: vi.fn().mockReturnThis(),
      filter: vi.fn().mockReturnThis(),
      click: vi.fn().mockResolvedValue(undefined),
    };

    // Mock context for handling multiple pages (tabs)
    mockContext = {
      pages: vi.fn().mockReturnValue([mockPage]),
    };

    // Create mock page
    mockPage = {
      locator: vi.fn().mockReturnValue(mockLocator),
      context: vi.fn().mockReturnValue(mockContext),
      goto: vi.fn().mockResolvedValue(undefined),
    };

    // Create mock browser adapter
    mockBrowser = {
      goto: vi.fn().mockResolvedValue(undefined),
      getPage: vi.fn().mockReturnValue(mockPage),
      clickHuman: vi.fn().mockResolvedValue(undefined),
      typeHuman: vi.fn().mockResolvedValue(undefined),
    } as unknown as BrowserAdapter;
  });

  describe('constructor', () => {
    it('should use default config values', () => {
      const handler = new ClickHandler(mockBrowser);
      expect(handler.name).toBe('ClickHandler');
    });

    it('should accept custom config', () => {
      const handler = new ClickHandler(mockBrowser, { dryRun: true, maxActionsPerHour: 10 });
      expect(handler.name).toBe('ClickHandler');
    });
  });

  describe('run', () => {
    it('should navigate to rewards page', async () => {
      const handler = new ClickHandler(mockBrowser);
      await handler.run(mockPage);

      expect(mockBrowser.goto).toHaveBeenCalledWith('https://rewards.bing.com/');
    });

    it('should return skipped status when no activities found', async () => {
      mockLocator.count.mockResolvedValue(0);

      const handler = new ClickHandler(mockBrowser);
      const result = await handler.run(mockPage);

      expect(result.status).toBe('skipped');
      expect(result.type).toBe('click');
    });

    it('should track duration in result', async () => {
      const handler = new ClickHandler(mockBrowser);
      const result = await handler.run(mockPage);

      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });

    it('should handle errors gracefully', async () => {
      mockBrowser.goto = vi.fn().mockRejectedValue(new Error('Network error'));

      const handler = new ClickHandler(mockBrowser);
      const result = await handler.run(mockPage);

      expect(result.status).toBe('failed');
      expect(result.meta).toHaveProperty('error');
    });
  });

  describe('dry-run mode', () => {
    it('should not click in dry-run mode', async () => {
      // Setup: simulate finding one activity
      const mockActivityLocator = {
        ...mockLocator,
        count: vi.fn().mockResolvedValue(1),
        isVisible: vi.fn().mockResolvedValue(true),
        textContent: vi.fn().mockResolvedValue('Daily Activity'),
        boundingBox: vi.fn().mockResolvedValue({ x: 100, y: 100, width: 50, height: 30 }),
        scrollIntoViewIfNeeded: vi.fn().mockResolvedValue(undefined),
      };

      // Setup nested locator behavior
      mockActivityLocator.locator = vi.fn().mockImplementation((selector: string) => {
        if (selector.includes('title') || selector.includes('heading')) {
          return {
            first: vi.fn().mockReturnValue({
              textContent: vi.fn().mockResolvedValue('Test Activity'),
            }),
          };
        }
        if (selector === 'a') {
          return {
            first: vi.fn().mockReturnValue(mockActivityLocator),
            count: vi.fn().mockResolvedValue(1),
          };
        }

        // Default fallback for any other selector (description, completion, etc)
        // Must provide methods called by processCard (first, count, textContent)
        return {
          count: vi.fn().mockResolvedValue(0),
          first: vi.fn().mockReturnValue({
             textContent: vi.fn().mockRejectedValue(new Error('Not found')), // simulate missing element for catch clause
             count: vi.fn().mockResolvedValue(0)
          }),
        };
      });

      mockPage.locator = vi.fn().mockImplementation((selector: string) => {
        // Heading locator used by getCardsInSectionByHeading
        if (selector.includes('h1,h2,h3,h4') || selector.includes('heading')) {
          const headingChain: any = {
            filter: vi.fn().mockReturnThis(),
            first: vi.fn().mockReturnThis(),
            locator: vi.fn().mockImplementation(() => ({
              locator: vi.fn().mockReturnValue({
                count: vi.fn().mockResolvedValue(1),
                nth: vi.fn().mockReturnValue(mockActivityLocator),
              }),
            })),
          };
          return headingChain;
        }
        // XPath fallback for mee-card selectors
        if (selector.includes('mee-card')) {
          return {
            count: vi.fn().mockResolvedValue(1),
            nth: vi.fn().mockReturnValue(mockActivityLocator),
          };
        }
        return mockLocator;
      });

      const handler = new ClickHandler(mockBrowser, { dryRun: true });
      const result = await handler.run(mockPage);

      // Should NOT have actually clicked
      // We check the locator's click method, not browser.clickHuman since handler uses locator directly
      expect(mockActivityLocator.click).not.toHaveBeenCalled();

      // But should still report success in dry-run
      expect(result.status).toBe('ok');
    });
  });

  describe('points filter', () => {
    it('should skip More Activities cards without points-you-will-earn icon', async () => {
      // Build a card locator that is visible, not completed, but has NO points icon
      const noPointsCard: any = {
        count: vi.fn().mockResolvedValue(1),
        nth: vi.fn().mockReturnThis(),
        isVisible: vi.fn().mockResolvedValue(true),
        locator: vi.fn().mockImplementation((selector: string) => {
          // Completion check → not completed
          if (selector.includes('SkypeCircleCheck') || selector.includes('complete')) {
            return { count: vi.fn().mockResolvedValue(0) };
          }
          // Points check → NO points icon
          if (selector.includes('Points you will earn')) {
            return { count: vi.fn().mockResolvedValue(0) };
          }
          return {
            count: vi.fn().mockResolvedValue(0),
            first: vi.fn().mockReturnValue({
              textContent: vi.fn().mockResolvedValue('No-Points Card'),
            }),
          };
        }),
      };

      mockPage.locator = vi.fn().mockImplementation((selector: string) => {
        if (selector.includes('h1,h2,h3,h4')) {
          return {
            filter: vi.fn().mockReturnThis(),
            first: vi.fn().mockReturnThis(),
            locator: vi.fn().mockImplementation(() => ({
              locator: vi.fn().mockReturnValue(noPointsCard),
            })),
          };
        }
        // Explore section returns 0 cards
        if (selector.includes('explore')) {
          return { count: vi.fn().mockResolvedValue(0) };
        }
        return mockLocator;
      });

      const handler = new ClickHandler(mockBrowser);
      const result = await handler.run(mockPage);

      // Card without points icon should be filtered out → skipped
      expect(result.status).toBe('skipped');
    });
  });

  describe('rate limiting', () => {
    it('should respect maxActionsPerHour config', async () => {
      const handler = new ClickHandler(mockBrowser, { maxActionsPerHour: 1 });

      // Even with multiple activities, should stop at limit
      // (The actual limiting happens during activity processing)
      const result = await handler.run(mockPage);

      expect(result.attempts).toBeLessThanOrEqual(1);
    });
  });
});

describe('SelectorNotFoundError', () => {
  it('should create error with selector in message', () => {
    const error = new SelectorNotFoundError('#missing-element');

    expect(error.name).toBe('SelectorNotFoundError');
    expect(error.message).toContain('#missing-element');
  });
});
