import type { Finding, OWASPCategory } from '../core/types';

const OWASP_MAP: Record<string, OWASPCategory> = {
  'sql-injection': 'A03:2021-injection',
  'sqli': 'A03:2021-injection',
  'xss': 'A03:2021-injection',
  'injection': 'A03:2021-injection',
  'command-injection': 'A03:2021-injection',
  'ldap-injection': 'A03:2021-injection',
  'xpath-injection': 'A03:2021-injection',
  'idor': 'A01:2021-broken-access-control',
  'broken-access-control': 'A01:2021-broken-access-control',
  'privilege-escalation': 'A01:2021-broken-access-control',
  'cors': 'A01:2021-broken-access-control',
  'missing-auth': 'A01:2021-broken-access-control',
  'csrf': 'A07:2021-auth-failures',
  'auth-bypass': 'A07:2021-auth-failures',
  'session-fixation': 'A07:2021-auth-failures',
  'jwt': 'A07:2021-auth-failures',
  'oauth': 'A07:2021-auth-failures',
  'credential-stuffing': 'A07:2021-auth-failures',
  'brute-force': 'A07:2021-auth-failures',
  'weak-password': 'A07:2021-auth-failures',
  'data-exposure': 'A02:2021-cryptographic-failures',
  'sensitive-data': 'A02:2021-cryptographic-failures',
  'encryption': 'A02:2021-cryptographic-failures',
  'tls': 'A02:2021-cryptographic-failures',
  'ssl': 'A02:2021-cryptographic-failures',
  'secrets-exposure': 'A02:2021-cryptographic-failures',
  'hardcoded-secret': 'A02:2021-cryptographic-failures',
  'api-key': 'A02:2021-cryptographic-failures',
  'security-misconfiguration': 'A05:2021-security-misconfiguration',
  'misconfiguration': 'A05:2021-security-misconfiguration',
  'missing-header': 'A05:2021-security-misconfiguration',
  'hsts': 'A05:2021-security-misconfiguration',
  'directory-listing': 'A05:2021-security-misconfiguration',
  'default-credentials': 'A05:2021-security-misconfiguration',
  'ssrf': 'A10:2021-ssrf',
  'server-side-request': 'A10:2021-ssrf',
  'insecure-design': 'A04:2021-insecure-design',
  'business-logic': 'A04:2021-insecure-design',
  'rate-limit': 'A04:2021-insecure-design',
  'data-integrity': 'A08:2021-data-integrity',
  'deserialization': 'A08:2021-data-integrity',
  'supply-chain': 'A06:2021-vulnerable-components',
  'dependency': 'A06:2021-vulnerable-components',
  'vulnerable-library': 'A06:2021-vulnerable-components',
  'logging': 'A09:2021-logging-failures',
  'audit-log': 'A09:2021-logging-failures',
};

export function mapToOWASP(finding: Finding): OWASPCategory | undefined {
  if (finding.owaspCategory) return finding.owaspCategory;

  const category = finding.category.toLowerCase();
  const title = finding.title.toLowerCase();
  const description = finding.description.toLowerCase();
  const combined = `${category} ${title} ${description}`;

  for (const [key, owasp] of Object.entries(OWASP_MAP)) {
    if (combined.includes(key)) return owasp;
  }

  return undefined;
}

export function enrichFindingsWithOWASP(findings: Finding[]): Finding[] {
  return findings.map((f) => ({
    ...f,
    owaspCategory: f.owaspCategory || mapToOWASP(f),
  }));
}

export const OWASP_CATEGORIES: Record<OWASPCategory, { name: string; description: string }> = {
  'A01:2021-broken-access-control': {
    name: 'Broken Access Control',
    description: 'Restrictions on what authenticated users can do are not properly enforced',
  },
  'A02:2021-cryptographic-failures': {
    name: 'Cryptographic Failures',
    description: 'Failures related to cryptography which often lead to sensitive data exposure',
  },
  'A03:2021-injection': {
    name: 'Injection',
    description: 'User-supplied data is not properly validated before being interpreted as part of a command or query',
  },
  'A04:2021-insecure-design': {
    name: 'Insecure Design',
    description: 'Missing or ineffective control design for specific threat scenarios',
  },
  'A05:2021-security-misconfiguration': {
    name: 'Security Misconfiguration',
    description: 'Security settings are not defined, implemented, or maintained at an appropriate level',
  },
  'A06:2021-vulnerable-components': {
    name: 'Vulnerable and Outdated Components',
    description: 'Using components with known vulnerabilities',
  },
  'A07:2021-auth-failures': {
    name: 'Identification and Authentication Failures',
    description: 'Confirming the user\'s identity, authentication, and session management are broken',
  },
  'A08:2021-data-integrity': {
    name: 'Software and Data Integrity Failures',
    description: 'Code and infrastructure that do not protect against integrity violations',
  },
  'A09:2021-logging-failures': {
    name: 'Security Logging and Monitoring Failures',
    description: 'Insufficient logging, detection, and monitoring of suspicious activities',
  },
  'A10:2021-ssrf': {
    name: 'Server-Side Request Forgery',
    description: 'Server-side requests to unauthorized resources are not properly validated',
  },
};
