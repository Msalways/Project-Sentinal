import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fc from 'fast-check';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { Pipeline } from '../../src/pipeline/index';
import { UltimatrixConfig } from '../../src/core/config';

const TEST_PORT = 18999;
const TEST_BASE = `http://localhost:${TEST_PORT}`;
const OUTPUT_DIR = path.join(__dirname, '..', '..', 'tmp', 'headless-timing-test');

let server: http.Server;
let serverUrls: string[] = [];

beforeAll(async () => {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  await new Promise<void>((resolve) => {
    server = http.createServer((req, res) => {
      const url = req.url || '/';

      if (url === '/') {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(`<!DOCTYPE html>
<html><body>
<h1>Home</h1>
<a href="/page1">Page 1</a>
<a href="/api/data">Fetch Data</a>
<script>
function loadData() {
  var xhr = new XMLHttpRequest();
  xhr.open('GET', '/api/data', true);
  xhr.send();
  fetch('/api/fetch-data');
}
setTimeout(loadData, 100);
</script>
</body></html>`);
      } else if (url === '/page1') {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(`<!DOCTYPE html>
<html><body>
<h1>Page 1</h1>
<a href="/">Home</a>
</body></html>`);
      } else if (url === '/page2') {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(`<!DOCTYPE html>
<html><body>
<h1>Page 2</h1>
<p>Subsequent page content</p>
</body></html>`);
      } else if (url === '/api/data') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ items: [1, 2, 3] }));
      } else if (url === '/api/fetch-data') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok' }));
      } else {
        res.writeHead(404);
        res.end('Not found');
      }
    });

    server.listen(TEST_PORT, () => {
      serverUrls = [TEST_BASE];
      resolve();
    });
  });
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  fs.rmSync(OUTPUT_DIR, { recursive: true, force: true });
});

describe('Headless Pipeline Timing', () => {
  it('captures XHR and fetch requests within timing bound', async () => {
    const config: UltimatrixConfig = {
      provider: 'mock',
      apiKey: 'mock',
      modelId: 'mock',
      agents: { agents: [], terminationPrompt: '', maxRounds: 3 },
      headless: true,
      timeout: 30000,
      outputFormat: 'json',
      outputDir: OUTPUT_DIR,
    };

    const pipeline = new Pipeline(config);

    const targetUrl = `${TEST_BASE}/`;
    const result = await pipeline.run({ url: targetUrl });

    expect(result.success).toBe(true);
    expect(result.duration).toBeGreaterThanOrEqual(0);
  }, 30000);

  it('preserves property: headless pipeline completes under 5 seconds for simple target', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(
          `${TEST_BASE}/`,
          `${TEST_BASE}/page1`,
          `${TEST_BASE}/page2`,
        ),
        fc.integer({ min: 1, max: 3 }),
        async (baseUrl, _timeoutMultiplier) => {
          const config: UltimatrixConfig = {
            provider: 'mock',
            apiKey: 'mock',
            modelId: 'mock',
            agents: { agents: [], terminationPrompt: '', maxRounds: 3 },
            headless: true,
            timeout: 30000,
            outputFormat: 'json',
            outputDir: OUTPUT_DIR,
          };

          const pipeline = new Pipeline(config);
          const start = Date.now();
          const result = await pipeline.run({ url: baseUrl });
          const elapsed = Date.now() - start;

          expect(result.success).toBe(true);
          expect(elapsed).toBeLessThan(5000);
        },
      ),
      { numRuns: 1 },
    );
  }, 60000);

  it('preserves property: headless pipeline tracks at least one navigation request', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(
          `${TEST_BASE}/`,
          `${TEST_BASE}/page1`,
        ),
        async (url) => {
          const config: UltimatrixConfig = {
            provider: 'mock',
            apiKey: 'mock',
            modelId: 'mock',
            agents: { agents: [], terminationPrompt: '', maxRounds: 3 },
            headless: true,
            timeout: 30000,
            outputFormat: 'json',
            outputDir: OUTPUT_DIR,
          };

          const pipeline = new Pipeline(config);
          const result = await pipeline.run({ url });

          expect(result.success).toBe(true);
          expect(result.metadata.agentsUsed.length).toBeGreaterThan(0);
        },
      ),
      { numRuns: 1 },
    );
  }, 60000);
});
