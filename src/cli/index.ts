#!/usr/bin/env node

import { Command } from 'commander';
import fs from 'fs';
import path from 'path';
import { createSentinel, ScenarioParser, PlaywrightTestGenerator, ReportGenerator, HARParser, toolRegistry, agentRegistry, providerRegistry } from '../index';
import { loadFileConfig, createConfig } from '../core/config';
import type { SentinelConfig, ScanTarget } from '../core/types';

const program = new Command();
const fileConfig = loadFileConfig();

program
  .name('sentinel')
  .description('AI-powered security team-in-a-box')
  .version('2.0.0')
  .option('-c, --config <file>', 'Config file path (default: sentinel.json)');

program.hook('preAction', (thisCommand) => {
  const configPath = thisCommand.opts().config;
  if (configPath) Object.assign(fileConfig, loadFileConfig(configPath));
});

program
  .command('init')
  .description('Initialize sentinel.json config')
  .option('-p, --provider <provider>', 'LLM provider', 'openrouter')
  .option('-m, --model <model>', 'Model ID')
  .option('-e, --endpoint <url>', 'Azure OpenAI endpoint')
  .option('-t, --target <url>', 'Target URL')
  .option('-o, --output <dir>', 'Output directory', './reports')
  .option('-f, --format <format>', 'Report format', 'html')
  .action((opts) => {
    const config = {
      provider: opts.provider,
      model: opts.model,
      target: opts.target,
      output: opts.output,
      format: opts.format,
      headless: true,
      ci: false,
    };
    if (opts.endpoint) config.target = opts.endpoint;

    const outDir = opts.output || '.';
    fs.mkdirSync(outDir, { recursive: true });
    const configFile = path.join(outDir, 'sentinel.json');
    fs.writeFileSync(configFile, JSON.stringify(config, null, 2));
    console.log(`Config saved to ${configFile}`);

    const envVar = opts.provider === 'azure-openai' ? 'AZURE_OPENAI_API_KEY' :
      opts.provider === 'openrouter' ? 'OPENROUTER_API_KEY' :
      opts.provider === 'anthropic' ? 'ANTHROPIC_API_KEY' : 'OPENAI_API_KEY';
    console.log(`Set env: export ${envVar}=your-key`);
  });

program
  .command('learn')
  .description('Record workflows and generate tests')
  .argument('[target]', 'Target URL (from config if omitted)')
  .option('-o, --output <dir>', 'Output directory')
  .action(async (target, opts) => {
    const t = target || (fileConfig.target || undefined);
    if (!t) { console.error('Provide target or set "target" in sentinel.json'); process.exit(1); }

    console.log(`Learning: ${t}`);
    const sentinel = createSentinel();
    try {
      const result = await sentinel.learn(t, opts.output || fileConfig.output || './sentinel-project');
      console.log(`HAR: ${result.harPath}`);
      console.log(`Tests: ${result.testsDir}/`);
      console.log(`Manifest: ${result.manifestPath}`);
    } catch (error) {
      console.error('Failed:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

program
  .command('scan')
  .description('Run security assessment')
  .option('-t, --target <url>', 'Target URL')
  .option('-f, --har <file>', 'HAR file')
  .option('-p, --project <dir>', 'Project directory')
  .option('-s, --scenario <file>', 'Scenario manifest')
  .option('-o, --output <dir>', 'Output directory')
  .option('--format <format>', 'Report format')
  .option('--provider <provider>', 'LLM provider')
  .option('--model <model>', 'Model ID')
  .option('--ci', 'CI/CD mode')
  .action(async (opts) => {
    const apiKey = process.env.OPENROUTER_API_KEY || process.env.OPENAI_API_KEY || process.env.AZURE_OPENAI_API_KEY || process.env.ANTHROPIC_API_KEY || '';
    const provider = (opts.provider || fileConfig.provider || 'openai') as SentinelConfig['provider'];

    const config = createConfig({
      apiKey,
      provider,
      modelId: opts.model || fileConfig.model,
      headless: fileConfig.headless ?? true,
      outputFormat: (opts.format || fileConfig.format || 'html') as 'html',
      outputDir: opts.output || fileConfig.output || '.',
      scopeManifest: opts.scenario || fileConfig.scenario,
    });

    const sentinel = createSentinel(config);
    const target: ScanTarget = {};

    if (opts.project || (fileConfig.project && fileConfig.project !== '')) {
      const projDir = opts.project || fileConfig.project!;
      const harPath = path.join(projDir, 'session.har');
      const scenarioPath = path.join(projDir, 'sentinel.yaml');
      if (fs.existsSync(harPath)) target.harPath = harPath;
      if (fs.existsSync(scenarioPath)) config.scopeManifest = scenarioPath;
      if (fs.existsSync(harPath)) {
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

    if (!apiKey && provider !== 'mock') {
      const envVar = provider === 'openrouter' ? 'OPENROUTER_API_KEY' :
        provider === 'azure-openai' ? 'AZURE_OPENAI_API_KEY' :
        provider === 'anthropic' ? 'ANTHROPIC_API_KEY' : 'OPENAI_API_KEY';
      console.error(`No API key. Set ${envVar}`);
      process.exit(1);
    }

    console.log(`Scanning: ${target.url || 'HAR only'}`);
    console.log(`Provider: ${provider} | Model: ${config.modelId}`);

    try {
      const result = await sentinel.scan(target);
      console.log(`Risk: ${result.riskScore}/100 (${result.riskLevel.toUpperCase()})`);
      console.log(`Findings: ${result.findings.length}`);
      for (const f of result.findings.slice(0, 5)) {
        console.log(`  [${f.severity.toUpperCase()}] ${f.title}`);
      }
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
  .command('test')
  .description('Generate Playwright tests')
  .argument('[target]', 'Target URL')
  .option('-m, --manifest <file>', 'Scenario manifest')
  .option('-o, --output <dir>', 'Output directory')
  .action((target, opts) => {
    const t = target || (fileConfig.target || undefined);
    const manifestPath = opts.manifest || (fileConfig.scenario || undefined);
    if (!manifestPath) { console.error('Set "scenario" in sentinel.json or use --manifest'); process.exit(1); }

    const generator = new PlaywrightTestGenerator(t || 'http://localhost');
    const files = generator.generateFromManifest(ScenarioParser.fromFile(manifestPath), opts.output || './tests');
    console.log('Generated:');
    for (const f of files) console.log(`  ${f}`);
  });

program
  .command('report')
  .description('Generate report from JSON')
  .argument('[input]', 'JSON results file')
  .option('-o, --output <dir>', 'Output directory')
  .option('--format <format>', 'Report format')
  .action((input, opts) => {
    const file = input || path.join((fileConfig.output || '.'), 'scan-result.json');
    if (!fs.existsSync(file)) { console.error(`Not found: ${file}`); process.exit(1); }
    const result = JSON.parse(fs.readFileSync(file, 'utf-8'));
    const generator = new ReportGenerator(result);
    const reportPath = generator.save(opts.output || fileConfig.output || '.', (opts.format || fileConfig.format || 'html') as 'html');
    console.log(`Report: ${reportPath}`);
  });

program
  .command('har')
  .description('Analyze HAR file')
  .argument('[file]', 'HAR file path')
  .action((file) => {
    const f = file || (fileConfig.har || undefined);
    if (!f) { console.error('Set "har" in sentinel.json or provide file path'); process.exit(1); }
    const parser = HARParser.fromFile(f);
    console.log(`URLs: ${parser.getUniqueUrls().length}`);
    console.log(`Endpoints: ${parser.getEndpoints().length}`);
    console.log(`Auth: ${parser.getAuthEndpoints().filter((a) => a.hasAuth).length}`);
    console.log(`No auth: ${parser.getAuthEndpoints().filter((a) => !a.hasAuth).length}`);
    console.log(`Sensitive: ${parser.getSensitiveData().length}`);
    for (const s of parser.getSensitiveData()) {
      console.log(`  [${s.type}] ${s.url}`);
    }
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
      console.log(`  Tools: ${agent.requiredTools.join(', ')}`);
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
