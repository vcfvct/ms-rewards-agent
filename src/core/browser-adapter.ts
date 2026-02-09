import { chromium, type BrowserContext, type Page, type Browser } from 'playwright';
import path from 'path';
import { Humanizer } from '../utils/humanizer';

export class BrowserAdapter {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;
  public humanizer: Humanizer;

  constructor() {
    this.humanizer = new Humanizer();
  }

  async init(userDataDir: string, headless: boolean = false) {
    const absoluteUserDataDir = path.resolve(userDataDir);
    console.log(`Launching browser with user data: ${absoluteUserDataDir}`);

    try {
        // Standard Playwright Launch (Works on Windows/Mac/Linux)
        // On Windows, if you want to use the specific Edge executable instead of bundled Chromium,
        // you can add `executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'`
        // but often the bundled chromium is fine.
        // HOWEVER, for Rewards, using the real Edge is safer.

        let executablePath: string | undefined = undefined;
        if (process.platform === 'win32') {
             executablePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
        }

        this.context = await chromium.launchPersistentContext(absoluteUserDataDir, {
            headless,
            executablePath,
            viewport: { width: 1280, height: 720 },
            channel: executablePath ? undefined : 'msedge', // Try to use installed Edge if path not manual
            args: [
                '--disable-blink-features=AutomationControlled',
                '--no-sandbox',
                '--disable-infobars',
            ],
        });

        const pages = this.context.pages();
        this.page = pages.length > 0 ? pages[0]! : await this.context.newPage();

        console.log('BrowserAdapter initialized successfully');
    } catch (error) {
        console.error("Failed to launch browser:", error);
        throw error;
    }
  }

  async close() {
    if (this.context) {
      await this.context.close().catch(() => {});
      this.context = null;
      this.page = null;
    }
    if (this.browser) {
      await this.browser.close().catch(() => {});
      this.browser = null;
    }
  }


  getPage(): Page {
    if (!this.page) throw new Error('Browser not initialized');
    return this.page;
  }

  async goto(url: string) {
    const page = this.getPage();
    await page.goto(url, { waitUntil: 'domcontentloaded' });
  }

  // Delegated Humanizer methods
  async clickHuman(selector: string) {
    const page = this.getPage();
    console.log(`[Humanizer] Clicking ${selector}`);
    await this.humanizer.clickHuman(page, selector);
  }

  async typeHuman(selector: string, text: string) {
    const page = this.getPage();
    console.log(`[Humanizer] Typing "${text}" into ${selector}`);
    await this.humanizer.typeHuman(page, selector, text);
  }

  async search(query: string) {
    const page = this.getPage();
    console.log(`[Browser] Searching for: "${query}"`);

    // Go to Bing if not already there
    if (!page.url().includes('bing.com')) {
      await page.goto('https://www.bing.com');
    }

    // Wait for search box
    const searchBox = page.locator('input[name="q"], #sb_form_q');
    await searchBox.waitFor({ state: 'visible' });

    // Focus and clear
    await searchBox.click();
    await page.keyboard.press('Control+A');
    await page.keyboard.press('Backspace');

    // Type query human-like
    await this.humanizer.typeHuman(page, 'input[name="q"], #sb_form_q', query);

    // Press Enter and wait for results
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'domcontentloaded' }),
      page.keyboard.press('Enter'),
    ]);
  }
}
