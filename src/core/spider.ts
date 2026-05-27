import type { BrowserSessionManager, TraceEntry, MacroStep } from './browser-session';

export interface RouteNode {
  path: string;
  title: string;
  depth: number;
  url: string;
  forms: number;
  linkCount: number;
  visitedAt: number;
}

export interface CrawlResult {
  baseUrl: string;
  totalRoutes: number;
  maxDepth: number;
  durationMs: number;
  routes: RouteNode[];
  visitedUrls: string[];
  errors: Array<{ url: string; error: string }>;
  trace: TraceEntry[];
  recording: MacroStep[];
}

const STATIC_EXT = /\.(css|js|woff2?|png|svg|ico|map|jpg|jpeg|gif|webp|ttf|eot|pdf)$/i;
const SKIP_PREFIXES = ['tel:', 'mailto:', 'javascript:', 'blob:', 'data:', 'file:', 'ftp:'];
const MAX_PAGES = 50;

export class SpiderCrawler {
  private manager: BrowserSessionManager;
  private sessionId: string;

  constructor(manager: BrowserSessionManager, sessionId = 'default') {
    this.manager = manager;
    this.sessionId = sessionId;
  }

  async crawl(targetUrl: string, maxDepth = 3): Promise<CrawlResult> {
    const startTime = Date.now();
    const baseUrl = new URL(targetUrl).origin;
    const visited = new Set<string>();
    const routes: RouteNode[] = [];
    const errors: Array<{ url: string; error: string }> = [];
    let queue: Array<{ url: string; depth: number }> = [{ url: this.normalize(targetUrl), depth: 0 }];

    // Start trace + recording
    await this.manager.startTrace(this.sessionId);
    this.manager.startRecording(this.sessionId);

    while (queue.length > 0 && routes.length < MAX_PAGES) {
      const { url, depth } = queue.shift()!;
      if (depth > maxDepth || visited.has(url)) continue;
      visited.add(url);

      try {
        const finalUrl = await this.manager.navigate(this.sessionId, url);
        const page = await this.manager.getOrCreate(this.sessionId);
        const title = await page.title();

        const links: Array<{ href: string; text: string }> = await page.evaluate(() =>
          Array.from(document.querySelectorAll('a[href]')).map((a) => ({
            href: (a as HTMLAnchorElement).getAttribute('href') || '',
            text: ((a as HTMLAnchorElement).textContent || '').trim().slice(0, 60),
          }))
        );
        const forms = await page.evaluate(() => document.querySelectorAll('form').length);
        const resolvedLinks = this.resolveLinks(links, finalUrl, baseUrl);

        routes.push({
          path: new URL(finalUrl).pathname,
          title: title || '(no title)',
          depth,
          url: finalUrl,
          forms,
          linkCount: resolvedLinks.length,
          visitedAt: Date.now(),
        });

        // Enqueue unvisited same-origin children
        for (const link of resolvedLinks) {
          if (!visited.has(link) && depth + 1 <= maxDepth) {
            queue.push({ url: link, depth: depth + 1 });
          }
        }
      } catch (err) {
        errors.push({ url, error: String(err) });
      }
    }

    // Stop trace — capture data before clear
    const spiderTrace = this.manager.stopTrace(this.sessionId);
    const spiderRecording = this.manager.stopRecording(this.sessionId);

    return {
      baseUrl,
      totalRoutes: routes.length,
      maxDepth,
      durationMs: Date.now() - startTime,
      routes,
      visitedUrls: Array.from(visited),
      errors,
      trace: spiderTrace,
      recording: spiderRecording,
    };
  }

  private normalize(url: string): string {
    try {
      const u = new URL(url);
      return u.origin + u.pathname.replace(/\/$/, '') || u.origin + '/';
    } catch {
      return url;
    }
  }

  private resolveLinks(
    links: Array<{ href: string; text: string }>,
    currentUrl: string,
    baseOrigin: string,
  ): string[] {
    const resolved: string[] = [];
    for (const { href } of links) {
      try {
        const abs = new URL(href, currentUrl);
        // Filter: same origin only
        if (abs.origin !== baseOrigin) continue;
        // Filter: static assets
        if (STATIC_EXT.test(abs.pathname)) continue;
        // Filter: skip prefixes
        if (SKIP_PREFIXES.some((p) => href.startsWith(p))) continue;
        // Normalize
        const normalized = abs.origin + abs.pathname.replace(/\/$/, '') || abs.origin + '/';
        if (normalized !== abs.origin + '/') resolved.push(normalized);
      } catch {
        // skip malformed URLs
      }
    }
    return [...new Set(resolved)];
  }

  async close(): Promise<string> {
    const entries = this.manager.getTrace(this.sessionId);
    const navs = entries.filter((e) => e.type === 'navigation').length;
    const apis = entries.filter((e) => e.type === 'xhr' || e.type === 'fetch').length;
    await this.manager.close(this.sessionId);
    return `Spider session closed. Recorded ${navs} navigations, ${apis} API calls.`;
  }
}
