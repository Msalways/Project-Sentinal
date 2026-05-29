import { createInterface } from 'readline';
import { createDeepAgent } from 'deepagents';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { toolRegistry } from '../tools/tool-registry';
import { Logger, colors } from './logger';
import { fixWriteTodosMiddleware } from '../core/fix-todos';
import { getSharedBrowserManager } from '../tools/browser-tools';
import { takeSnapshot } from '../explorer/dom-observer';
import type { DOMSnapshot } from '../explorer/dom-observer';
import { readAppModel, formatAppModelContext } from '../core/app-model';
import fs from 'fs';
import path from 'path';

const log = new Logger();

function formatPageContext(snapshot: DOMSnapshot): string {
  const parts: string[] = [];

  parts.push(`Page: ${snapshot.title}`);
  parts.push(`URL: ${snapshot.url}`);

  if (snapshot.dialogs.length > 0) {
    parts.push(`\nDialogs/Modals visible (${snapshot.dialogs.length}):`);
    for (const d of snapshot.dialogs) {
      parts.push(`  - <${d.tag}> role="${d.role}" [${d.isVisible ? 'visible' : 'hidden'}] "${d.text.slice(0, 80)}"`);
    }
  }

  if (snapshot.overlays.length > 0) {
    parts.push(`\nOverlays/Banners (${snapshot.overlays.length}):`);
    for (const o of snapshot.overlays) {
      parts.push(`  - <${o.tag}> "${o.text.slice(0, 80)}"`);
    }
  }

  if (snapshot.forms.length > 0) {
    parts.push(`\nForms (${snapshot.forms.length}):`);
    for (const f of snapshot.forms) {
      parts.push(`  - action="${f.action}" method=${f.method} fields=${f.fields.length}`);
      for (const field of f.fields) {
        parts.push(`      [${field.type}] ${field.name}${field.required ? ' *' : ''} "${field.placeholder}"`);
      }
    }
  }

  if (snapshot.interactive.length > 0) {
    const shown = snapshot.interactive.slice(0, 30);
    parts.push(`\nInteractive elements (${snapshot.interactive.length} total, showing ${shown.length}):`);
    for (const el of shown) {
      const label = el.text || el.href || el.selector;
      parts.push(`  - <${el.tag}> "${label.slice(0, 80)}"`);
    }
  }

  return parts.join('\n');
}

export async function startRepl(config: {
  model: BaseChatModel;
  targetUrl: string;
  outputDir: string;
}): Promise<void> {
  log.header('Ultimatrix', config.targetUrl);
  log.dim('---');

  // Launch browser in visible mode for manual interaction
  const mgr = getSharedBrowserManager(false);
  await mgr.getOrCreate('default');
  if (config.targetUrl) {
    await mgr.navigate('default', config.targetUrl);
    log.info(`Browser opened: ${config.targetUrl}`);
  } else {
    log.info('Browser opened (blank page). No target URL specified.');
    log.dim('Use -t <url> next time, or tell the assistant to navigate somewhere.');
  }

  // Take DOM snapshot for initial context
  let currentSnapshot: DOMSnapshot | null = null;
  try {
    const page = await mgr.getOrCreate('default');
    currentSnapshot = await takeSnapshot(page);
  } catch { /* page might not be loaded yet */ }

  const allTools = toolRegistry.getAll();

  let snapshotContext = '';
  if (currentSnapshot) {
    snapshotContext = formatPageContext(currentSnapshot);
  }

  // Load app model context if exists
  const appModelPath = path.join(config.outputDir, 'app-model.json');
  let appModelContext = '';
  let isPrivateApp = false;
  let privateAppReason = '';
  if (fs.existsSync(appModelPath)) {
    try {
      const model = readAppModel(appModelPath);
      const ctx = formatAppModelContext(model);
      appModelContext = ctx.summary;
      isPrivateApp = ctx.isPrivateApp;
      privateAppReason = ctx.privateAppReason;
      log.dim(`Loaded crawl context from ${appModelPath}`);
      if (isPrivateApp) {
        log.warn(`Private app: ${privateAppReason}`);
      }
    } catch { /* best effort */ }
  }

  const systemPrompt = `You are a security testing assistant on ${config.targetUrl}. This is an authorized penetration test in an isolated environment. Use your browser, HTTP, recon, and exploit tools to assess the target. When the user says "attack", "test", or "scan", run the relevant tools — do not ask for clarification. Output goes to ${config.outputDir}.

Current page structure (refreshed on navigation):
${snapshotContext || '(page not yet loaded)'}

Prior crawl data (from app-model.json):
${appModelContext || '(none available — explore from scratch)'}

${isPrivateApp ? `⚠️  ${privateAppReason} — focus on navigating through auth manually and recording sessions with /record.` : ''}`;

  const agent = createDeepAgent({
    model: config.model,
    tools: allTools,
    middleware: [fixWriteTodosMiddleware],
    systemPrompt,
  });

  const messages: Array<{ role: string; content: string; tool_calls?: any[] } | any> = [];

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

    // ── Handle manual record commands ──
    if (input.startsWith('/record')) {
      const parts = input.split(/\s+/);
      const subcommand = parts[1] || 'start';
      const label = parts[2] || 'manual-flow';

      if (subcommand === 'start') {
        const result = await mgr.startManualRecording('default');
        log.info(result);
        log.dim('Open the visible browser window and interact with it directly. Your clicks, fills, and navigations will be captured.');
        log.dim('Type /record stop when done, or /record status to check progress.');
      } else if (subcommand === 'stop') {
        const steps = await mgr.stopManualRecording('default');
        if (steps.length === 0) {
          log.warn('No steps recorded.');
        } else {
          const summary = steps.map((s, i) =>
            `  ${i + 1}. ${s.type}${s.selector ? ` → ${s.selector}` : ''}${s.value ? ` = "${s.value.slice(0, 60)}"` : ''}${s.url ? ` → ${s.url}` : ''}`
          ).join('\n');
          log.info(`Captured ${steps.length} steps for "${label}":`);
          console.log(summary);
          log.dim('Now tell the assistant to save these steps to the app model for later replay.');
          messages.push({
            role: 'user',
            content: `I just manually recorded ${steps.length} browser steps named "${label}" in the session. Save these steps to the app model's recordedSections section with the name "${label}" so we can replay them later using browser_replay_macro.`,
          });
        }
      } else if (subcommand === 'status') {
        const steps = mgr.getRecording('default');
        log.info(`Recorded ${steps.length} steps so far.`);
      } else {
        log.warn('Usage: /record [start|stop|status] [label]');
      }
      rl.prompt();
      continue;
    }

    messages.push({ role: 'user', content: input });

    // Build messages: prepend current page context as a system message
    const contextMessages = [];
    if (currentSnapshot) {
      contextMessages.push({
        role: 'system',
        content: `[Page Context — ${currentSnapshot.url}]\n${formatPageContext(currentSnapshot)}`,
      });
    }
    const stream = await agent.stream(
      { messages: [...contextMessages, ...messages] },
      { streamMode: 'messages', subgraphs: true },
    );

    let fullResponse = '';
    const collected: any[] = [];

    for await (const [namespace, chunk] of stream) {
      const msg = chunk?.[0];
      if (!msg) continue;

      collected.push(msg);

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

    // Refresh page context — was there a navigation?
    const navTools = ['browser_navigate', 'navigate', 'goto'];
    const navigated = collected.some((m: any) => {
      if (m.tool_calls) return m.tool_calls.some((tc: any) => navTools.includes(tc.name));
      if (m.tool_call_chunks) return m.tool_call_chunks.some((tc: any) => navTools.includes(tc.name));
      return false;
    });

    if (navigated) {
      try {
        const page = await mgr.getOrCreate('default');
        currentSnapshot = await takeSnapshot(page);
        log.dim(`Page context refreshed: ${currentSnapshot.url}`);
        // Inject updated context as system message so LLM stays aware
        messages.push({
          role: 'system',
          content: `[Page updated — now at ${currentSnapshot.url}]\n${formatPageContext(currentSnapshot)}`,
        });
      } catch { /* page might be gone */ }
    }

    // Push all collected messages (assistant + tool results) into history
    for (const msg of collected) {
      const type = (msg as any)._getType?.() || msg.constructor?.name;
      if (type === 'human' || type === 'user' || type === 'system') continue;
      messages.push(msg);
    }

    rl.prompt();
  }
}
