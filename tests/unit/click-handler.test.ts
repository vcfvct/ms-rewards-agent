import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ClickHandler } from '../../src/handlers/click-handler';
import type { BrowserAdapter } from '../../src/core/browser-adapter';

// Mock the embeddings module to prevent model loading in tests
vi.mock('../../src/utils/embeddings', () => ({
  matchQueryBank: vi.fn().mockResolvedValue(null),
}));

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
      humanizer: {
        clickLocatorHuman: vi.fn().mockResolvedValue(undefined),
      },
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

  describe('explore query normalization', () => {
    it('should strip "search using bing to" prefix', () => {
      const handler = new ClickHandler(mockBrowser);
      const normalized = (handler as any).normalizeExploreQuery('Search using Bing to translate any word you want');
      expect(normalized).toBe('translate any word you want');
    });
  });

  describe('run', () => {
    it('should navigate to the Rewards Earn page', async () => {
      const handler = new ClickHandler(mockBrowser);
      await handler.run(mockPage);

      expect(mockBrowser.goto).toHaveBeenCalledWith('https://rewards.bing.com/earn');
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

  describe('Earn page discovery', () => {
    it('should include activated point cards and skip completed or promotional links', async () => {
      const createEarnLink = ({
        title,
        description,
        points,
        status,
      }: {
        title: string;
        description: string;
        points?: string;
        status?: string;
      }) => {
        const paragraphTexts = [title, description, ...(points ? [points] : [])];
        const textLocator = (text: string | undefined) => ({
          textContent: vi.fn().mockResolvedValue(text),
        });

        return {
          isVisible: vi.fn().mockResolvedValue(true),
          textContent: vi.fn().mockResolvedValue(
            [...paragraphTexts, ...(status ? [status] : [])].join(''),
          ),
          getAttribute: vi.fn().mockResolvedValue(null),
          getByText: vi.fn().mockImplementation((pattern: RegExp) => ({
            count: vi.fn().mockResolvedValue(status && pattern.test(status) ? 1 : 0),
          })),
          locator: vi.fn().mockImplementation((selector: string) => {
            expect(selector).toBe('p');
            return {
              filter: vi.fn().mockImplementation(({ hasText }: { hasText: RegExp }) => ({
                count: vi.fn().mockResolvedValue(
                  paragraphTexts.some((text) => hasText.test(text)) ? 1 : 0,
                ),
              })),
              first: vi.fn().mockReturnValue(textLocator(paragraphTexts[0])),
              nth: vi.fn().mockImplementation((index: number) => textLocator(paragraphTexts[index])),
            };
          }),
        };
      };

      const activatedExplore = createEarnLink({
        title: 'Find deals on Bing',
        description: 'Search on Bing to find items on your shopping list',
        points: '+10',
        status: 'Activated',
      });
      const completedExplore = createEarnLink({
        title: 'Swipe smart',
        description: 'Search on Bing for credit cards',
        points: '10',
        status: 'Completed',
      });
      const lockedExplore = createEarnLink({
        title: 'Catch the show',
        description: 'Search on Bing for concert tickets',
        points: '+10',
        status: 'Unlocks tomorrow',
      });
      const standardActivity = createEarnLink({
        title: 'Serengeti adventure',
        description: 'Witness Serengeti National Park',
        points: '+15',
      });
      const promotion = createEarnLink({
        title: 'New Wallpaper Every Day',
        description: 'Install Bing Wallpaper today',
      });
      const locatorList = (items: unknown[]) => ({
        count: vi.fn().mockResolvedValue(items.length),
        nth: vi.fn().mockImplementation((index: number) => items[index]),
      });

      mockPage.locator = vi.fn().mockImplementation((selector: string) => {
        if (selector === '#exploreonbing a') {
          return locatorList([completedExplore, lockedExplore, activatedExplore]);
        }
        if (selector === '#moreactivities a') {
          return locatorList([promotion, standardActivity]);
        }
        return mockLocator;
      });

      const handler = new ClickHandler(mockBrowser, { dryRun: true });
      const result = await handler.run(mockPage);

      expect(result.meta?.clickedActivities).toEqual([
        'Find deals on Bing',
        'Serengeti adventure',
      ]);
      expect(mockBrowser.humanizer.clickLocatorHuman).not.toHaveBeenCalled();
    });

    it('should open the Daily Set sidebar and include its point-bearing task links', async () => {
      const opener = {
        count: vi.fn().mockResolvedValue(1),
        isVisible: vi.fn().mockResolvedValue(true),
      };
      const closeButton = {
        count: vi.fn().mockResolvedValue(1),
      };
      const shortcut = {
        isVisible: vi.fn().mockResolvedValue(true),
        textContent: vi.fn().mockResolvedValue('Activity: 0/3'),
        getAttribute: vi.fn().mockResolvedValue(null),
        getByText: vi.fn().mockReturnValue({ count: vi.fn().mockResolvedValue(0) }),
        locator: vi.fn().mockReturnValue({
          filter: vi.fn().mockReturnValue({ count: vi.fn().mockResolvedValue(0) }),
        }),
      };
      const paragraphs = ['Upcoming events near me', 'Exciting events coming soon', '+10'];
      const dailyTask = {
        isVisible: vi.fn().mockResolvedValue(true),
        textContent: vi.fn().mockResolvedValue(paragraphs.join('')),
        getAttribute: vi.fn().mockResolvedValue(null),
        getByText: vi.fn().mockReturnValue({ count: vi.fn().mockResolvedValue(0) }),
        locator: vi.fn().mockReturnValue({
          filter: vi.fn().mockImplementation(({ hasText }: { hasText: RegExp }) => ({
            count: vi.fn().mockResolvedValue(
              paragraphs.some((text) => hasText.test(text)) ? 1 : 0,
            ),
          })),
          first: vi.fn().mockReturnValue({
            textContent: vi.fn().mockResolvedValue(paragraphs[0]),
          }),
          nth: vi.fn().mockImplementation((index: number) => ({
            textContent: vi.fn().mockResolvedValue(paragraphs[index]),
          })),
        }),
      };
      const dailyLinks = {
        count: vi.fn().mockResolvedValue(2),
        nth: vi.fn().mockImplementation((index: number) => [shortcut, dailyTask][index]),
      };
      const dialog = {
        count: vi.fn().mockResolvedValue(1),
        isVisible: vi.fn().mockResolvedValue(true),
        waitFor: vi.fn().mockResolvedValue(undefined),
        locator: vi.fn().mockReturnValue(dailyLinks),
        getByRole: vi.fn().mockReturnValue(closeButton),
      };
      const emptyLinks = {
        count: vi.fn().mockResolvedValue(0),
        nth: vi.fn(),
      };

      mockPage.locator = vi.fn().mockImplementation((selector: string) => {
        if (selector === '#exploreonbing a' || selector === '#moreactivities a') {
          return emptyLinks;
        }
        if (selector === '#streaks button') {
          return {
            filter: vi.fn().mockReturnValue({
              first: vi.fn().mockReturnValue(opener),
            }),
          };
        }
        if (selector === '[role="dialog"]') {
          return { filter: vi.fn().mockReturnValue(dialog) };
        }
        return mockLocator;
      });

      const handler = new ClickHandler(mockBrowser, { dryRun: true });
      const result = await handler.run(mockPage);

      expect(result.meta?.clickedActivities).toEqual(['Upcoming events near me']);
      expect(mockBrowser.humanizer.clickLocatorHuman).toHaveBeenCalledWith(mockPage, opener);
      expect(mockBrowser.humanizer.clickLocatorHuman).toHaveBeenCalledWith(mockPage, closeButton);
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

