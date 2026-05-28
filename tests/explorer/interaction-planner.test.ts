import { describe, it, expect } from 'vitest';
import { planInteractions, type Interaction } from '../../src/explorer/interaction-planner';
import type { DOMSnapshot } from '../../src/explorer/dom-observer';

function makeSnapshot(overrides: Partial<DOMSnapshot> = {}): DOMSnapshot {
  return {
    url: 'https://example.com/page',
    title: 'Test Page',
    forms: [],
    interactive: [],
    textContent: '',
    hash: 'abc123',
    ...overrides,
  };
}

describe('planInteractions', () => {
  it('returns empty for empty page', () => {
    const snapshot = makeSnapshot();
    const result = planInteractions(snapshot, new Set(), new Set());
    expect(result).toEqual([]);
  });

  it('returns click interactions for links to unvisited URLs', () => {
    const snapshot = makeSnapshot({
      interactive: [
        { tag: 'a', text: 'About', selector: '#about-link', href: 'https://example.com/about', type: null },
        { tag: 'a', text: 'Contact', selector: '#contact-link', href: 'https://example.com/contact', type: null },
      ],
    });
    const result = planInteractions(snapshot, new Set(), new Set());
    expect(result).toHaveLength(2);
    expect(result[0].type).toBe('click');
    expect(result[0].label).toContain('About');
  });

  it('skips already visited URLs', () => {
    const snapshot = makeSnapshot({
      interactive: [
        { tag: 'a', text: 'About', selector: '#about-link', href: 'https://example.com/about', type: null },
      ],
    });
    const visited = new Set(['https://example.com/about']);
    const result = planInteractions(snapshot, visited, new Set());
    expect(result).toHaveLength(0);
  });

  it('skips danger words (logout, delete, etc.)', () => {
    const snapshot = makeSnapshot({
      interactive: [
        { tag: 'a', text: 'Logout', selector: '#logout', href: 'https://example.com/logout', type: null },
        { tag: 'a', text: 'Delete Account', selector: '#delete', href: 'https://example.com/delete', type: null },
        { tag: 'button', text: 'Cancel', selector: '#cancel', href: null, type: 'button' },
      ],
    });
    const result = planInteractions(snapshot, new Set(), new Set());
    expect(result).toHaveLength(0);
  });

  it('returns form interactions with context-aware field data', () => {
    const snapshot = makeSnapshot({
      forms: [{
        selector: 'form:first-of-type',
        action: '/login',
        method: 'post',
        fields: [
          { name: 'email', type: 'email', placeholder: 'Enter email', required: true },
          { name: 'password', type: 'password', placeholder: 'Password', required: true },
        ],
      }],
    });
    const result = planInteractions(snapshot, new Set(), new Set());
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('fill_and_submit');
    expect(result[0].formData?.email).toBe('test@example.com');
    expect(result[0].formData?.password).toBe('TestPassword123!');
  });

  it('returns button clicks', () => {
    const snapshot = makeSnapshot({
      interactive: [
        { tag: 'button', text: 'Submit', selector: 'button', href: null, type: 'submit' },
        { tag: 'button', text: 'Open Modal', selector: '#modal-btn', href: null, type: 'button' },
      ],
    });
    const result = planInteractions(snapshot, new Set(), new Set());
    expect(result.length).toBeGreaterThanOrEqual(1);
    expect(result.some(i => i.label.includes('Submit'))).toBe(true);
  });

  it('deduplicates by selector', () => {
    const snapshot = makeSnapshot({
      interactive: [
        { tag: 'a', text: 'Same Link', selector: '#link', href: 'https://example.com/page2', type: null },
      ],
    });
    const seen = new Set(['#link']);
    const result = planInteractions(snapshot, new Set(), seen);
    expect(result).toHaveLength(0);
  });

  it('context-aware field data for various field types', () => {
    const snapshot = makeSnapshot({
      forms: [{
        selector: 'form',
        action: '/search',
        method: 'get',
        fields: [
          { name: 'q', type: 'search', placeholder: 'Search...', required: false },
          { name: 'age', type: 'number', placeholder: 'Age', required: false },
          { name: 'bio', type: 'textarea', placeholder: 'Tell us', required: false },
          { name: 'country', type: 'select', placeholder: 'Select country', required: true },
        ],
      }],
    });
    const result = planInteractions(snapshot, new Set(), new Set());
    expect(result[0].formData?.q).toBe('test-search');
    expect(result[0].formData?.age).toBe('123');
    expect(result[0].formData?.bio).toBe('Test input');
    expect(result[0].formData?.country).toBe('US');
  });
});
