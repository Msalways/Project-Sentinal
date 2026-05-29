import type { DOMSnapshot } from './dom-observer';

export interface Interaction {
  type: 'click' | 'fill_and_submit' | 'navigate';
  targetSelector: string;
  formData?: Record<string, string>;
  label: string;
}

const DANGER_WORDS = /logout|sign.?out|delete|remove|destroy|terminate|suspend|cancel|revoke/i;
const LOGIN_WORDS = /login|sign.?in|log.?in|authenticate/i;
const SEEN_THRESHOLD = 5;

function contextAwareField(field: { name: string; type: string; placeholder: string }): string {
  const name = (field.name + ' ' + field.placeholder).toLowerCase();
  if (/email|e-mail|mail/i.test(name)) return 'test@example.com';
  if (/password|passwd|pwd/i.test(name)) return 'TestPassword123!';
  if (/user(name)?|login|username/i.test(name)) return 'testuser';
  if (/search|q|query/i.test(name)) return 'test-search';
  if (/first.?name|fname/i.test(name)) return 'Test';
  if (/last.?name|lname/i.test(name)) return 'User';
  if (/\b(phone|tel|mobile)\b/i.test(name)) return '555-0100';
  if (/\b(zip|postal|postcode)\b/i.test(name)) return '10001';
  if (/\b(address|street)\b/i.test(name)) return '123 Test St';
  if (/\bcity\b/i.test(name)) return 'New York';
  if (/\b(state|province)\b/i.test(name)) return 'NY';
  if (/\bcountry\b/i.test(name)) return 'US';
  if (/\bdate\b/i.test(name)) return '2025-01-01';
  if (/\b(price|amount|cost)\b/i.test(name)) return '100';
  if (/\b(quantity|qty|count)\b/i.test(name)) return '1';
  if (/\b(comment|message|desc|bio|about)\b/i.test(name)) return 'Test input';
  if (/\b(url|link|site)\b/i.test(name)) return 'https://example.com';
  if (field.type === 'email') return 'test@example.com';
  if (field.type === 'tel') return '555-0100';
  if (field.type === 'number') return '123';
  if (field.type === 'url') return 'https://example.com';
  if (field.type === 'password') return 'TestPassword123!';
  if (field.type === 'date') return '2025-01-01';
  if (field.type === 'checkbox') return 'true';
  if (field.type === 'file') return '';
  return 'test';
}

export function planInteractions(snapshot: DOMSnapshot, visitedUrls: Set<string>, seenSelectors: Set<string>): Interaction[] {
  const interactions: Interaction[] = [];

  // 0. Dialogs / overlays — dismiss or interact first (cookie banners, login modals, popups)
  for (const d of snapshot.dialogs) {
    if (seenSelectors.has(d.selector)) continue;
    if (!d.isVisible) continue;
    seenSelectors.add(d.selector);
    const textLower = d.text.toLowerCase();
    // Look for accept/dismiss buttons inside the dialog
    let btnSel = `${d.selector} button, ${d.selector} a, ${d.selector} [role="button"]`;
    if (/accept|agree|allow|consent|got it|ok/i.test(textLower)) {
      interactions.push({
        type: 'click',
        targetSelector: `${d.selector} [class*="accept"], ${d.selector} [class*="agree"], ${d.selector} [class*="allow"], ${d.selector} button:first-of-type`,
        label: `accept dialog: ${d.text.slice(0, 60)}`,
      });
    } else if (/reject|decline|deny|refuse|only essential/i.test(textLower)) {
      interactions.push({
        type: 'click',
        targetSelector: `${d.selector} [class*="reject"], ${d.selector} [class*="decline"], ${d.selector} [data-testid*="reject"]`,
        label: `reject dialog: ${d.text.slice(0, 60)}`,
      });
    }
  }

  for (const o of snapshot.overlays) {
    if (seenSelectors.has(o.selector)) continue;
    seenSelectors.add(o.selector);
    const textLower = o.text.toLowerCase();
    if (/accept|agree|allow|consent|got it|ok/i.test(textLower)) {
      interactions.push({
        type: 'click',
        targetSelector: `${o.selector} button, ${o.selector} a`,
        label: `accept overlay: ${o.text.slice(0, 60)}`,
      });
    }
  }

  // 1. Form submissions — fill and submit
  for (const form of snapshot.forms) {
    if (seenSelectors.has(form.selector + ':submit')) continue;
    seenSelectors.add(form.selector + ':submit');

    const formData: Record<string, string> = {};
    for (const field of form.fields) {
      if (field.type === 'file' || field.type === 'hidden') continue;
      formData[field.name] = contextAwareField(field);
    }

    interactions.push({
      type: 'fill_and_submit',
      targetSelector: form.selector,
      formData,
      label: `submit form ${form.action || form.selector}`,
    });
  }

  // 2. Click links — discover new pages
  for (const el of snapshot.interactive) {
    if (seenSelectors.has(el.selector)) continue;
    if (el.tag === 'a' && el.href) {
      if (DANGER_WORDS.test(el.text) && !LOGIN_WORDS.test(el.text)) continue;
      if (visitedUrls.has(el.href)) continue;
      if (el.href.startsWith('#') || el.href.startsWith('javascript:')) continue;
      seenSelectors.add(el.selector);
      interactions.push({
        type: 'click',
        targetSelector: el.selector,
        label: `click ${el.text || el.href}`,
      });
    }
  }

  // 3. Click buttons that aren't form children (modals, tabs, toggles)
  for (const el of snapshot.interactive) {
    if (seenSelectors.has(el.selector)) continue;
    if (el.tag === 'button' || el.type === 'submit' || el.type === 'button') {
      if (DANGER_WORDS.test(el.text)) continue;
      seenSelectors.add(el.selector);
      interactions.push({
        type: 'click',
        targetSelector: el.selector,
        label: `click button "${el.text}"`,
      });
    }
  }

  // 4. Click interactive elements with role="button"
  for (const el of snapshot.interactive) {
    if (seenSelectors.has(el.selector)) continue;
    if (el.tag === 'div' || el.tag === 'span') {
      if (DANGER_WORDS.test(el.text)) continue;
      seenSelectors.add(el.selector);
      interactions.push({
        type: 'click',
        targetSelector: el.selector,
        label: `click "${el.text}"`,
      });
    }
  }

  return interactions;
}
