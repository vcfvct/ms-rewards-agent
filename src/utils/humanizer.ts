import type { Page, Locator } from 'playwright';

/**
 * Returns a promise that resolves after a random duration between min and max.
 */
export const randomDelay = async (min: number = 500, max: number = 2000): Promise<void> => {
  const delay = Math.floor(Math.random() * (max - min + 1)) + min;
  return new Promise((resolve) => setTimeout(resolve, delay));
};

/**
 * Simulates a human-like mouse movement curve.
 * This is a simplified Bezier curve implementation.
 */
export const generateMousePath = (
  startX: number,
  startY: number,
  endX: number,
  endY: number,
  steps: number = 50
): { x: number; y: number }[] => {
  const path: { x: number; y: number }[] = [];

  // Control points for Bezier curve (randomize slightly for variability)
  const control1X = startX + (endX - startX) * 0.3 + (Math.random() - 0.5) * 50;
  const control1Y = startY + (endY - startY) * 0.1 + (Math.random() - 0.5) * 50;
  const control2X = startX + (endX - startX) * 0.7 + (Math.random() - 0.5) * 50;
  const control2Y = startY + (endY - startY) * 0.9 + (Math.random() - 0.5) * 50;

  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    // Cubic Bezier formula
    const x =
      Math.pow(1 - t, 3) * startX +
      3 * Math.pow(1 - t, 2) * t * control1X +
      3 * (1 - t) * Math.pow(t, 2) * control2X +
      Math.pow(t, 3) * endX;
    const y =
      Math.pow(1 - t, 3) * startY +
      3 * Math.pow(1 - t, 2) * t * control1Y +
      3 * (1 - t) * Math.pow(t, 2) * control2Y +
      Math.pow(t, 3) * endY;
    path.push({ x, y });
  }
  return path;
};

export class Humanizer {
  /**
   * Clicks an element with human-like movement and delays.
   */
  async clickHuman(page: Page, selector: string): Promise<void> {
    const element = page.locator(selector).first();
    const box = await element.boundingBox();
    if (!box) throw new Error(`Element ${selector} not visible`);

    // Calculate target point (center of element + random offset)
    const targetX = box.x + box.width / 2 + (Math.random() - 0.5) * (box.width * 0.8);
    const targetY = box.y + box.height / 2 + (Math.random() - 0.5) * (box.height * 0.8);

    // Get current mouse position is not directly exposed in simple API,
    // but we can assume 0,0 or store state. For now, we simply move.
    // In a persistent session, we might want to track the last position.
    // For this prototype, starting from (0,0) or last known is acceptable deviation.
    const startX = 0;
    const startY = 0;

    // Move mouse along path
    const path = generateMousePath(startX, startY, targetX, targetY);
    for (const point of path) {
      await page.mouse.move(point.x, point.y);
      // Very fast pauses between movement steps to simulate sampling rate
      await new Promise(r => setTimeout(r, Math.random() * 5));
    }

    await randomDelay(100, 300); // Pause before click
    await page.mouse.down();
    await randomDelay(50, 150);  // Hold click
    await page.mouse.up();
    await randomDelay(500, 1000); // Post-click pause
  }

  /**
   * Clicks a locator with human-like movement and delays.
   * Useful when a stable selector string is not available.
   */
  async clickLocatorHuman(page: Page, locator: Locator): Promise<void> {
    const element = locator.first();
    const box = await element.boundingBox();
    if (!box) throw new Error('Element not visible');

    const targetX = box.x + box.width / 2 + (Math.random() - 0.5) * (box.width * 0.8);
    const targetY = box.y + box.height / 2 + (Math.random() - 0.5) * (box.height * 0.8);

    const startX = 0;
    const startY = 0;

    const path = generateMousePath(startX, startY, targetX, targetY);
    for (const point of path) {
      await page.mouse.move(point.x, point.y);
      await new Promise(r => setTimeout(r, Math.random() * 5));
    }

    await randomDelay(100, 300);
    await page.mouse.down();
    await randomDelay(50, 150);
    await page.mouse.up();
    await randomDelay(500, 1000);
  }

  /**
   * Types text with variable delays between keystrokes.
   */
  async typeHuman(page: Page, selector: string, text: string): Promise<void> {
    await this.clickHuman(page, selector); // Use human click to focus

    for (const char of text) {
      await page.keyboard.type(char);
      // Random delay between keystrokes (50ms - 150ms)
      await randomDelay(50, 150);
    }
  }

  /**
   * Focuses the input, clears it, and then types text with variable delays.
   */
  async clearAndTypeHuman(page: Page, selector: string, text: string): Promise<void> {
    await this.clickHuman(page, selector);
    await page.keyboard.press('Control+A');
    await randomDelay(30, 80);
    await page.keyboard.press('Backspace');
    await randomDelay(50, 120);

    for (const char of text) {
      await page.keyboard.type(char);
      await randomDelay(50, 150);
    }
  }
}
