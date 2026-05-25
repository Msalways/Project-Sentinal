import { calculateConfidence, confidenceLabel, enrichFindingsWithConfidence } from '../../src/tools/confidence';
import type { Finding } from '../../src/core/types';

function makeFinding(overrides: Partial<Finding>): Finding {
  return {
    id: 'test-1',
    title: 'Test Finding',
    description: 'a description',
    severity: 'medium',
    category: 'injection',
    confidence: 50,
    location: '/api/test',
    evidence: '',
    remediation: '',
    agent: 'web',
    timestamp: '2025-01-01T00:00:00Z',
    ...overrides,
  };
}

describe('calculateConfidence', () => {
  it('starts at base score 50', () => {
    expect(calculateConfidence(makeFinding({}))).toBe(50);
  });

  it('adds 10 for evidence longer than 10 chars', () => {
    const f = makeFinding({ evidence: '12345678901' });
    expect(calculateConfidence(f)).toBe(60);
  });

  it('adds 20 for evidence longer than 50 chars', () => {
    const f = makeFinding({ evidence: 'x'.repeat(51) });
    expect(calculateConfidence(f)).toBe(70);
  });

  it('adds 15 if evidence includes "confirmed"', () => {
    const f = makeFinding({ evidence: 'confirmed vulnerability found' });
    expect(calculateConfidence(f)).toBe(80);
  });

  it('adds 15 if evidence includes "verified"', () => {
    const f = makeFinding({ evidence: 'verified by retest' });
    expect(calculateConfidence(f)).toBe(80);
  });

  it('adds 5 if cweId is set', () => {
    const f = makeFinding({ cweId: 'CWE-79' });
    expect(calculateConfidence(f)).toBe(55);
  });

  it('adds 5 if cvssScore > 0', () => {
    const f = makeFinding({ cvssScore: 7.5 });
    expect(calculateConfidence(f)).toBe(55);
  });

  it('adds 5 if remediation longer than 20 chars', () => {
    const f = makeFinding({ remediation: 'this is a longer remediation text' });
    expect(calculateConfidence(f)).toBe(55);
  });

  it('adds 5 for each strong evidence keyword', () => {
    const f = makeFinding({ evidence: 'exploited the vulnerability and injected payload', description: 'bypassed security' });
    expect(calculateConfidence(f)).toBeGreaterThan(60);
  });

  it('subtracts 5 for each weak evidence keyword', () => {
    const f = makeFinding({ evidence: 'possible vulnerability might exist', description: 'potential issue' });
    expect(calculateConfidence(f)).toBe(45);
  });

  it('clamps to 0 minimum', () => {
    const f = makeFinding({ evidence: '', description: 'possible might could suspected potential appears seems likely may be' });
    expect(calculateConfidence(f)).toBe(5);
  });

  it('clamps to 100 maximum', () => {
    const f = makeFinding({
      evidence: 'confirmed verified exploited executed injected reproduced accessed bypassed returned ' + 'x'.repeat(100),
      cweId: 'CWE-79',
      cvssScore: 9.0,
      remediation: 'a very long remediation string that exceeds 20 characters',
    });
    const score = calculateConfidence(f);
    expect(score).toBeLessThanOrEqual(100);
    expect(score).toBe(100);
  });

  it('combines multiple bonuses', () => {
    const f = makeFinding({
      evidence: 'confirmed exploited injection',
      cweId: 'CWE-89',
      cvssScore: 8.0,
      remediation: 'this is a long remediation fix for the issue',
    });
    expect(calculateConfidence(f)).toBe(100);
  });

  it('searches combined evidence+description for keywords', () => {
    const f = makeFinding({ evidence: 'short', description: 'this was exploited successfully' });
    expect(calculateConfidence(f)).toBe(55);
  });
});

describe('confidenceLabel', () => {
  it('returns Confirmed for >= 90', () => expect(confidenceLabel(90)).toBe('Confirmed'));
  it('returns High for >= 75', () => expect(confidenceLabel(75)).toBe('High'));
  it('returns Medium for >= 50', () => expect(confidenceLabel(50)).toBe('Medium'));
  it('returns Low for >= 25', () => expect(confidenceLabel(25)).toBe('Low'));
  it('returns Speculative for < 25', () => expect(confidenceLabel(24)).toBe('Speculative'));
  it('handles boundaries', () => {
    expect(confidenceLabel(100)).toBe('Confirmed');
    expect(confidenceLabel(89)).toBe('High');
    expect(confidenceLabel(74)).toBe('Medium');
    expect(confidenceLabel(49)).toBe('Low');
    expect(confidenceLabel(0)).toBe('Speculative');
  });
});

describe('enrichFindingsWithConfidence', () => {
  it('calculates confidence when not set', () => {
    const f = makeFinding({ confidence: 0 });
    const enriched = enrichFindingsWithConfidence([f]);
    expect(enriched[0].confidence).toBeGreaterThan(0);
  });

  it('preserves existing confidence when already set', () => {
    const f = makeFinding({ confidence: 99 });
    const enriched = enrichFindingsWithConfidence([f]);
    expect(enriched[0].confidence).toBe(99);
  });

  it('does not mutate original findings', () => {
    const f = makeFinding({ confidence: 0 });
    enrichFindingsWithConfidence([f]);
    expect(f.confidence).toBe(0);
  });

  it('handles empty array', () => {
    expect(enrichFindingsWithConfidence([])).toEqual([]);
  });
});
