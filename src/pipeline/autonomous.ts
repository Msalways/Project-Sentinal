import { createDeepAgent } from 'deepagents';
import { type BaseChatModel } from '@langchain/core/language_models/chat_models';
import { Logger, colors } from '../cli/logger';
import { toolRegistry } from '../tools/tool-registry';
import { createSpawnAgentTool } from '../tools/spawn-agent';
import { fixWriteTodosMiddleware } from '../core/fix-todos';
import type { Finding, ScanTarget, ScanEventEmitter } from '../core/types';

const log = new Logger();

function mdToHtml(md: string): string {
  return md
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/^- (.+)$/gm, '<li>$1</li>')
    .replace(/(<li>.*<\/li>\n?)+/g, '<ul>$&</ul>')
    .replace(/\n\n/g, '</p><p>')
    .replace(/\n/g, '<br>');
}

export const SKILL_SECTION = `## Skills System
You have on-demand skill files with expert guidance for every technique:

- Use \`list_skills\` to see the full skill catalog
- Use \`load_skill("name")\` to load a skill's full content into context
- Use \`search_skills("keyword")\` to find relevant skills

Always load relevant skills BEFORE starting a technique. Skills contain exact commands, payloads, and methodology.`;

export const ORCHESTRATOR_PROMPT = `You are an autonomous security assessment lead. Your job is to execute a comprehensive security test against the target URL.

CRITICAL RULES:
- You are given a specific target URL. Use THAT URL in all requests. Never use example.com, localhost, or any other URL — only the target you were given.
- CALL TOOLS IMMEDIATELY. Do not describe what you will do — call tools and do it.
- ONLY use tools from the list provided to you. Do NOT invent tools.
- Do NOT output raw XML/HTML like <tool_call> or <function>. Use ONLY the JSON function calling interface.
- Every message must either be a tool call or a direct result with findings.

## Available Tools

You have two categories of tools:
1. Core tools (always available): write_todos, write_file, read_file, edit_file
2. spawn_subagent — creates a specialized sub-agent with specific tools

Use spawn_subagent for ALL actual security work. The sub-agents have all the specialized security testing tools (http_request, sql_inject, xss_inject, tech_detect, subdomain_enum, dir_bruteforce, port_scan, etc.).

## How to Use Sub-Agents

To delegate work, use spawn_subagent. Always include targetUrl:

spawn_subagent({
  name: "sqli-scanner",
  goal: "Test login and search forms for SQL injection. Report findings.",
  targetUrl: "TARGET_URL_HERE",
})

### CRITICAL: Parallel Spawning
SPAWN 3-4 SUB-AGENTS IN YOUR VERY FIRST MESSAGE. Do NOT do recon first and then spawn — all phases run in parallel:

spawn_subagent({ name: "recon", goal: "...", targetUrl: "..." })
spawn_subagent({ name: "vuln-scan", goal: "...", targetUrl: "..." })
spawn_subagent({ name: "exploit", goal: "...", targetUrl: "..." })

Each sub-agent runs independently and returns findings as the spawn_subagent result. After all sub-agents return, compile their results into a final report and save it to final-security-report.md with write_file.

### Spawning Guidelines
- **Split by phase**: one agent for recon, one for vuln scanning, one for exploitation
- **Split by area**: one for web endpoints, one for API, one for infrastructure
- **Set clear goals** — include what to look for and what output format to use
- **targetUrl must always be the actual target URL** — never example.com or localhost
- **Sub-agents return findings as spawn_subagent results** — compile from those

### Tool Parameter Notes
- write_file requires file_path AND content. Both required.
- write_todos requires a todos array: [{"content": "...", "status": "pending"}]. NOT flat content/status fields.
- spawn_subagent requires targetUrl — always pass the real target URL.

## Workflow

YOUR FIRST MESSAGE: spawn 3-4 sub-agents in parallel covering recon + vuln + exploit + report.
SECOND MESSAGE: after all return, compile their spawn_subagent results into a final report and use write_file to save it to the output directory.

Do NOT do sequential work. Do NOT describe what you will do. CALL TOOLS IMMEDIATELY.`;

interface SubAgentResult {
  name: string;
  output: string;
  tools: string[];
}

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

  private getAllTools() {
    return toolRegistry.getAll();
  }

  async run(): Promise<{ findings: Finding[]; reportPath: string }> {
    const fs = require('fs');
    const path = require('path');

    fs.mkdirSync(this.outputDir, { recursive: true });

    const targetUrl = typeof this.target === 'string' ? this.target : (this.target as any).url || String(this.target);

    const spawnTool = createSpawnAgentTool(this.model);
    const leadTools = [spawnTool];

    let prompt = ORCHESTRATOR_PROMPT;
    prompt += `\n\nTarget URL: ${targetUrl}`;
    prompt += `\nOutput directory: ${this.outputDir}`;
    prompt += `\n\nWrite all sub-agent results to ${this.outputDir}/subagent-<name>.txt using write_file, and compile the final report to ${this.outputDir}/final-security-report.md.`;

    const leadAgent = createDeepAgent({
      model: this.model,
      tools: leadTools,
      middleware: [fixWriteTodosMiddleware],
      systemPrompt: prompt,
    });

    log.info('Lead agent starting...');
    if (this.events) this.events.pipelineStatus('Lead agent orchestrating assessment', 0);

    const subAgentResults: SubAgentResult[] = [];

    try {
      process.stdout.write(colors.dim('Assessment running...\n'));

      const stream = await leadAgent.stream(
        {
          messages: [{
            role: 'user',
            content: `Begin a full security assessment of ${targetUrl}. Use spawn_subagent to create specialized sub-agents for each phase (recon → vuln → exploit → report). After all sub-agents return, compile their results into a final report and use write_file to save it to ${this.outputDir}/final-security-report.md.`,
          }],
        },
        { streamMode: 'messages', subgraphs: true },
      );

      for await (const [namespace, chunk] of stream) {
        const isSubagent = namespace.some((s: string) => s.startsWith('tools:'));
        const msg = chunk?.[0];
        if (!msg) continue;

        if (msg.text) {
          const prefix = isSubagent ? colors.dim(`[sub] `) : '';
          process.stdout.write(`${prefix}${msg.text}`);
        }

        const tcChunks = (msg as any).tool_call_chunks;
        if (tcChunks?.length) {
          for (const tc of tcChunks) {
            if (tc.name) {
              process.stdout.write(colors.dim(`\n→ ${tc.name}(${tc.args || ''})\n`));
            }
          }
        }

        if ((msg as any)._getType?.() === 'tool') {
          const result = msg.content;
          const resultStr = typeof result === 'string' ? result : JSON.stringify(result);
          if (resultStr?.trim()) {
            process.stdout.write(colors.dim(`  ↳ ${resultStr.slice(0, 500)}\n`));
            // Capture full sub-agent reports (not truncated)
            if (resultStr.includes('## Sub-Agent Report:')) {
              const nameMatch = resultStr.match(/## Sub-Agent Report: (.+)/);
              const toolsMatch = resultStr.match(/\*\*Tools granted:\*\*\n([\s\S]*?)(?:\n\n|\*\*Output:\*\*)/);
              const outputMatch = resultStr.match(/\*\*Output:\*\*\n([\s\S]*)/);
              subAgentResults.push({
                name: nameMatch?.[1] || 'unknown',
                output: outputMatch?.[1]?.trim() || resultStr.slice(0, 5000),
                tools: toolsMatch?.[1]?.split('\n').map(l => l.replace(/^\s*-\s*/, '').split(':')[0].trim()).filter(Boolean) || [],
              });
            }
          }
        }
      }

      process.stdout.write('\n');
      log.success('Assessment complete');
    } catch (e) {
      log.warn(`Lead agent error: ${e instanceof Error ? e.message : String(e)}`);
    }

    const ext = this.format === 'html' ? 'html' : this.format === 'json' ? 'json' : 'md';
    const reportPath = path.join(this.outputDir, `final-security-report.${ext}`);

    // Build a structured report, not raw LLM text
    const header = `# Security Assessment Report\n\n**Target:** ${targetUrl}\n**Date:** ${new Date().toISOString().split('T')[0]}\n**Format:** ${this.format}\n\n`;

    if (subAgentResults.length > 0) {
      const body = subAgentResults.map(sa => [
        `## ${sa.name}`,
        `**Tools used:** ${sa.tools.join(', ')}`,
        ``,
        sa.output,
      ].join('\n')).join('\n\n---\n\n');

      const fullReport = header + body;

      if (this.format === 'html') {
        const templatePath = path.join(__dirname, 'report-template.html');
        let template = fs.readFileSync(templatePath, 'utf-8');
        const sectionsHtml = subAgentResults.map(sa => {
          const toolsHtml = sa.tools.map((t: string) => `<code>${t}</code>`).join(' ');
          return `<section><h2>🔍 ${sa.name}</h2><div class="tools">Tools: ${toolsHtml}</div><div class="output">${mdToHtml(sa.output)}</div></section>`;
        }).join('\n');
        template = template.replace('{{targetUrl}}', targetUrl).replace('{{date}}', new Date().toISOString().split('T')[0]).replace('{{sections}}', sectionsHtml);
        fs.writeFileSync(reportPath, template, 'utf-8');
      } else if (this.format === 'json') {
        const json = JSON.stringify({
          target: targetUrl,
          date: new Date().toISOString().split('T')[0],
          subAgents: subAgentResults.map(sa => ({
            name: sa.name,
            tools: sa.tools,
            output: sa.output,
          })),
        }, null, 2);
        fs.writeFileSync(reportPath, json, 'utf-8');
      } else {
        fs.writeFileSync(reportPath, header + body, 'utf-8');
      }
    } else {
      // Fallback: write whatever text was captured
      fs.writeFileSync(reportPath, header + 'No findings were captured.', 'utf-8');
    }

    return { findings: [], reportPath };
  }
}
