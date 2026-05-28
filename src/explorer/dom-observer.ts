import type { Page } from 'playwright';
import * as crypto from 'crypto';

export interface DOMSnapshot {
  url: string;
  title: string;
  forms: Array<{
    selector: string;
    action: string;
    method: string;
    fields: Array<{ name: string; type: string; placeholder: string; required: boolean }>;
  }>;
  interactive: Array<{
    tag: string;
    text: string;
    selector: string;
    href: string | null;
    type: string | null;
  }>;
  textContent: string;
  hash: string;
}

function buildSelector(el: Element): string {
  if (el.id) return `#${CSS.escape(el.id)}`;
  if (el.getAttribute('data-testid')) return `[data-testid="${CSS.escape(el.getAttribute('data-testid')!)}"]`;
  const tag = el.tagName.toLowerCase();
  const parent = el.parentElement;
  if (parent) {
    const siblings = Array.from(parent.children).filter(c => c.tagName === el.tagName);
    if (siblings.length > 1) {
      const idx = siblings.indexOf(el) + 1;
      return `${tag}:nth-of-type(${idx})`;
    }
  }
  if (el.className && typeof el.className === 'string') {
    const cls = el.className.trim().split(/\s+/).slice(0, 3).map(c => CSS.escape(c)).join('.');
    return `${tag}.${cls}`;
  }
  return tag;
}

function hashSnapshot(data: Omit<DOMSnapshot, 'hash'>): string {
  return crypto.createHash('md5').update(JSON.stringify(data)).digest('hex').slice(0, 12);
}

export async function takeSnapshot(page: Page): Promise<DOMSnapshot> {
  const base: Omit<DOMSnapshot, 'hash'> = await page.evaluate(() => {
    const forms: DOMSnapshot['forms'] = [];
    const interactive: DOMSnapshot['interactive'] = [];

    document.querySelectorAll('form').forEach((form, fi) => {
      const fields: DOMSnapshot['forms'][0]['fields'] = [];
      form.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>('input, select, textarea').forEach(el => {
        fields.push({
          name: el.name || el.id || `field_${fi}_${fields.length}`,
          type: (el as HTMLInputElement).type || el.tagName.toLowerCase(),
          placeholder: (el as HTMLInputElement).placeholder || '',
          required: el.required || el.hasAttribute('required'),
        });
      });
      forms.push({
        selector: `form:nth-of-type(${fi + 1})`,
        action: (form as HTMLFormElement).action || '',
        method: (form as HTMLFormElement).method || 'get',
        fields,
      });
    });

    document.querySelectorAll<HTMLElement>('a[href], button, input[type="submit"], input[type="button"], [role="button"]').forEach(el => {
      const tag = el.tagName.toLowerCase();
      const text = (el.textContent || el.getAttribute('aria-label') || el.getAttribute('value') || '').trim().slice(0, 100);
      const href = el.tagName === 'A' ? (el as HTMLAnchorElement).getAttribute('href') : null;
      const type = el.getAttribute('type');
      interactive.push({ tag, text, selector: buildSelector(el), href, type });
    });

    return {
      url: window.location.href,
      title: document.title,
      forms,
      interactive,
      textContent: (document.body?.innerText || '').slice(0, 10000),
    };
  });

  return {
    ...base,
    hash: hashSnapshot(base),
  };
}

export function isSamePage(a: DOMSnapshot, b: DOMSnapshot): boolean {
  return a.hash === b.hash;
}
