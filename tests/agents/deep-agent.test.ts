import { describe, it, expect } from 'vitest';
import { parseFindingsFromOutput } from '../../src/agents/deep-agent';

describe('parseFindingsFromOutput', () => {
  it('parses a finding with inline severity in title', () => {
    const output = [
      '1. SQL Injection in login - Severity: critical',
      '  Description: The login endpoint is vulnerable to SQL injection',
      '  Location: /api/login',
      "  Evidence: ' OR 1=1 -- returned all users",
      '  Remediation: Use parameterized queries',
    ].join('\n');

    const findings = parseFindingsFromOutput(output);
    expect(findings).toHaveLength(1);
    expect(findings[0].title).toBe('SQL Injection in login');
    expect(findings[0].severity).toBe('critical');
    expect(findings[0].location).toBe('/api/login');
    expect(findings[0].evidence).toBe("' OR 1=1 -- returned all users");
    expect(findings[0].remediation).toBe('Use parameterized queries');
  });

  it('parses severity from a dedicated Severity line', () => {
    const output = [
      '1. XSS in search',
      '  Severity: high',
      '  Description: Reflected XSS in search parameter',
      '  Location: /search',
      "  Evidence: <script>alert(1)</script> returned",
    ].join('\n');

    const findings = parseFindingsFromOutput(output);
    expect(findings).toHaveLength(1);
    expect(findings[0].title).toBe('XSS in search');
    expect(findings[0].severity).toBe('high');
  });

  it('defaults severity to medium when not specified', () => {
    const output = [
      '1. Missing security headers',
      '  Description: Security headers are not set',
    ].join('\n');

    const findings = parseFindingsFromOutput(output);
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe('medium');
  });

  it('parses multiple findings from numbered blocks', () => {
    const output = [
      '1. Finding one - Severity: high',
      '  Description: First finding',
      '  Location: /one',
      '  Evidence: proof1',
      '  Remediation: fix1',
      '',
      '2. Finding two - Severity: low',
      '  Description: Second finding',
      '  Location: /two',
      '  Evidence: proof2',
      '  Remediation: fix2',
    ].join('\n');

    const findings = parseFindingsFromOutput(output);
    expect(findings).toHaveLength(2);
    expect(findings[0].title).toBe('Finding one');
    expect(findings[0].severity).toBe('high');
    expect(findings[1].title).toBe('Finding two');
    expect(findings[1].severity).toBe('low');
  });

  it('skips findings whose title contains "complete"', () => {
    const output = [
      '1. Scan complete - Severity: info',
      '  Description: The scan has completed',
    ].join('\n');
    expect(parseFindingsFromOutput(output)).toHaveLength(0);
  });

  it('skips findings whose title contains "finished"', () => {
    const output = [
      '1. Scan finished - Severity: info',
      '  Description: All tests done',
    ].join('\n');
    expect(parseFindingsFromOutput(output)).toHaveLength(0);
  });

  it('parses a category field', () => {
    const output = [
      '1. Open redirect - Severity: medium',
      '  Category: ssrf',
      '  Description: Server follows untrusted redirects',
      '  Location: /redirect',
      '  Evidence: 302 to evil.com',
    ].join('\n');

    const findings = parseFindingsFromOutput(output);
    expect(findings).toHaveLength(1);
    expect(findings[0].category).toBe('ssrf');
  });

  it('handles multiline descriptions', () => {
    const output = [
      '1. JWT weak secret - Severity: high',
      '  Description: The JWT token uses a weak signing secret',
      '  that can be brute forced with common wordlists',
      '  Location: /api/auth/token',
    ].join('\n');

    const findings = parseFindingsFromOutput(output);
    expect(findings).toHaveLength(1);
    expect(findings[0].description).toContain('weak signing secret');
    expect(findings[0].description).toContain('brute forced');
  });

  it('assigns sequential finding-{n} IDs in order', () => {
    const output = [
      '1. First - Severity: low',
      '  Description: First',
      '',
      '2. Second - Severity: high',
      '  Description: Second',
    ].join('\n');

    const findings = parseFindingsFromOutput(output);
    expect(findings[0].id).toBe('finding-1');
    expect(findings[1].id).toBe('finding-2');
  });

  it('sets default agent to "recon"', () => {
    const output = [
      '1. Test finding',
      '  Description: A test finding',
    ].join('\n');

    const findings = parseFindingsFromOutput(output);
    expect(findings[0].agent).toBe('recon');
  });

  it('returns empty array for empty output', () => {
    expect(parseFindingsFromOutput('')).toHaveLength(0);
  });

  it('returns empty array when all titles are skip-words', () => {
    const output = [
      '1. Assessment complete',
      '  Description: Done',
    ].join('\n');
    expect(parseFindingsFromOutput(output)).toHaveLength(0);
  });
});
