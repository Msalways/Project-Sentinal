import { mapToOWASP, enrichFindingsWithOWASP, OWASP_CATEGORIES } from '../../src/tools/owasp-mapper';
import type { Finding } from '../../src/core/types';

function makeFinding(overrides: Partial<Finding>): Finding {
  return {
    id: 'test-1',
    title: 'Test Finding',
    description: 'A test finding',
    severity: 'medium',
    category: 'injection',
    confidence: 50,
    location: '/api/test',
    evidence: 'test',
    remediation: 'fix it',
    agent: 'web',
    timestamp: '2025-01-01T00:00:00Z',
    ...overrides,
  };
}

describe('mapToOWASP', () => {
  it('returns existing owaspCategory if set', () => {
    const f = makeFinding({ owaspCategory: 'A01:2021-broken-access-control' });
    expect(mapToOWASP(f)).toBe('A01:2021-broken-access-control');
  });

  it('maps sql-injection to injection', () => {
    expect(mapToOWASP(makeFinding({ category: 'sql-injection' }))).toBe('A03:2021-injection');
  });

  it('maps xss to injection', () => {
    expect(mapToOWASP(makeFinding({ category: 'xss' }))).toBe('A03:2021-injection');
  });

  it('maps command-injection to injection', () => {
    expect(mapToOWASP(makeFinding({ category: 'command-injection' }))).toBe('A03:2021-injection');
  });

  it('maps idor to broken-access-control', () => {
    expect(mapToOWASP(makeFinding({ category: 'idor' }))).toBe('A01:2021-broken-access-control');
  });

  it('maps ssrf to A10', () => {
    expect(mapToOWASP(makeFinding({ category: 'ssrf' }))).toBe('A10:2021-ssrf');
  });

  it('maps csrf to auth-failures', () => {
    expect(mapToOWASP(makeFinding({ category: 'csrf' }))).toBe('A07:2021-auth-failures');
  });

  it('maps from title text', () => {
    const f = makeFinding({ category: 'other', title: 'SQL Injection in login' });
    expect(mapToOWASP(f)).toBe('A03:2021-injection');
  });

  it('maps from description text', () => {
    const f = makeFinding({ category: 'other', title: 'Misc', description: 'SSRF vulnerability found via URL parameter' });
    expect(mapToOWASP(f)).toBe('A10:2021-ssrf');
  });

  it('matches case-insensitively', () => {
    const f = makeFinding({ category: 'XSS' });
    expect(mapToOWASP(f)).toBe('A03:2021-injection');
  });

  it('returns undefined for unknown category', () => {
    const f = makeFinding({ category: 'unknown-vuln', title: 'Some weird thing', description: 'none' });
    expect(mapToOWASP(f)).toBeUndefined();
  });
});

describe('enrichFindingsWithOWASP', () => {
  it('adds owaspCategory to findings that lack it', () => {
    const findings = [makeFinding({ category: 'xss', owaspCategory: undefined })];
    const enriched = enrichFindingsWithOWASP(findings);
    expect(enriched[0].owaspCategory).toBe('A03:2021-injection');
  });

  it('preserves existing owaspCategory', () => {
    const findings = [makeFinding({ category: 'xss', owaspCategory: 'A01:2021-broken-access-control' })];
    const enriched = enrichFindingsWithOWASP(findings);
    expect(enriched[0].owaspCategory).toBe('A01:2021-broken-access-control');
  });

  it('does not mutate original findings', () => {
    const f = makeFinding({ category: 'xss' });
    const origCat = f.owaspCategory;
    enrichFindingsWithOWASP([f]);
    expect(f.owaspCategory).toBe(origCat);
  });

  it('handles empty array', () => {
    expect(enrichFindingsWithOWASP([])).toEqual([]);
  });
});

describe('OWASP_CATEGORIES', () => {
  it('contains all 10 categories', () => {
    expect(Object.keys(OWASP_CATEGORIES)).toHaveLength(10);
  });

  it('has name and description for each', () => {
    for (const [key, val] of Object.entries(OWASP_CATEGORIES)) {
      expect(val).toHaveProperty('name');
      expect(val).toHaveProperty('description');
      expect(typeof val.name).toBe('string');
      expect(typeof val.description).toBe('string');
    }
  });

  it('includes injection category', () => {
    expect(OWASP_CATEGORIES['A03:2021-injection'].name).toBe('Injection');
  });

  it('includes broken access control', () => {
    expect(OWASP_CATEGORIES['A01:2021-broken-access-control'].name).toBe('Broken Access Control');
  });
});
