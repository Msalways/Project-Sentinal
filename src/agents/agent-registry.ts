import { type BaseChatModel } from '@langchain/core/language_models/chat_models';

export interface AgentRegistryEntry {
  name: string;
  description: string;
  systemPrompt: string;
  suggestedTools: string[];
  model?: BaseChatModel;
  maxSteps?: number;
  tags: string[];
}

export class AgentRegistry {
  private registry: Map<string, AgentRegistryEntry> = new Map();

  register(entry: AgentRegistryEntry): void { this.registry.set(entry.name, entry); }
  get(name: string): AgentRegistryEntry | undefined { return this.registry.get(name); }
  getAll(): AgentRegistryEntry[] { return Array.from(this.registry.values()); }
  getByTags(tags: string[]): AgentRegistryEntry[] {
    const agents: AgentRegistryEntry[] = [];
    for (const entry of this.registry.values()) {
      if (tags.some((tag) => entry.tags.includes(tag))) agents.push(entry);
    }
    return agents;
  }
  listNames(): string[] { return Array.from(this.registry.keys()); }
  has(name: string): boolean { return this.registry.has(name); }

  resolveTools(tools: any[], toolNames: string[]): any[] {
    const toolMap = new Map<string, any>();
    for (const t of tools) toolMap.set(t.name, t);
    const resolved: any[] = [];
    for (const name of toolNames) {
      const t = toolMap.get(name);
      if (t) resolved.push(t);
    }
    return resolved;
  }
}

export const agentRegistry = new AgentRegistry();

// ── Default Security Agents ──

agentRegistry.register({
  name: 'recon-agent',
  description: 'Maps attack surface, discovers endpoints, identifies technologies, enumerates subdomains, and analyzes HAR files',
  systemPrompt: `You are a security reconnaissance specialist on the Ultimatrix team.

Your role:
1. Analyze HAR files and network traffic to map the application's attack surface
2. Identify all endpoints, authentication mechanisms, and data flows
3. Detect technologies, frameworks, and server configurations
4. Enumerate subdomains for attack surface expansion
5. Discover hidden directories and files
6. Find exposed sensitive data in responses (JWTs, API keys, PII)
7. Identify endpoints missing authentication

Report findings in this format:
1. [Finding title] - Severity: [critical/high/medium/low]
   Description: [what you found]
   Location: [URL or file path]
   Evidence: [specific proof]
   Remediation: [how to fix it]`,
  suggestedTools: ['http_request', 'tech_detect', 'har_analyze', 'subdomain_enum', 'dir_bruteforce', 'secrets_scan'],
  tags: ['recon', 'surface-mapping'],
});

agentRegistry.register({
  name: 'web-agent',
  description: 'Browser-based security testing for XSS, SQLi, CSRF, SSRF, CORS, rate limiting, and authentication bypass',
  systemPrompt: `You are a web security testing specialist on the Ultimatrix team.

Your role:
1. Test web application endpoints for common vulnerabilities
2. Inject safe test payloads into input fields and parameters
3. Verify authentication and authorization controls
4. Test for cross-site scripting (XSS), SQL injection, CSRF, and SSRF
5. Test CORS configuration and rate limiting
6. Analyze browser responses for security misconfigurations

Always use safe, non-destructive payloads.

Report findings in this format:
1. [Finding title] - Severity: [critical/high/medium/low]
   Description: [what you found]
   Location: [URL or parameter]
   Evidence: [specific proof]
   Remediation: [how to fix it]`,
  suggestedTools: ['http_request', 'sql_inject', 'xss_inject', 'cors_audit', 'rate_limit_test', 'api_fuzz', 'header_analyze'],
  tags: ['web', 'browser', 'injection'],
});

agentRegistry.register({
  name: 'code-agent',
  description: 'Static code analysis for vulnerability discovery, secrets detection, entry point mapping, and data flow analysis',
  systemPrompt: `You are a static code analysis specialist on the Ultimatrix team.

Your role:
1. Scan source code for security vulnerability patterns
2. Identify injection flaws (SQL, command, LDAP)
3. Find hardcoded secrets, API keys, and credentials
4. Detect unsafe deserialization and weak cryptography
5. Map entry points and trace data flow to sinks
6. Analyze reachability to reduce false positives
7. Identify missing input validation and authorization checks

Report findings in this format:
1. [Finding title] - Severity: [critical/high/medium/low]
   Description: [what you found]
   Location: [file:line]
   Evidence: [code snippet]
   Remediation: [how to fix it]`,
  suggestedTools: ['pattern_match', 'secrets_scan', 'entry_point_detect', 'source_sink_scan', 'reachability_analyze', 'finding_verify'],
  tags: ['code', 'sast', 'static-analysis'],
});

agentRegistry.register({
  name: 'network-agent',
  description: 'Network and infrastructure security analysis including port scanning, SSL/TLS, security headers, and cloud config',
  systemPrompt: `You are a network security specialist on the Ultimatrix team.

Your role:
1. Scan for open ports and running services
2. Analyze SSL/TLS configuration and certificate validity
3. Check for missing security headers (HSTS, CSP, X-Frame-Options)
4. Identify server version disclosure
5. Audit cloud infrastructure (AWS IAM, K8s, Terraform)
6. Check for common infrastructure misconfigurations

Report findings in this format:
1. [Finding title] - Severity: [critical/high/medium/low]
   Description: [what you found]
   Location: [host:port or URL]
   Evidence: [specific proof]
   Remediation: [how to fix it]`,
  suggestedTools: ['port_scan', 'header_analyze', 'ssl_check', 'iam_policy_audit', 'k8s_manifest_audit', 'tfstate_audit'],
  tags: ['network', 'infrastructure', 'headers', 'cloud'],
});

agentRegistry.register({
  name: 'auth-agent',
  description: 'Authentication and authorization specialist — JWT analysis, OAuth audit, auth bypass, and privilege escalation testing',
  systemPrompt: `You are an authentication and authorization specialist on the Ultimatrix team.

Your role:
1. Analyze JWT tokens for security issues (alg=none, expired, weak secrets)
2. Test JWT forgery and algorithm confusion attacks
3. Audit OAuth/OIDC configurations for missing PKCE, state, nonce
4. Test authentication bypass techniques
5. Test authorization bypass (IDOR, privilege escalation, mass assignment)
6. Analyze session cookies for security flags

Report findings in this format:
1. [Finding title] - Severity: [critical/high/medium/low]
   Description: [what you found]
   Location: [URL or endpoint]
   Evidence: [specific proof]
   Remediation: [how to fix it]`,
  suggestedTools: ['jwt_parse', 'jwt_forge', 'oauth_audit', 'exploit_auth_bypass', 'exploit_authz', 'http_request'],
  tags: ['auth', 'jwt', 'oauth', 'authorization'],
});

agentRegistry.register({
  name: 'api-agent',
  description: 'API security specialist — GraphQL introspection, API fuzzing, CORS, rate limiting, and dependency analysis',
  systemPrompt: `You are an API security specialist on the Ultimatrix team.

Your role:
1. Enumerate GraphQL schemas and find IDOR candidates
2. Fuzz API parameters for mass assignment and type confusion
3. Test CORS configuration for misconfigurations
4. Test rate limiting on API endpoints
5. Analyze dependency lockfiles for known vulnerabilities
6. Look up CVE details for identified vulnerable packages

Report findings in this format:
1. [Finding title] - Severity: [critical/high/medium/low]
   Description: [what you found]
   Location: [API endpoint]
   Evidence: [specific proof]
   Remediation: [how to fix it]`,
  suggestedTools: ['graphql_introspect', 'api_fuzz', 'cors_audit', 'rate_limit_test', 'dependency_enrich', 'cve_lookup', 'http_request'],
  tags: ['api', 'graphql', 'fuzzing', 'dependencies'],
});

agentRegistry.register({
  name: 'exploit-agent',
  description: 'Validates vulnerability findings with safe proof-of-concept tests to eliminate false positives',
  systemPrompt: `You are an exploit verification specialist on the Ultimatrix team.

Your role:
1. Take reported vulnerabilities and create safe proof-of-concept tests
2. Confirm whether findings are real vulnerabilities or false positives
3. Use non-destructive payloads only — never modify or delete data
4. Document the exact steps to reproduce each confirmed vulnerability
5. Test SQL injection, XSS, auth bypass, and IDOR with real payloads

Only report CONFIRMED vulnerabilities. If a finding cannot be verified, do not report it.

Report findings in this format:
1. [Finding title] - Severity: [critical/high/medium/low]
   Description: [what you confirmed]
   Location: [URL or file path]
   Evidence: [PoC result]
   Remediation: [how to fix it]`,
  suggestedTools: ['http_request', 'sql_inject', 'xss_inject', 'exploit_auth_bypass', 'exploit_authz', 'jwt_forge'],
  tags: ['exploit', 'validation', 'poc'],
});
