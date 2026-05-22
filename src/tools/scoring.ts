import type { Finding, Severity, TestResult } from '../core/types';
import { enrichFindingsWithConfidence } from './confidence';
import { enrichFindingsWithOWASP } from './owasp-mapper';

export function calculateRiskScore(findings: Finding[]): number {
  if (findings.length === 0) return 0;
  const weights: Record<Severity, number> = { critical: 25, high: 15, medium: 8, low: 3, info: 1 };
  let totalWeight = 0;
  for (const finding of findings) {
    const confidenceMultiplier = (finding.confidence || 50) / 100;
    totalWeight += (weights[finding.severity] || 0) * confidenceMultiplier;
  }
  return Math.min(100, totalWeight);
}

export function riskLevelFromScore(score: number): Severity {
  if (score >= 75) return 'critical';
  if (score >= 50) return 'high';
  if (score >= 25) return 'medium';
  if (score >= 10) return 'low';
  return 'info';
}

export function deduplicateFindings(findings: Finding[]): Finding[] {
  const seen = new Map<string, Finding>();
  for (const finding of findings) {
    const key = `${finding.category}:${finding.location}:${finding.title}`;
    if (!seen.has(key) || finding.severity === 'critical' || finding.severity === 'high') seen.set(key, finding);
  }
  return Array.from(seen.values());
}

export function correlateFindings(findings: Finding[], testResults: TestResult[]): {
  findings: Finding[];
  testResults: TestResult[];
  summary: string;
} {
  const enriched = enrichFindingsWithConfidence(enrichFindingsWithOWASP(findings));
  const uniqueFindings = deduplicateFindings(enriched);
  const score = calculateRiskScore(uniqueFindings);
  const level = riskLevelFromScore(score);
  const confirmed = uniqueFindings.filter((f) => f.confidence >= 75).length;
  const summary = `Security assessment complete. ${uniqueFindings.length} vulnerabilities found (${uniqueFindings.filter((f) => f.severity === 'critical').length} critical, ${uniqueFindings.filter((f) => f.severity === 'high').length} high). ${confirmed} confirmed. Risk level: ${level}. Score: ${score}/100.`;

  return {
    findings: uniqueFindings.sort((a, b) => {
      const order: Severity[] = ['critical', 'high', 'medium', 'low', 'info'];
      return order.indexOf(a.severity) - order.indexOf(b.severity);
    }),
    testResults,
    summary,
  };
}
