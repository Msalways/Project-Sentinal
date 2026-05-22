#!/usr/bin/env node

import { Command } from 'commander';
import fs from 'fs';
import path from 'path';
import { select, input, confirm } from '@inquirer/prompts';
import { createSentinel, ScenarioParser, PlaywrightTestGenerator, ReportGenerator, HARParser, toolRegistry, agentRegistry, providerRegistry } from '../index';
import { loadFileConfig, createConfig } from '../core/config';
import { LLMTestGenerator } from '../tools/llm-test-generator';
import { StatusDisplay } from './status-display';
import type { SentinelConfig, ScanTarget } from '../core/types';

const program = new Command();
const fileConfig = loadFileConfig();

program
  .name('sentinel')
  .description('AI-powered security team-in-a-box')
  .version('2.0.0')
  .option('-c, --config <file>', 'Config file path');

program.hook('preAction', (thisCommand) => {
  const configPath = thisCommand.opts().config;
  if (configPath) Object.assign(fileConfig, loadFileConfig(configPath));
});

async function resolveApiKey(): Promise<string> {
  return process.env.OPENROUTER_API_KEY || process.env.OPENAI_API_KEY || process.env.AZURE_OPENAI_API_KEY || process.env.ANTHROPIC_API_KEY || '';
}

async function interactiveMenu() {
  console.log('\n🛡️  Project Sentinel\n');

  const action = await select({
    message: 'What would you like to do?',
    choices: [
      { name: '🔍 Demo — Run mock scan (no API key)', value: 'demo' },
      { name: '🎯 Learn — Record workflows from your app', value: 'learn' },
      { name: '🛡️  Scan — Run security assessment', value: 'scan' },
      { name: '📝 Test — Generate Playwright tests', value: 'test' },
      { name: '📊 Analyze — Inspect a HAR file', value: 'har' },
      { name: '🔧 Tools — List security tools', value: 'tools' },
      { name: '🤖 Agents — List AI agents', value: 'agents' },
      { name: '⚙️  Setup — Configure sentinel.json', value: 'setup' },
      { name: '❌ Exit', value: 'exit' },
    ],
  });

  switch (action) {
    case 'demo': await runDemo(); break;
    case 'learn': await runLearn(); break;
    case 'scan': await runScan(); break;
    case 'test': await runTest(); break;
    case 'har': await runHar(); break;
    case 'tools': runTools(); break;
    case 'agents': runAgents(); break;
    case 'setup': await runSetup(); break;
    case 'exit': process.exit(0); break;
  }

  const again = await confirm({ message: 'Go back to menu?', default: true });
  if (again) await interactiveMenu();
}

async function runDemo() {
  const format = await select({
    message: 'Report format?',
    choices: [
      { name: 'HTML', value: 'html' },
      { name: 'JSON', value: 'json' },
      { name: 'Markdown', value: 'markdown' },
    ],
    default: fileConfig.format || 'html',
  });

  const output = await input({
    message: 'Output directory?',
    default: fileConfig.output || './reports',
  });

  const sentinel = createSentinel({ provider: 'mock', apiKey: 'mock' });
  const result = await sentinel.demo();

  console.log(`\nRisk: ${result.riskScore}/100 (${result.riskLevel.toUpperCase()})`);
  console.log(`Findings: ${result.findings.length}`);
  for (const f of result.findings) console.log(`  [${f.severity.toUpperCase()}] ${f.title}`);

  const reportPath = sentinel.generateReport(result, output, format as 'html');
  console.log(`\nReport: ${reportPath}`);
}

async function runLearn() {
  const target = await input({
    message: 'Target URL?',
    default: fileConfig.target || '',
  });

  if (!target) { console.log('Target required'); return; }

  const output = await input({
    message: 'Output directory?',
    default: fileConfig.output || './sentinel-project',
  });

  console.log(`\nLearning: ${target}`);
  const sentinel = createSentinel();

  try {
    const result = await sentinel.learn(target, output);
    console.log(`HAR: ${result.harPath}`);
    console.log(`Tests: ${result.testsDir}/`);
    console.log(`Manifest: ${result.manifestPath}`);
  } catch (error) {
    console.error('Failed:', error instanceof Error ? error.message : error);
  }
}

async function runScan() {
  const apiKey = await resolveApiKey();
  const provider = (fileConfig.provider || 'openrouter') as SentinelConfig['provider'];

  if (!apiKey && provider !== 'mock') {
    const hasKey = await confirm({ message: `No ${provider} API key found. Run with mock provider?`, default: false });
    if (!hasKey) { console.log('Set env: OPENROUTER_API_KEY or OPENAI_API_KEY'); return; }
  }

  const mode = await select({
    message: 'Scan mode?',
    choices: [
      { name: 'Use config defaults', value: 'config' },
      { name: 'Specify target URL', value: 'url' },
      { name: 'Use HAR file', value: 'har' },
      { name: 'Use project directory', value: 'project' },
    ],
  });

  let target: ScanTarget = {};
  let scanProvider = provider;

  if (mode === 'url') {
    target.url = await input({ message: 'Target URL?', default: fileConfig.target || '' });
  } else if (mode === 'har') {
    target.harPath = await input({ message: 'HAR file path?', default: fileConfig.har || '' });
  } else if (mode === 'project') {
    const projDir = await input({ message: 'Project directory?', default: fileConfig.project || '' });
    const harPath = path.join(projDir, 'session.har');
    if (fs.existsSync(harPath)) {
      target.harPath = harPath;
      const parser = HARParser.fromFile(harPath);
      const entries = parser.getEntries();
      if (entries.length > 0) {
        const url = new URL(entries[0].request.url);
        target.url = `${url.protocol}//${url.hostname}`;
      }
    }
  } else {
    target.url = fileConfig.target || undefined;
    target.harPath = fileConfig.har || undefined;
  }

  if (!target.url && !target.harPath) {
    console.log('No target configured. Set "target" or "har" in sentinel.json');
    return;
  }

  const format = await select({
    message: 'Report format?',
    choices: [
      { name: 'HTML', value: 'html' },
      { name: 'JSON', value: 'json' },
      { name: 'Markdown', value: 'markdown' },
    ],
    default: fileConfig.format || 'html',
  });

  const output = await input({
    message: 'Output directory?',
    default: fileConfig.output || './reports',
  });

  const config = createConfig({
    apiKey: apiKey || 'mock',
    provider: apiKey ? scanProvider : 'mock',
    modelId: fileConfig.model,
    outputFormat: format as 'html',
    outputDir: output,
  });

  const sentinel = createSentinel(config);
  console.log(`\nScanning: ${target.url || 'HAR only'}`);
  console.log(`Provider: ${config.provider} | Model: ${config.modelId}`);

  const status = new StatusDisplay();
  const agentNames = agentRegistry.listNames();
  status.init(agentNames);

  sentinel.pipeline.events.on((event) => status.handleEvent(event));

  try {
    const result = await sentinel.scan(target);
    status.printFinalSummary(result.findings);
    console.log(`\nRisk: ${result.riskScore}/100 (${result.riskLevel.toUpperCase()})`);
    console.log(`Findings: ${result.findings.length}`);
    for (const f of result.findings.slice(0, 10)) {
      console.log(`  [${f.severity.toUpperCase()}] ${f.title} (confidence: ${f.confidence}%)`);
    }
    const reportPath = sentinel.generateReport(result, output, format as 'html');
    console.log(`\nReport: ${reportPath}`);
  } catch (error) {
    status.stopSpinner();
    console.error('Scan failed:', error instanceof Error ? error.message : error);
  }
}

async function runTest() {
  const apiKey = await resolveApiKey();
  const provider = (fileConfig.provider || 'openrouter') as SentinelConfig['provider'];

  const mode = await select({
    message: 'Generate tests from?',
    choices: [
      { name: 'HAR file (LLM generates real tests)', value: 'har' },
      { name: 'Scenario manifest', value: 'manifest' },
    ],
  });

  const target = await input({
    message: 'Target URL?',
    default: fileConfig.target || 'http://localhost',
  });

  let harFile = '';
  let manifestFile = '';

  if (mode === 'har') {
    harFile = await input({ message: 'HAR file path?', default: fileConfig.har || '' });
    if (!harFile || !fs.existsSync(harFile)) { console.log('HAR file not found'); return; }
  } else {
    manifestFile = await input({ message: 'Scenario manifest path?', default: fileConfig.scenario || '' });
    if (!manifestFile || !fs.existsSync(manifestFile)) { console.log('Manifest not found'); return; }
  }

  const output = await input({
    message: 'Output directory?',
    default: fileConfig.output || './tests',
  });

  if (!apiKey || provider === 'mock') {
    console.log('No API key — using static generator');
    if (harFile) {
      const manifest = ScenarioParser.fromHar(harFile, target);
      const generator = new PlaywrightTestGenerator(target);
      const files = generator.generateFromManifest(manifest, output);
      console.log('Generated:');
      for (const f of files) console.log(`  ${f}`);
    } else {
      const generator = new PlaywrightTestGenerator(target);
      const files = generator.generateFromManifest(ScenarioParser.fromFile(manifestFile), output);
      console.log('Generated:');
      for (const f of files) console.log(`  ${f}`);
    }
    return;
  }

  console.log(`Generating tests with ${provider}...`);
  const model = await providerRegistry.create(provider, {
    apiKey,
    modelId: fileConfig.model || 'openai/gpt-4o',
  });

  const generator = new LLMTestGenerator(model, target);
  const result = harFile
    ? await generator.generateFromHar(harFile, output)
    : await generator.generateFromManifest(ScenarioParser.fromFile(manifestFile), output);

  if (result.newFiles.length > 0) {
    console.log('\nNew tests:');
    for (const f of result.newFiles) console.log(`  + ${f}`);
  }
  if (result.updatedFiles.length > 0) {
    console.log('\nUpdated tests:');
    for (const f of result.updatedFiles) console.log(`  ~ ${f}`);
  }
  if (result.staleFiles.length > 0) {
    console.log('\nStale tests (marked):');
    for (const f of result.staleFiles) console.log(`  ! ${f}`);
  }
  if (result.preservedFiles.length > 0) {
    console.log(`\nPreserved: ${result.preservedFiles.length} tests unchanged`);
  }
  console.log(`\nTotal: ${result.files.length} test files`);
}

async function runHar() {
  const harFile = await input({
    message: 'HAR file path?',
    default: fileConfig.har || '',
  });

  if (!harFile || !fs.existsSync(harFile)) { console.log('File not found'); return; }

  const parser = HARParser.fromFile(harFile);
  console.log(`\nURLs: ${parser.getUniqueUrls().length}`);
  console.log(`Endpoints: ${parser.getEndpoints().length}`);
  console.log(`Auth: ${parser.getAuthEndpoints().filter((a) => a.hasAuth).length}`);
  console.log(`No auth: ${parser.getAuthEndpoints().filter((a) => !a.hasAuth).length}`);
  console.log(`Sensitive: ${parser.getSensitiveData().length}`);

  const sensitive = parser.getSensitiveData();
  if (sensitive.length > 0) {
    console.log('\nSensitive data:');
    for (const s of sensitive) console.log(`  [${s.type}] ${s.url}`);
  }
}

function runTools() {
  const byCategory = toolRegistry.listByCategory();
  for (const [category, names] of Object.entries(byCategory)) {
    console.log(`\n${category}:`);
    for (const name of names) console.log(`  - ${name}`);
  }
}

function runAgents() {
  for (const agent of agentRegistry.getAll()) {
    console.log(`\n${agent.name}`);
    console.log(`  ${agent.description}`);
    console.log(`  Suggested tools: ${agent.suggestedTools.join(', ')}`);
  }
}

async function runSetup() {
  console.log('\n⚙️  Sentinel Setup\n');

  const provider = await select({
    message: 'LLM provider?',
    choices: [
      { name: 'OpenRouter (multi-model)', value: 'openrouter' },
      { name: 'OpenAI', value: 'openai' },
      { name: 'Azure OpenAI', value: 'azure-openai' },
      { name: 'Anthropic', value: 'anthropic' },
    ],
    default: (fileConfig.provider === 'mock' ? 'openrouter' : fileConfig.provider) || 'openrouter',
  });

  const model = await input({
    message: 'Model ID?',
    default: fileConfig.model || (provider === 'openrouter' ? 'openai/gpt-4o' : 'gpt-4o'),
  });

  const target = await input({
    message: 'Target URL (optional)?',
    default: fileConfig.target || '',
  });

  const har = await input({
    message: 'HAR file path (optional)?',
    default: fileConfig.har || '',
  });

  const output = await input({
    message: 'Output directory?',
    default: fileConfig.output || './reports',
  });

  const config = {
    provider: provider as SentinelConfig['provider'],
    model,
    target: target || '',
    har: har || '',
    project: '',
    scenario: '',
    output,
    format: 'html',
    headless: true,
    ci: false,
  };

  fs.writeFileSync('sentinel.json', JSON.stringify(config, null, 2));
  console.log('\n✅ Saved to sentinel.json');

  const envVar = provider === 'openrouter' ? 'OPENROUTER_API_KEY' :
    provider === 'azure-openai' ? 'AZURE_OPENAI_API_KEY' :
    provider === 'anthropic' ? 'ANTHROPIC_API_KEY' : 'OPENAI_API_KEY';
  console.log(`Set env: $env:${envVar} = "your-key"`);
}

program
  .action(async () => {
    await interactiveMenu();
  });

program
  .command('init')
  .description('Initialize sentinel.json config')
  .option('-p, --provider <provider>', 'LLM provider', 'openrouter')
  .option('-m, --model <model>', 'Model ID')
  .option('-t, --target <url>', 'Target URL')
  .option('-o, --output <dir>', 'Output directory', './reports')
  .action(async (opts) => {
    const config = {
      provider: opts.provider as SentinelConfig['provider'],
      model: opts.model,
      target: opts.target || '',
      har: '',
      project: '',
      scenario: '',
      output: opts.output,
      format: 'html',
      headless: true,
      ci: false,
    };
    fs.mkdirSync(opts.output, { recursive: true });
    fs.writeFileSync(path.join(opts.output, 'sentinel.json'), JSON.stringify(config, null, 2));
    console.log(`Config saved to ${opts.output}/sentinel.json`);
  });

program
  .command('scan')
  .description('Run security assessment')
  .option('-t, --target <url>', 'Target URL')
  .option('-f, --har <file>', 'HAR file')
  .option('-p, --project <dir>', 'Project directory')
  .option('-o, --output <dir>', 'Output directory')
  .option('--format <format>', 'Report format')
  .option('--provider <provider>', 'LLM provider')
  .option('--model <model>', 'Model ID')
  .option('--preset <preset>', 'Scan preset (quick, full, api, auth)')
  .option('--ci', 'CI/CD mode')
  .action(async (opts) => {
    const apiKey = await resolveApiKey();
    const provider = (opts.provider || fileConfig.provider || 'openai') as SentinelConfig['provider'];

    const presets: Record<string, { agents: string[]; tools: string[]; desc: string }> = {
      quick: { agents: ['web-agent', 'auth-agent'], tools: [], desc: 'Web + auth only' },
      full: { agents: [], tools: [], desc: 'All agents, all tools' },
      api: { agents: ['api-agent', 'auth-agent'], tools: [], desc: 'API + auth focus' },
      auth: { agents: ['auth-agent', 'exploit-agent'], tools: [], desc: 'Auth bypass + exploit' },
    };

    const preset = opts.preset ? presets[opts.preset] : null;
    if (preset) console.log(`Preset: ${opts.preset} (${preset.desc})`);

    const config = createConfig({
      apiKey: apiKey || 'mock',
      provider: apiKey ? provider : 'mock',
      modelId: opts.model || fileConfig.model,
      outputFormat: (opts.format || fileConfig.format || 'html') as 'html',
      outputDir: opts.output || fileConfig.output || '.',
    });

    const sentinel = createSentinel(config);
    const target: ScanTarget = {};

    if (opts.project || (fileConfig.project && fileConfig.project !== '')) {
      const projDir = opts.project || fileConfig.project!;
      const harPath = path.join(projDir, 'session.har');
      if (fs.existsSync(harPath)) {
        target.harPath = harPath;
        const parser = HARParser.fromFile(harPath);
        const entries = parser.getEntries();
        if (entries.length > 0) {
          const url = new URL(entries[0].request.url);
          target.url = `${url.protocol}//${url.hostname}`;
        }
      }
    }

    target.url = opts.target || (fileConfig.target || undefined);
    target.harPath = opts.har || (fileConfig.har || undefined);

    if (!target.url && !target.harPath && !target.harContent) {
      console.error('Set "target" or "har" in sentinel.json, or use --target/--har');
      console.error('Example: {"target": "https://your-app.com", "har": "session.har"}');
      process.exit(1);
    }

    console.log(`Scanning: ${target.url || 'HAR only'}`);
    console.log(`Provider: ${config.provider} | Model: ${config.modelId}`);

    try {
      const result = await sentinel.scan(target);
      console.log(`Risk: ${result.riskScore}/100 (${result.riskLevel.toUpperCase()})`);
      console.log(`Findings: ${result.findings.length}`);
      for (const f of result.findings.slice(0, 5)) console.log(`  [${f.severity.toUpperCase()}] ${f.title}`);
      const reportPath = sentinel.generateReport(result, config.outputDir, config.outputFormat);
      console.log(`Report: ${reportPath}`);
      if ((opts.ci || fileConfig.ci) && result.riskLevel === 'critical') {
        console.log('CI gate: critical vulns found');
        process.exit(1);
      }
    } catch (error) {
      console.error('Scan failed:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

program
  .command('demo')
  .description('Run demo (no API key)')
  .option('-o, --output <dir>', 'Output directory')
  .option('--format <format>', 'Report format')
  .action(async (opts) => {
    const sentinel = createSentinel({ provider: 'mock', apiKey: 'mock' });
    const result = await sentinel.demo();
    console.log(`Risk: ${result.riskScore}/100 (${result.riskLevel.toUpperCase()})`);
    console.log(`Findings: ${result.findings.length}`);
    for (const f of result.findings) console.log(`  [${f.severity.toUpperCase()}] ${f.title}`);
    const reportPath = sentinel.generateReport(result, opts.output || (fileConfig.output || '.'), (opts.format || fileConfig.format || 'html') as 'html');
    console.log(`Report: ${reportPath}`);
  });

program
  .command('tools')
  .description('List security tools')
  .option('-c, --category <category>', 'Filter by category')
  .action((opts) => {
    if (opts.category) {
      const tools = toolRegistry.getByCategory(opts.category);
      console.log(`Tools in "${opts.category}":`);
      for (const tool of tools) console.log(`  - ${tool.name}: ${tool.description}`);
    } else {
      const byCategory = toolRegistry.listByCategory();
      for (const [category, names] of Object.entries(byCategory)) {
        console.log(`\n${category}:`);
        for (const name of names) console.log(`  - ${name}`);
      }
    }
  });

program
  .command('agents')
  .description('List AI agents')
  .action(() => {
    for (const agent of agentRegistry.getAll()) {
      console.log(`\n${agent.name}`);
      console.log(`  ${agent.description}`);
      console.log(`  Suggested tools: ${agent.suggestedTools.join(', ')}`);
    }
  });

program
  .command('providers')
  .description('List LLM providers')
  .action(() => {
    for (const p of providerRegistry.listAll()) {
      console.log(`${p.name} (${p.label}) — env: ${p.envVars.join(', ')}`);
    }
  });

program.parse();
