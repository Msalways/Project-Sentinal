import { createDeepAgent } from 'deepagents';
import { type BaseChatModel } from '@langchain/core/language_models/chat_models';
import { Logger, colors } from '../cli/logger';
import { toolRegistry } from '../tools/tool-registry';
import { fixWriteTodosMiddleware } from '../core/fix-todos';
import type { Finding, ScanTarget, ScanEventEmitter } from '../core/types';

const log = new Logger();

export const THREAT_MODEL_PROMPT = `You are an autonomous security agent with full browser and HTTP tool access. Your mission is to assess the target web application by running an iterative explore → analyze → attack loop with NO human intervention.

Unlike traditional scanners, you do NOT use canned payload lists. You craft every payload based on what you learn about the target.

## How This Works

You have three categories of tools:
1. **Browser tools** — navigate, click, fill, extract forms/cookies/scripts/storage, evaluate JS, screenshot
2. **HTTP tools** — http_request, sql_inject, xss_inject (these accept YOUR payloads, not hardcoded lists)
3. **File tools** — write_todos, write_file, read_file, edit_file

## The Loop (Repeat Until Complete)

### 1. EXPLORE — Learn the target
- Navigate to the target with browser_navigate
- Extract all forms, cookies, scripts, and localStorage
- Read visible page content with browser_extract(type="text")
- Send http_request to key endpoints to probe tech stack
- Build a threat model by learning: what framework, what DB, what auth, what endpoints

### 2. ANALYZE — Update your threat model
Store everything you learn as structured JSON in threat-model.json using write_file:
{
  "target": "...",
  "tech": ["React", "Node.js"],
  "auth": { "type": "JWT", "endpoints": [] },
  "endpoints": [{ "path": "/login", "method": "POST", "params": [], "requiresAuth": false }],
  "findings": [{ "type": "sqli", "endpoint": "/api/users", "param": "id", "evidence": "...", "confidence": "high", "confirmed": false }],
  "hypotheses": ["PostgreSQL based on error: 'function pg_cURRENT_USER does not exist'"],
  "next_steps": ["Test UNION injection on /api/users?id="]
}

### 3. ATTACK — Craft exploits based on your threat model
- If you found a form with a search field, probe it with XSS payloads YOU craft based on the response
- If you found an API endpoint with an id parameter, probe it with SQL injection payloads YOU craft
- If you found a login form, test auth bypass techniques
- After each payload, READ THE RESPONSE carefully and use it to craft the NEXT payload
- If a payload errors, analyze the error message — it tells you the database, the framework, or the sanitization

### 4. RE-ANALYZE — Update your threat model with findings
- Did the payload reflect? Update your threat model
- Did you get a timing difference? Note it for time-based blind injection
- Did you get an error message? It reveals the tech stack — update tech[], hypotheses[], and craft a better payload

### 5. PIVOT — Use findings to discover new attack surface
- SQLi found an admin session token? Use it to access admin endpoints
- XSS found in comment form? Check if comments are stored and who views them
- JWT decoded? Try forging with alg=none

### 6. Repeat until the app is fully mapped and all hypotheses are tested

## Critical Rules

- NEVER use generic payloads. Craft each payload based on what you learned from the previous response.
- If a SQLi payload returns an error message mentioning "PostgreSQL", your next payload should use PostgreSQL syntax.
- If an XSS payload is HTML-encoded, try an attribute-breaking payload instead.
- If a request takes 5+ seconds, the payload may have worked — investigate with evidence extraction.
- After every 3-4 attack attempts, step back and update threat-model.json with what you've learned.
- When you have enough evidence for a finding, save it to findings section in the threat model.
- STOP only when you've tested all hypotheses and the threat model covers the full app surface.
- FINAL STEP: compile everything into a comprehensive report using write_file.`;

export class AutonomousOrchestrator {
  private model: BaseChatModel;
  private target: ScanTarget;
  private events?: ScanEventEmitter;
  private outputDir: string;
  private format: string;

  constructor(config: {
    model: BaseChatModel;
    target: ScanTarget;
    events?: ScanEventEmitter;
    outputDir: string;
    format?: string;
  }) {
    this.model = config.model;
    this.target = config.target;
    this.events = config.events;
    this.outputDir = config.outputDir;
    this.format = config.format || 'markdown';
  }

  async run(): Promise<{ findings: Finding[]; reportPath: string }> {
    const fs = require('fs');
    const path = require('path');

    fs.mkdirSync(this.outputDir, { recursive: true });

    const targetUrl = typeof this.target === 'string' ? this.target : (this.target as any).url || String(this.target);

    const allTools = toolRegistry.getByTags(['browser', 'http', 'network', 'exploit', 'recon']);
    // Also add http_request, file tools
    const httpTool = toolRegistry.get('http_request');
    const sqlTool = toolRegistry.get('sql_inject');
    const xssTool = toolRegistry.get('xss_inject');
    const writeTodos = toolRegistry.get('write_todos');
    const writeFile = toolRegistry.get('write_file');
    const readFile = toolRegistry.get('read_file');
    const editFile = toolRegistry.get('edit_file');
    const extras = [httpTool, sqlTool, xssTool, writeTodos, writeFile, readFile, editFile].filter(Boolean) as any[];
    const allToolsWithFile = [...allTools, ...extras];

    let prompt = THREAT_MODEL_PROMPT;
    prompt += `\n\nTarget URL: ${targetUrl}`;
    prompt += `\nOutput directory: ${this.outputDir}`;
    prompt += `\n\nInitialize your threat model at ${this.outputDir}/threat-model.json using write_file.`;
    prompt += `\nSave the final report to ${this.outputDir}/final-security-report.${this.format === 'html' ? 'html' : this.format === 'json' ? 'json' : 'md'} when complete.`;

    const agent = createDeepAgent({
      model: this.model,
      tools: allToolsWithFile,
      middleware: [fixWriteTodosMiddleware],
      systemPrompt: prompt,
    });

    log.info('Autonomous assessment starting...');
    if (this.events) this.events.pipelineStatus('Exploring and assessing target autonomously', 0);

    process.stdout.write(colors.dim('Autonomous agent running... (this will take several minutes)\n'));

    try {
      const stream = await agent.stream(
        {
          messages: [{
            role: 'user',
            content: `Begin autonomous security assessment of ${targetUrl}. 
            
1. First, navigate to the target and explore — extract forms, cookies, scripts, tech stack.
2. Build your threat model at ${this.outputDir}/threat-model.json.
3. Dynamically probe each finding with crafted payloads.
4. Pivot based on what you discover.
5. When done, compile the final report to ${this.outputDir}/final-security-report.${this.format === 'html' ? 'html' : this.format === 'json' ? 'json' : 'md'}.

You have full browser and HTTP access. No human will intervene. Go.`,
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
              process.stdout.write(colors.dim(`\n→ ${tc.name}\n`));
            }
          }
        }

        if ((msg as any)._getType?.() === 'tool') {
          const result = msg.content;
          const resultStr = typeof result === 'string' ? result : JSON.stringify(result);
          if (resultStr?.trim()) {
            process.stdout.write(colors.dim(`  [${resultStr.replace(/\n/g, ' ').slice(0, 300).trim()}]\n`));
          }
        }
      }

      process.stdout.write('\n');
      log.success('Assessment complete');
    } catch (e) {
      log.warn(`Agent error: ${e instanceof Error ? e.message : String(e)}`);
    }

    const ext = this.format === 'html' ? 'html' : this.format === 'json' ? 'json' : 'md';
    const reportPath = path.join(this.outputDir, `final-security-report.${ext}`);

    return { findings: [], reportPath };
  }
}