import { DynamicStructuredTool } from '@langchain/core/tools';
import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { createDeepAgent } from 'deepagents';
import { z } from 'zod';
import { toolRegistry } from './tool-registry';

export function createSpawnAgentTool(model: BaseChatModel): DynamicStructuredTool {
  return new DynamicStructuredTool({
    name: 'spawn_subagent',
    description: 'Dynamically create a sub-agent with specific tools and a task goal. Returns the sub-agent\'s complete output.',
    schema: z.object({
      name: z.string().describe('A short identifier for this sub-agent (e.g. sqli-scanner, xss-checker)'),
      goal: z.string().describe('The specific task for this sub-agent to accomplish. Be detailed about what to do and what output to produce.'),
      toolNames: z.array(z.string()).describe('List of tool names this sub-agent can use. Pick only tools relevant to the task — do NOT give it tools it does not need.'),
      targetUrl: z.string().describe('The actual target URL that this sub-agent should test. Must be the real target URL — never a placeholder or example.com.'),
      maxSteps: z.number().optional().default(30).describe('Maximum number of steps for the sub-agent before it must return'),
    }),
    func: async (input) => {
      const { name, goal, toolNames, targetUrl, maxSteps } = input;

      const availableTools = toolRegistry.getAll();
      const toolMap = new Map<string, DynamicStructuredTool>();
      for (const t of availableTools) toolMap.set(t.name, t);

      const grantedTools: DynamicStructuredTool[] = [];
      const missing: string[] = [];
      for (const tn of toolNames) {
        const t = toolMap.get(tn);
        if (t) grantedTools.push(t);
        else missing.push(tn);
      }

      if (grantedTools.length === 0) {
        return `Error: No valid tools found for sub-agent "${name}". Requested: ${toolNames.join(', ')}. Available: ${Array.from(toolMap.keys()).join(', ')}`;
      }

      const agent = createDeepAgent({
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
          `Focus only on your assigned task. Do not deviate. When you have completed the goal, provide a clear summary of what you found.`,
          `Maximum steps: ${maxSteps}`,
        ].join('\n'),
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
