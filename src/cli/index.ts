import { Command } from 'commander';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { select, input, confirm, password } from '@inquirer/prompts';
import { providerRegistry, type ProviderConfig } from '../providers/provider-registry';
import { toolRegistry } from '../tools/tool-registry';
import { agentRegistry } from '../agents/agent-registry';
import type { LLMProviderName, ScanTarget } from '../core/types';
import yaml from 'js-yaml';
import { Logger, colors } from './logger';
import type { DynamicStructuredTool } from '@langchain/core/tools';

const log = new Logger();

function hasAnyConfig(): boolean {
  const searchPaths = [
    path.join(process.cwd(), 'ultimatrix.yaml'),
    path.join(process.cwd(), 'ultimatrix.json'),
    path.join(os.homedir(), '.config', 'ultimatrix', 'providers.yaml'),
    path.join(os.homedir(), '.config', 'ultimatrix', 'config.yaml'),
  ];
  for (const p of searchPaths) {
    if (fs.existsSync(p)) return true;
  }
  return !!(
    process.env.OPENAI_API_KEY ||
    process.env.OPENROUTER_API_KEY ||
    process.env.ANTHROPIC_API_KEY ||
    process.env.AWS_ACCESS_KEY_ID
  );
}

const program = new Command();

program
  .name('ultimatrix')
  .description('AI-powered security testing')
  .version('2.0.0');

// ── Default: no command → REPL ──
program
  .action(async () => {
    if (!hasAnyConfig()) {
      log.warn('No provider configured. Run `ultimatrix init` or set env vars.');
      log.info('');
      log.info('Quick start:');
      log.dim('  1. ultimatrix init          — interactive setup');
      log.dim('  2. set OPENAI_API_KEY     — or AZURE_OPENAI_API_KEY, ANTHROPIC_API_KEY');
      log.dim('  3. ultimatrix scan -t <url> — run scan with env vars only');
      process.exit(0);
    }

    const config = await loadRuntimeConfig();
    const model = await loadModel(config);
    const { startRepl } = await import('./repl');
    await startRepl({
      model,
      targetUrl: config.scan?.target || '',
      outputDir: config.output?.dir || './output',
    });
  });

// ── init: Interactive config wizard ──
program
  .command('init')
  .description('Interactive setup wizard')
  .action(runInit);

// ── scan: Autonomous security assessment ──
program
  .command('scan')
  .description('Run autonomous security assessment')
  .option('-t, --target <url>', 'Target URL')
  .option('-o, --output <dir>', 'Output directory')
  .option('--provider <provider>', 'LLM provider')
  .option('--model <model>', 'Model ID')
  .option('--format <format>', 'Report format (html, json, markdown)')
  .option('--ci', 'CI/CD mode (exit code 1 on critical)')
  .action(async (opts) => {
    if (!hasAnyConfig() && !opts.provider && !process.env.OPENAI_API_KEY) {
      log.error('No provider configured. Run `ultimatrix init` first.');
      process.exit(1);
    }

    const config = await loadRuntimeConfig({ ...opts });
    if (!config.scan?.target && !opts.target) {
      log.error('No target specified. Use -t <url> or set scan.target in ultimatrix.yaml');
      process.exit(1);
    }

    const model = await loadModel(config);
    const { AutonomousOrchestrator } = await import('../pipeline/autonomous');
    const orchestrator = new AutonomousOrchestrator({
      model,
      target: { url: config.scan?.target || opts.target } as ScanTarget,
      outputDir: config.output?.dir || opts.output || './output',
    });

    const result = await orchestrator.run();
    log.success(`Assessment complete. Report: ${result.reportPath}`);

    if (opts.ci && result.findings.some((f) => f.severity === 'critical')) {
      process.exit(1);
    }
  });

// ── map: Autonomous app flow mapping ──
program
  .command('map')
  .description('Autonomously explore and map the application flow — generates flow.yaml, tests, HAR')
  .option('-t, --target <url>', 'Target URL')
  .option('-o, --output <dir>', 'Output directory', './flow-output')
  .option('--headless', 'Run browser in headless mode')
  .option('--flow-repo <url>', 'Git registry URL for storing/retrieving flow data')
  .option('--provider <provider>', 'LLM provider')
  .option('--model <model>', 'Model ID')
  .action(async (opts) => {
    if (!opts.target) {
      log.error('No target specified. Use -t <url>');
      process.exit(1);
    }

    const config = await loadRuntimeConfig({ ...opts });
    const model = await loadModel(config);

    const { createDeepAgent } = await import('deepagents');
    const { toolRegistry: toolReg } = await import('../tools/tool-registry');

    const allTools: DynamicStructuredTool[] = toolReg.getByCategory('browser') as DynamicStructuredTool[];
    const traceTool = toolReg.get('build_flow_from_trace');
    if (traceTool) allTools.push(traceTool);

    const agent = createDeepAgent({
      model,
      tools: allTools,
      systemPrompt: `You are exploring and mapping a web application.

Goal: navigate through every page, interact with forms, and discover all API endpoints so the app's flow model can be built automatically.

Steps:
1. Start browser_start_trace to capture all network requests
2. Start browser_start_recording to capture user interactions for Playwright test generation
3. Navigate to ${opts.target} with browser_navigate
4. Click every link, fill and submit forms with test data
5. After thorough exploration, call browser_stop_trace and browser_stop_recording
6. Finally, call build_flow_from_trace to generate flow.yaml + flow.json + session.har + Playwright test files

The network trace captures requests, payloads, auth headers automatically. The recording captures click/fill/navigate steps for Playwright code.

Never use example.com — the target is ${opts.target}`,
    });

    log.header('App Flow Mapping', opts.target);

    const stream = await agent.stream(
      { messages: [{ role: 'user', content: `Map the application at ${opts.target}. Start by navigating to it with browser_navigate.` }] },
      { streamMode: 'messages', subgraphs: true },
    );

    for await (const [namespace, chunk] of stream) {
      const msg = chunk?.[0];
      if (!msg) continue;

      if (msg.text) process.stdout.write(msg.text);

      const tcChunks = (msg as any).tool_call_chunks;
      if (tcChunks?.length) {
        for (const tc of tcChunks) {
          if (tc.name) process.stdout.write(colors.dim(`\n→ ${tc.name}\n`));
        }
      }

      if ((msg as any)._getType?.() === 'tool') {
        const result = msg.content;
        const resultStr = typeof result === 'string' ? result.slice(0, 500) : JSON.stringify(result).slice(0, 500);
        if (resultStr?.trim()) process.stdout.write(colors.dim(`  ↳ ${resultStr}\n`));
      }
    }

    log.divider();

    const { LocalRegistry } = await import('../flow/local-registry');
    const registry = new LocalRegistry(opts.target);
    const outDir = path.resolve(opts.output);
    const testDir = path.join(outDir, 'tests');

    const previousModel = registry.loadPrevious();
    const currentJson = path.join(outDir, 'flow.json');
    const currentModel = fs.existsSync(currentJson) ? JSON.parse(fs.readFileSync(currentJson, 'utf-8')) : null;

    if (previousModel && currentModel) {
      const diff = registry.diff(currentModel);

      if (diff.hasChanges) {
        log.info('Changes from previous scan:');
        for (const p of diff.addedPages) log.dim(`  + new page: ${p}`);
        for (const p of diff.removedPages) log.dim(`  - removed: ${p}`);
        for (const p of diff.changedPages) {
          log.dim(`  ~ ${p.path}:`);
          for (const c of p.changes) log.dim(`      ${c}`);
        }
        for (const a of diff.addedApis) log.dim(`  + new API: ${a}`);
        for (const f of diff.impactedFlows) log.dim(`  ↳ impacted: ${f}`);

        const changedPaths = new Set([
          ...diff.addedPages,
          ...diff.changedPages.map(p => p.path),
        ]);

        if (fs.existsSync(testDir)) {
          const registryTests = path.join(registry.path, 'tests');
          const freshTests = fs.readdirSync(testDir).filter(f => f.endsWith('.spec.ts'));
          let restored = 0;
          for (const testFile of freshTests) {
            const pagePath = '/' + testFile.replace(/\.spec\.ts$/, '').replace(/-/g, '/');
            const pageName = testFile.replace('.spec.ts', '');
            const isChanged = changedPaths.has(pagePath) || changedPaths.has('/' + pageName) ||
              Array.from(changedPaths).some(cp => cp.includes(pageName));
            if (!isChanged) {
              const oldTest = path.join(registryTests, testFile);
              if (fs.existsSync(oldTest)) {
                fs.copyFileSync(oldTest, path.join(testDir, testFile));
                restored++;
              }
            }
          }
          if (restored > 0) log.dim(`Restored ${restored} unchanged test files from previous scan`);
        }
      } else {
        log.info('No changes detected — keeping all previous tests.');
        if (fs.existsSync(path.join(registry.path, 'tests'))) {
          const registryTests = path.join(registry.path, 'tests');
          if (fs.existsSync(testDir)) fs.rmSync(testDir, { recursive: true });
          fs.cpSync(registryTests, testDir, { recursive: true });
        }
      }
    }

    if (fs.existsSync(outDir)) {
      fs.mkdirSync(registry.path, { recursive: true });
      const entries = fs.readdirSync(outDir);
      for (const entry of entries) {
        const src = path.join(outDir, entry);
        const dst = path.join(registry.path, entry);
        if (fs.statSync(src).isDirectory()) {
          fs.mkdirSync(dst, { recursive: true });
          for (const child of fs.readdirSync(src)) fs.copyFileSync(path.join(src, child), path.join(dst, child));
        } else {
          fs.copyFileSync(src, dst);
        }
      }
    }

    log.header('Mapping Complete', `Artifacts in ${opts.output}`);
  });

// ── demo: Quick mock scan ──
program
  .command('demo')
  .description('Run demo assessment (no API key needed)')
  .option('-o, --output <dir>', 'Output directory', './demo-output')
  .action(async (opts) => {
    const { createUltimatrix } = await import('../index');
    const ultimatrix = createUltimatrix({ provider: 'mock', apiKey: 'mock' });
    const result = await ultimatrix.demo();
    log.success(`Risk: ${result.riskScore}/100 (${result.riskLevel.toUpperCase()})`);
    log.info(`Findings: ${result.findings.length}`);
    for (const f of result.findings) {
      log.dim(`  [${f.severity.toUpperCase()}] ${f.title}`);
    }
    const reportPath = ultimatrix.generateReport(result, opts.output, 'html');
    log.info(`Report: ${reportPath}`);
  });

// ── providers: List LLM providers ──
program
  .command('providers')
  .description('List available LLM providers')
  .action(() => {
    for (const p of providerRegistry.listAll()) {
      log.info(`${p.name} — ${p.label}`);
      log.dim(`  Env vars: ${p.envVars.join(', ')}`);
    }
  });

// ── tools: List security tools ──
program
  .command('tools')
  .description('List security testing tools')
  .option('-c, --category <category>', 'Filter by category')
  .action((opts) => {
    if (opts.category) {
      const tools = toolRegistry.getByCategory(opts.category);
      for (const tool of tools) log.dim(`  ${tool.name}: ${tool.description}`);
    } else {
      const byCategory = toolRegistry.listByCategory();
      for (const [category, names] of Object.entries(byCategory)) {
        log.info(category);
        for (const name of names) log.dim(`  ${name}`);
      }
    }
  });

// ── agents: List AI agents ──
program
  .command('agents')
  .description('List AI agent roles')
  .action(() => {
    for (const agent of agentRegistry.getAll()) {
      log.info(`${agent.name}: ${agent.description}`);
    }
  });

// ── test: Generate Playwright tests from recorded browser sessions ──
program
  .command('test')
  .description('Generate Playwright tests from recorded browser sessions')
  .option('-s, --session <id>', 'Session ID', 'default')
  .option('-o, --output <dir>', 'Output directory', './playwright-tests')
  .option('--name <name>', 'Workflow name', 'Recorded Workflow')
  .action(async (opts) => {
    const { BrowserSessionManager } = await import('../core/browser-session');
    const { PlaywrightTestGenerator } = await import('../tools/test-generator');
    const mgr = new BrowserSessionManager(false);
    const steps = mgr.getRecording(opts.session);
    if (steps.length === 0) {
      log.error(`No recording found for session "${opts.session}".`);
      log.info('Use the browser recording tools via REPL or agent to record actions first.');
      log.info('  ultimatrix interact -t <url>  — then call browser_start_recording, navigate, click, fill, generate_playwright_test');
      process.exit(1);
    }

    const target = steps.find(s => s.url)?.url || 'http://localhost:3000';
    const manifest = {
      target,
      roles: [{ name: 'default', credentials: {} }],
      workflows: [{
        name: opts.name,
        test: {
          happy: steps.map(s => {
            switch (s.type) {
              case 'navigate': return `Navigate to ${s.url}`;
              case 'click': return `Click ${s.selector}`;
              case 'fill': return `Fill ${s.selector} with "${s.value}"`;
              default: return `${s.type}: ${JSON.stringify(s)}`;
            }
          }),
          sad: [],
        },
      }],
    };

    const generator = new PlaywrightTestGenerator(target);
    const outDir = path.join(opts.output, opts.name.toLowerCase().replace(/[^a-z0-9]/g, '-'));
    fs.mkdirSync(outDir, { recursive: true });
    const generated = generator.generateFromManifest(manifest as any, outDir);

    log.success(`Generated ${generated.length} Playwright test files:`);
    for (const f of generated) log.dim(`  ${f}`);
  });

program.parse();

// ── Core helpers ──

function providerEnvVar(provider: string): string {
  const map: Record<string, string> = {
    openai: 'OPENAI_API_KEY',
    'azure-openai': 'AZURE_OPENAI_API_KEY',
    openrouter: 'OPENROUTER_API_KEY',
    anthropic: 'ANTHROPIC_API_KEY',
    groq: 'GROQ_API_KEY',
    gemini: 'GEMINI_API_KEY',
    together: 'TOGETHER_API_KEY',
    mistral: 'MISTRAL_API_KEY',
    nvidia: 'NVIDIA_API_KEY',
  };
  return map[provider] || 'API_KEY';
}

function providerQuestions(provider: string): Array<{ field: string; question: string; default?: string; secret?: boolean }> {
  const common = [
    { field: 'name', question: 'Model ID', default: 'gpt-4o' },
  ];
  if (provider === 'azure-openai') {
    return [
      { field: 'apiKey', question: 'Azure API Key', secret: true },
      { field: 'endpoint', question: 'Azure endpoint (https://xxx.openai.azure.com)' },
      { field: 'apiVersion', question: 'API version', default: '2024-02-01' },
      ...common,
    ];
  }
  if (provider === 'bedrock') {
    return [
      { field: 'auth', question: 'Auth method (accessKey/iamRole/apiKey)', default: 'accessKey' },
      { field: 'accessKeyId', question: 'AWS Access Key ID' },
      { field: 'secretAccessKey', question: 'AWS Secret Access Key', secret: true },
      { field: 'region', question: 'AWS Region', default: 'us-east-1' },
      ...common,
    ];
  }
  if (provider === 'nvidia') {
    return [
      { field: 'apiKey', question: 'NVIDIA API Key', secret: true },
      { field: 'baseURL', question: 'Base URL (optional for self-hosted)' },
      ...common,
    ];
  }
  return [
    { field: 'apiKey', question: `API Key (or set ${providerEnvVar(provider)})`, secret: true },
    ...common,
  ];
}

async function loadRuntimeConfig(cliOpts?: Record<string, string>): Promise<{ provider: { name: string; [key: string]: any }; scan: { target?: string; headless?: boolean; timeout?: number }; output: { dir: string; format: string } }> {
  const config: any = { provider: {}, scan: {}, output: { dir: './output', format: 'html' } };

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
          // Support old flat format: {"provider": "openai", "model": "gpt-4o", "target": "..."}
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

  // 3. Providers file (secrets)
  const providersPath = path.join(os.homedir(), '.config', 'ultimatrix', 'providers.yaml');
  if (fs.existsSync(providersPath)) {
    try {
      const parsed = yaml.load(fs.readFileSync(providersPath, 'utf-8')) as Record<string, any>;
      if (parsed && config.provider?.name && parsed[config.provider.name]) {
        Object.assign(config.provider, parsed[config.provider.name]);
      }
    } catch {}
  }

  // Normalize: if provider is a string, convert to object
  if (typeof config.provider === 'string') {
    config.provider = { name: config.provider };
  }

  // 4. CLI overrides
  if (cliOpts?.provider) config.provider.name = cliOpts.provider;
  if (cliOpts?.model) config.provider.model = cliOpts.model;
  if (cliOpts?.target) config.scan.target = cliOpts.target;
  if (cliOpts?.output) config.output.dir = cliOpts.output;
  if (cliOpts?.format) config.output.format = cliOpts.format;

  // 5. Env var fallbacks
  if (!config.provider.name) {
    const envProviders: Record<string, string> = {
      OPENAI_API_KEY: 'openai',
      OPENROUTER_API_KEY: 'openrouter',
      ANTHROPIC_API_KEY: 'anthropic',
      AZURE_OPENAI_API_KEY: 'azure-openai',
      GROQ_API_KEY: 'groq',
      GEMINI_API_KEY: 'gemini',
      AWS_ACCESS_KEY_ID: 'bedrock',
    };
    for (const [envKey, providerName] of Object.entries(envProviders)) {
      if (process.env[envKey]) {
        config.provider.name = providerName;
        break;
      }
    }
  }
  if (!config.provider.apiKey && config.provider.name) {
    const envKey = providerEnvVar(config.provider.name);
    if (process.env[envKey]) config.provider.apiKey = process.env[envKey];
  }

  return config;
}

async function loadModel(config: any) {
  const providerName = config.provider?.name;
  const apiKey = config.provider?.apiKey || 'mock';
  const modelId = config.provider?.model || 'gpt-4o';

  if (!providerName || providerName === 'mock' || !apiKey) {
    const { FakeListChatModel } = require('@langchain/core/utils/testing');
    return new FakeListChatModel({ responses: ['Mock mode'] });
  }

  return providerRegistry.create(providerName as LLMProviderName, {
    apiKey,
    modelId,
    azureEndpoint: config.provider?.endpoint,
    azureApiVersion: config.provider?.apiVersion,
    accessKeyId: config.provider?.accessKeyId,
    secretAccessKey: config.provider?.secretAccessKey,
    region: config.provider?.region,
    baseURL: config.provider?.baseURL,
    temperature: config.provider?.temperature,
  } as ProviderConfig);
}

async function runInit() {
  log.header('Ultimatrix Setup', '');

  const provider = await select({
    message: 'LLM Provider',
    choices: [
      { name: 'OpenAI', value: 'openai' },
      { name: 'Azure OpenAI', value: 'azure-openai' },
      { name: 'OpenRouter (multi-model)', value: 'openrouter' },
      { name: 'Anthropic', value: 'anthropic' },
      { name: 'AWS Bedrock', value: 'bedrock' },
      { name: 'Google Gemini', value: 'gemini' },
      { name: 'Groq', value: 'groq' },
      { name: 'Together AI', value: 'together' },
      { name: 'Mistral AI', value: 'mistral' },
      { name: 'NVIDIA NIM', value: 'nvidia' },
    ],
  });

  const questions = providerQuestions(provider);
  const providerConfig: Record<string, string> = {};

  for (const q of questions) {
    const value = q.secret
      ? await password({ message: q.question, mask: true })
      : q.default
        ? await input({ message: q.question, default: q.default })
        : await input({ message: q.question });
    if (value) providerConfig[q.field] = value;
  }

  const target = await input({ message: 'Default target URL (optional)' });
  const output = await input({ message: 'Output directory', default: './output' });
  const saveSecrets = await confirm({ message: 'Save API keys to ~/.config$1ultimatrix$1providers.yaml?', default: true });

  // Write ultimatrix.yaml (project config — no secrets or meta fields)
  const secretsFields = new Set(['apiKey', 'secretAccessKey', 'accessKeyId', 'auth']);
  const modelLine = providerConfig.name ? `  model: ${providerConfig.name}\n` : '';
  const extraLines = Object.entries(providerConfig)
    .filter(([k]) => !secretsFields.has(k) && k !== 'name')
    .map(([k, v]) => `  ${k}: ${v}\n`);
  const ultimatrixYaml = `provider:\n  name: ${provider}\n${modelLine}${extraLines.join('')}scan:\n  target: ${target || ''}\noutput:\n  dir: ${output}\n  format: html\n`;

  fs.writeFileSync(path.join(process.cwd(), 'ultimatrix.yaml'), ultimatrixYaml + '\n');
  log.success('Saved ultimatrix.yaml');

  // Write providers.yaml (secrets — gitignored)
  if (saveSecrets) {
    const secretsDir = path.join(os.homedir(), '.config', 'ultimatrix');
    fs.mkdirSync(secretsDir, { recursive: true });

    let providersData: Record<string, any> = {};
    const existingPath = path.join(secretsDir, 'providers.yaml');
    if (fs.existsSync(existingPath)) {
      try {
        providersData = yaml.load(fs.readFileSync(existingPath, 'utf-8')) as Record<string, any> || {};
      } catch {}
    }

    providersData[provider] = {
      apiKey: providerConfig.apiKey,
      ...(providerConfig.secretAccessKey ? { secretAccessKey: providerConfig.secretAccessKey } : {}),
      ...(providerConfig.accessKeyId ? { accessKeyId: providerConfig.accessKeyId } : {}),
      ...(providerConfig.region ? { region: providerConfig.region } : {}),
    };

    fs.writeFileSync(existingPath, yaml.dump(providersData));
    log.success('Saved API keys to ~/.config/ultimatrix/providers.yaml');
  } else {
    const envVar = providerEnvVar(provider);
    log.warn(`Set ${envVar} env var before running ultimatrix`);
  }

  log.divider();
  log.success('Setup complete. Run \x1b[1multimatrix\x1b[0m to start, or \x1b[1multimatrix scan -t <url>\x1b[0m for autonomous scan');
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
