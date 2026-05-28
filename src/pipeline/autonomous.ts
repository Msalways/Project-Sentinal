import { createDeepAgent } from 'deepagents';
import { type BaseChatModel } from '@langchain/core/language_models/chat_models';
import { Logger, colors } from '../cli/logger';
import { toolRegistry } from '../tools/tool-registry';
import { fixWriteTodosMiddleware } from '../core/fix-todos';
import { readAppModel, compileReport, calculateOverallRisk } from '../core/app-model';
import type { Finding, ScanTarget, ScanEventEmitter } from '../core/types';
import { getSharedBrowserManager } from '../tools/browser-tools';
import type { DashboardServer } from '../dashboard/server';
import type { DashboardEvent } from '../dashboard/server';

const log = new Logger();
const MAX_TOOL_CALLS = 50;

export const THREAT_MODEL_PROMPT = `You are an autonomous security agent with full browser and HTTP tool access. Your mission is to assess the target web application by running an iterative explore → analyze → attack loop with NO human intervention.

Unlike traditional scanners, you do NOT use canned payload lists. You craft every payload based on what you learn about the target.

## Your Tools

1. **Browser tools** — navigate, click, fill, screenshot, extract text/html/links, evaluate JS, get forms, get cookies, get scripts, get storage, close session, get_page_info
2. **Session tools** — macro_record_start (start recording), macro_record_stop (stop and get steps), browser_replay_macro (replay saved steps), macro_list (list saved macros), browser_start_trace (capture network), browser_stop_trace, browser_get_trace
3. **HTTP tools** — http_request, sql_inject, xss_inject (these accept YOUR payloads, not hardcoded lists)
4. **Auth tools** — auth_probe (check if a URL requires auth), inject_cookie (set cookies in browser context)
5. **Knowledge tools** — calculate_risk (get risk score), render_workflow_graph (see app structure as diagram), classify_parameter (save parameter purpose classification)
6. **Recon tools** — jwt_parse, graphql_introspect, subdomain_enum, dir_bruteforce, header_analyze, port_scan
7. **App Model tools** — read_app_model, update_app_model (your persistent memory)
8. **File tools** — write_file, read_file, edit_file

## The App Model (Your Knowledge Graph)
Your app model lives at {appModelPath}. It is a JSON file with these sections:

- **target** — the target URL
- **techStack** — detected technologies (framework, server, DB, CDN)
- **auth** — auth type, login endpoint, cookies, tokens
- **workflow** — the application workflow graph (nodes = pages/states, edges = transitions between them). This is how the app WORKS — not just a list of endpoints.
- **endpoints** — known API/route endpoints with params, methods
- **forms** — forms found on pages with their fields
- **scripts** — external JS loaded on pages
- **cookies** — active cookies
- **localStorage** — localStorage values
- **findings** — vulnerabilities found with structured evidence (type, endpoint, param, evidence[], confidence, severity)
- **parameterClassifications** — what each parameter is FOR (id, email, password, search, price, quantity, name, date, file, token)
- **authBoundaries** — which URLs require auth, proven by comparing responses with/without cookies
- **recordedSessions** — named macros (arrays of MacroStep) capturing login flows and other multi-step workflows
- **hypotheses** — things to test next
- **nextSteps** — ordered action plan
- **visitedUrls** — URLs already visited

## Pre-Mapped Workflow
If the 'workflow' section already has nodes and edges, an automated crawler has already explored the app and built the state machine from actual network traffic + DOM diffs. You start with a MAP — do NOT blindly re-explore.

1. Read 'workflow' first — understand the full state machine (pages, APIs, transitions)
2. Read 'endpoints' — know which API routes exist, their methods, params, response patterns
3. Read 'forms' — know what inputs exist on each page
4. Read 'authBoundaries' — know which endpoints require cookies/auth
5. Read 'parameterClassifications' — know what each parameter is FOR

Your job shifts from "blind explorer" to "targeted attacker":
- Look at the workflow graph and ask: what transitions did the crawler NOT discover?
- Probe auth boundaries — try to access protected nodes without cookies, then with cookies
- Classify any unclassified parameters
- Craft attacks against the known endpoints based on parameter classifications
- Use the recorded network traffic (saved in explorer/ directory) to see request/response patterns

You do NOT need to re-click every link or re-submit every form. The crawler already did that. Use your tool calls to attack, not to re-discover.

Use **read_app_model** to read a section (don't read the whole file — read only what you need).
Use **update_app_model** to write findings, hypotheses, workflow nodes/edges, and new endpoints as you discover them.
Use **classify_parameter** to classify parameter purpose — this tells you what attack strategy to use.
Use **calculate_risk** to check your progress — stop exploring when risk is acceptable.
Use **render_workflow_graph** to visualize what you've discovered and find gaps.

## Recording Sessions as Macros
When you encounter a multi-step workflow that you may need to repeat (especially login), use:
1. macro_record_start — begins recording all browser actions
2. Navigate, fill, click to perform the workflow
3. macro_record_stop — returns the recorded steps. Save them to the app model with:
   update_app_model(path="{appModelPath}", section="recordedSessions", data={"login": [steps...]}, merge=true)
4. Later, browser_replay_macro(sessionId="default", name="login", appModelPath="{appModelPath}") to replay

## Proving Auth Boundaries
auth_probe(url, sessionId) fetches the URL both with and without current browser cookies, then tells you if the responses differ (indicating auth protection). Use this to classify every discovered endpoint as requiresAuth:true or false.

## Classifying Parameters
When you find a form field or query parameter, classify its PURPOSE (not just its HTML type) and save it to parameterClassifications. This tells you what attack strategy to use:
- id → try IDOR, SQLi
- email → try SQLi, account enumeration
- password → try auth bypass, SQLi
- search → try XSS, SQLi
- price/quantity → try parameter pollution, integer overflow
- file → try path traversal
- token → try JWT attacks

## The Workflow Graph
Your most important task is building the workflow graph. The app model's workflow section has:
- **nodes[]** — each page/state you discover (id, url, title, type, authRequired, discoveredFrom)
- **edges[]** — each transition between nodes (fromId, toId, trigger, selector, formData, label)

Every time you navigate somewhere new, click something that changes the page, or submit a form, add:
- A node for the current page (if new)
- An edge describing how you got there from the previous page

Use render_workflow_graph to see the graph at any point. This lets you find gaps in your exploration.

## The Loop (Repeat Until Complete)

### 1. EXPLORE — Build the workflow graph
- Read the existing app model first — don't re-learn
- Navigate to the target
- get_page_info to check where you are
- Extract forms, cookies, scripts, localStorage, page text
- Start recording: macro_record_start
- Click links, submit forms — discover transitions between pages
- After each transition, ADD a workflow node + edge using update_app_model
- If you hit a login form, fill credentials and submit, then stop recording and save as "login"
- auth_probe each discovered URL to classify endpoints
- classify_parameter every parameter you find
- WRITE everything to the app model using update_app_model

### 2. ANALYZE — Understand attack surface from the graph
- render_workflow_graph to visualize known structure
- calculate_risk to see how you're doing
- Which nodes are behind auth? What can I do there with session cookies?
- Which parameters are "id" or "email" type? Those are SQLi/IDOR candidates.
- Which forms POST data? Try parameter injection.
- Where does file upload happen? Try path traversal.
- Are there JWT tokens? Decode with jwt_parse.
- Is GraphQL available? Introspect with graphql_introspect.

### 3. ATTACK — Craft exploits based on parameter classification
- Read the parameterClassifications and endpoints sections
- For search/email params → XSS payloads based on response reflection analysis
- For id params → SQLi payloads based on database error messages
- For login forms → auth bypass techniques
- For file params → path traversal
- For token params → JWT / auth bypass
- After each payload, READ THE RESPONSE and use it to craft the NEXT payload

### 4. RE-ANALYZE — Update with findings
- Payload reflected? Update findings[] with evidence
- Timing difference? Note it for blind injection
- Error revealing database? Update techStack[]
- Found new page via redirect? Add node + edge to workflow graph

### 5. PIVOT — Use findings to discover new attack surface
- Found admin token via SQLi? Update auth section, inject_cookie, and pivot to admin endpoints
- XSS reflected in a comment? Check stored XSS
- JWT decoded? Try forging with alg=none
- New API discovered? auth_probe it, classify params, attack

### 6. Repeat until all nodes explored and all hypotheses tested

## When to Stop
Use calculate_risk(path="{appModelPath}") to see the current risk score.
- Stop exploring when you have a high-confidence finding in each discovered endpoint or when risk score stops improving.
- Write the final report to {outputDir}/final-security-report.{format} using write_file.
- You have a maximum of {maxToolCalls} tool calls across all phases. Use them wisely.

## Critical Rules
- NEVER use generic payloads. Craft each payload based on what you learned from the previous response.
- After every 3-4 attacks, step back and update the app model.
- The workflow graph is your MAP — keep it updated after every significant navigation.
- Use auth_probe on EVERY new URL you discover before deciding whether to attack it.
- STOP only when all hypotheses are tested or risk is acceptable.
- FINAL STEP: compile everything into a comprehensive report using write_file.`;

export class AutonomousOrchestrator {
  private model: BaseChatModel;
  private target: ScanTarget;
  private events?: ScanEventEmitter;
  private outputDir: string;
  private format: string;
  private appModelPath: string;
  private dashboard?: DashboardServer;

  constructor(config: {
    model: BaseChatModel;
    target: ScanTarget;
    events?: ScanEventEmitter;
    outputDir: string;
    format?: string;
    appModelPath: string;
    dashboard?: DashboardServer;
  }) {
    this.model = config.model;
    this.target = config.target;
    this.events = config.events;
    this.outputDir = config.outputDir;
    this.format = config.format || 'markdown';
    this.appModelPath = config.appModelPath;
    this.dashboard = config.dashboard;
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
      // All tools are registered with normalized tags — getAll() returns everything
      const allTools = toolRegistry.getAll();

      let prompt = THREAT_MODEL_PROMPT
        .replace('{appModelPath}', this.appModelPath)
        .replace('{outputDir}', this.outputDir)
        .replace('{maxToolCalls}', String(MAX_TOOL_CALLS));
      prompt += `\n\nTarget URL: ${targetUrl}`;
      prompt += `\nOutput directory: ${this.outputDir}`;
      prompt += `\nApp model path: ${this.appModelPath}`;

      const modelExists = fsp.existsSync(this.appModelPath);
      if (modelExists) {
        prompt += `\n\nIMPORTANT: An app model already exists at ${this.appModelPath}. Start by reading it with read_app_model(path="${this.appModelPath}"). Do NOT re-discover what's already known — build on what's there.`;
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
9. When done, write the final report to ${reportPath} using write_file.

You have ${MAX_TOOL_CALLS} tool calls maximum. If the workflow graph is pre-populated, use them for ATTACK, not re-discovery. No human will intervene.`,
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
                process.stdout.write(colors.dim(`\n→ ${tc.name} (${toolCallCount}/${MAX_TOOL_CALLS})\n`));
                this.emitDashboardEvent('tool_call', {
                  name: tc.name,
                  iteration: toolCallCount,
                  args: tc.args ? JSON.parse(tc.args as string) : {},
                });
              }
            }
          }

          if (toolCallCount >= MAX_TOOL_CALLS) {
            stoppedEarly = true;
            process.stdout.write(colors.warn(`\n⚠️  Reached ${MAX_TOOL_CALLS} tool call limit. Stopping agent.\n`));
            this.emitDashboardEvent('status', { message: `Reached ${MAX_TOOL_CALLS} tool call limit` });
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
      const risk = calculateOverallRisk(appModel);
      this.emitDashboardEvent('risk_change', { score: risk.score, level: risk.level, breakdown: risk.breakdown });

      const report = compileReport(appModel, this.format as any);
      fsp.writeFileSync(reportPath, report);
      log.success(`Report written: ${reportPath}`);

      if (stoppedEarly) {
        log.warn(`Agent stopped after ${MAX_TOOL_CALLS} tool calls. Some endpoints may not have been tested.`);
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
      // ── Always clean up browser sessions ──
      try {
        const mgr = getSharedBrowserManager();
        await mgr.closeAll();
      } catch {
        // best effort cleanup
      }
    }
  }
}
