import { createMiddleware } from 'langchain';
import { AIMessage } from '@langchain/core/messages';

export const fixWriteTodosMiddleware = createMiddleware({
  name: 'fixWriteTodosMiddleware',
  afterModel: (state) => {
    const messages = state.messages;
    if (!messages?.length) return;
    const lastAiMsg = [...messages].reverse().find((m) => AIMessage.isInstance(m));
    if (!lastAiMsg?.tool_calls?.length) return;
    let patched = false;
    for (const tc of lastAiMsg.tool_calls) {
      if (tc.name !== 'write_todos') continue;
      const args = typeof tc.args === 'string' ? safeParse(tc.args) : tc.args;
      if (!args?.todos) continue;
      for (const todo of args.todos) {
        if (!todo.status) { todo.status = 'pending'; patched = true; }
      }
      if (patched) tc.args = typeof tc.args === 'string' ? JSON.stringify(args) : args;
    }
    if (!patched) return;
    const idx = messages.lastIndexOf(lastAiMsg);
    const msgs = [...messages];
    msgs[idx] = new AIMessage({ ...lastAiMsg, tool_calls: [...lastAiMsg.tool_calls] });
    return { messages: msgs };
  },
});

function safeParse(s: string): any {
  try { return JSON.parse(s); } catch { return {}; }
}
