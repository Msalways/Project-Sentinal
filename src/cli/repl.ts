import { createInterface } from 'readline';
import { createDeepAgent } from 'deepagents';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { toolRegistry } from '../tools/tool-registry';
import { Logger, colors } from './logger';

const log = new Logger();

export async function startRepl(config: {
  model: BaseChatModel;
  targetUrl: string;
  outputDir: string;
}): Promise<void> {
  log.header('Sentinel', config.targetUrl);
  log.dim('---');

  const allTools = toolRegistry.getAll();

  const systemPrompt = `You are a security testing assistant with tools.

Target: ${config.targetUrl}
Output: ${config.outputDir}

Rules:
- When the user asks you to scan or test a target, call tools immediately.
- Always include the target URL or host when calling tools.
- If a tool fails, report the error clearly.`;

  const agent = createDeepAgent({
    model: config.model,
    tools: allTools,
    systemPrompt,
  });

  const messages: Array<{ role: string; content: string }> = [];

  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: '\x1b[36mYou >\x1b[0m ',
  });

  rl.prompt();

  for await (const line of rl) {
    const input = line.trim();
    if (!input) { rl.prompt(); continue; }
    if (input === '/quit') { log.info('Goodbye.'); rl.close(); process.exit(0); }

    messages.push({ role: 'user', content: input });

    const stream = await agent.stream(
      { messages: [...messages] },
      { streamMode: 'messages', subgraphs: true },
    );

    let fullResponse = '';

    for await (const [namespace, chunk] of stream) {
      const msg = chunk?.[0];
      if (!msg) continue;

      if (msg.text) {
        fullResponse += msg.text;
        process.stdout.write(msg.text);
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

    if (fullResponse) {
      messages.push({ role: 'assistant', content: fullResponse });
    }

    rl.prompt();
  }
}
