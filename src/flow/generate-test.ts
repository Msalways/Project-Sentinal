import fs from 'fs';
import path from 'path';
import type { MacroStep } from '../core/browser-session';

export interface TestGenOptions {
  steps: MacroStep[];
  target: string;
  outputDir: string;
  totalRoutes?: number;
  filename?: string;
}

export interface TestGenResult {
  filePath: string;
  stepCount: number;
}

export function generatePlaywrightTest(opts: TestGenOptions): TestGenResult {
  const { steps, target, outputDir, totalRoutes, filename } = opts;
  const filePath = path.join(outputDir, filename || 'user-flow.spec.ts');

  const lines: string[] = [];
  lines.push(`import { test } from '@playwright/test';`);
  lines.push(``);
  lines.push(`// Auto-generated user flow — ${target}`);
  if (totalRoutes !== undefined) lines.push(`// Crawled ${totalRoutes} routes`);
  lines.push(`// ${steps.length} user actions`);
  lines.push(`// ${new Date().toISOString()}`);
  lines.push(``);
  lines.push(`test('User Workflow', async ({ page }) => {`);

  for (let i = 0; i < steps.length; i++) {
    const s = steps[i];
    lines.push(`  // Step ${i + 1}`);
    switch (s.type) {
      case 'navigate':
        lines.push(`  await page.goto('${esc(s.url || '')}');`);
        break;
      case 'click':
        lines.push(`  await page.locator('${esc(s.selector || '')}').click();`);
        break;
      case 'fill':
        lines.push(`  await page.locator('${esc(s.selector || '')}').fill('${esc(s.value || '')}');`);
        break;
      default:
        lines.push(`  // ${s.type} — skipped`);
    }
  }

  lines.push(`});`);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, lines.join('\n'), 'utf-8');

  return { filePath, stepCount: steps.length };
}

function esc(s: string): string {
  return s.replace(/'/g, "\\'");
}
