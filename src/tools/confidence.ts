import type { Finding } from '../core/types';

export function calculateConfidence(finding: Finding): number {
  let score = 50;

  if (finding.evidence && finding.evidence.length > 10) score += 10;
  if (finding.evidence && finding.evidence.length > 50) score += 10;
  if (finding.evidence && finding.evidence.includes('confirmed')) score += 15;
  if (finding.evidence && finding.evidence.includes('verified')) score += 15;

  if (finding.cweId) score += 5;
  if (finding.cvssScore && finding.cvssScore > 0) score += 5;

  if (finding.remediation && finding.remediation.length > 20) score += 5;

  const strongEvidence = [
    'bypassed', 'returned', 'executed', 'injected', 'accessed',
    'exploited', 'confirmed', 'verified', 'reproduced',
  ];
  const weakEvidence = [
    'possible', 'might', 'could', 'suspected', 'potential',
    'appears', 'seems', 'may be', 'likely',
  ];

  const combined = `${finding.evidence} ${finding.description}`.toLowerCase();
  for (const word of strongEvidence) {
    if (combined.includes(word)) score += 5;
  }
  for (const word of weakEvidence) {
    if (combined.includes(word)) score -= 5;
  }

  return Math.max(0, Math.min(100, score));
}

export function confidenceLabel(score: number): string {
  if (score >= 90) return 'Confirmed';
  if (score >= 75) return 'High';
  if (score >= 50) return 'Medium';
  if (score >= 25) return 'Low';
  return 'Speculative';
}

export function enrichFindingsWithConfidence(findings: Finding[]): Finding[] {
  return findings.map((f) => ({
    ...f,
    confidence: f.confidence || calculateConfidence(f),
  }));
}
