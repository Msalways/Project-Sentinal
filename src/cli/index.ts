#!/usr/bin/env node

import { Command } from 'commander';
import fs from 'fs';
import path from 'path';
import { createSentinel, ScenarioParser, PlaywrightTestGenerator, ReportGenerator, HARParser, toolRegistry, agentRegistry, providerRegistry } from '../index';
import type { SentinelConfig, ScanTarget } from '../core/types';

const program = new Command();

program
  .name('sentinel')
  .description('🛡️ Project Sentinel - AI-powered security team-in-a-box')
  .version('2.0.0');

program
  .command('init')
  .description('Initialize Sentinel configuration')
  .option('-p, --provider <provider>', 'LLM provider (azure-openai, openai, openrouter, anthropic)', 'openai')
  .option('-m, --model <model>', 'Model ID')
  .option('-e, --endpoint <url>', 'Azure OpenAI endpoint')
  .option('-o, --output <dir>', 'Output directory', '.')
  .action((opts) => {
    const config = {
      provider: opts.provider,
      modelId: opts.model || (opts.provider === 'azure-openai' ? 'gpt-4o' : undefined),
      azureEndpoint: opts.endpoint,
    };

    const configFile = path.join(opts.output, 'sentinel.config.json');
    fs.writeFileSync(configFile, JSON.stringify(config, null, 2));
    console.log(`✅ Configuration saved to ${configFile}`);

    const envVar = opts.provider === 'azure-openai' ? 'AZURE_OPENAI_API_KEY' :
      opts.provider === 'openrouter' ? 'OPENROUTER_API_KEY' :
      opts.provider === 'anthropic' ? 'ANTHROPIC_API_KEY' : 'OPENAI_API_KEY';

    console.log(`\nSet your API key: export ${envVar}=your-key`);
  });

program
  .command('learn')
  .description('Record workflows and generate tests + scenario manifest')
  .argument('<target>', 'Target URL to learn')
  .option('-o, --output <dir>', 'Output directory', './sentinel-project')
  .action(async (target, opts) => {
    console.log(`🎯 Learning mode: ${target}`);
    console.log(`📁 Output: ${opts.output}\n`);

    const sentinel = createSentinel();

    try {
      const result = await sentinel.learn(target, opts.output);
      console.log('\n✅ Learning complete!');
      console.log(`  HAR file: ${result.harPath}`);
      console.log(`  Tests: ${result.testsDir}/`);
      console.log(`  Manifest: ${result.manifestPath}`);
      console.log('\nNext: Run "sentinel scan --project ./sentinel-project" to test');
    } catch (error) {
      console.error('❌ Learning failed:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

program
  .command('scan')
  .description('Run full security assessment')
  .option('-t, --target <url>', 'Target URL')
  .option('-f, --har <file>', 'HAR file to analyze')
  .option('-p, --project <dir>', 'Project directory (from learn)')
  .option('-s, --scenario <file>', 'Scenario manifest file')
  .option('--provider <provider>', 'LLM provider', 'openai')
  .option('--model <model>', 'Model ID')
  .option('--endpoint <url>', 'Azure OpenAI endpoint')
  .option('-o, --output <dir>', 'Output directory', '.')
  .option('--format <format>', 'Report format (html, json, markdown)', 'html')
  .option('--headless', 'Run browser in headless mode', true)
  .option('--ci', 'CI/CD mode (exit code 1 on critical vulns)', false)
  .action(async (opts) => {
    const config: Partial<SentinelConfig> = {
      provider: opts.provider as SentinelConfig['provider'],
      modelId: opts.model,
      azureEndpoint: opts.endpoint,
      headless: opts.headless,
    };

    const sentinel = createSentinel(config);
    const target: ScanTarget = {};

    if (opts.project) {
      const harPath = path.join(opts.project, 'session.har');
      const scenarioPath = path.join(opts.project, 'sentinel.yaml');
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

    if (opts.target) target.url = opts.target;
    if (opts.har) target.harPath = opts.har;
    if (opts.scenario) config.scopeManifest = opts.scenario;

    if (!target.url && !target.harPath && !target.harContent) {
      console.error('❌ Provide --target, --har, or --project');
      process.exit(1);
    }

    console.log(`🛡️  Starting security scan...`);
    console.log(`   Target: ${target.url || 'HAR analysis'}`);
    console.log(`   Provider: ${config.provider}`);
    console.log(`   Model: ${config.modelId || 'default'}\n`);

    try {
      const result = await sentinel.scan(target);

      console.log('\n📊 Results:');
      console.log(`   Risk Score: ${result.riskScore}/100 (${result.riskLevel.toUpperCase()})`);
      console.log(`   Findings: ${result.findings.length}`);
      console.log(`   Critical: ${result.findings.filter((f) => f.severity === 'critical').length}`);
      console.log(`   High: ${result.findings.filter((f) => f.severity === 'high').length}`);
      console.log(`   Medium: ${result.findings.filter((f) => f.severity === 'medium').length}`);
      console.log(`   Low: ${result.findings.filter((f) => f.severity === 'low').length}`);

      if (result.findings.length > 0) {
        console.log('\n🔍 Top Findings:');
        for (const finding of result.findings.slice(0, 5)) {
          console.log(`   [${finding.severity.toUpperCase()}] ${finding.title}`);
          console.log(`     Location: ${finding.location}`);
        }
      }

      const reportPath = sentinel.generateReport(result, opts.output, opts.format as 'html' | 'json' | 'markdown');
      console.log(`\n📄 Report saved: ${reportPath}`);

      if (opts.ci && result.riskLevel === 'critical') {
        console.log('\n❌ CI/CD gate: Critical vulnerabilities found');
        process.exit(1);
      }
    } catch (error) {
      console.error('❌ Scan failed:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

program
  .command('demo')
  .description('Run demo with mock data (no API key needed)')
  .option('-o, --output <dir>', 'Output directory', '.')
  .option('--format <format>', 'Report format (html, json, markdown)', 'html')
  .action(async (opts) => {
    console.log('🛡️  Project Sentinel - Demo Mode\n');

    const sentinel = createSentinel({ provider: 'mock', apiKey: 'mock' });
    const result = await sentinel.demo();

    console.log('📊 Demo Results:');
    console.log(`   Risk Score: ${result.riskScore}/100 (${result.riskLevel.toUpperCase()})`);
    console.log(`   Findings: ${result.findings.length}`);
    console.log(`   Agents Used: ${result.metadata.agentsUsed.join(', ')}`);

    if (result.findings.length > 0) {
      console.log('\n🔍 Findings:');
      for (const finding of result.findings) {
        console.log(`   [${finding.severity.toUpperCase()}] ${finding.title}`);
      }
    }

    const reportPath = sentinel.generateReport(result, opts.output, opts.format as 'html' | 'json' | 'markdown');
    console.log(`\n📄 Report saved: ${reportPath}`);
  });

program
  .command('test')
  .description('Generate Playwright tests from scenario manifest')
  .argument('<target>', 'Target URL')
  .option('-m, --manifest <file>', 'Scenario manifest file')
  .option('-o, --output <dir>', 'Output directory', './tests')
  .action((target, opts) => {
    let manifest;
    if (opts.manifest) {
      manifest = ScenarioParser.fromFile(opts.manifest);
    } else {
      console.error('❌ Provide --manifest with scenario file');
      process.exit(1);
    }

    const generator = new PlaywrightTestGenerator(target);
    const files = generator.generateFromManifest(manifest, opts.output);

    console.log('✅ Generated Playwright tests:');
    for (const file of files) console.log(`   ${file}`);
  });

program
  .command('report')
  .description('Generate report from JSON results')
  .argument('<input>', 'JSON results file')
  .option('-o, --output <dir>', 'Output directory', '.')
  .option('--format <format>', 'Report format (html, json, markdown)', 'html')
  .action((input, opts) => {
    const content = fs.readFileSync(input, 'utf-8');
    const result = JSON.parse(content);
    const generator = new ReportGenerator(result);
    const reportPath = generator.save(opts.output, opts.format as 'html' | 'json' | 'markdown');
    console.log(`📄 Report saved: ${reportPath}`);
  });

program
  .command('har')
  .description('Analyze a HAR file')
  .argument('<file>', 'HAR file path')
  .option('-f, --format <format>', 'Output format (json, text)', 'text')
  .action((file, opts) => {
    const parser = HARParser.fromFile(file);

    if (opts.format === 'json') {
      const analysis = {
        urls: parser.getUniqueUrls(),
        endpoints: parser.getEndpoints(),
        authEndpoints: parser.getAuthEndpoints(),
        sensitiveData: parser.getSensitiveData(),
        graph: parser.buildDependencyGraph(),
      };
      console.log(JSON.stringify(analysis, null, 2));
    } else {
      console.log(`📊 HAR Analysis:`);
      console.log(`   Unique URLs: ${parser.getUniqueUrls().length}`);
      console.log(`   Endpoints: ${parser.getEndpoints().length}`);
      console.log(`   Auth endpoints: ${parser.getAuthEndpoints().filter((a) => a.hasAuth).length}`);
      console.log(`   Unauthenticated: ${parser.getAuthEndpoints().filter((a) => !a.hasAuth).length}`);
      console.log(`   Sensitive data: ${parser.getSensitiveData().length}`);

      const sensitive = parser.getSensitiveData();
      if (sensitive.length > 0) {
        console.log('\n⚠️  Sensitive Data Found:');
        for (const s of sensitive) {
          console.log(`   [${s.type}] ${s.url} - ${s.value.slice(0, 50)}...`);
        }
      }
    }
  });

program
  .command('tools')
  .description('List available security tools')
  .option('-c, --category <category>', 'Filter by category')
  .action((opts) => {
    if (opts.category) {
      const tools = toolRegistry.getByCategory(opts.category);
      console.log(`\n🔧 Tools in category "${opts.category}":`);
      for (const tool of tools) console.log(`   - ${tool.name}: ${tool.description}`);
    } else {
      console.log('\n🔧 Available Security Tools:');
      const byCategory = toolRegistry.listByCategory();
      for (const [category, names] of Object.entries(byCategory)) {
        console.log(`\n  ${category}:`);
        for (const name of names) console.log(`    - ${name}`);
      }
    }
  });

program
  .command('agents')
  .description('List available security agents')
  .action(() => {
    console.log('\n🤖 Available Security Agents:');
    for (const agent of agentRegistry.getAll()) {
      console.log(`\n  ${agent.name}`);
      console.log(`    Description: ${agent.description}`);
      console.log(`    Tools: ${agent.requiredTools.join(', ')}`);
      console.log(`    Tags: ${agent.tags.join(', ')}`);
    }
  });

program
  .command('providers')
  .description('List available LLM providers')
  .action(() => {
    console.log('\n🧠 Available LLM Providers:');
    for (const provider of providerRegistry.listAll()) {
      console.log(`\n  ${provider.name} (${provider.label})`);
      console.log(`    Required env: ${provider.envVars.join(', ')}`);
    }
  });

program.parse();
