import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';

export function createWriteTodosTool(): DynamicStructuredTool {
  return new DynamicStructuredTool({
    name: 'write_todos',
    description: 'Track and update task todos for the current assessment. Use to set up a plan, mark items complete, or update status.',
    schema: z.object({
      todos: z.array(z.object({
        content: z.string(),
        status: z.enum(['pending', 'in_progress', 'completed', 'cancelled']).default('pending'),
        priority: z.enum(['high', 'medium', 'low']).optional(),
      })).optional().describe('Array of todo items to set'),
      content: z.string().optional().describe('A single todo item text (alternative to todos array)'),
      status: z.enum(['pending', 'in_progress', 'completed', 'cancelled']).optional().describe('Status when using single content field'),
      priority: z.enum(['high', 'medium', 'low']).optional().describe('Priority when using single content field'),
    }),
    func: async (input) => {
      const { todos, content, status, priority } = input;
      const items = todos || (content ? [{ content, status: status || 'pending', priority }] : []);
      if (items.length === 0) return 'No todos to track.';
      const summary = items.map((t: any, i: number) => `  ${i + 1}. [${t.status}] ${t.content}${t.priority ? ` (${t.priority})` : ''}`).join('\n');
      return `Todos updated (${items.length} items):\n${summary}`;
    },
  });
}
