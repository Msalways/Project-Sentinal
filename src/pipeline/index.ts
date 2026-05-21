import fs from 'fs';
import path from 'path';
import type { SentinelConfig, ScanTarget, PipelineResult, Finding, TestResult, AgentName } from '../core/types';
import { HARParser } from '../tools/har-parser';
import { ScenarioParser } from '../tools/scenario-parser';
import { PlaywrightTestGenerator } from '../tools/test-generator';
import { correlateFindings, calculateRiskScore, riskLevelFromScore } from '../tools/scoring';
import { toolRegistry } from '../tools/tool-registry';
import { agentRegistry } from '../agents/agent-registry';
import { providerRegistry } from '../providers/provider-registry';
import { createSentinelAgent, parseFindingsFromOutput } from '../agents/deep-agent';
import { Viewport } from '../browser/viewport';

export class Pipeline {
  private config: SentinelConfig;

  constructor(config: SentinelConfig) {
    this.config = config;
  }

  async run(target: ScanTarget): Promise<PipelineResult> {
    const startedAt = new Date().toISOString();
    const findings: Finding[] = [];
    const testResults: TestResult[] = [];
    const agentsUsed: AgentName[] = [];

    let context = '';

    if (target.harPath || target.harContent) {
      const parser = target.harPath
        ? HARParser.fromFile(target.harPath)
        : new HARParser(target.harContent!);

      const graph = parser.buildDependencyGraph();
      const sensitive = parser.getSensitiveData();
      const authEndpoints = parser.getAuthEndpoints();

      context += `HAR Analysis:\n`;
      context += `- ${parser.getUniqueUrls().length} unique URLs discovered\n`;
      context += `- ${graph.nodes.length} endpoints mapped\n`;
      context += `- ${sensitive.length} sensitive data exposures found\n`;
      context += `- ${authEndpoints.filter((a) => !a.hasAuth).length} endpoints without authentication\n`;

      if (sensitive.length > 0) {
        const findingsFromHar = sensitive.map((s, i) => ({
          id: `har-${i + 1}`,
          title: `Sensitive data exposure: ${s.type}`,
          description: `Found ${s.type} data in response from ${s.url}`,
          severity: (s.type === 'jwt' || s.type === 'password' ? 'high' : 'medium') as Finding['severity'],
          category: 'data-exposure',
          location: s.url,
          evidence: s.value,
          remediation: `Remove ${s.type} data from API responses. Use proper data filtering.`,
          agent: 'recon' as AgentName,
          timestamp: new Date().toISOString(),
        }));
        findings.push(...findingsFromHar);
      }
    }

    if (this.config.scopeManifest) {
      try {
        const manifest = ScenarioParser.fromFile(this.config.scopeManifest);
        context += `\nScenario Manifest: ${manifest.workflows.length} workflows defined\n`;
        for (const workflow of manifest.workflows) {
          context += `- Workflow: ${workflow.name} (${workflow.test.happy.length} happy paths, ${workflow.test.sad.length} sad paths)\n`;
        }
      } catch {
        // Not a valid manifest file, skip
      }
    }

    const targetUrl = target.url || 'unknown';
    const task = `Perform a comprehensive security assessment of ${targetUrl}.

${context ? `Context:\n${context}\n` : ''}

Your mission:
1. Use recon-agent to map the attack surface and identify all endpoints
2. Use web-agent to test for browser-based vulnerabilities (XSS, SQLi, CSRF)
3. Use code-agent to scan source code for vulnerability patterns
4. Use network-agent to check infrastructure security (ports, SSL, headers)
5. Use exploit-agent to validate findings with safe proof-of-concepts
6. Generate a final security report with all confirmed vulnerabilities

Report each finding with severity, location, evidence, and remediation.`;

    const model = await providerRegistry.create(this.config.provider, {
      apiKey: this.config.apiKey,
      modelId: this.config.modelId,
      azureEndpoint: this.config.azureEndpoint,
      azureApiVersion: this.config.azureApiVersion,
    });

    const allTools = toolRegistry.getAll() as any[];

    const agent = createSentinelAgent({
      model,
      allTools,
    });

    try {
      const result = await agent.invoke({
        messages: [{ role: 'user', content: task }],
      });

      const output = extractOutput(result);
      const parsedFindings = parseFindingsFromOutput(output);
      findings.push(...parsedFindings);
      agentsUsed.push('recon', 'web', 'code', 'network', 'exploit', 'report');
    } catch (error) {
      console.error('Agent execution failed:', error);
    }

    const correlated = correlateFindings(findings, testResults);
    const riskScore = calculateRiskScore(correlated.findings);
    const riskLevel = riskLevelFromScore(riskScore);

    const completedAt = new Date().toISOString();

    return {
      success: true,
      duration: new Date(completedAt).getTime() - new Date(startedAt).getTime(),
      findings: correlated.findings,
      testResults: correlated.testResults,
      riskScore,
      riskLevel,
      summary: correlated.summary,
      metadata: {
        target,
        startedAt,
        completedAt,
        agentsUsed,
        modelUsed: this.config.modelId,
      },
    };
  }

  async learn(target: string, outputDir: string): Promise<{ harPath: string; testsDir: string; manifestPath: string }> {
    const viewport = new Viewport({ headless: false });
    await viewport.launch();

    console.log(`\n🎯 Learning mode activated for ${target}`);
    console.log('Browser opened. Navigate through your application workflows.');
    console.log('Close the browser when done recording.\n');

    await viewport.navigate(target);

    return new Promise((resolve, reject) => {
      const checkInterval = setInterval(async () => {
        const entries = viewport.getNetworkLog();
        if (entries.length > 5) {
          clearInterval(checkInterval);

          const harContent = JSON.stringify({
            log: {
              version: '1.2',
              creator: { name: 'Project Sentinel', version: '2.0.0' },
              entries: entries.map((e) => ({
                startedDateTime: new Date().toISOString(),
                time: 0,
                request: { method: e.method, url: e.url, httpVersion: 'HTTP/1.1', headers: [], queryString: [] },
                response: { status: e.status, statusText: '', httpVersion: 'HTTP/1.1', headers: [], content: { mimeType: '', text: '', size: 0 } },
                cache: {},
                timings: {},
              })),
            },
          });

          fs.mkdirSync(outputDir, { recursive: true });

          const harPath = path.join(outputDir, 'session.har');
          fs.writeFileSync(harPath, harContent);

          const manifest = ScenarioParser.fromHar(harPath, target);
          const manifestPath = path.join(outputDir, 'sentinel.yaml');
          fs.writeFileSync(manifestPath, this.manifestToYaml(manifest));

          const generator = new PlaywrightTestGenerator(target);
          const testsDir = path.join(outputDir, 'tests');
          generator.generateFromManifest(manifest, testsDir);

          await viewport.close();

          resolve({ harPath, testsDir, manifestPath });
        }
      }, 3000);

      setTimeout(() => {
        clearInterval(checkInterval);
        viewport.close().then(() => {
          reject(new Error('Learning session timed out after 5 minutes'));
        });
      }, 300000);
    });
  }

  async demo(): Promise<PipelineResult> {
    const startedAt = new Date().toISOString();

    const demoFindings: Finding[] = [
      {
        id: 'demo-1',
        title: 'SQL injection in login form',
        description: 'Authentication bypass via SQL injection in the username field. The login endpoint concatenates user input directly into SQL queries.',
        severity: 'critical',
        category: 'injection',
        location: 'https://shop.example.com/api/login',
        evidence: "' OR 1=1-- bypassed authentication and returned admin session",
        remediation: 'Use parameterized queries or prepared statements. Implement input validation and WAF rules.',
        agent: 'web',
        timestamp: new Date().toISOString(),
      },
      {
        id: 'demo-2',
        title: 'IDOR in user profile API',
        description: 'Cross-user data access via ID manipulation. Any authenticated user can access other users\' data by changing the user ID parameter.',
        severity: 'high',
        category: 'broken-access-control',
        location: 'https://shop.example.com/api/users/{id}',
        evidence: 'GET /api/users/9999 returned Jane Smith\'s email and phone using customer token for user 1234567890',
        remediation: 'Add authorization middleware to verify resource ownership. Implement row-level security.',
        agent: 'web',
        timestamp: new Date().toISOString(),
      },
      {
        id: 'demo-3',
        title: 'Reflected XSS in search parameter',
        description: 'Unsanitized search parameter enables script injection. User input is reflected in the response without encoding.',
        severity: 'high',
        category: 'xss',
        location: 'https://shop.example.com/api/products?search=',
        evidence: '<script>alert(1)</script> was not escaped in search results page',
        remediation: 'Implement output encoding, Content-Security-Policy headers, and input validation.',
        agent: 'web',
        timestamp: new Date().toISOString(),
      },
      {
        id: 'demo-4',
        title: 'Hardcoded API key in source code',
        description: 'Production API key committed to source repository. The key provides full access to external services.',
        severity: 'high',
        category: 'secrets-exposure',
        location: 'src/config.js:15',
        evidence: 'const API_KEY = "sk-live-abc123def456"',
        remediation: 'Rotate the exposed key immediately. Use environment variables or a secrets manager.',
        agent: 'code',
        timestamp: new Date().toISOString(),
      },
      {
        id: 'demo-5',
        title: 'Missing CSRF protection',
        description: 'State-changing endpoints lack CSRF token validation, allowing cross-site request forgery attacks.',
        severity: 'medium',
        category: 'csrf',
        location: 'https://shop.example.com/api/profile',
        evidence: 'POST /api/profile accepted request without CSRF token',
        remediation: 'Add CSRF token validation to all state-changing endpoints. Use SameSite cookie attribute.',
        agent: 'web',
        timestamp: new Date().toISOString(),
      },
      {
        id: 'demo-6',
        title: 'Missing HSTS header',
        description: 'No Strict-Transport-Security header, leaving the application vulnerable to protocol downgrade attacks.',
        severity: 'medium',
        category: 'security-misconfiguration',
        location: 'https://shop.example.com',
        evidence: 'Response headers do not include Strict-Transport-Security',
        remediation: 'Add Strict-Transport-Security: max-age=31536000; includeSubDomains header to all responses.',
        agent: 'network',
        timestamp: new Date().toISOString(),
      },
    ];

    const correlated = correlateFindings(demoFindings, []);
    const riskScore = calculateRiskScore(correlated.findings);

    return {
      success: true,
      duration: 0,
      findings: correlated.findings,
      testResults: [],
      riskScore,
      riskLevel: riskLevelFromScore(riskScore),
      summary: correlated.summary,
      metadata: {
        target: { url: 'https://shop.example.com' },
        startedAt,
        completedAt: new Date().toISOString(),
        agentsUsed: ['recon', 'web', 'code', 'network', 'exploit', 'report'],
        modelUsed: 'mock',
      },
    };
  }

  private manifestToYaml(manifest: ReturnType<typeof ScenarioParser.fromHar>): string {
    let yaml = `target: ${manifest.target}\n\n`;
    yaml += 'roles:\n';
    for (const role of manifest.roles) {
      yaml += `  - name: ${role.name}\n`;
      if (role.har) yaml += `    har: ${role.har}\n`;
    }
    yaml += '\nworkflows:\n';
    for (const workflow of manifest.workflows) {
      yaml += `  - name: "${workflow.name}"\n`;
      if (workflow.har) yaml += `    har: ${workflow.har}\n`;
      yaml += '    test:\n      happy:\n';
      for (const step of workflow.test.happy) yaml += `        - "${step}"\n`;
      if (workflow.test.sad.length > 0) {
        yaml += '      sad:\n';
        for (const step of workflow.test.sad) yaml += `        - "${step}"\n`;
      }
    }
    return yaml;
  }
}

function extractOutput(result: Record<string, unknown>): string {
  if (typeof result.output === 'string') return result.output;
  const messages = result.messages as Array<{ role: string; content: string }> | undefined;
  if (messages && messages.length > 0) {
    const lastMessage = messages[messages.length - 1];
    if (lastMessage.role === 'assistant') return lastMessage.content;
  }
  return JSON.stringify(result, null, 2);
}
