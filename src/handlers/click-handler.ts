import type { Page, Locator } from "playwright";
import type { TaskHandler, ActionResult, RunConfig } from "../types";
import { BrowserAdapter } from "../core/browser-adapter";
import { randomDelay } from "../utils/humanizer";
import { matchQueryBank } from "../utils/embeddings";

const REWARDS_EARN_URL = "https://rewards.bing.com/earn";

interface ActivityInfo {
  index: number;
  title: string;
  isCompleted: boolean;
  locator: Locator;
  type: "daily" | "standard" | "explore";
  description?: string;
}

export class ClickHandler implements TaskHandler {
  name = "ClickHandler";
  private config: Pick<RunConfig, "dryRun" | "maxActionsPerHour">;

  constructor(
    private browser: BrowserAdapter,
    config?: Partial<Pick<RunConfig, "dryRun" | "maxActionsPerHour">>,
  ) {
    this.config = {
      dryRun: config?.dryRun ?? false,
      maxActionsPerHour: config?.maxActionsPerHour ?? 30,
    };
  }

  private normalizeExploreQuery(text: string): string {
    const trimmed = text.trim();
    if (!trimmed) return "";

    // Examples we want to normalize:
    // - "Search on Bing for best pizza" -> "best pizza"
    // - "Search on Bing to learn about whales" -> "learn about whales"
    // - "Search using Bing to discover local events" -> "discover local events"
    // Handle case-insensitively and allow extra whitespace/punctuation.
    const cleaned = trimmed
      .replace(/^search\s+(?:on|using)\s+bing\s+(?:to|for)\s*[:\-–]?\s*/i, "")
      .trim();

    return cleaned || trimmed;
  }

  private async getExploreQuery(activity: ActivityInfo): Promise<string> {
    const desc = activity.description ?? "";

    // Try semantic matching against the query bank
    if (desc) {
      try {
        const match = await matchQueryBank(this.normalizeExploreQuery(desc));
        if (match) return match;
      } catch (err) {
        console.warn(
          "[ClickHandler] Embedding match failed, using fallback:",
          err,
        );
      }
    }

    // Fallback: normalize the description or title into a search query
    const fromDescription = desc ? this.normalizeExploreQuery(desc) : "";
    if (fromDescription) return fromDescription;
    return this.normalizeExploreQuery(activity.title);
  }

  async run(page: Page): Promise<ActionResult> {
    console.log(`[ClickHandler] Starting... (dryRun: ${this.config.dryRun})`);
    const result: ActionResult = {
      type: "click",
      status: "skipped",
      attempts: 0,
      durationMs: 0,
      meta: { clickedActivities: [] as string[] },
    };
    const startTime = Date.now();

    try {
      // 1. Navigate to the Rewards activities page
      await this.browser.goto(REWARDS_EARN_URL);
      await randomDelay(2000, 4000);

      // 2. Find clickable reward activities
      const activities = await this.findClickableActivities(page);
      console.log(
        `[ClickHandler] Found ${activities.length} incomplete activities`,
      );

      if (activities.length === 0) {
        console.log("[ClickHandler] No incomplete activities found");
        result.status = "skipped";
        result.meta = { reason: "No incomplete activities" };
        return result;
      }

      // 3. Click activities (respect rate limit)
      const maxClicks = Math.min(20, this.config.maxActionsPerHour); // Increased limit as searches are gone
      let clickedCount = 0;
      let previousActivityType: ActivityInfo["type"] | undefined;

      for (const activity of activities) {
        if (clickedCount >= maxClicks) {
          console.log(
            `[ClickHandler] Rate limit reached (${maxClicks} clicks)`,
          );
          break;
        }

        if (previousActivityType === "daily" && activity.type !== "daily") {
          await this.closeDailySetDialog(page);
        }

        result.attempts++;
        const clickResult = await this.clickActivity(page, activity);
        previousActivityType = activity.type;

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

      if (previousActivityType === "daily") {
        await this.closeDailySetDialog(page);
      }

      result.status = clickedCount > 0 ? "ok" : "failed";
      result.meta!.totalClicked = clickedCount;
    } catch (e) {
      console.error("[ClickHandler] Error:", e);
      result.status = "failed";
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
    return this.findEarnPageActivities(page);
  }

  /**
   * Finds activities in the current anchor-based Rewards Earn UI.
   */
  private async findEarnPageActivities(page: Page): Promise<ActivityInfo[]> {
    const activities: ActivityInfo[] = [];
    const exploreLinks = page.locator("#exploreonbing a");
    const standardLinks = page.locator("#moreactivities a");
    const dailySetOpener = page
      .locator("#streaks button")
      .filter({ hasText: /daily\s+set\s+streak/i })
      .first();
    const exploreCount = await exploreLinks.count();
    const standardCount = await standardLinks.count();
    const dailySetOpenerCount = await dailySetOpener.count();

    if (exploreCount + standardCount + dailySetOpenerCount === 0) return [];

    const processLink = async (
      link: Locator,
      type: ActivityInfo["type"],
    ): Promise<ActivityInfo | null> => {
      try {
        if (!(await link.isVisible())) return null;

        const text = (await link.textContent()) ?? "";
        const isCompleted =
          /\bcompleted\b/i.test(text) ||
          (await link.getByText(/^completed$/i).count()) > 0;
        const isLocked =
          (await link.getAttribute("data-disabled")) === "true" ||
          /unlock(?:s|ed)?\b/i.test(text) ||
          (await link.getByText(/^unlock(?:s|ed)?\b/i).count()) > 0;
        if (isCompleted || isLocked) return null;

        const paragraphs = link.locator("p");
        const hasPoints =
          (await paragraphs.filter({ hasText: /^\+\d+\s*$/ }).count()) > 0;
        if (!hasPoints) return null;

        const title =
          (await paragraphs.first().textContent())?.trim() ||
          `Activity #${activities.length}`;
        const description = await paragraphs
          .nth(1)
          .textContent()
          .catch(() => undefined);

        return {
          index: activities.length,
          title,
          isCompleted,
          locator: link,
          type,
          description: description?.trim(),
        };
      } catch {
        return null;
      }
    };

    if (dailySetOpenerCount > 0 && (await dailySetOpener.isVisible())) {
      try {
        await this.browser.humanizer.clickLocatorHuman(page, dailySetOpener);

        const dailySetDialog = page
          .locator('[role="dialog"]')
          .filter({ hasText: /daily\s+set\s+streak/i });
        await dailySetDialog.waitFor({ state: "visible" });

        const dailyLinks = dailySetDialog.locator("a");
        const dailyCount = await dailyLinks.count();
        console.log(`[ClickHandler] Found ${dailyCount} Daily Set sidebar links`);

        for (let i = 0; i < dailyCount; i++) {
          const info = await processLink(dailyLinks.nth(i), "daily");
          if (info) activities.push(info);
        }
      } catch (error) {
        console.warn("[ClickHandler] Could not inspect Daily Set sidebar:", error);
      }
    }

    console.log(`[ClickHandler] Found ${exploreCount} Earn explore links`);
    for (let i = 0; i < exploreCount; i++) {
      const info = await processLink(exploreLinks.nth(i), "explore");
      if (info) activities.push(info);
    }

    console.log(`[ClickHandler] Found ${standardCount} Earn activity links`);
    for (let i = 0; i < standardCount; i++) {
      const info = await processLink(standardLinks.nth(i), "standard");
      if (info) activities.push(info);
    }

    return activities;
  }

  private async closeDailySetDialog(page: Page): Promise<void> {
    const dialog = page
      .locator('[role="dialog"]')
      .filter({ hasText: /daily\s+set\s+streak/i });
    if ((await dialog.count()) === 0 || !(await dialog.isVisible())) return;

    const closeButton = dialog.getByRole("button", { name: "Close" });
    if ((await closeButton.count()) > 0) {
      await this.browser.humanizer.clickLocatorHuman(page, closeButton);
      await dialog.waitFor({ state: "hidden" });
    }
  }

  /**
   * Clicks on a single activity with humanized behavior.
   */
  private async clickActivity(
    page: Page,
    activity: ActivityInfo,
  ): Promise<{ success: boolean; title: string }> {
    const { title, locator } = activity;

    try {
      if (this.config.dryRun) {
        console.log(`[DRY-RUN] Would click: "${title}" (${activity.type})`);
        if (activity.type === "explore") {
          const query = await this.getExploreQuery(activity);
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

      if (activity.type === "explore") {
        const query = await this.getExploreQuery(activity);
        if (!query) return { success: true, title };

        console.log(
          `[ClickHandler] Explore activity: Searching for "${query}"`,
        );
        const pages = page.context().pages();
        const activityPages = pages.filter((candidate) => candidate !== page);
        const targetPage =
          activityPages.length > 0
            ? activityPages[activityPages.length - 1]!
            : page;

        await targetPage.bringToFront();

        if (!targetPage.url().includes("bing.com")) {
          await targetPage.goto("https://www.bing.com");
          await randomDelay(1000, 2000);
        }

        // Clear existing text and type human-like, then submit.
        await this.browser.humanizer.clearAndTypeHuman(
          targetPage,
          '#sb_form_q, [name="q"]',
          query,
        );
        await randomDelay(120, 300);
        await targetPage.keyboard.press("Enter");
        await randomDelay(3000, 4000); // Wait for search results
      }

      // Cleanup tabs
      const pages = page.context().pages();
      while (pages.length > 1) {
        const p = pages.pop();
        if (p && p !== page) await p.close();
      }
      await page.bringToFront();

      // If the main page navigated away, return to the activities page.
      if (page.url().includes("bing.com/search")) {
        console.log("[ClickHandler] Returning to Rewards activities...");
        await this.browser.goto(REWARDS_EARN_URL);
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
