import { createInterface } from 'readline';
import { createDeepAgent } from 'deepagents';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { toolRegistry } from '../tools/tool-registry';
import { Logger } from './logger';

const log = new Logger();

function streamThinking(text: string): void {
  const lines = text.split('\n');
  for (const line of lines) {
    process.stdout.write(`\x1b[2m${line}\x1b[0m\n`);
  }
}

export async function startRepl(config: {
  model: BaseChatModel;
  targetUrl: string;
  outputDir: string;
}): Promise<void> {
  const { skillLoader } = await import('../core/skill-loader');

  log.header('Interactive Assault Mode', config.targetUrl);
  log.info('Type messages to guide the agent. The agent has full browser + shell + security tools.');
  log.info('Commands: /skills — list all skills, /skill <name> — load a skill, /help — show commands, /quit — exit');
  log.dim('---');

  const allTools = toolRegistry.getAll();
  const catalog = skillLoader.getCatalog();
  const skillsHelp = catalog ? `\n\nAvailable skills:\n${catalog}` : '';

  const systemPrompt = `You are an autonomous penetration testing agent. You have full control over a browser, shell commands, file system, and security testing tools.

TARGET: ${config.targetUrl}
OUTPUT DIR: ${config.outputDir}

TOOLS AVAILABLE:
- Browser: browser_navigate, browser_click, browser_fill, browser_extract, browser_screenshot, browser_evaluate, browser_close
- Shell: exec_command, read_file, write_file
- Security: sql_inject, xss_inject, ssrf_test, csrf_test, nosql_inject, ssti_test, cmd_inject, xxe_test, jwt_crack, graphql_idor, prototype_pollution, prompt_inject, cookie_analyze, cloud_metadata_enum, s3_bucket_find, payload_search, finding_verify
- Knowledge: load_skill, search_skills, list_skills, kg_query
- Network: http_request, tech_detect

RULES:
- You are in a live interactive chat. The user can see everything.
- Explain what you're doing before each action.
- Show your reasoning briefly, then take action.
- Before using a technique, load the relevant skill with load_skill().
- Write findings to the output directory with write_file.
- When you find a vulnerability, explain the evidence clearly.
- If you need clarification, ask the user.
- Use browser_screenshot to capture visual evidence.
${skillsHelp}`;

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
    if (input === '/help') {
      log.dim('/skills — list all skill files');
      log.dim('/skill <name> — load a skill into view');
      log.dim('/quit — exit');
      log.dim('Anything else — send to the agent as a message');
      rl.prompt();
      continue;
    }
    if (input === '/skills') {
      log.info(skillLoader.getCatalog());
      rl.prompt();
      continue;
    }
    if (input.startsWith('/skill ')) {
      const name = input.slice(7).trim();
      const skill = skillLoader.get(name);
      if (skill) log.info(`\n--- ${skill.name} ---\n${skill.content.slice(0, 3000)}`);
      else log.warn(`Skill not found: ${name}`);
      rl.prompt();
      continue;
    }

    messages.push({ role: 'user', content: input });

    log.dim('Agent thinking...');
    try {
      const result = await agent.invoke({ messages: [...messages] });

      const lastMsg = result.messages?.[result.messages.length - 1];
      const response = typeof lastMsg?.content === 'string' ? lastMsg.content
        : Array.isArray(lastMsg?.content) ? lastMsg.content.map((c: any) => c.text || '').join('')
        : '';

      if (response) {
        process.stdout.write(`\x1b[33mAgent >\x1b[0m ${response}\n`);
        messages.push({ role: 'assistant', content: response });
      }
    } catch (e) {
      log.error(`Error: ${e instanceof Error ? e.message : String(e)}`);
    }

    rl.prompt();
  }
}
