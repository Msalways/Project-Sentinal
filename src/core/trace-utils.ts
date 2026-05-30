import { TraceEntry, MacroStep } from './browser-session';
import * as fsp from 'node:fs';
import * as pth from 'node:path';

export function traceToHar(trace: TraceEntry[]): string {
  const entries = trace.map((t, i) => ({
    startedDateTime: new Date(t.timestamp).toISOString(),
    time: t.duration,
    request: {
      method: t.method,
      url: t.url,
      httpVersion: 'HTTP/1.1',
      headers: Object.entries(t.requestHeaders).map(([name, value]) => ({ name, value })),
      queryString: [],
      cookies: [],
      headersSize: -1,
      bodySize: t.requestBody?.length ?? -1,
    },
    response: {
      status: t.status,
      statusText: '',
      httpVersion: 'HTTP/1.1',
      headers: Object.entries(t.responseHeaders).map(([name, value]) => ({ name, value })),
      cookies: [],
      content: {
        size: -1,
        mimeType: t.responseHeaders['content-type'] || '',
      },
      redirectURL: '',
      headersSize: -1,
      bodySize: -1,
    },
    cache: {},
    timings: { send: 0, wait: t.duration, receive: 0 },
    pageref: t.sourcePage || `page_${i}`,
  }));

  return JSON.stringify({ log: { version: '1.2', creator: { name: 'ultimatrix', version: '1.0' }, entries } }, null, 2);
}

export interface GenerateTestOptions {
  steps: MacroStep[];
  target: string;
  outputDir: string;
  totalRoutes?: number;
  filename?: string;
}

export function generatePlaywrightTest(opts: GenerateTestOptions): { filePath: string; stepCount: number } {
  if (!opts.steps.length) {
    return { filePath: '', stepCount: 0 };
  }

  const lines: string[] = [
    `import { test } from '@playwright/test';`,
    ``,
    `test('recorded flow: ${opts.target}', async ({ page }) => {`,
  ];

  let screenshotIndex = 1;
  for (const step of opts.steps) {
    switch (step.type) {
      case 'navigate':
        lines.push(`  await page.goto('${escapeQuotes(step.url || opts.target)}');`);
        break;
      case 'click':
        lines.push(`  await page.click('${escapeQuotes(step.selector || '')}');`);
        break;
      case 'fill':
        lines.push(`  await page.fill('${escapeQuotes(step.selector || '')}', '${escapeQuotes(step.value || '')}');`);
        break;
      case 'wait':
        lines.push(`  await page.waitForTimeout(${step.waitMs || 1000});`);
        break;
      case 'screenshot':
        lines.push(`  await page.screenshot({ path: 'step-${screenshotIndex}.png' });`);
        screenshotIndex++;
        break;
      case 'evaluate':
        lines.push(`  await page.evaluate(\`${escapeQuotes(step.script || '')}\`);`);
        break;
    }
  }

  lines.push(`});`);
  lines.push('');

  const filename = opts.filename || `flow-${Date.now()}.spec.ts`;
  const filePath = pth.join(opts.outputDir, filename);
  fsp.writeFileSync(filePath, lines.join('\n'), 'utf-8');
  return { filePath, stepCount: opts.steps.length };
}

function escapeQuotes(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/`/g, '\\`');
}
