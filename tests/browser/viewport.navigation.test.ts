import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fc from 'fast-check';
import http from 'http';
import fs from 'fs';
import { chromium } from 'playwright';
import { Viewport } from '../../src/browser/viewport';

const TEST_PORT = 19000;
const TEST_BASE = `http://localhost:${TEST_PORT}`;

let server: http.Server;

// Skip all tests if Playwright browser is not installed (e.g. CI without npx playwright install)
let hasBrowser = false;
try {
  hasBrowser = fs.existsSync(chromium.executablePath());
} catch { /* browser not installed */ }

export const describeIf = hasBrowser ? describe : describe.skip;

beforeAll(async () => {
  await new Promise<void>((resolve) => {
    server = http.createServer((req, res) => {
      const url = req.url || '/';

      if (url === '/') {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(`<!DOCTYPE html>
<html><head><title>Home Page</title></head>
<body>
<h1>Welcome</h1>
<a href="/page2">Go to Page 2</a>
<script>
var xhr = new XMLHttpRequest();
xhr.open('GET', '/api/ping', false);
xhr.send();
</script>
</body></html>`);
      } else if (url === '/page2') {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(`<!DOCTYPE html>
<html><head><title>Page Two</title></head>
<body>
<h1>Page 2</h1>
<a href="/page3">Go to Page 3</a>
</body></html>`);
      } else if (url === '/page3') {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(`<!DOCTYPE html>
<html><head><title>Page Three</title></head>
<body>
<h1>Page 3</h1>
<p>Navigation chain complete</p>
</body></html>`);
      } else if (url === '/api/ping') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ pong: true }));
      } else {
        res.writeHead(404);
        res.end('Not found');
      }
    });

    server.listen(TEST_PORT, () => resolve());
  });
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

describeIf('Viewport navigation tracking', () => {
  it('captures requests from subsequent pages after navigation', async () => {
    const viewport = new Viewport({ headless: true });
    await viewport.launch();

    try {
      const nav1 = await viewport.navigate(TEST_BASE);
      expect(nav1.url).toBe(`${TEST_BASE}/`);
      expect(nav1.title).toBe('Home Page');

      const page1Log = viewport.getNetworkLog();
      const page1Urls = page1Log.map((e) => e.url);

      expect(page1Urls).toContain(`${TEST_BASE}/`);
      expect(page1Urls).toContain(`${TEST_BASE}/api/ping`);

      const nav2 = await viewport.navigate(`${TEST_BASE}/page2`);
      expect(nav2.url).toBe(`${TEST_BASE}/page2`);
      expect(nav2.title).toBe('Page Two');

      const page2Log = viewport.getNetworkLog();
      const page2Urls = page2Log.map((e) => e.url);
      expect(page2Urls).toContain(`${TEST_BASE}/page2`);
    } finally {
      await viewport.close();
    }
  }, 30000);

  it('tracks navigation chain across 3 pages', async () => {
    const viewport = new Viewport({ headless: true });
    await viewport.launch();

    try {
      await viewport.navigate(TEST_BASE);
      await viewport.navigate(`${TEST_BASE}/page2`);
      const nav3 = await viewport.navigate(`${TEST_BASE}/page3`);

      expect(nav3.url).toBe(`${TEST_BASE}/page3`);
      expect(nav3.title).toBe('Page Three');

      const log = viewport.getNetworkLog();
      const urls = log.map((e) => e.url);

      expect(urls).toContain(`${TEST_BASE}/`);
      expect(urls).toContain(`${TEST_BASE}/page2`);
      expect(urls).toContain(`${TEST_BASE}/page3`);
    } finally {
      await viewport.close();
    }
  }, 30000);

  it('returns correct navigation result fields', async () => {
    const viewport = new Viewport({ headless: true });
    await viewport.launch();

    try {
      const result = await viewport.navigate(TEST_BASE);
      expect(result).toHaveProperty('url');
      expect(result).toHaveProperty('title');
      expect(result).toHaveProperty('status');
      expect(result).toHaveProperty('html');
      expect(result).toHaveProperty('text');
      expect(typeof result.url).toBe('string');
      expect(typeof result.title).toBe('string');
      expect(typeof result.status).toBe('number');
      expect(typeof result.html).toBe('string');
      expect(typeof result.text).toBe('string');
      expect(result.status).toBe(200);
      expect(result.html).toContain('Welcome');
      expect(result.text).toContain('Welcome');
    } finally {
      await viewport.close();
    }
  }, 30000);

  it('preserves property: network log accumulates across multiple navigations', async () => {
    const viewport = new Viewport({ headless: true });
    await viewport.launch();

    try {
      await viewport.navigate(TEST_BASE);
      const logSize1 = viewport.getNetworkLog().length;

      await viewport.navigate(`${TEST_BASE}/page2`);
      const logSize2 = viewport.getNetworkLog().length;

      expect(logSize2).toBeGreaterThanOrEqual(logSize1);
    } finally {
      await viewport.close();
    }
  }, 30000);

  it('captures 404 status for non-existent pages', async () => {
    const viewport = new Viewport({ headless: true });
    await viewport.launch();

    try {
      const result = await viewport.navigate(`${TEST_BASE}/nonexistent`);
      expect(result.status).toBe(404);
    } finally {
      await viewport.close();
    }
  }, 30000);

  it('clears network log between tests', async () => {
    const viewport = new Viewport({ headless: true });
    await viewport.launch();

    try {
      await viewport.navigate(TEST_BASE);
      expect(viewport.getNetworkLog().length).toBeGreaterThan(0);

      viewport.clearNetworkLog();
      expect(viewport.getNetworkLog()).toEqual([]);
    } finally {
      await viewport.close();
    }
  }, 30000);

  it('throws error when navigating without launch', async () => {
    const viewport = new Viewport({ headless: true });
    await expect(viewport.navigate(TEST_BASE)).rejects.toThrow('Viewport not launched');
  });

  describe('fast-check property tests', () => {
    it('preserves property: navigation order matches URL order', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(
            fc.constantFrom(
              `${TEST_BASE}/`,
              `${TEST_BASE}/page2`,
              `${TEST_BASE}/page3`,
            ),
            { minLength: 1, maxLength: 5 },
          ),
          async (urls: string[]) => {
            const viewport = new Viewport({ headless: true });
            await viewport.launch();

            try {
              const results: string[] = [];
              for (const url of urls) {
                const nav = await viewport.navigate(url);
                results.push(nav.url);
              }
              expect(results).toEqual(urls);
            } finally {
              await viewport.close();
            }
          },
        ),
        { numRuns: 3 },
      );
    }, 60000);

    it('preserves property: network log entries have url, method, status', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom(
            `${TEST_BASE}/`,
            `${TEST_BASE}/page2`,
          ),
          async (url) => {
            const viewport = new Viewport({ headless: true });
            await viewport.launch();

            try {
              await viewport.navigate(url);
              const log = viewport.getNetworkLog();

              for (const entry of log) {
                expect(entry).toHaveProperty('url');
                expect(entry).toHaveProperty('method');
                expect(entry).toHaveProperty('status');
                expect(typeof entry.url).toBe('string');
                expect(typeof entry.method).toBe('string');
                expect(typeof entry.status).toBe('number');
              }
            } finally {
              await viewport.close();
            }
          },
        ),
        { numRuns: 2 },
      );
    }, 60000);
  });
});
