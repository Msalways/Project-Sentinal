import { createDeepAgent } from 'deepagents';
import { type BaseChatModel } from '@langchain/core/language_models/chat_models';
import { Logger, colors } from '../cli/logger';
import { toolRegistry } from '../tools/tool-registry';
import { fixWriteTodosMiddleware } from '../core/fix-todos';
import { readAppModel, compileReport, calculateOverallRisk, formatAppModelContext } from '../core/app-model';
import type { Finding, ScanTarget, ScanEventEmitter } from '../core/types';
import { getSharedBrowserManager } from '../tools/browser-tools';
import type { DashboardServer } from '../dashboard/server';
import type { DashboardEvent } from '../dashboard/server';
import { ensureOastRunning, stopOast } from '../oast';
import { setAppModelPath } from '../core/app-model-path';

const log = new Logger();
const DEFAULT_MAX_TOOL_CALLS = 50;

import { THREAT_MODEL_PROMPT } from '../prompts/threat-model';
export { THREAT_MODEL_PROMPT };

export class AutonomousOrchestrator {
  private model: BaseChatModel;
  private target: ScanTarget;
  private events?: ScanEventEmitter;
  private outputDir: string;
  private format: string;
  private appModelPath: string;
  private dashboard?: DashboardServer;
  private maxToolCalls: number;
  private keepBrowser: boolean;

  constructor(config: {
    model: BaseChatModel;
    target: ScanTarget;
    events?: ScanEventEmitter;
    outputDir: string;
    format?: string;
    appModelPath: string;
    dashboard?: DashboardServer;
    maxToolCalls?: number;
    keepBrowser?: boolean;
  }) {
    this.model = config.model;
    this.target = config.target;
    this.events = config.events;
    this.outputDir = config.outputDir;
    this.format = config.format || 'markdown';
    this.appModelPath = config.appModelPath;
    setAppModelPath(this.appModelPath);
    this.dashboard = config.dashboard;
    this.maxToolCalls = config.maxToolCalls || DEFAULT_MAX_TOOL_CALLS;
    this.keepBrowser = config.keepBrowser || false;
  }

  private emitDashboardEvent(type: DashboardEvent['type'], data: Record<string, unknown>): void {
    if (!this.dashboard) return;
    try {
      this.dashboard.emit({ type, data, timestamp: new Date().toISOString() });
    } catch { /* best effort */ }
  }

  async run(): Promise<{ findings: Finding[]; reportPath: string }> {
    const fsp = await import('fs');
    const pth = await import('path');

    fsp.mkdirSync(this.outputDir, { recursive: true });

    const targetUrl = typeof this.target === 'string' ? this.target : (this.target as any).url || String(this.target);
    const fmt = this.format === 'html' ? 'html' : this.format === 'json' ? 'json' : 'md';
    const reportPath = pth.join(this.outputDir, `final-security-report.${fmt}`);

    try {
      // ── Start OAST callback server ──
      let oastPort: number | null = null;
      try {
        oastPort = await ensureOastRunning();
        log.info(`OAST server running on port ${oastPort}`);
        this.emitDashboardEvent('status', { message: `OAST server on port ${oastPort}` });
      } catch (e) {
        log.warn(`OAST server failed to start: ${e}`);
      }

      // All tools are registered with normalized tags — getAll() returns everything
      const allTools = toolRegistry.getAll();

      // Auto-start trace on the default session
      try {
        const mgr = getSharedBrowserManager();
        await mgr.startTrace('default');
        log.info('Network trace started on default session');
      } catch { /* best effort */ }

      let prompt = THREAT_MODEL_PROMPT
        .replace('{appModelPath}', this.appModelPath)
        .replace('{outputDir}', this.outputDir)
        .replace('{maxToolCalls}', String(this.maxToolCalls));
      prompt += `\n\nTarget URL: ${targetUrl}`;
      prompt += `\nOutput directory: ${this.outputDir}`;
      prompt += `\nApp model path: ${this.appModelPath}`;
      if (oastPort) {
        prompt += `\n\nOAST callback server is running on port ${oastPort}. Use oast_create_url to get a unique URL for blind payloads.`;
      }

      const modelExists = fsp.existsSync(this.appModelPath);
      if (modelExists) {
        prompt += `\n\nIMPORTANT: An app model already exists at ${this.appModelPath}. Start by reading it with read_app_model(). Do NOT re-discover what's already known — build on what's there.`;

        // Inject formatted crawl context as a concise overview
        try {
          const appModel = readAppModel(this.appModelPath);
          const ctx = formatAppModelContext(appModel);
          prompt += `\n\n## Crawl Results Summary\n${ctx.summary}`;

          if (ctx.isPrivateApp) {
            prompt += `\n\n⚠️  NOTE: ${ctx.privateAppReason}`;
            prompt += `\nOptions:`;
            if (appModel.auth.loginEndpoint) {
              prompt += `\n- A login endpoint was detected at ${appModel.auth.loginEndpoint}. Try navigating there, filling credentials, and authenticating.`;
            }
            prompt += `\n- If you can't access pages due to auth, switch to attack mode: probe the login form, test for auth bypass, or ask the human to record a login session via /record.`;
            prompt += `\n- You can also ingest app specs: the operator can re-run with --with-openapi <file>, --with-har <file>, or --with-postman <file>.`;
          }
        } catch { /* best-effort context injection */ }
      }

      const agent = createDeepAgent({
        model: this.model,
        tools: allTools,
        middleware: [fixWriteTodosMiddleware],
        systemPrompt: prompt,
      });

      log.info('Autonomous assessment starting...');
      if (this.events) this.events.pipelineStatus('Exploring and assessing target autonomously', 0);

      this.emitDashboardEvent('status', { message: 'Agent launched' });
      process.stdout.write(colors.dim('Autonomous agent running...\n'));

      let toolCallCount = 0;
      let stoppedEarly = false;

      try {
        const stream = await agent.stream(
          {
            messages: [{
              role: 'user',
              content: `Begin autonomous security assessment of ${targetUrl}.
1. First, read the app model at ${this.appModelPath} — start by checking if the workflow graph, endpoints, and auth boundaries are already populated.
2. If the workflow graph EXISTS — study it. You have a MAP. Skip blind exploration and go straight to auth probing, parameter classification, and attack.
3. If the workflow graph is EMPTY — Navigate, explore, and build the graph yourself. Add nodes and edges as you discover them.
4. Record login flows as macros and auth_probe every URL to classify endpoints.
5. Classify each parameter's purpose using classify_parameter — focus on the pre-mapped ones first.
6. Dynamically probe each hypothesis with crafted payloads based on parameter classifications.
7. Calculate risk periodically with calculate_risk to track progress.
8. Save every finding to the app model with update_app_model — include structured evidence.
9. When done, ensure all findings are saved to the app model — the pipeline will compile the final report automatically.

You have ${this.maxToolCalls} tool calls maximum. If the workflow graph is pre-populated, use them for ATTACK, not re-discovery. No human will intervene.`,
            }],
          },
          { streamMode: 'messages', subgraphs: true },
        );

        for await (const [, chunk] of stream) {
          const msg = chunk?.[0];
          if (!msg) continue;
          if (msg.text) process.stdout.write(msg.text);

          const tcChunks = (msg as any).tool_call_chunks;
          if (tcChunks?.length) {
            for (const tc of tcChunks) {
              if (tc.name) {
                toolCallCount++;
                process.stdout.write(colors.dim(`\n→ ${tc.name} (${toolCallCount}/${this.maxToolCalls})\n`));
                this.emitDashboardEvent('tool_call', {
                  name: tc.name,
                  iteration: toolCallCount,
                  args: tc.args ? JSON.parse(tc.args as string) : {},
                });
              }
            }
          }

          if (toolCallCount >= this.maxToolCalls) {
            stoppedEarly = true;
            process.stdout.write(colors.warn(`\n⚠️  Reached ${this.maxToolCalls} tool call limit. Stopping agent.\n`));
            this.emitDashboardEvent('status', { message: `Reached ${this.maxToolCalls} tool call limit` });
            break;
          }

          if ((msg as any)._getType?.() === 'tool') {
            const result = msg.content;
            const resultStr = typeof result === 'string' ? result : JSON.stringify(result);
            if (resultStr?.trim()) {
              process.stdout.write(colors.dim(`  [${resultStr.replace(/\n/g, ' ').slice(0, 300).trim()}]\n`));
            }
          }
        }
      } catch (e) {
        log.warn(`Agent error: ${e instanceof Error ? e.message : String(e)}`);
        this.emitDashboardEvent('error', { message: e instanceof Error ? e.message : String(e) });
      }

      // ── Always compile report from app model ──
      process.stdout.write('\n');
      log.info('Compiling report from app model...');
      this.emitDashboardEvent('status', { message: 'Compiling report' });

      const appModel = readAppModel(this.appModelPath);

      // ── Run independent triage on all findings ──
      if (appModel.findings.length > 0) {
        log.info(`Running triage on ${appModel.findings.length} findings...`);
        this.emitDashboardEvent('status', { message: 'Running finding triage' });
        const { triageFinding, applyTriageToFindings } = await import('../triage');
        const decisions = appModel.findings.map(f => triageFinding(f, appModel.findings));
        const triaged = applyTriageToFindings(appModel.findings, decisions);
        const removed = appModel.findings.length - triaged.length;
        if (removed > 0) {
          log.info(`Triage: ${removed} finding(s) removed/rejected, ${triaged.length} accepted`);
          appModel.findings = triaged;
          fsp.writeFileSync(this.appModelPath, JSON.stringify(appModel, null, 2));
        }
        const rejected = decisions.filter(d => d.status === 'rejected').map(d => `  - ${d.candidateId}: ${d.reason}`).join('\n');
        if (rejected) log.dim(`Rejected:\n${rejected}`);
        const downgraded = decisions.filter(d => d.status === 'downgraded').map(d => `  - ${d.candidateId}: ${d.reason}`).join('\n');
        if (downgraded) log.dim(`Downgraded:\n${downgraded}`);
      }

      const risk = calculateOverallRisk(appModel);
      this.emitDashboardEvent('risk_change', { score: risk.score, level: risk.level, breakdown: risk.breakdown });

      // ── Add OAST stats to coverage report ──
      let oastSummary = '';
      try {
        const { getOastServer } = await import('../oast');
        const server = getOastServer();
        if (server) {
          const stats = server.getStats();
          if (stats.totalCallbacks > 0) {
            oastSummary = `\n\n**OAST Callbacks**: ${stats.totalCallbacks} callbacks across ${stats.uniqueUuids} unique URLs`;
          }
        }
      } catch { /* best effort */ }

      // Save HAR from trace
      try {
        const mgr = getSharedBrowserManager();
        const trace = mgr.stopTrace('default');
        if (trace.length > 0) {
          const { traceToHar } = await import('../core/trace-utils');
          const harPath = pth.join(this.outputDir, 'session-trace.har');
          fsp.writeFileSync(harPath, traceToHar(trace), 'utf-8');
          log.info(`Network trace saved: ${harPath}`);
        }
      } catch { /* best effort */ }

      const report = compileReport(appModel, this.format as any);
      fsp.writeFileSync(reportPath, report + oastSummary);
      log.success(`Report written: ${reportPath}`);

      if (stoppedEarly) {
        log.warn(`Agent stopped after ${this.maxToolCalls} tool calls. Some endpoints may not have been tested.`);
      }

      const findings: Finding[] = appModel.findings.map((f, i) => ({
        id: `finding-${i}`,
        title: f.type,
        description: `Parameter: ${f.param || '-'}, Evidence: ${f.evidence.map(e => e.label).join('; ')}`,
        severity: f.severity as any,
        category: f.type,
        confidence: f.confidence === 'high' ? 0.9 : f.confidence === 'medium' ? 0.6 : 0.3,
        location: f.endpoint || appModel.target,
        evidence: f.evidence.map(e => `[${e.label}] ${e.data.slice(0, 200)}`).join('\n'),
        remediation: '',
        agent: 'autonomous' as any,
        timestamp: new Date().toISOString(),
      }));

      return { findings, reportPath };
    } finally {
      if (this.keepBrowser) {
        log.info('--keep-browser: browser sessions left open for post-mortem inspection');
      } else {
        try {
          const mgr = getSharedBrowserManager();
          await mgr.closeAll();
        } catch {
          // best effort cleanup
        }
      }
    }
  }
}
