import type { Page, Locator } from 'playwright';
import type { TaskHandler, ActionResult, RunConfig } from '../types';
import { BrowserAdapter } from '../core/browser-adapter';
import { randomDelay } from '../utils/humanizer';

// Custom error for better retry logic
export class SelectorNotFoundError extends Error {
  constructor(selector: string) {
    super(`Selector not found: ${selector}`);
    this.name = 'SelectorNotFoundError';
  }
}


interface ActivityInfo {
  index: number;
  title: string;
  selector: string;
  isCompleted: boolean;
  locator: Locator;
  type: 'standard' | 'explore';
  description?: string;
}

export class ClickHandler implements TaskHandler {
  name = 'ClickHandler';
  private config: Pick<RunConfig, 'dryRun' | 'maxActionsPerHour'>;

  constructor(
    private browser: BrowserAdapter,
    config?: Partial<Pick<RunConfig, 'dryRun' | 'maxActionsPerHour'>>
  ) {
    this.config = {
      dryRun: config?.dryRun ?? false,
      maxActionsPerHour: config?.maxActionsPerHour ?? 30,
    };
  }

  private normalizeExploreQuery(text: string): string {
    const trimmed = text.trim();
    if (!trimmed) return '';

    // Examples we want to normalize:
    // - "Search on Bing for best pizza" -> "best pizza"
    // - "Search on Bing to learn about whales" -> "learn about whales"
    // Handle case-insensitively and allow extra whitespace/punctuation.
    const cleaned = trimmed
      .replace(/^search\s+on\s+bing\s+(?:to|for)\s*[:\-–]?\s*/i, '')
      .trim();

    return cleaned || trimmed;
  }

  private getExploreQuery(activity: ActivityInfo): string {
    const fromDescription = activity.description ? this.normalizeExploreQuery(activity.description) : '';
    if (fromDescription) return fromDescription;
    return this.normalizeExploreQuery(activity.title);
  }

  private getCardsInSectionByHeading(page: Page, headingRegex: RegExp): Locator {
    const heading = page
      .locator('h1,h2,h3,h4,[role="heading"]')
      .filter({ hasText: headingRegex })
      .first();

    // Find the closest container that actually contains cards.
    // The Rewards dashboard markup shifts often; avoid relying on specific class names.
    const container = heading.locator('xpath=ancestor::*[self::section or self::div][.//mee-card][1]');
    return container.locator('mee-card');
  }

  async run(page: Page): Promise<ActionResult> {
    console.log(`[ClickHandler] Starting... (dryRun: ${this.config.dryRun})`);
    const result: ActionResult = {
      type: 'click',
      status: 'skipped',
      attempts: 0,
      durationMs: 0,
      meta: { clickedActivities: [] as string[] },
    };
    const startTime = Date.now();

    try {
      // 1. Navigate to Rewards Dashboard
      await this.browser.goto('https://rewards.bing.com/');
      await randomDelay(2000, 4000);

      // 2. Find clickable reward activities
      const activities = await this.findClickableActivities(page);
      console.log(`[ClickHandler] Found ${activities.length} incomplete activities`);

      if (activities.length === 0) {
        console.log('[ClickHandler] No incomplete activities found');
        result.status = 'skipped';
        result.meta = { reason: 'No incomplete activities' };
        return result;
      }

      // 3. Click activities (respect rate limit)
      const maxClicks = Math.min(10, this.config.maxActionsPerHour); // Increased limit as searches are gone
      let clickedCount = 0;

      for (const activity of activities) {
        if (clickedCount >= maxClicks) {
          console.log(`[ClickHandler] Rate limit reached (${maxClicks} clicks)`);
          break;
        }

        result.attempts++;
        const clickResult = await this.clickActivity(page, activity);

        if (clickResult.success) {
          clickedCount++;
          (result.meta!.clickedActivities as string[]).push(clickResult.title);
          console.log(`[ClickHandler] ✓ Clicked: ${clickResult.title}`);
        } else {
          console.log(`[ClickHandler] ✗ Failed: ${clickResult.title}`);
        }

        // Wait between clicks
        await randomDelay(2000, 4000);
      }

      result.status = clickedCount > 0 ? 'ok' : 'failed';
      result.meta!.totalClicked = clickedCount;

    } catch (e) {
      console.error('[ClickHandler] Error:', e);
      result.status = 'failed';
      result.meta = { error: e instanceof Error ? e.message : String(e) };
    } finally {
      result.durationMs = Date.now() - startTime;
    }

    return result;
  }

  /**
   * Finds all clickable (incomplete) reward activities on the page.
   */
  private async findClickableActivities(page: Page): Promise<ActivityInfo[]> {
    const activities: ActivityInfo[] = [];

    // Helper to process a card
    const processCard = async (card: Locator, type: 'standard' | 'explore', index: number): Promise<ActivityInfo | null> => {
      try {
        if (!(await card.isVisible())) return null;

        // Check for completion
        const isCompleted = (await card.locator('.mee-icon-SkypeCircleCheck, [aria-label*="complete" i], .c-glyph-check').count()) > 0;
        if (isCompleted) return null;

        // In "More activities", only keep cards that award points
        if (type === 'standard') {
          const hasPoints = await card.locator('[aria-label="Points you will earn"]').count() > 0;
          if (!hasPoints) return null;
        }

        // Exclude quizzes for standard clicks (QuizHandler handles them)
        // But keep them for Explore if needed (though Explore usually aren't quizzes)
        if (type === 'standard') {
          const isQuiz = await card.locator('.mee-icon-Question, [data-bi-id*="quiz" i], [data-bi-id*="poll" i]').count() > 0;
          if (isQuiz) return null;
        }

        // Fix: Exclude points string (often has c-heading class) from title detection
        const title = await card.locator('h3, .title, .c-heading:not(.pointsString)').first().textContent() || `Activity #${index}`;
        const description = await card.locator('.mee-paragraph, .description, [mee-paragraph], .c-paragraph-4').first().textContent().catch(() => undefined);
        const link = card.locator('a').first();

        if ((await link.count()) === 0) return null;

        return {
          index,
          title: title.trim(),
          isCompleted,
          locator: link, // Click the link
          selector: `placeholder`, // We use locator directly mainly
          type,
          description: description?.trim(),
        };
      } catch {
        return null;
      }
    };

    // 1. "More activities" Section
    // Prefer robust heading-based detection; keep old XPath as a fallback.
    let moreActivities = this.getCardsInSectionByHeading(page, /more\s+activities/i);
    let moreCount = await moreActivities.count();
    if (moreCount === 0) {
      moreActivities = page.locator('//h3[contains(text(), "More activities")]/ancestor::div[contains(@class, "mee-group-header")]/following-sibling::div//mee-card');
      moreCount = await moreActivities.count();
    }
    console.log(`[ClickHandler] Found ${moreCount} more-activities cards`);

    for (let i = 0; i < moreCount; i++) {
      const info = await processCard(moreActivities.nth(i), 'standard', activities.length);
      if (info) activities.push(info);
    }

    // 2. "Explore on Bing" Section
    // We look for headers containing "Explore" (case-insensitive) to be more robust.
    // We get the ancestors div which acts as the container, then find all mee-cards within it.
    const exploreSection = page.locator('//h3[contains(translate(., "ABCDEFGHIJKLMNOPQRSTUVWXYZ", "abcdefghijklmnopqrstuvwxyz"), "explore")]/ancestor::div[1]//mee-card');
    const exploreCount = await exploreSection.count();
    console.log(`[ClickHandler] Found ${exploreCount} explore cards`);

    for (let i = 0; i < exploreCount; i++) {
        // Find if it has meme-paragraph to search
        const info = await processCard(exploreSection.nth(i), 'explore', activities.length);
        if (info) activities.push(info);
    }

    // If sections aren't clearly labeled or using new UI, fallback to finding cards with "mee-paragraph" for explore?
    // User requested specifically "Explore on Bing section". If not found, we skip.

    return activities;
  }

  // extractActivityInfo removed as it's merged into findClickableActivities logic or helper

  /**
   * Clicks on a single activity with humanized behavior.
   */
  private async clickActivity(
    page: Page,
    activity: ActivityInfo
  ): Promise<{ success: boolean; title: string }> {
    const { title, locator } = activity;

    try {
      if (this.config.dryRun) {
        console.log(`[DRY-RUN] Would click: "${title}" (${activity.type})`);
        if (activity.type === 'explore') {
          const query = this.getExploreQuery(activity);
          if (query) console.log(`[DRY-RUN] Would search: "${query}"`);
        }
        return { success: true, title };
      }

      await locator.scrollIntoViewIfNeeded();
      await randomDelay(300, 800);

      // Click (humanized)
      await this.browser.humanizer.clickLocatorHuman(page, locator);

      // Wait for navigation
      await randomDelay(2000, 4000);

      if (activity.type === 'explore') {
        const query = this.getExploreQuery(activity);
        if (!query) return { success: true, title };

        console.log(`[ClickHandler] Explore activity: Searching for "${query}"`);
         // We might be on a new page or new tab.
         // If new tab, we need to find it.
         // Most rewards clicks open new tab.
        const pages = page.context().pages();
        const nonDashboardPages = pages.filter(p => p !== page);
        const targetPage = nonDashboardPages.length > 0 ? nonDashboardPages[nonDashboardPages.length - 1]! : page;

         await targetPage.bringToFront();

         // Assuming we are on Bing, or need to go to Bing.
         // Usually these links go to a search page already.
         // But user requirement: "click and search the text".
         // Strategy: Use the browser adapter's search method on the target page.

         // We must use the browser adapter to leverage human-like typing
         // BUT browser adapter methods like .search() usually use this.getPage() which is the MAIN dashboard page.
         // We need to execute search on the TARGET page (the new tab).

         // Simplification: Just run the search on the active tab (targetPage).
         // Since browser.search() relies on `this.getPage()`, we'll implement the search logic locally here
         // OR update BrowserAdapter to accept a page.

         if (!targetPage.url().includes('bing.com')) {
           await targetPage.goto('https://www.bing.com');
           await randomDelay(1000, 2000);
         }

         // Clear existing text and type human-like, then submit.
         await this.browser.humanizer.clearAndTypeHuman(targetPage, '#sb_form_q, [name="q"]', query);
         await randomDelay(120, 300);
         await targetPage.keyboard.press('Enter');
         await randomDelay(2000, 3000); // Wait for search results
      }

      // Cleanup tabs
      const pages = page.context().pages();
      while (pages.length > 1) {
        const p = pages.pop();
        if (p && p !== page) await p.close();
      }
      await page.bringToFront(); // Focus back on dashboard

      // If we used the main page for navigation (no new tab opened), we must go back to specific dashboard
      if (page.url().includes('bing.com/search')) {
          console.log('[ClickHandler] Returning to dashboard...');
          await this.browser.goto('https://rewards.bing.com/');
          await randomDelay(1000, 2000);
      }

      return { success: true, title };
    } catch (error) {
      console.error(`[ClickHandler] Failed to click "${title}":`, error);
      return { success: false, title };
    }
  }
}

// remove the interface at bottom since it's defined at top

