import { calculateRiskScore, riskLevelFromScore, deduplicateFindings, correlateFindings } from '../../src/tools/scoring';
import type { Finding, TestResult } from '../../src/core/types';

function makeFinding(overrides: Partial<Finding>): Finding {
  return {
    id: 'test-1',
    title: 'Test Finding',
    description: 'A test finding',
    severity: 'medium',
    category: 'injection',
    confidence: 50,
    location: '/api/test',
    evidence: 'test evidence',
    remediation: 'fix it',
    agent: 'web',
    timestamp: '2025-01-01T00:00:00Z',
    ...overrides,
  };
}

function makeTestResult(overrides: Partial<TestResult> = {}): TestResult {
  return {
    id: 'result-1',
    name: 'Test Result',
    status: 'passed',
    severity: 'medium',
    description: 'A test result',
    duration: 100,
    confidence: 80,
    ...overrides,
  };
}

describe('calculateRiskScore', () => {
  it('returns 0 for empty findings', () => {
    expect(calculateRiskScore([])).toBe(0);
  });

  it('computes weighted score with confidence multiplier', () => {
    const findings = [
      makeFinding({ severity: 'critical', confidence: 100 }),
      makeFinding({ severity: 'high', confidence: 100 }),
    ];
    const score = calculateRiskScore(findings);
    expect(score).toBe(40);
  });

  it('scales by confidence', () => {
    const full = calculateRiskScore([makeFinding({ severity: 'critical', confidence: 100 })]);
    const half = calculateRiskScore([makeFinding({ severity: 'critical', confidence: 50 })]);
    expect(full).toBe(25);
    expect(half).toBe(12.5);
  });

  it('caps at 100', () => {
    const findings = [
      makeFinding({ severity: 'critical', confidence: 100 }),
      makeFinding({ severity: 'critical', confidence: 100 }),
      makeFinding({ severity: 'critical', confidence: 100 }),
      makeFinding({ severity: 'critical', confidence: 100 }),
    ];
    expect(calculateRiskScore(findings)).toBe(100);
  });

  it('handles info severity', () => {
    const score = calculateRiskScore([makeFinding({ severity: 'info', confidence: 100 })]);
    expect(score).toBe(1);
  });
});

describe('riskLevelFromScore', () => {
  it('returns critical for >= 75', () => expect(riskLevelFromScore(75)).toBe('critical'));
  it('returns high for >= 50', () => expect(riskLevelFromScore(50)).toBe('high'));
  it('returns medium for >= 25', () => expect(riskLevelFromScore(25)).toBe('medium'));
  it('returns low for >= 10', () => expect(riskLevelFromScore(10)).toBe('low'));
  it('returns info for < 10', () => expect(riskLevelFromScore(5)).toBe('info'));
  it('handles 0', () => expect(riskLevelFromScore(0)).toBe('info'));
  it('handles exact boundaries', () => {
    expect(riskLevelFromScore(74)).toBe('high');
    expect(riskLevelFromScore(49)).toBe('medium');
    expect(riskLevelFromScore(24)).toBe('low');
    expect(riskLevelFromScore(9)).toBe('info');
  });
});

describe('deduplicateFindings', () => {
  it('removes duplicates by category:location:title', () => {
    const findings = [
      makeFinding({ id: '1', category: 'xss', location: '/page', title: 'XSS' }),
      makeFinding({ id: '2', category: 'xss', location: '/page', title: 'XSS' }),
    ];
    expect(deduplicateFindings(findings)).toHaveLength(1);
  });

  it('keeps critical/high severity duplicates over lower', () => {
    const low = makeFinding({ id: '1', category: 'xss', location: '/page', title: 'XSS', severity: 'low' });
    const high = makeFinding({ id: '2', category: 'xss', location: '/page', title: 'XSS', severity: 'high' });
    const result = deduplicateFindings([low, high]);
    expect(result).toHaveLength(1);
    expect(result[0].severity).toBe('high');
  });

  it('keeps distinct findings', () => {
    const findings = [
      makeFinding({ id: '1', category: 'xss', location: '/a', title: 'A' }),
      makeFinding({ id: '2', category: 'sqli', location: '/b', title: 'B' }),
    ];
    expect(deduplicateFindings(findings)).toHaveLength(2);
  });

  it('returns empty for empty input', () => {
    expect(deduplicateFindings([])).toEqual([]);
  });
});

describe('correlateFindings', () => {
  it('enriches findings with confidence and OWASP', () => {
    const finding = makeFinding({ category: 'xss', confidence: 0 });
    const result = correlateFindings([finding], []);
    expect(result.findings[0].confidence).toBeGreaterThan(0);
    expect(result.findings[0].owaspCategory).toBe('A03:2021-injection');
  });

  it('deduplicates and sorts by severity', () => {
    const findings = [
      makeFinding({ id: '1', severity: 'low', category: 'xss', location: '/a', title: 'XSS' }),
      makeFinding({ id: '2', severity: 'critical', category: 'xss', location: '/a', title: 'XSS' }),
      makeFinding({ id: '3', severity: 'high', category: 'sqli', location: '/b', title: 'SQLi' }),
    ];
    const result = correlateFindings(findings, []);
    expect(result.findings).toHaveLength(2);
    expect(result.findings[0].severity).toBe('critical');
    expect(result.findings[1].severity).toBe('high');
  });

  it('computes risk score and level', () => {
    const findings = [
      makeFinding({ severity: 'critical', confidence: 100, category: 'xss', location: '/a', title: 'XSS' }),
      makeFinding({ severity: 'high', confidence: 100, category: 'sqli', location: '/b', title: 'SQLi' }),
    ];
    const result = correlateFindings(findings, []);
    expect(result.summary).toContain('2 vulnerabilities');
    expect(result.summary).toContain('1 critical');
    expect(result.summary).toContain('1 high');
  });

  it('passes through testResults', () => {
    const tr = makeTestResult();
    const result = correlateFindings([makeFinding({ category: 'xss', location: '/a', title: 'X' })], [tr]);
    expect(result.testResults).toHaveLength(1);
    expect(result.testResults[0].id).toBe('result-1');
  });

  it('reports confirmed findings (confidence >= 75)', () => {
    const findings = [
      makeFinding({ confidence: 90, category: 'xss', location: '/a', title: 'XSS', severity: 'high' }),
    ];
    const result = correlateFindings(findings, []);
    expect(result.summary).toContain('1 confirmed');
  });

  it('handles empty findings', () => {
    const result = correlateFindings([], []);
    expect(result.findings).toEqual([]);
    expect(result.summary).toContain('0 vulnerabilities');
    expect(result.summary).toContain('Risk level: info');
  });
});
