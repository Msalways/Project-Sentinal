import fs from 'fs';
import path from 'path';
import type { SentinelConfig, ScanTarget, PipelineResult, Finding, TestResult, AgentName } from '../core/types';
import { ScanEventEmitter } from '../core/types';
import { HARParser } from '../tools/har-parser';
import { ScenarioParser } from '../tools/scenario-parser';
import { correlateFindings, calculateRiskScore, riskLevelFromScore } from '../tools/scoring';
import { toolRegistry } from '../tools/tool-registry';
import { agentRegistry } from '../agents/agent-registry';
import { providerRegistry } from '../providers/provider-registry';
import { createSentinelAgent, parseFindingsFromOutput } from '../agents/deep-agent';
import { Viewport } from '../browser/viewport';
import { buildTargetContext, getContextSummary, type TargetContext } from '../core/context';
import { LLMAnalyzer } from '../tools/llm-analyzer';
import { enrichFindingsWithOWASP } from '../tools/owasp-mapper';
import { enrichFindingsWithConfidence } from '../tools/confidence';

export class Pipeline {
  private config: SentinelConfig;
  public events: ScanEventEmitter;

  constructor(config: SentinelConfig) {
    this.config = config;
    this.events = new ScanEventEmitter();
  }

  async run(target: ScanTarget): Promise<PipelineResult> {
    const startedAt = new Date().toISOString();
    const findings: Finding[] = [];
    const testResults: TestResult[] = [];
    const agentsUsed: AgentName[] = [];

    this.events.pipelineStatus('Initializing scan...', 0);

    let harData: any = null;
    let targetContext: TargetContext = { url: target.url || '', detectedTech: [], authFlows: [], endpoints: [], sensitiveData: [] };

    if (target.harPath || target.harContent) {
      this.events.pipelineStatus('Parsing HAR data...', 10);
      const parser = target.harPath
        ? HARParser.fromFile(target.harPath)
        : new HARParser(target.harContent!);

      const urls = parser.getUniqueUrls();
      const endpoints = parser.getEndpoints();
      const sensitive = parser.getSensitiveData();
      const authEndpoints = parser.getAuthEndpoints();
      const graph = parser.buildDependencyGraph();

      if (target.harPath) {
        harData = JSON.parse(fs.readFileSync(target.harPath, 'utf-8'));
      }

      targetContext = buildTargetContext(harData, target.url);
      targetContext.sensitiveData = sensitive;

      const sensitiveFindings = sensitive.map((s, i) => ({
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
        confidence: 70,
      }));
      findings.push(...sensitiveFindings);

      for (const f of sensitiveFindings) {
        this.events.newFinding(f);
      }

      this.events.pipelineStatus('HAR analysis complete', 20);
    }

    if (this.config.scopeManifest) {
      try {
        const manifest = ScenarioParser.fromFile(this.config.scopeManifest);
        for (const workflow of manifest.workflows) {
          // Manifest workflows are handled by LLM context
        }
      } catch {
        // Not a valid manifest file, skip
      }
    }

    const targetUrl = target.url || 'unknown';
    const contextSummary = getContextSummary(targetContext);

    this.events.pipelineStatus('Loading AI model...', 25);

    const model = await providerRegistry.create(this.config.provider, {
      apiKey: this.config.apiKey,
      modelId: this.config.modelId,
      azureEndpoint: this.config.azureEndpoint,
      azureApiVersion: this.config.azureApiVersion,
    });

    const allTools = toolRegistry.getAll() as any[];
    const allAgents = agentRegistry.getAll();

    this.events.pipelineStatus('Initializing security agents...', 30);

    const agent = createSentinelAgent({
      model,
      allTools,
      allAgents,
      targetContext: contextSummary,
    });

    const task = `Perform a comprehensive security assessment of ${targetUrl}.

Target Context:
${contextSummary}

You are the security team lead. Plan and execute the assessment autonomously:

1. Analyze the target context to understand the application architecture
2. Decide which specialized agents to spawn based on the tech stack and attack surface
3. Delegate specific tasks to each agent based on their expertise and the detected technologies
4. Review all findings, correlate them, and eliminate false positives
5. Generate a final security report with confirmed vulnerabilities and risk assessment

Available agents:
${allAgents.map((a) => `- ${a.name}: ${a.description}`).join('\n')}

Available tools:
${allTools.map((t) => `- ${t.name}: ${t.description}`).join('\n')}

Guidelines:
- For ${targetContext.framework || 'web'} apps: prioritize web-agent, auth-agent, api-agent
- For ${targetContext.apiType || 'API'} endpoints: use api-agent, auth-agent
- If code access available: use code-agent
- For infrastructure: use network-agent
- Always validate findings with exploit-agent before reporting
- Only report CONFIRMED vulnerabilities

Report each finding with severity, location, evidence, and remediation.`;

    this.events.pipelineStatus('Running security assessment...', 35);

    for (const a of allAgents) {
      this.events.agentStart(a.name, { description: a.description });
    }

    try {
      const result = await agent.invoke({
        messages: [{ role: 'user', content: task }],
      });

      const output = extractOutput(result);
      const parsedFindings = parseFindingsFromOutput(output);

      for (const f of parsedFindings) {
        this.events.newFinding(f);
      }

      findings.push(...parsedFindings);
      agentsUsed.push('recon', 'web', 'code', 'network', 'exploit', 'report');

      for (const a of allAgents) {
        this.events.agentComplete(a.name);
      }

      this.events.pipelineStatus('Agent assessment complete', 70);
    } catch (error) {
      console.error('Agent execution failed:', error);
      this.events.pipelineStatus('Agent execution failed', 70);
    }

    this.events.pipelineStatus('Correlating findings...', 75);

    let correlatedFindings = findings;
    let riskScore = 0;
    let riskLevel: Finding['severity'] = 'info';
    let summary = '';

    const isMock = this.config.provider === 'mock';

    if (!isMock && findings.length > 0) {
      try {
        const analyzer = new LLMAnalyzer(model);
        correlatedFindings = await analyzer.correlateFindings(findings, targetContext);
        const riskAssessment = await analyzer.assessRisk(correlatedFindings, targetContext);
        riskScore = riskAssessment.score;
        riskLevel = riskAssessment.level;
        summary = riskAssessment.summary;
      } catch (err) {
        console.log('LLM analysis failed, using default scoring');
        const correlated = correlateFindings(findings, testResults);
        correlatedFindings = correlated.findings;
        riskScore = calculateRiskScore(correlatedFindings);
        riskLevel = riskLevelFromScore(riskScore);
        summary = correlated.summary;
      }
    } else {
      const correlated = correlateFindings(findings, testResults);
      correlatedFindings = correlated.findings;
      riskScore = calculateRiskScore(correlatedFindings);
      riskLevel = riskLevelFromScore(riskScore);
      summary = correlated.summary;
    }

    correlatedFindings = enrichFindingsWithConfidence(enrichFindingsWithOWASP(correlatedFindings));

    this.events.pipelineStatus('Generating report...', 90);

    const completedAt = new Date().toISOString();

    this.events.pipelineStatus('Scan complete', 100);

    return {
      success: true,
      duration: new Date(completedAt).getTime() - new Date(startedAt).getTime(),
      findings: correlatedFindings,
      testResults,
      riskScore,
      riskLevel,
      summary,
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

          const harData = JSON.parse(harContent);
          const targetContext = buildTargetContext(harData, target);

          const manifestPath = path.join(outputDir, 'sentinel.yaml');
          const manifestContent = this.manifestToContextYaml(targetContext, target);
          fs.writeFileSync(manifestPath, manifestContent);

          const testsDir = path.join(outputDir, 'tests');
          const isMock = this.config.provider === 'mock';

          if (isMock) {
            const { PlaywrightTestGenerator } = await import('../tools/test-generator');
            const generator = new PlaywrightTestGenerator(target);
            const manifest = ScenarioParser.fromHar(harPath, target);
            generator.generateFromManifest(manifest, testsDir);
          } else {
            try {
              const model = await providerRegistry.create(this.config.provider, {
                apiKey: this.config.apiKey,
                modelId: this.config.modelId,
                azureEndpoint: this.config.azureEndpoint,
                azureApiVersion: this.config.azureApiVersion,
              });
              const analyzer = new LLMAnalyzer(model);
              const workflows = await analyzer.extractWorkflows(harData, target);

              const { LLMTestGenerator } = await import('../tools/llm-test-generator');
              const generator = new LLMTestGenerator(model, target);
              const result = await generator.generateFromHar(harPath, testsDir);

              if (result.newFiles.length > 0) console.log(`New tests: ${result.newFiles.length}`);
              if (result.updatedFiles.length > 0) console.log(`Updated tests: ${result.updatedFiles.length}`);
              if (result.staleFiles.length > 0) console.log(`Stale tests: ${result.staleFiles.length}`);
              if (result.preservedFiles.length > 0) console.log(`Preserved tests: ${result.preservedFiles.length}`);
            } catch (err) {
              console.log('LLM test generation failed, falling back to static generator');
              const { PlaywrightTestGenerator } = await import('../tools/test-generator');
              const generator = new PlaywrightTestGenerator(target);
              const manifest = ScenarioParser.fromHar(harPath, target);
              generator.generateFromManifest(manifest, testsDir);
            }
          }

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
        confidence: 85,
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
        confidence: 80,
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
        confidence: 75,
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
        confidence: 95,
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
        confidence: 70,
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
        confidence: 90,
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

  private manifestToContextYaml(context: TargetContext, target: string): string {
    let yaml = `target: ${target}\n\n`;
    yaml += `tech_stack:\n`;
    for (const tech of context.detectedTech) yaml += `  - ${tech}\n`;
    yaml += `\nauth_flows:\n`;
    for (const flow of context.authFlows) yaml += `  - type: ${flow.type}\n    endpoint: ${flow.endpoint}\n`;
    yaml += `\nworkflows:\n`;
    yaml += `  - name: "Auto-detected from HAR"\n`;
    yaml += `    test:\n      happy:\n        - "Navigate through application"\n      sad:\n        - "Test authentication bypass"\n        - "Test injection vectors"\n`;
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
