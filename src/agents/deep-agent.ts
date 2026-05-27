import { createDeepAgent } from 'deepagents';
import { type BaseChatModel } from '@langchain/core/language_models/chat_models';
import { type Tool } from '@langchain/core/tools';
import type { AgentName, Finding, Severity } from '../core/types';
import { toolRegistry } from '../tools/tool-registry';
import { agentRegistry } from '../agents/agent-registry';
import { fixWriteTodosMiddleware } from '../core/fix-todos';

export interface UltimatrixAgentConfig {
  model: BaseChatModel;
  allTools: Tool[];
  allAgents?: typeof agentRegistry.getAll extends () => infer T ? T : any[];
  targetContext?: string;
  agentNames?: string[];
}

export function createUltimatrixAgent(config: UltimatrixAgentConfig): ReturnType<typeof createDeepAgent> {
  const agentNames = config.agentNames || agentRegistry.listNames();
  const allAgents = config.allAgents || agentRegistry.getAll();

  const subagents = agentNames
    .map((name) => agentRegistry.get(name))
    .filter(Boolean)
    .map((entry) => {
      const tools = agentRegistry.resolveTools(config.allTools, entry!.suggestedTools);
      return {
        name: entry!.name,
        description: entry!.description,
        systemPrompt: entry!.systemPrompt,
        tools,
        model: config.model,
      };
    });

  const agentList = subagents
    .map((sa) => `- ${sa.name}: ${sa.description}`)
    .join('\n');

  const contextSection = config.targetContext ? `Target Context:\n${config.targetContext}\n\n` : '';

  return createDeepAgent({
    model: config.model,
    tools: config.allTools,
    middleware: [fixWriteTodosMiddleware],
    subagents,
    systemPrompt: `You are Ultimatrix, an autonomous AI security team lead.

${contextSection}You coordinate a team of specialized security agents to perform comprehensive security assessments.

Your autonomous workflow:
1. Analyze the target application and understand its architecture from the context provided
2. Decide which specialized agents are relevant for this target
3. Spawn only the agents needed — don't waste time on irrelevant ones
4. Delegate specific tasks to each agent based on their expertise
5. Review all findings, correlate them, and eliminate false positives
6. Generate a comprehensive security report with risk scoring

Available agents (use task tool to delegate):
${agentList}

Guidelines:
- For web apps: use recon-agent, web-agent, auth-agent, exploit-agent
- For APIs: use recon-agent, api-agent, auth-agent, exploit-agent
- For code repos: use code-agent, secrets_scan tools
- For infrastructure: use network-agent, cloud tools
- Always validate findings with exploit-agent before reporting
- Only report CONFIRMED vulnerabilities

After all subagents complete their work, synthesize the findings into a final security report.`,
  });
}

export function parseFindingsFromOutput(output: string): Finding[] {
  const findings: Finding[] = [];
  const blocks = output.split(/\n(?=\d+[\.\)]\s)/);

  for (const block of blocks) {
    const lines = block.split('\n').map((l) => l.trim()).filter(Boolean);
    if (lines.length === 0) continue;

    const titleLine = lines[0];
    const titleMatch = titleLine.match(/^\d+[\.\)]\s*(.+?)(?:\s*-\s*Severity:\s*(critical|high|medium|low|info))?$/i);
    const title = titleMatch ? titleMatch[1] : titleLine.replace(/^\d+[\.\)]\s*/, '');

    let severity: Severity = 'medium';
    if (titleMatch && titleMatch[2]) severity = titleMatch[2].toLowerCase() as Severity;

    let description = '';
    let location = '';
    let evidence = '';
    let remediation = '';
    let category = 'general';

    for (const line of lines.slice(1)) {
      const lower = line.toLowerCase();
      if (lower.startsWith('severity:')) {
        if (lower.includes('critical')) severity = 'critical';
        else if (lower.includes('high')) severity = 'high';
        else if (lower.includes('medium')) severity = 'medium';
        else if (lower.includes('low')) severity = 'low';
        else if (lower.includes('info')) severity = 'info';
      } else if (lower.startsWith('location:')) location = line.replace(/^location[:\s]*/i, '').trim();
      else if (lower.startsWith('evidence:')) evidence = line.replace(/^evidence[:\s]*/i, '').trim();
      else if (lower.startsWith('remediation:')) remediation = line.replace(/^remediation[:\s]*/i, '').trim();
      else if (lower.startsWith('category:')) category = line.replace(/^category[:\s]*/i, '').trim();
      else if (!lower.startsWith('severity') && !lower.startsWith('location') && !lower.startsWith('evidence') && !lower.startsWith('remediation') && !lower.startsWith('category')) {
        description += (description ? ' ' : '') + line;
      }
    }

    if (title && !title.includes('complete') && !title.includes('finished')) {
      findings.push({
        id: `finding-${findings.length + 1}`,
        title,
        description,
        severity,
        category,
        location,
        evidence,
        remediation,
        agent: 'recon' as AgentName,
        timestamp: new Date().toISOString(),
        confidence: 50,
      });
    }
  }

  return findings;
}
