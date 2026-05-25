import { createDeepAgent } from 'deepagents';
import { type BaseChatModel } from '@langchain/core/language_models/chat_models';
import { Logger } from '../cli/logger';
import { toolRegistry } from '../tools/tool-registry';
import type { Finding, ScanTarget, ScanEventEmitter } from '../core/types';

const log = new Logger();

export interface AutonomousPhase {
  name: string;
  goalPrompt: string;
  outputFile?: string;
}

export const SKILL_SECTION = `## Skills System
You have on-demand skill files with expert guidance for every technique:

- Use \`list_skills\` to see the full skill catalog
- Use \`load_skill("name")\` to load a skill's full content into context
- Use \`search_skills("keyword")\` to find relevant skills

Always load relevant skills BEFORE starting a technique. Skills contain exact commands, payloads, and methodology.

Available tools: browser_navigate, browser_click, browser_fill, browser_extract, browser_screenshot, browser_evaluate, browser_close, exec_command, read_file, write_file, http_request, tech_detect, payload_search, kg_query, load_skill, search_skills, list_skills`;

export const PHASES: AutonomousPhase[] = [
  {
    name: 'recon',
    goalPrompt: `You are an autonomous reconnaissance specialist. Your goal is to explore the target web application thoroughly and understand its attack surface.

${SKILL_SECTION}

Your mission:
1. Navigate to the target and explore all pages, forms, and endpoints
2. Document the technology stack, authentication mechanisms, and API structure
3. Identify all input vectors (forms, URL parameters, API endpoints, headers, cookies)
4. Map the application's attack surface in detail
5. Write your findings to a file using write_file so the next phase can read them

Be thorough — explore every page, click every link, fill and submit every form you find.
Document everything clearly. Write detailed findings to a deliverable file.`,
    outputFile: 'recon-deliverable.md',
  },
  {
    name: 'vuln',
    goalPrompt: `You are an autonomous vulnerability analyst. Using the reconnaissance data from the previous phase, you need to probe the target for security vulnerabilities.

${SKILL_SECTION}

Additional specialized tools:
- sql_inject, xss_inject, ssrf_test, csrf_test, nosql_inject, ssti_test, cmd_inject, xxe_test
- prototype_pollution, prompt_inject, jwt_crack, graphql_idor
- cookie_analyze, cloud_metadata_enum, s3_bucket_find
- browser_navigate, browser_click, browser_fill — test payloads in real browser
- http_request — craft custom requests
- payload_search — find relevant payloads
- kg_query, kg_add_node, kg_add_edge — build knowledge graph of findings
- write_file — save evidence

Your mission:
1. Read the recon deliverable file to understand the attack surface
2. For each input vector and endpoint, test relevant vulnerability classes
3. Use the browser to submit payloads and observe responses
4. For each confirmed finding, write detailed evidence to a finding file
5. Add findings to the knowledge graph for cross-referencing

For each vulnerability you confirm:
- Document the exact URL, parameter, and payload that worked
- Capture the evidence (response text, screenshot, timing difference)
- Rate severity, confidence, and provide remediation advice
- Write to a structured findings file

Only report CONFIRMED vulnerabilities with real evidence.`,
    outputFile: 'vuln-findings.md',
  },
  {
    name: 'exploit',
    goalPrompt: `You are an autonomous exploitation specialist. Your goal is to prove the impact of the vulnerabilities discovered in the previous phase.

${SKILL_SECTION}

Your mission:
1. Read the vulnerability findings file
2. For each confirmed vulnerability, attempt to exploit it to demonstrate real impact:
   - SQL injection: extract actual data from the database
   - XSS: execute JavaScript in the browser and capture the result
   - SSRF: read cloud metadata or internal resources
   - Command injection: execute commands on the server
   - Authentication bypass: access protected resources
   - Privilege escalation: perform unauthorized actions
3. Document each successful exploitation with:
   - Exact steps to reproduce
   - Evidence (screenshots, response data, extracted information)
   - Business impact assessment
4. Write a comprehensive exploitation report

Prove impact — don't just confirm the vulnerability exists, demonstrate what an attacker could actually do with it.`,
    outputFile: 'exploit-evidence.md',
  },
  {
    name: 'report',
    goalPrompt: `You are an autonomous security report writer. Your goal is to compile a comprehensive security assessment report from all the previous phase deliverables.

${SKILL_SECTION}

Read all deliverable files from previous phases and synthesize them into a final report.

The report should include:
1. Executive summary — high-level overview of findings and risk level
2. Reconnaissance findings — attack surface map, technology stack, endpoints
3. Vulnerability findings — detailed list of all confirmed vulnerabilities
4. Exploitation evidence — proof of impact for each exploited vulnerability
5. Risk assessment — CVSS scores, severity ratings, business impact
6. Remediation recommendations — actionable steps to fix each issue
7. Methodology — how the assessment was conducted

Write the final report using write_file. Make it professional, clear, and actionable.`,
    outputFile: 'final-security-report.md',
  },
];

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

  private loadDeliverable(phase: string): string {
    const fs = require('fs');
    const path = require('path');
    const fp = path.join(this.outputDir, `${phase}-deliverable.md`);
    if (fs.existsSync(fp)) {
      return fs.readFileSync(fp, 'utf-8').slice(0, 50000);
    }
    return '';
  }

  async run(): Promise<{ findings: Finding[]; reportPath: string }> {
    const fs = require('fs');
    const path = require('path');
    const { promisify } = require('util');
    const mkdir = promisify(fs.mkdir);

    fs.mkdirSync(this.outputDir, { recursive: true });

    const targetUrl = typeof this.target === 'string' ? this.target : (this.target as any).url || String(this.target);
    const allTools = this.getAllTools();
    const findings: Finding[] = [];

    for (const phase of PHASES) {
      log.info(`[${phase.name.toUpperCase()}] Autonomous phase starting...`);
      if (this.events) this.events.pipelineStatus(`Phase: ${phase.name}`, (PHASES.indexOf(phase) / PHASES.length) * 100);

      let phasePrompt = phase.goalPrompt;
      phasePrompt += `\n\nTarget URL: ${targetUrl}`;
      phasePrompt += `\nOutput directory: ${this.outputDir}`;

      if (phase.name !== 'recon') {
        const prevDeliverable = this.loadDeliverable(PHASES[PHASES.indexOf(phase) - 1].name);
        if (prevDeliverable) {
          phasePrompt += `\n\nPrevious phase deliverable:\n${prevDeliverable.slice(0, 30000)}`;
        }
      }

      if (phase.outputFile) {
        phasePrompt += `\n\nWrite your output to: ${path.join(this.outputDir, phase.outputFile)}`;
      }

      const agent = createDeepAgent({
        model: this.model,
        tools: allTools,
        systemPrompt: phasePrompt,
      });

      log.info(`Invoking ${phase.name} agent...`);
      try {
        await agent.invoke({
          messages: [{
            role: 'user',
            content: `Begin ${phase.name} phase for ${targetUrl}. Explore, test, exploit, and document everything. Use write_file to save your deliverables.`,
          }],
        });
        log.success(`${phase.name} phase complete`);
      } catch (e) {
        log.warn(`${phase.name} phase error: ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    const reportPath = path.join(this.outputDir, 'final-security-report.md');

    return { findings, reportPath };
  }
}
