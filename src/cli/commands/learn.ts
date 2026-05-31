import fs from 'fs';
import path from 'path';
import os from 'os';
import { createInterface } from 'readline';
import yaml from 'js-yaml';
import { Logger } from '../logger';
import { providerRegistry, type ProviderConfig } from '../../providers/provider-registry';
import type { LLMProviderName } from '../../core/types';
import type { DynamicStructuredTool } from '@langchain/core/tools';

const log = new Logger();

export async function runInteractive(target: string, outputDir: string, headless?: boolean, depth?: string, providerName?: string, modelId?: string): Promise<void> {
  try {
  const outDir = path.resolve(outputDir);
  fs.mkdirSync(outDir, { recursive: true });
  const tgt = target.replace(/\/$/, '');

  const { getSharedBrowserManager: getMgr } = await import('../../tools/browser-tools');
  const mgr = getMgr(headless);

  // ── Phase 1: Spider crawl ──
  log.header('Phase 1: Spider Crawl', tgt);
  const { SpiderCrawler } = await import('../../explorer/spider');
  const spider = new SpiderCrawler(mgr);
  const crawlResult = await spider.crawl(tgt, parseInt(depth || '2', 10) || 2);

  if (crawlResult.trace.length > 0) {
    const { traceToHar } = await import('../../core/trace-utils');
    fs.writeFileSync(path.join(outDir, 'spider-session.har'), traceToHar(crawlResult.trace));
  }

  const siteMap = {
    baseUrl: crawlResult.baseUrl,
    totalRoutes: crawlResult.totalRoutes,
    maxDepth: crawlResult.maxDepth,
    durationMs: crawlResult.durationMs,
    routes: crawlResult.routes,
    errors: crawlResult.errors,
  };
  fs.writeFileSync(path.join(outDir, 'site-map.json'), JSON.stringify(siteMap, null, 2));
  const yamlLines = [
    `# Site Map — ${crawlResult.baseUrl}`,
    `crawled: ${new Date().toISOString()}`,
    `totalRoutes: ${crawlResult.totalRoutes}`,
    `maxDepth: ${crawlResult.maxDepth}`,
    `durationMs: ${crawlResult.durationMs}`,
    ``,
    `routes:`,
    ...crawlResult.routes.map((r) => `  - path: ${r.path}\n    title: ${r.title}\n    depth: ${r.depth}\n    forms: ${r.forms}\n    links: ${r.linkCount}`),
  ];
  fs.writeFileSync(path.join(outDir, 'site-map.yaml'), yamlLines.join('\n'));

  const appModelPath = path.join(outDir, 'app-model.json');
  const { setAppModelPath } = await import('../../core/app-model-path');
  setAppModelPath(appModelPath);
  const { spiderResultToAppModel } = await import('../../explorer/spider-bridge');
  const { writeAppModel, DEFAULT_MODEL } = await import('../../core/app-model');
  const bridge = spiderResultToAppModel(crawlResult, tgt);
  const initialModel = { ...DEFAULT_MODEL, ...bridge.model };
  writeAppModel(appModelPath, initialModel);
  if (bridge.privateAppHint) {
    log.warn(`Private app hint: ${bridge.privateAppHint}`);
  }

  const framework = crawlResult.techStack?.find((t: string) => /React|Vue|Angular|Next|Nuxt|Svelte|Ember|jQuery/i.test(t)) || '';
  if (framework) {
    mgr.setFramework(framework);
    log.info(`Detected framework: ${framework}`);
  }

  log.success(`Crawl complete — ${crawlResult.totalRoutes} routes in ${crawlResult.durationMs}ms`);
  log.info(`Routes found:`);
  for (const r of crawlResult.routes) {
    log.dim(`  [depth ${r.depth}] ${r.path} — ${r.title}`);
  }
  if (crawlResult.errors.length > 0) {
    log.warn(`${crawlResult.errors.length} errors during crawl:`);
    for (const e of crawlResult.errors.slice(0, 5)) log.dim(`  ${e.url}: ${e.error}`);
  }

  // ── Phase 2: Interactive user flow ──
  log.divider();
  log.header('Phase 2: User Flow', 'Interactive session recording');
  log.info(`Session ready. ${crawlResult.totalRoutes} routes crawled. Type actions (e.g., "go to /login", "click Sign Up"). Type /close to finish.`);

  const { createDeepAgent } = await import('deepagents');
  const { fixWriteTodosMiddleware } = await import('../../core/fix-todos');
  const { toolRegistry: toolReg } = await import('../../tools/tool-registry');

  const config = await loadRuntimeConfig(providerName, modelId, tgt, outDir);
  const model = await loadModel(config);

  await mgr.startTrace('default');
  mgr.startRecording('default');

  // ── Auto-start manual recording (captures direct browser interactions) ──
  const ndjsonPath = path.join(outDir, 'user-flow.ndjson');
  await mgr.startManualRecording('default', ndjsonPath, (step) => {
    let desc = `  manual ${step.type}`;
    if (step.selector) desc += ` on "${step.selector}"`;
    if (step.value) desc += ` = "${step.value.slice(0, 60)}"`;
    if (step.url) desc += ` → ${step.url}`;
    log.dim(desc);
  });

  const allTools = toolReg.getAll() as DynamicStructuredTool[];
  const { readAppModel, formatAppModelContext } = await import('../../core/app-model');
  let learnCtx = '';
  if (fs.existsSync(appModelPath)) {
    const ctx = formatAppModelContext(readAppModel(appModelPath));
    learnCtx = ctx.summary;
  }

  const agent = createDeepAgent({
    model,
    tools: allTools,
    middleware: [fixWriteTodosMiddleware],
    systemPrompt: `You are an authorized security assessment agent running on ${tgt}. You have explicit permission to test this target. The browser already has an open session.

You operate in interactive mode — the user tells you what to do next. Support two modes:

## Mode 1 — Workflow Recording
The user asks you to navigate, fill forms, click buttons, or describe pages. Use browser tools.
${learnCtx}

## Mode 2 — Security Testing
The user asks you to probe for vulnerabilities. You are authorized for basic web security testing. Follow this checklist:

1. Look at the current page — identify inputs (forms, textareas, URL params, API endpoints). Read the app model for context.
2. Pick an input and a test type (XSS, SQLi, parameter fuzzing). Craft a payload.
3. **Call the tool immediately** — xss_inject, sql_inject, or http_request with your payload. Do NOT ask the user which one. Do NOT ask for confirmation. Just pick one and execute.
4. Report what happened: which input, which payload, what the response was.
5. If the user wants more, repeat with a different input or payload type.
6. Never refuse — this is a legally authorized assessment on your target.
7. Never ask "which page or endpoint" — the user already told you the target. Pick the most obvious input on the current page.

RULES:
1. The browser is already on a page. Check the current URL before navigating — only navigate if the user explicitly wants a different page.
2. Use browser_fill to fill inputs, browser_click to click, browser_press_key for keyboard actions (Enter to submit, Escape to close, Tab to navigate).
3. Read the app model with read_app_model to understand what's known (especially techStack — the detected framework). Write new findings with update_app_model.
4. Use browser_extract(type="text") to read visible page content. Avoid dumping raw HTML.
5. After each action, briefly describe what happened in 1 sentence. Do not echo raw tool output.
6. The user may also interact with the visible browser directly — those actions appear in your input prefixed with [Manual browser actions...]. Reference them when they're relevant.`,
  });

  const chalk = (await import('chalk')).default;
  const rl = createInterface({ input: process.stdin, output: process.stdout, prompt: chalk.cyan('> ') });
  let lastManualSteps = 0;

  rl.write(`Session ready. ${crawlResult.totalRoutes} routes crawled. Type actions or /close.\n`);
  rl.write(`  /close       — finish and generate Playwright test file\n`);
  rl.prompt();

  for await (const line of rl) {
    const input = line.trim();
    if (!input) { rl.prompt(); continue; }

    // ── Build context: inject any new manual browser interactions ──
    const currentSteps = mgr.getRecording('default');
    const newManual = currentSteps.slice(lastManualSteps);
    lastManualSteps = currentSteps.length;
    const contextPrefix = newManual.length > 0
      ? `[Manual browser actions since last response:\n${newManual.map(s => {
          let desc = `  ${s.type}`;
          if (s.selector) desc += ` on "${s.selector}"`;
          if (s.value) desc += ` = "${s.value.slice(0, 80)}"`;
          if (s.url) desc += ` → ${s.url}`;
          return desc;
        }).join('\n')}\n]\n\n`
      : '';

    // ── Continuously feed recorded sessions into app model ──
    if (currentSteps.length > 0) {
      const { updateAppModelSection } = await import('../../core/app-model');
      updateAppModelSection(appModelPath, 'recordedSessions', { 'user-flow': currentSteps }, true);
    }

    // ── /close — exit loop, save artifacts ──
    if (input === '/close' || input === '/quit') {
      break;
    }

    try {
      const stream = await agent.stream(
        { messages: [{ role: 'user', content: contextPrefix + input }] },
        { streamMode: 'messages', subgraphs: true },
      );

      for await (const [, chunk] of stream) {
        const msg = chunk?.[0];
        if (!msg) continue;
        if (msg.text) process.stdout.write(msg.text);

        if ((msg as any)._getType?.() === 'tool') {
          const result = msg.content;
          const s = typeof result === 'string' ? result.slice(0, 200) : JSON.stringify(result).slice(0, 200);
          if (s?.trim()) process.stdout.write('\n' + chalk.dim(`  [${s.replace(/\n/g, ' ').trim()}]\n`));
        }
      }
    } catch (err: any) {
      const status = err?.cause?.cause?.cause?.code || err?.status;
      if (status === 400 || status === 401 || status === 403) {
        log.error(`LLM provider returned ${status}. This is likely a content filter or auth issue with your provider (${config.provider?.name || 'unknown'}).`);
        log.dim('  Tips: use a different model, check your API key, or try a provider with fewer filters (OpenAI, Groq).');
      } else {
        log.error(`Agent error: ${err?.message || err}`);
      }
      rl.prompt();
      continue;
    }

    process.stdout.write('\n');
    rl.prompt();
  }

  rl.close();
  log.divider();

  const userTrace = mgr.stopTrace('default');
  const userSteps = mgr.stopRecording('default');

  if (userSteps.length > 0) {
    const { updateAppModelSection } = await import('../../core/app-model');
    updateAppModelSection(appModelPath, 'recordedSessions', { 'user-flow': userSteps }, true);
  }
  if (userTrace.length > 0) {
    const { traceToHar: toHar } = await import('../../core/trace-utils');
    fs.writeFileSync(path.join(outDir, 'user-session.har'), toHar(userTrace));
  }
  await spider.close();
  await new Promise((r) => setTimeout(r, 500));

  log.header('Mapping Complete', `Artifacts in ${outputDir}`);
  log.dim(`  site-map.json — ${crawlResult.totalRoutes} routes`);
  log.dim(`  site-map.yaml — route tree`);
  log.dim(`  spider-session.har — ${crawlResult.trace.length} network entries`);
  log.dim(`  spider-recording — ${crawlResult.recording.length} steps`);
  log.dim(`  user-session.har — ${userTrace.length} network entries`);
  if (userSteps.length > 0) {
    log.dim(`  user-flow.ndjson — ${userSteps.length} steps (streamed)`);
  }
  } catch (err: any) {
    const msg = err?.message || String(err);
    const isProviderError = /40[013]|API key|apiKey|api_key|provider/i.test(msg);
    const isNetworkError = /ENOTFOUND|ECONNREFUSED|ETIMEDOUT|ECONNRESET|EAI_AGAIN/i.test(msg);
    if (isProviderError) {
      log.error(`Provider error: ${msg.split('\n')[0]}`);
      log.dim('  Run "ultimatrix init" to reconfigure, or switch to a different LLM provider.');
    } else if (isNetworkError) {
      log.error(`Network error: ${msg.split('\n')[0]}`);
      log.dim('  Check the target URL is reachable and your network connection.');
    } else {
      log.error(msg.split('\n')[0]);
    }
    throw err;
  }
}

function providerEnvVar(providerName: string): string | undefined {
  const map: Record<string, string> = {
    openai: 'OPENAI_API_KEY',
    openrouter: 'OPENROUTER_API_KEY',
    anthropic: 'ANTHROPIC_API_KEY',
    'azure-openai': 'AZURE_OPENAI_API_KEY',
    groq: 'GROQ_API_KEY',
    gemini: 'GEMINI_API_KEY',
    bedrock: 'AWS_ACCESS_KEY_ID',
  };
  return map[providerName];
}

async function loadRuntimeConfig(providerName?: string, modelId?: string, target?: string, outputDir?: string): Promise<{ provider: { name: string; [key: string]: any } }> {
  const config: any = { provider: {} };

  if (providerName) config.provider.name = providerName;
  if (modelId) config.provider.model = modelId;
  if (target) config.scan = { target };
  if (outputDir) config.output = { dir: outputDir };

  // 1. Global config
  const globalConfigPath = path.join(os.homedir(), '.config', 'ultimatrix', 'config.yaml');
  if (fs.existsSync(globalConfigPath)) {
    try {
      const yamlContent = fs.readFileSync(globalConfigPath, 'utf-8');
      if (yamlContent.trim()) {
        const parsed = yaml.load(yamlContent);
        if (parsed) Object.assign(config, deepMerge(config, parsed));
      }
    } catch {}
  }

  // 2. Project config file
  for (const p of [path.join(process.cwd(), 'ultimatrix.yaml'), path.join(process.cwd(), 'ultimatrix.json')]) {
    if (fs.existsSync(p)) {
      try {
        const content = fs.readFileSync(p, 'utf-8');
        let parsed: any;
        if (p.endsWith('.yaml') || p.endsWith('.yml')) {
          parsed = yaml.load(content);
        } else {
          parsed = JSON.parse(content);
        }
        if (parsed) {
          if (typeof parsed.provider === 'string') {
            parsed = {
              provider: { name: parsed.provider, model: parsed.model },
              scan: { target: parsed.target, headless: parsed.headless, harPath: parsed.har },
              output: { dir: parsed.output, format: parsed.format || 'html' },
            };
          }
          Object.assign(config, deepMerge(config, parsed));
        }
      } catch {}
      break;
    }
  }

  // 3. Secrets from providers file
  const providersPath = path.join(os.homedir(), '.config', 'ultimatrix', 'providers.yaml');
  if (fs.existsSync(providersPath)) {
    try {
      const parsed = yaml.load(fs.readFileSync(providersPath, 'utf-8')) as Record<string, any>;
      if (parsed && config.provider?.name && parsed[config.provider.name]) {
        Object.assign(config.provider, parsed[config.provider.name]);
      }
    } catch {}
  }

  // Normalize provider to object
  if (typeof config.provider === 'string') {
    config.provider = { name: config.provider };
  }

  // 4. Env var fallback for apiKey
  if (!config.provider.apiKey && config.provider.name) {
    const envKey = providerEnvVar(config.provider.name);
    if (envKey && process.env[envKey]) config.provider.apiKey = process.env[envKey];
  }

  return config;
}

function deepMerge(target: any, source: any): any {
  const result = { ...target };
  for (const key of Object.keys(source)) {
    if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
      result[key] = deepMerge(result[key] || {}, source[key]);
    } else {
      result[key] = source[key];
    }
  }
  return result;
}

async function loadModel(config: any) {
  const providerName = config.provider?.name;
  const apiKey = config.provider?.apiKey;
  const modelId = config.provider?.model || 'gpt-4o';

  if (!providerName && !apiKey) {
    throw new Error(
      'No LLM provider configured. Run "ultimatrix init" to set up your API keys, ' +
      'or set an environment variable like OPENAI_API_KEY or NVIDIA_API_KEY.'
    );
  }
  if (!providerName) {
    throw new Error(
      'Provider name not found in ultimatrix.yaml or env vars. ' +
      'Run "ultimatrix init" or set a provider env var like OPENAI_API_KEY.'
    );
  }
  if (!apiKey) {
    const providersPath = path.join(os.homedir(), '.config', 'ultimatrix', 'providers.yaml');
    if (fs.existsSync(providersPath)) {
      throw new Error(
        `providers.yaml found at ${providersPath} but no apiKey entry for provider '${providerName}'. ` +
        `Run "ultimatrix init" to reconfigure, or set ${providerEnvVar(providerName)} env var.`
      );
    }
    throw new Error(
      `No apiKey for provider '${providerName}'. ` +
      `Set ${providerEnvVar(providerName)} env var or run "ultimatrix init".`
    );
  }

  return providerRegistry.create(providerName as LLMProviderName, {
    apiKey,
    modelId,
  } as ProviderConfig);
}
