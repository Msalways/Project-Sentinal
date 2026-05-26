import { createDeepAgent } from 'deepagents';
import { type BaseChatModel } from '@langchain/core/language_models/chat_models';
import { Logger, colors } from '../cli/logger';
import { toolRegistry } from '../tools/tool-registry';
import { createSpawnAgentTool } from '../tools/spawn-agent';
import type { Finding, ScanTarget, ScanEventEmitter } from '../core/types';

const log = new Logger();

export const SKILL_SECTION = `## Skills System
You have on-demand skill files with expert guidance for every technique:

- Use \`list_skills\` to see the full skill catalog
- Use \`load_skill("name")\` to load a skill's full content into context
- Use \`search_skills("keyword")\` to find relevant skills

Always load relevant skills BEFORE starting a technique. Skills contain exact commands, payloads, and methodology.`;

export const ORCHESTRATOR_PROMPT = `You are an autonomous security assessment lead. Your job is to execute a comprehensive security test against the target URL.

CRITICAL: You are given a specific target URL. Use THAT URL in all requests. Never use example.com, localhost, or any other URL — only the target you were given.

CALL TOOLS IMMEDIATELY. Do not describe what you will do — call tools and do it. Every message must either be a tool call or a direct result.

## How to Use Sub-Agents

To delegate work, use spawn_subagent. Always include targetUrl:

\`\`\`
spawn_subagent({
  name: "sqli-scanner",
  goal: "Test login and search forms for SQL injection. Report findings.",
  toolNames: ["http_request", "sql_inject"],
  targetUrl: "TARGET_URL_HERE",
})
\`\`\`

### Parallel Spawning
When multiple sub-agents have independent tasks (e.g. scanning different endpoints, checking different vulnerability types), SPAWN THEM ALL IN ONE MESSAGE by calling spawn_subagent multiple times simultaneously. Do NOT wait for one to finish before starting another if they don't depend on each other.

### Spawning Guidelines
- **Name sub-agents descriptively** — names help you track what each one does
- **Set a clear goal** — include what to look for and what output format to use
- **targetUrl must always be the actual target URL** — never example.com or localhost
- **Use write_file inside sub-agents** to persist findings for later phases

## Workflow

Start with reconnaissance, then test vulnerabilities, then validate findings. Always write findings to files using write_file.`;

export class AutonomousOrchestrator {
  private model: BaseChatModel;
  private target: ScanTarget;
  private events?: ScanEventEmitter;
  private outputDir: string;

  constructor(config: {
    model: BaseChatModel;
    target: ScanTarget;
    events?: ScanEventEmitter;
    outputDir: string;
  }) {
    this.model = config.model;
    this.target = config.target;
    this.events = config.events;
    this.outputDir = config.outputDir;
  }

  private getAllTools() {
    return toolRegistry.getAll();
  }

  async run(): Promise<{ findings: Finding[]; reportPath: string }> {
    const fs = require('fs');
    const path = require('path');

    fs.mkdirSync(this.outputDir, { recursive: true });

    const targetUrl = typeof this.target === 'string' ? this.target : (this.target as any).url || String(this.target);
    const allTools = this.getAllTools();

    const spawnTool = createSpawnAgentTool(this.model);
    const leadTools = [spawnTool, ...allTools];

    let prompt = ORCHESTRATOR_PROMPT;
    prompt += `\n\nTarget URL: ${targetUrl}`;
    prompt += `\nOutput directory: ${this.outputDir}`;
    prompt += `\n\nWrite all findings and reports to ${this.outputDir} using write_file.`;

    const leadAgent = createDeepAgent({
      model: this.model,
      tools: leadTools,
      systemPrompt: prompt,
    });

    log.info('Lead agent starting...');
    if (this.events) this.events.pipelineStatus('Lead agent orchestrating assessment', 0);

    try {
      process.stdout.write(colors.dim('Assessment running...\n'));

      const stream = await leadAgent.stream(
        {
          messages: [{
            role: 'user',
            content: `Begin a full security assessment of ${targetUrl}. Use spawn_subagent to create specialized sub-agents for each phase (recon → vuln → exploit → report). Write all findings and the final report to ${this.outputDir} using write_file.`,
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
          const resultStr = typeof result === 'string' ? result.slice(0, 500) : JSON.stringify(result).slice(0, 500);
          if (resultStr?.trim()) {
            process.stdout.write(colors.dim(`  ↳ ${resultStr}\n`));
          }
        }
      }

      process.stdout.write('\n');
      log.success('Assessment complete');
    } catch (e) {
      log.warn(`Lead agent error: ${e instanceof Error ? e.message : String(e)}`);
    }

    const reportPath = path.join(this.outputDir, 'final-security-report.md');

    return { findings: [], reportPath };
  }
}
