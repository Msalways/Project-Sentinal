import { createAgent, toolCallLimitMiddleware, modelCallLimitMiddleware } from 'langchain';
import { DynamicStructuredTool, tool } from '@langchain/core/tools';
import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { z } from 'zod';
import { toolRegistry } from './tool-registry';

export function createSpawnAgentTool(model: BaseChatModel): DynamicStructuredTool {
  // Track the last target URL so sub-agents can be spawned without it
  let lastTargetUrl = '';
  const inferTools = (goal: string): string[] => {
    const g = goal.toLowerCase();
    const tools: string[] = ['http_request'];
    if (g.includes('recon') || g.includes('technology') || g.includes('technolog') || g.includes('infrastructure')) tools.push('tech_detect', 'subdomain_enum', 'dir_bruteforce');
    if (g.includes('vuln') || g.includes('sqli') || g.includes('sql') || g.includes('xss') || g.includes('injection')) tools.push('sql_inject', 'xss_inject', 'header_analyze');
    if (g.includes('exploit') || g.includes('bypass') || g.includes('auth') || g.includes('idor')) tools.push('sql_inject', 'xss_inject', 'exploit_auth_bypass', 'exploit_authz');
    if (g.includes('report') || g.includes('summariz') || g.includes('compil')) tools.push('write_file');
    return [...new Set(tools)];
  };

  return new DynamicStructuredTool({
    name: 'spawn_subagent',
    description: 'Dynamically create a sub-agent with a specific task. Tools are auto-inferred from the goal. The sub-agent runs and returns its findings.',
    schema: z.object({
      name: z.string().optional().describe('A short identifier for this sub-agent (e.g. sqli-scanner, xss-checker). Auto-generated from goal if omitted.'),
      goal: z.string().describe('The specific task for this sub-agent to accomplish. Be detailed about what to do and what output to produce.'),
      toolNames: z.preprocess(
        (val) => {
          if (typeof val === 'string') {
            // Extract JSON array portion if present (LLM sometimes dumps XML/extra text into toolNames)
            const jsonMatch = val.match(/\[.*?\]/);
            if (jsonMatch) {
              try { return JSON.parse(jsonMatch[0]); } catch { /* fall through */ }
            }
            return val.replace(/<[^>]*>/g, '').split(/[ ,;]+/).filter(Boolean);
          }
          return val;
        },
        z.array(z.string()).optional(),
      ).describe('OVERRIDE auto-inferred tools. Only include if you MUST override. Normally leave out — tools are auto-selected from the goal.'),
      targetUrl: z.string().optional().describe('The actual target URL that this sub-agent should test. If omitted, uses the last known target URL.'),
    }),
    func: async (input) => {
      const goal = input.goal;
      const name = input.name || goal.slice(0, 40).replace(/\s+/g, '-').toLowerCase();
      const toolNames = input.toolNames || inferTools(goal);
      const targetUrl = input.targetUrl || lastTargetUrl;
      if (targetUrl) lastTargetUrl = targetUrl;
      if (!targetUrl) return `Error: No target URL provided and no previous target URL known. Include targetUrl in spawn_subagent.`;

      const availableTools = toolRegistry.getAll();
      const toolMap = new Map<string, DynamicStructuredTool>();
      for (const t of availableTools) toolMap.set(t.name, t);

      const grantedTools: DynamicStructuredTool[] = [];
      const missing: string[] = [];
      for (const tn of toolNames) {
        const t = toolMap.get(tn);
        if (t) {
          const dt = t as DynamicStructuredTool;
          const wrapped = tool(
            async (input: Record<string, unknown>) => {
              // Normalize malformed LLM input
              let kwargs = input;
              // LLM sometimes nests all params inside 'body'
              if (typeof kwargs.body === 'object' && kwargs.body && !Array.isArray(kwargs.body)) {
                const bodyObj = kwargs.body as Record<string, unknown>;
                if (bodyObj.url || bodyObj.method) {
                  const { body, ...rest } = kwargs;
                  kwargs = { ...bodyObj, ...rest };
                }
              }
              // Inject targetUrl if url is missing
              if (!kwargs.url && targetUrl) kwargs = { ...kwargs, url: targetUrl };
              return String(await dt.call(kwargs));
            },
            { name: dt.name, description: dt.description, schema: dt.schema as any },
          );
          grantedTools.push(wrapped);
        } else missing.push(tn);
      }

      if (grantedTools.length === 0) {
        return `Error: No valid tools found for sub-agent "${name}". Requested: ${toolNames.join(', ')}. Available: ${Array.from(toolMap.keys()).join(', ')}`;
      }

      const agent = createAgent({
        model,
        tools: grantedTools,
        systemPrompt: [
          `You are a specialized sub-agent: "${name}".`,
          ``,
          `Your goal:`,
          goal,
          ``,
          `CRITICAL: The target URL is ${targetUrl}. Use THIS URL for all requests. Never use example.com, localhost, or any other URL. Only use ${targetUrl}.`,
          ``,
          `You have access to these tools: ${grantedTools.map((t) => t.name).join(', ')}`,
          ``,
          `## Rules`,
          `- Be concise. Stop as soon as you have enough information.`,
          `- Do not repeat tool calls — if a tool returns an error, move on.`,
          `- Return your findings in your final message — include everything you discovered.`,
        ].join('\n'),
        middleware: [
          toolCallLimitMiddleware({ runLimit: 20 }),
          modelCallLimitMiddleware({ runLimit: 15, exitBehavior: 'end' }),
        ],
      });

      try {
        const result = await agent.invoke({
          messages: [{
            role: 'user',
            content: goal,
          }],
        });

        const content = typeof result === 'string' ? result
          : result?.messages?.[result.messages.length - 1]?.content || JSON.stringify(result);

        const toolSummary = grantedTools.map((t) => `  - ${t.name}: ${t.description}`).join('\n');

        return [
          `## Sub-Agent Report: ${name}`,
          ``,
          `**Tools granted:**`,
          toolSummary,
          ``,
          missing.length > 0 ? `**Note:** ${missing.length} requested tools were not found: ${missing.join(', ')}\n\n` : '',
          `**Output:**`,
          String(content).slice(0, 50000),
        ].join('\n');
      } catch (error) {
        return `Sub-agent "${name}" encountered an error: ${error instanceof Error ? error.message : String(error)}`;
      }
    },
  });
}
