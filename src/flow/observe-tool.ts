import { z } from 'zod';
import { tool, DynamicStructuredTool } from '@langchain/core/tools';
import { BrowserSessionManager } from '../core/browser-session';
import type { AppPage, PageForm, Transition } from './flow-model';
import { FlowStore } from './flow-store';

export function createObservePageTool(browser: BrowserSessionManager, flowStore: FlowStore): DynamicStructuredTool {
  return tool(async (input) => {
    const { sessionId, pageType, authLevel, description } = input;
    const page = await browser.getOrCreate(sessionId);
    const currentUrl = page.url();
    const pathname = new URL(currentUrl).pathname;

    const title = await page.evaluate(() => document.title || '');

    const rawForms = await page.evaluate(() =>
      Array.from(document.querySelectorAll('form')).map(f => ({
        action: (f as HTMLFormElement).action || (f as HTMLFormElement).getAttribute('action') || '',
        method: ((f as HTMLFormElement).method || 'GET').toUpperCase(),
        fields: Array.from(f.querySelectorAll('input, select, textarea')).map(el => {
          const input = el as HTMLInputElement;
          return { name: input.name || input.id || '', type: input.type || 'text', required: input.required, placeholder: input.placeholder };
        }).filter(f => f.name),
        submitText: f.querySelector('[type="submit"], button[type="submit"]')?.textContent?.trim() || undefined,
      }))
    );

    const links = await page.evaluate(() =>
      Array.from(document.querySelectorAll('a[href]')).map(a => ({
        text: (a as HTMLAnchorElement).textContent?.trim() || '',
        href: (a as HTMLAnchorElement).href,
      }))
    );

    const buttons = await page.evaluate(() =>
      Array.from(document.querySelectorAll('button, [role="button"], input[type="submit"]')).map(el => ({
        text: (el as HTMLElement).textContent?.trim() || (el as HTMLInputElement).value || '',
      })).filter(b => b.text)
    );

    const scripts = await page.evaluate(() =>
      Array.from(document.querySelectorAll('script[src]')).map(s => (s as HTMLScriptElement).src).filter(Boolean)
    );

    const images = await page.evaluate(() =>
      Array.from(document.querySelectorAll('img[src]')).map(img => (img as HTMLImageElement).src)
    );

    const forms: PageForm[] = rawForms.map(f => ({
      action: f.action,
      method: f.method,
      fields: f.fields.map(fd => ({ name: fd.name, type: fd.type, required: fd.required, placeholder: fd.placeholder })),
      submitText: f.submitText,
    }));

    const transitions: Transition[] = links.map(l => ({
      trigger: l.text || 'link',
      from: pathname,
      to: l.href,
      method: 'GET',
      endpoint: l.href,
      requiresAuth: false,
    }));

    const base = new URL(currentUrl);
    const detectedEndpoints = new Set<string>();
    for (const url of [...links.map(l => l.href), ...scripts, ...images]) {
      try {
        const parsed = new URL(url);
        if (parsed.hostname === base.hostname) detectedEndpoints.add(parsed.pathname);
      } catch {}
    }

    const appPage: AppPage = {
      path: pathname,
      title,
      type: pageType,
      auth: authLevel,
      forms,
      transitions,
      actions: buttons.map(b => b.text),
      detectedEndpoints: Array.from(detectedEndpoints),
    };

    flowStore.recordPage(appPage);

    const formSummary = forms.length > 0
      ? `\n  Forms: ${forms.map(f => `${f.method} ${f.action} (${f.fields.length} fields)`).join(', ')}`
      : '';
    const endpointSummary = detectedEndpoints.size > 0
      ? `\n  Endpoints: ${Array.from(detectedEndpoints).slice(0, 10).join(', ')}`
      : '';
    const btnSummary = buttons.length > 0
      ? `\n  Actions: ${buttons.map(b => `"${b.text}"`).slice(0, 8).join(', ')}`
      : '';

    return [
      `Observed [${pageType}] at ${pathname} — "${title}" (auth: ${authLevel})`,
      description ? `  ${description}` : '',
      `  ${links.length} links, ${forms.length} forms, ${buttons.length} actions${formSummary}${endpointSummary}${btnSummary}`,
    ].filter(Boolean).join('\n');
  }, {
    name: 'observe_page',
    description: 'Capture current browser page as structured flow data. Records forms, links, buttons, endpoints. Call this on every unique page to build the app flow model.',
    schema: z.object({
      sessionId: z.string().default('default'),
      pageType: z.string().default('page').describe('What kind of page this is (e.g. login, product-catalog, checkout, admin-panel)'),
      authLevel: z.string().default('public').describe('Who can access this page (e.g. public, authenticated, admin-only, role:editor)'),
      description: z.string().optional().describe('What this page does in your own words'),
    }),
  });
}
