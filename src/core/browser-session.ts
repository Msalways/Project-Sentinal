import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';

interface SessionState {
  browser: Browser;
  context: BrowserContext;
  page: Page;
  createdAt: number;
}

export class BrowserSessionManager {
  private sessions = new Map<string, SessionState>();
  private headless: boolean;

  constructor(headless = false) {
    this.headless = headless;
  }

  async getOrCreate(sessionId: string): Promise<Page> {
    const existing = this.sessions.get(sessionId);
    if (existing) {
      try {
        await existing.page.evaluate('1');
        return existing.page;
      } catch {
        await this.close(sessionId);
      }
    }

    const browser = await chromium.launch({ headless: this.headless });
    const context = await browser.newContext({
      viewport: { width: 1280, height: 720 },
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    });
    const page = await context.newPage();

    this.sessions.set(sessionId, { browser, context, page, createdAt: Date.now() });
    return page;
  }

  async navigate(sessionId: string, url: string): Promise<string> {
    const page = await this.getOrCreate(sessionId);
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    return page.url();
  }

  async click(sessionId: string, selector: string): Promise<string> {
    const page = await this.getOrCreate(sessionId);
    await page.waitForSelector(selector, { timeout: 10000 });
    await page.click(selector);
    return `Clicked: ${selector}`;
  }

  async fill(sessionId: string, selector: string, value: string): Promise<string> {
    const page = await this.getOrCreate(sessionId);
    await page.waitForSelector(selector, { timeout: 10000 });
    await page.fill(selector, value);
    return `Filled: ${selector}`;
  }

  async screenshot(sessionId: string, fullPage = false): Promise<string> {
    const page = await this.getOrCreate(sessionId);
    const buffer = await page.screenshot({ fullPage, type: 'png' });
    return buffer.toString('base64');
  }

  async extractText(sessionId: string): Promise<string> {
    const page = await this.getOrCreate(sessionId);
    return page.evaluate(() => document.body?.innerText || '');
  }

  async extractHtml(sessionId: string): Promise<string> {
    const page = await this.getOrCreate(sessionId);
    try {
      return await page.evaluate(() => document.documentElement?.outerHTML || '');
    } catch {
      return await page.content();
    }
  }

  async extractLinks(sessionId: string): Promise<string> {
    const page = await this.getOrCreate(sessionId);
    const links: Array<{ href: string; text: string }> = await page.evaluate(() =>
      Array.from(document.querySelectorAll('a[href]')).map((a) => ({
        href: (a as HTMLAnchorElement).href,
        text: ((a as HTMLAnchorElement).textContent || '').trim().slice(0, 80),
      }))
    );
    return links.map((l) => `${l.href} (${l.text})`).join('\n');
  }

  async evaluate(sessionId: string, script: string): Promise<string> {
    const page = await this.getOrCreate(sessionId);
    const result = await page.evaluate(script);
    return typeof result === 'string' ? result : JSON.stringify(result, null, 2);
  }

  async close(sessionId: string): Promise<void> {
    const state = this.sessions.get(sessionId);
    if (!state) return;
    try { await state.page.close(); } catch { /* ok */ }
    try { await state.context.close(); } catch { /* ok */ }
    try { await state.browser.close(); } catch { /* ok */ }
    this.sessions.delete(sessionId);
  }

  async closeAll(): Promise<void> {
    for (const id of this.sessions.keys()) await this.close(id);
  }

  listSessions(): string[] {
    return Array.from(this.sessions.keys());
  }
}
