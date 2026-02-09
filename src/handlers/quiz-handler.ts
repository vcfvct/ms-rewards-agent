import type { Page, Locator } from 'playwright';
import type { TaskHandler, ActionResult } from '../types';
import { BrowserAdapter } from '../core/browser-adapter';
import { randomDelay } from '../utils/humanizer';

export interface QuizHandlerConfig {
  dryRun: boolean;
  maxActionsPerHour: number;
}

const DEFAULT_CONFIG: QuizHandlerConfig = {
  dryRun: false,
  maxActionsPerHour: 30,
};


export class QuizHandler implements TaskHandler {
  name = 'QuizHandler';
  private config: QuizHandlerConfig;

  constructor(
    private browser: BrowserAdapter,
    config?: Partial<QuizHandlerConfig>
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  async run(page: Page): Promise<ActionResult> {
    console.log(`[QuizHandler] Starting... (dryRun: ${this.config.dryRun})`);

    const result: ActionResult = {
      type: 'quiz',
      status: 'skipped',
      attempts: 0,
      durationMs: 0,
      meta: {
        quizzesCompleted: 0,
        correctAnswers: 0,
      },
    };
    const startTime = Date.now();

    try {
      // Navigate to Rewards Dashboard
      await this.browser.goto('https://rewards.bing.com/');
      await randomDelay(2000, 4000);

      // Find quiz activities
      const quizzes = await this.findQuizActivities(page);
      console.log(`[QuizHandler] Found ${quizzes.length} quiz activities`);

      if (quizzes.length === 0) {
        result.status = 'skipped';
        result.meta = { reason: 'No quiz activities found' };
        return result;
      }

      let completedCount = 0;

      for (const quizLocator of quizzes) {
        if (completedCount >= this.config.maxActionsPerHour) {
          console.log(`[QuizHandler] Rate limit reached`);
          break;
        }

        result.attempts++;

        try {
          // Click to open the quiz
          if (!this.config.dryRun) {
            await quizLocator.click();
            await randomDelay(2000, 4000);
          }

          // Handle the quiz based on type
          const quizResult = await this.handleQuiz(page);

          if (quizResult.completed) {
            completedCount++;
          }

          // Return to main page
          if (!this.config.dryRun) {
            await this.browser.goto('https://rewards.bing.com/');
            await randomDelay(1500, 3000);
          }

        } catch (error) {
          console.error('[QuizHandler] Error handling quiz:', error);
        }
      }

      result.meta = {
        quizzesCompleted: completedCount,
      };
      result.status = completedCount > 0 ? 'ok' : 'failed';

    } catch (e) {
      console.error('[QuizHandler] Error:', e);
      result.status = 'failed';
      result.meta = { error: e instanceof Error ? e.message : String(e) };
    } finally {
      result.durationMs = Date.now() - startTime;
    }

    return result;
  }

  /**
   * Finds quiz activities on the rewards page.
   */
  private async findQuizActivities(page: Page): Promise<Locator[]> {
    const quizSelectors = [
      // Look for quiz-specific indicators
      'mee-card:has([class*="quiz"])',
      'mee-card:has([aria-label*="quiz" i])',
      'mee-card:has([aria-label*="poll" i])',
      'mee-card:has([aria-label*="this or that" i])',
      // Generic cards with question marks or quiz icons
      '[data-bi-id*="quiz"]',
      '[data-bi-id*="poll"]',
      '.quiz-card',
    ];

    const quizzes: Locator[] = [];
    // We should filter explicitly to prevent duplicates if multiple selectors match the same element,
    // but locator handling usually manages this if we iterate carefully.
    // Simplified strategy: Grab all mee-cards and check indicators.

    // For now, iterate known selectors
    const processedIndices = new Set<string>();

    for (const selector of quizSelectors) {
      const elements = page.locator(selector);
      const count = await elements.count();

      for (let i = 0; i < count; i++) {
        const element = elements.nth(i);
        // Check if not completed
        const isCompleted = await element.locator('[class*="completed"], .mee-icon-SkypeCircleCheck, .c-glyph-check').count() > 0;
        if (!isCompleted) {
           // We might need a unique ID to avoid duplicates.
           // innerText is a decent proxy for now.
           const text = await element.textContent() || '';
           if (!processedIndices.has(text)) {
             processedIndices.add(text);
             quizzes.push(element);
           }
        }
      }
    }

    return quizzes;
  }

  /**
   * Handles a quiz once it's opened.
   */
  private async handleQuiz(page: Page): Promise<{ completed: boolean; }> {
     // Wait for quiz content
     await randomDelay(2000, 3000);

     // Brute force strategy:
     // Keep answering until "Quiz complete" or "Next question" or timeout
     const startTime = Date.now();
     const maxDuration = 60000; // 1 minute max per quiz

     while (Date.now() - startTime < maxDuration) {
        // Detect if quiz is done
        if (await this.isQuizComplete(page)) {
            console.log('[QuizHandler] Quiz completed detected.');
            return { completed: true };
        }

        // Detect options
        const options = await this.findOptions(page);
        if (options.length === 0) {
            console.log('[QuizHandler] No options found, maybe loading or done.');
            await randomDelay(1000, 2000);
            continue;
        }

        console.log(`[QuizHandler] Found ${options.length} options. Brute forcing...`);

        // Brute force: click first available option that isn't selected/disabled?
        // Actually, for multiple choice, we just click one. If generic quiz, we might need to click until green.

        for (const option of options) {
            try {
                if (this.config.dryRun) {
                    console.log('[DRY-RUN] Would click option');
                    return { completed: true };
                }

                // Some quizzes mark incorrect options with red. We should skip those if possible?
                // Or just click it. If it's wrong, page might block or show next.
                // We'll click and wait.

                await option.click();
                await randomDelay(1000, 2000);

                // Check if we advanced or finished
                if (await this.isQuizComplete(page)) return { completed: true };

                // If it was a generic "click to answer" (like poll), we are probably done or need to go back.
                // If it was wrong answer, we might be able to click another.
                // We continue loop.
            } catch {
                // Ignore click errors (element detached etc) and retry find
                break;
            }
        }

        // Wait a bit before next iteration (to allow for "Next Question" transition)
        await randomDelay(2000, 3000);
     }

     return { completed: false };
  }

  private async isQuizComplete(page: Page): Promise<boolean> {
      // Common completion indicators
      const text = await page.content(); // Heavy, maybe check selectors instead
      if (text.includes('Quiz complete') || text.includes('You earned')) return true;

      const completeHeader = page.locator('.c-heading', { hasText: 'complete' });
      if (await completeHeader.count() > 0) return true;

      // Points earned banner
      if (await page.locator('.points-earned').count() > 0) return true;

      return false;
  }

  private async findOptions(page: Page): Promise<Locator[]> {
      // New Bing Quiz selectors
      // Usually .b_algo, .wk_Option, .btOption
      const possibleSelectors = [
          '.wk_Option',
          '#currentQuestionContainer .b_algo',
          '.btOption',
          '.rqOption',
          '.mc_Item', // Multiple choice item
          'input[type="radio"] + label', // Generic radio
          '.choice-card',
      ];

      for (const sel of possibleSelectors) {
          const locs = page.locator(sel);
          if (await locs.count() > 0) {
              const res: Locator[] = [];
              for(let i=0; i<await locs.count(); i++) res.push(locs.nth(i));
              return res;
          }
      }
      return [];
  }
}
