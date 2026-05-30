import type { BrowserSessionManager, TraceEntry, MacroStep } from '../core/browser-session';
import { takeSnapshot } from './dom-observer';
import type { DOMSnapshot } from './dom-observer';

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
  snapshots: DOMSnapshot[];
  cookies: Record<string, string>;
  localStorage: Record<string, string>;
  sessionStorage: Record<string, string>;
  techStack: string[];
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
    const snapshots: DOMSnapshot[] = [];
    const aggregatedCookies: Record<string, string> = {};
    const aggregatedLocalStorage: Record<string, string> = {};
    const aggregatedSessionStorage: Record<string, string> = {};
    const techHints = new Set<string>();
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

        // Take full DOM snapshot — replaces manual form counting + link extraction
        const snapshot = await takeSnapshot(page);
        snapshots.push(snapshot);

        const links: Array<{ href: string; text: string }> = await page.evaluate(() =>
          Array.from(document.querySelectorAll('a[href]')).map((a) => ({
            href: (a as HTMLAnchorElement).getAttribute('href') || '',
            text: ((a as HTMLAnchorElement).textContent || '').trim().slice(0, 60),
          }))
        );
        const resolvedLinks = this.resolveLinks(links, finalUrl, baseUrl);

        routes.push({
          path: new URL(finalUrl).pathname,
          title: snapshot.title || '(no title)',
          depth,
          url: finalUrl,
          forms: snapshot.forms.length,
          linkCount: resolvedLinks.length,
          visitedAt: Date.now(),
        });

        // Capture cookies from browser context
        const ctxCookies = await page.context().cookies();
        for (const c of ctxCookies) {
          aggregatedCookies[c.name] = c.value;
        }

        // Capture localStorage
        const ls = await page.evaluate(() => {
          const items: Record<string, string> = {};
          for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i);
            if (k) items[k] = localStorage.getItem(k) || '';
          }
          return items;
        });
        Object.assign(aggregatedLocalStorage, ls);

        // Capture sessionStorage
        const ss = await page.evaluate(() => {
          const items: Record<string, string> = {};
          for (let i = 0; i < sessionStorage.length; i++) {
            const k = sessionStorage.key(i);
            if (k) items[k] = sessionStorage.getItem(k) || '';
          }
          return items;
        });
        Object.assign(aggregatedSessionStorage, ss);

        // Detect tech stack from DOM
        const domTech = await page.evaluate(() => {
          const hints: string[] = [];
          const metaGenerator = document.querySelector('meta[name="generator"]');
          if (metaGenerator) hints.push(metaGenerator.getAttribute('content') || '');

          if (typeof (window as any).__NEXT_DATA__ !== 'undefined') hints.push('Next.js');
          if (typeof (window as any).__NUXT__ !== 'undefined') hints.push('Nuxt.js');
          if (typeof (window as any).React !== 'undefined') hints.push('React');
          if (typeof (window as any).Vue !== 'undefined') hints.push('Vue.js');
          if (typeof (window as any).angular !== 'undefined') hints.push('Angular');
          if (typeof (window as any).jQuery !== 'undefined') hints.push('jQuery');

          document.querySelectorAll('script[src]').forEach((s) => {
            const src = (s as HTMLScriptElement).src.toLowerCase();
            if (src.includes('react')) hints.push('React');
            if (src.includes('vue')) hints.push('Vue.js');
            if (src.includes('angular')) hints.push('Angular');
            if (src.includes('jquery')) hints.push('jQuery');
            if (src.includes('next')) hints.push('Next.js');
            if (src.includes('nuxt')) hints.push('Nuxt.js');
            if (src.includes('svelte')) hints.push('Svelte');
            if (src.includes('ember')) hints.push('Ember.js');
            if (src.includes('backbone')) hints.push('Backbone.js');
            if (src.includes('django')) hints.push('Django');
            if (src.includes('laravel')) hints.push('Laravel');
          });

          return hints;
        });
        for (const h of domTech) techHints.add(h);

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

    // Detect tech stack from trace response headers
    const spiderTrace = this.manager.stopTrace(this.sessionId);
    for (const entry of spiderTrace) {
      const headers = entry.responseHeaders || {};
      const server = (headers['server'] || '').toLowerCase();
      const poweredBy = (headers['x-powered-by'] || headers['x-powered-by'] || '').toLowerCase();
      const setCookie = (headers['set-cookie'] || '').toLowerCase();
      if (server.includes('express') || poweredBy.includes('express')) techHints.add('Express.js');
      if (server.includes('nginx')) techHints.add('Nginx');
      if (server.includes('apache')) techHints.add('Apache');
      if (server.includes('cloudflare')) techHints.add('Cloudflare');
      if (poweredBy.includes('asp.net')) techHints.add('ASP.NET');
      if (poweredBy.includes('php')) techHints.add('PHP');
      if (poweredBy.includes('flask') || poweredBy.includes('python')) techHints.add('Flask/Python');
      if (poweredBy.includes('django')) techHints.add('Django');
      if (poweredBy.includes('next.js') || poweredBy.includes('nextjs')) techHints.add('Next.js');
      if (setCookie.includes('sessionid=')) techHints.add('Django');
      if (setCookie.includes('jsessionid=')) techHints.add('Java EE');
      if (setCookie.includes('phpsessid')) techHints.add('PHP');
      if (setCookie.includes('.aspnetcore')) techHints.add('ASP.NET Core');
    }

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
      snapshots,
      cookies: aggregatedCookies,
      localStorage: aggregatedLocalStorage,
      sessionStorage: aggregatedSessionStorage,
      techStack: Array.from(techHints),
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
        if (abs.origin !== baseOrigin) continue;
        if (STATIC_EXT.test(abs.pathname)) continue;
        if (SKIP_PREFIXES.some((p) => href.startsWith(p))) continue;
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
