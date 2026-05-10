// ── Project Sentinel Tools Entry Point ──
// Main entry point for security tools integration

export {
  WebSecurityTester,
  VulnerabilityScanner,
  SecurityPolicyEnforcer,
  ContentSecurityAnalyzer,
  AuthenticationTester
} from '../security/web/index.js';

// Export all web security exports
export type {
  WebSecurityTestOptions,
  WebSecurityTestResult,
  SecurityVulnerability,
  PolicyViolation,
  VulnerabilityScanOptions,
  VulnerabilityScanResult,
  WebVulnerability,
  SecurityPolicy,
  SecurityPolicyRule,
  SecurityPolicyOptions,
  ContentSecurityAnalysisOptions,
  ContentSecurityAnalysisResult,
  SensitiveContent

,  MaliciousContent,
  PatternMatch,
  AuthenticationTestOptions,
  AuthenticationTestResult,
  AuthenticationCredentials,
  AuthenticationVulnerability
} from '../security/web/index.js';