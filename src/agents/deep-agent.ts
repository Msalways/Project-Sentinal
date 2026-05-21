import { createDeepAgent } from 'deepagents';
import { type BaseChatModel } from '@langchain/core/language_models/chat_models';
import { type Tool } from '@langchain/core/tools';
import type { AgentName, Finding, Severity } from '../core/types';
import { toolRegistry } from '../tools/tool-registry';
import { agentRegistry } from '../agents/agent-registry';

export interface SentinelAgentConfig {
  model: BaseChatModel;
  allTools: Tool[];
  agentNames?: string[];
}

export function createSentinelAgent(config: SentinelAgentConfig): ReturnType<typeof createDeepAgent> {
  const agentNames = config.agentNames || agentRegistry.listNames();
  const subagents = agentNames
    .map((name) => agentRegistry.get(name))
    .filter(Boolean)
    .map((entry) => {
      const tools = agentRegistry.resolveTools(config.allTools, entry!.requiredTools);
      return {
        name: entry!.name,
        description: entry!.description,
        systemPrompt: entry!.systemPrompt,
        tools,
        ...(entry!.model ? { model: entry!.model } : {}),
      };
    });

  const agentList = subagents
    .map((sa) => `- ${sa.name}: ${sa.description}`)
    .join('\n');

  return createDeepAgent({
    model: config.model,
    tools: config.allTools,
    subagents,
    systemPrompt: `You are Project Sentinel, an AI-powered security team-in-a-box.

You coordinate a team of specialized security agents to perform comprehensive security assessments.

Your workflow:
1. Analyze the target application and understand its architecture
2. Spawn specialized subagents for each security domain
3. Correlate findings from all agents
4. Generate a comprehensive security report with risk scoring

Available agents:
${agentList}

Always use the task tool to delegate work to specialized subagents.
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
      });
    }
  }

  return findings;
}
