import type { Finding } from '../core/types';

export interface SarifOptions {
  toolName?: string;
  artifactUri?: string;
}

function severityToLevel(severity: string): 'error' | 'warning' | 'note' {
  switch (severity) {
    case 'critical':
    case 'high':
      return 'error';
    case 'medium':
      return 'warning';
    case 'low':
    case 'info':
    default:
      return 'note';
  }
}

export function findingsToSarif(findings: Finding[], options: SarifOptions = {}): string {
  const { toolName = 'Ultimatrix', artifactUri = '' } = options;

  const sarif = {
    $schema: 'https://raw.githubusercontent.com/oasis-tcs/openc2-schema/main/sarif/sarif-2-1.json',
    version: '2.1.0',
    runs: [
      {
        tool: {
          driver: {
            name: toolName,
            version: '2.0.0',
            informationUri: 'https://github.com/anomalyco/ultimatrix',
          },
        },
        results: findings.map((finding) => ({
          ruleId: finding.id,
          level: severityToLevel(finding.severity),
          message: {
            text: finding.title,
          },
          locations: [
            {
              physicalLocation: {
                artifactLocation: {
                  uri: finding.location || artifactUri,
                },
                description: {
                  text: finding.description,
                },
              },
            },
          ],
          properties: {
            severity: finding.severity,
            cwe: finding.cweId || '',
            cvss: finding.cvssScore ?? 0,
            confidence: finding.confidence,
            category: finding.category,
            evidence: finding.evidence,
            remediation: finding.remediation,
            agent: finding.agent,
            timestamp: finding.timestamp,
          },
        })),
        invocations: [
          {
            executionSuccessful: true,
          },
        ],
      },
    ],
  };

  return JSON.stringify(sarif, null, 2);
}
