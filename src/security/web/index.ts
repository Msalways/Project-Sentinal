// ── Project Sentinel Web Security Testing Framework ──
// Main entry point for web application security testing

import { WebSecurityTester } from './web-security-tester.js';
import { VulnerabilityScanner } from './vulnerability-scanner.js';
import { SecurityPolicyEnforcer } from './security-policy-enforcer.js';
import { ContentSecurityAnalyzer } from './content-security-analyzer.js';
import { AuthenticationTester } from './authentication-tester.js';

export {
  WebSecurityTester,
  VulnerabilityScanner,
  SecurityPolicyEnforcer,
  ContentSecurityAnalyzer,
  AuthenticationTester,
};

// Export types
export type {
  WebSecurityTestOptions,
  WebSecurityTestResult,
  SecurityVulnerability,
  PolicyViolation,
} from './web-security-tester.js';

export type {
  VulnerabilityScanOptions,
  VulnerabilityScanResult,
  WebVulnerability,
} from './vulnerability-scanner.js';

export type {
  SecurityPolicy,
  SecurityPolicyRule,
  SecurityPolicyOptions,
} from './security-policy-enforcer.js';

export type {
  ContentSecurityAnalysisOptions,
  ContentSecurityAnalysisResult,
  SensitiveContent,
  MaliciousContent,
  PatternMatch,
} from './content-security-analyzer.js';

export type {
  AuthenticationTestOptions,
  AuthenticationTestResult,
  AuthenticationCredentials,
  AuthenticationVulnerability,
} from './authentication-tester.js';