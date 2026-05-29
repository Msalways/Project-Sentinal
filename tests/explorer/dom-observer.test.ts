import { describe, it, expect } from 'vitest';
import { isSamePage, type DOMSnapshot } from '../../src/explorer/dom-observer';

function makeSnapshot(overrides: Partial<DOMSnapshot> = {}): DOMSnapshot {
  return {
    url: 'https://example.com/page',
    title: 'Test Page',
    forms: [],
    interactive: [],
    dialogs: [],
    overlays: [],
    textContent: 'Hello world',
    hash: 'abc123',
    ...overrides,
  };
}

describe('isSamePage', () => {
  it('returns true when hashes match', () => {
    const a = makeSnapshot({ hash: 'same' });
    const b = makeSnapshot({ hash: 'same' });
    expect(isSamePage(a, b)).toBe(true);
  });

  it('returns false when hashes differ', () => {
    const a = makeSnapshot({ hash: 'abc' });
    const b = makeSnapshot({ hash: 'def' });
    expect(isSamePage(a, b)).toBe(false);
  });

  it('handles empty hashes', () => {
    const a = makeSnapshot({ hash: '' });
    const b = makeSnapshot({ hash: '' });
    expect(isSamePage(a, b)).toBe(true);
  });
});
