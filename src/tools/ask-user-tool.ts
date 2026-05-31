import { z } from 'zod';
import { tool } from '@langchain/core/tools';

export function createAskUserTool() {
  return tool(async ({ question }) => {
    return `User acknowledged: "${question}"`;
  }, {
    name: 'ask_user',
    description: 'Ask the user a question and wait for their response. Use this when you need credentials, permission, clarification, or to explain findings.',
    schema: z.object({
      question: z.string().describe('Your question for the user'),
      options: z.array(z.string()).optional().describe('Suggested response options'),
    }),
  });
}
