import { Command } from 'commander';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { select, input, confirm, password } from '@inquirer/prompts';
import { providerRegistry, type ProviderConfig } from '../providers/provider-registry';
import { toolRegistry } from '../tools/tool-registry';
import { readAppModel, writeAppModel, type AppModel, type AppModelEndpoint, type AppModelFormField } from '../core/app-model';
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
    const outputDir = config.output?.dir || opts.output || './output';
    const appModelPath = path.join(outputDir, 'app-model.json');
    const orchestrator = new AutonomousOrchestrator({
      model,
      target: { url: config.scan?.target || opts.target } as ScanTarget,
      outputDir,
      format: config.output?.format || opts.format || 'markdown',
      appModelPath,
    });

    const result = await orchestrator.run();

    if (result.reportPath && fs.existsSync(result.reportPath)) {
      log.success(`Assessment complete. Report: ${result.reportPath}`);
    } else {
      log.warn('Assessment finished but no report file was generated.');
      log.warn(`Expected at: ${result.reportPath}`);
    }

    if (opts.ci && result.findings.some((f) => f.severity === 'critical')) {
      process.exit(1);
    }
    process.exit(0);
  });

// ── assess: LLM-driven security assessment ──
program
  .command('assess')
  .description('LLM-driven security assessment — agent navigates, explores, and attacks autonomously')
  .option('-t, --target <url>', 'Target URL')
  .option('-o, --output <dir>', 'Output directory', './output')
  .option('--headless', 'Run browser in headless mode')
  .option('--provider <provider>', 'LLM provider')
  .option('--model <model>', 'Model ID')
  .option('--format <format>', 'Report format (html, json, markdown)')
  .option('--dashboard', 'Start live WebSocket dashboard during assessment')
  .option('--dashboard-port <port>', 'Dashboard port', '3000')
  .option('--with-openapi <path>', 'Path to OpenAPI/Swagger spec to pre-populate endpoints')
  .option('--with-har <path>', 'Path to HAR file to pre-populate endpoints and cookies')
  .option('--with-postman <path>', 'Path to Postman collection to pre-populate endpoints')
  .option('--with-src <path>', 'Path to source code directory to scan for routes and tech stack')
  .option('--depth <n>', 'Max crawl depth for auto-exploration (default 2, 0 to disable)', '2')
  .option('--skip-explore', 'Skip automated workflow exploration phase')
  .action(async (opts) => {
    if (!opts.target) { log.error('No target specified. Use -t <url>'); process.exit(1); }

    const outDir = path.resolve(opts.output);
    fs.mkdirSync(outDir, { recursive: true });
    const target = opts.target.replace(/\/$/, '');
    const appModelPath = path.join(outDir, 'app-model.json');

    // ── Ingest artifacts if provided ──
    const hasArtifacts = opts.withOpenapi || opts.withHar || opts.withPostman || opts.withSrc;
    let initialModel: Partial<import('../core/app-model').AppModel> = {};
    if (hasArtifacts) {
      log.header('Ingesting artifacts', target);
      const { ingestAll } = await import('../ingestion');
      initialModel = ingestAll({
        openapi: opts.withOpenapi,
        har: opts.withHar,
        postman: opts.withPostman,
        sourceDir: opts.withSrc,
      }, target);
      log.info(`Ingested: ${initialModel.endpoints?.length || 0} endpoints, ${Object.keys(initialModel.cookies || {}).length} cookies, ${initialModel.techStack?.length || 0} tech stack items`);
    }

    // ── Create initial app model ──
    const model = {
      target,
      techStack: initialModel.techStack || [],
      auth: { type: 'unknown' as const, loginEndpoint: '', endpoints: [], cookies: {}, tokens: [], sessions: {} },
      workflow: { nodes: [], edges: [] },
      endpoints: initialModel.endpoints || [],
      forms: initialModel.forms || [],
      scripts: [],
      cookies: initialModel.cookies || {},
      localStorage: {},
      findings: [],
      verifications: [],
      parameterClassifications: [],
      authBoundaries: [],
      recordedSessions: {},
      hypotheses: initialModel.hypotheses || [],
      nextSteps: initialModel.nextSteps || ['Navigate to target', 'Build workflow graph', 'Record login flows', 'Probe auth boundaries', 'Classify parameters', 'Test hypotheses'],
      visitedUrls: initialModel.visitedUrls || [],
      oastCallbacks: [],
      coverage: [],
    };
    writeAppModel(appModelPath, model);
    log.info(`App model initialized: ${appModelPath}`);

    // ── Start dashboard if requested ──
    let dashboard: import('../dashboard/server').DashboardServer | undefined;
    let stopDashboard: (() => void) | undefined;
    if (opts.dashboard) {
      const { startDashboard } = await import('../dashboard/server');
      const dashboardPort = parseInt(opts.dashboardPort, 10) || 3000;
      const server = startDashboard(dashboardPort);
      dashboard = server;
      stopDashboard = server.close;
      log.info(`Dashboard: http://localhost:${server.port}`);
    }

    // ── Automated exploration phase ──
    const crawlDepth = parseInt(opts.depth, 10) || 0;
    if (!opts.skipExplore && crawlDepth > 0) {
      log.header('Exploration Phase', 'Auto-mapping workflow graph');
      const { getSharedBrowserManager } = await import('../tools/browser-tools');
      const mgr = getSharedBrowserManager(opts.headless);
      const { runExploration } = await import('../explorer');
      const explored = await runExploration({
        target,
        browserManager: mgr,
        outputDir: outDir,
        maxDepth: crawlDepth,
        maxPages: 30,
        onProgress: (msg: string) => log.dim(`  ${msg}`),
      });
      // Merge exploration data into app model
      const appModel = readAppModel(appModelPath);
      appModel.workflow = { nodes: explored.workflow.nodes, edges: explored.workflow.edges };
      appModel.endpoints = [...(appModel.endpoints || []), ...explored.endpoints];
      appModel.forms = [...(appModel.forms || []), ...explored.forms];
      appModel.authBoundaries = [...(appModel.authBoundaries || []), ...explored.authBoundaries];
      appModel.visitedUrls = [...(appModel.visitedUrls || []), ...explored.visitedUrls];
      appModel.parameterClassifications = [...(appModel.parameterClassifications || []), ...explored.parameterClassifications];
      if (explored.techStack.length > 0) appModel.techStack = [...new Set([...appModel.techStack, ...explored.techStack])];
      if (explored.auth.loginEndpoint && !appModel.auth.loginEndpoint) appModel.auth.loginEndpoint = explored.auth.loginEndpoint;
      if (explored.hypotheses.length > 0) appModel.hypotheses = [...new Set([...appModel.hypotheses, ...explored.hypotheses])];
      writeAppModel(appModelPath, appModel);
      log.success(`Workflow graph: ${explored.workflow.nodes.length} nodes, ${explored.workflow.edges.length} edges, ${explored.endpoints.length} endpoints`);

      // Private app detection
      const { formatAppModelContext } = await import('../core/app-model');
      const ctx = formatAppModelContext(readAppModel(appModelPath));
      if (ctx.isPrivateApp) {
        log.warn(`Private app detected — ${ctx.privateAppReason}`);
        log.info('');
        log.info('Options:');
        log.dim('  1. Continue anyway — agent will try to discover routes and handle auth');
        log.dim('  2. Run interactively instead: ultimatrix interact -t <url>');
        log.dim('     Then use /record to record a login session');
        log.dim('  3. Upload app specs:');
        log.dim('     ultimatrix assess -t <url> --with-openapi ./spec.yaml');
        log.dim('     ultimatrix assess -t <url> --with-har ./session.har');
        log.dim('     ultimatrix assess -t <url> --with-postman ./collection.json');
        log.info('');
        const { confirm } = await import('@inquirer/prompts');
        const proceed = await confirm({ message: 'Continue assessment anyway?', default: true });
        if (!proceed) {
          log.info('Stopping. Re-run with --with-openapi, --with-har, or use `ultimatrix interact` for manual flow.');
          process.exit(0);
        }
      }
    }

    // ── Launch agent ──
    log.header('Assessment', `${target}`);
    if (opts.skipExplore || crawlDepth === 0) {
      log.info('LLM-driven mode: agent navigates, explores, and attacks autonomously');
    } else {
      log.info('LLM-driven mode: agent starts with pre-mapped workflow graph and attacks known endpoints');
    }

    const config = await loadRuntimeConfig({ ...opts });
    const chatModel = await loadModel(config);
    const { AutonomousOrchestrator } = await import('../pipeline/autonomous');
    const orchestrator = new AutonomousOrchestrator({
      model: chatModel,
      target: { url: target } as ScanTarget,
      outputDir: outDir,
      format: opts.format || 'html',
      appModelPath,
      dashboard,
    });

    const result = await orchestrator.run();

    if (stopDashboard) stopDashboard();

    if (fs.existsSync(result.reportPath)) {
      log.success(`Assessment complete. Report: ${result.reportPath}`);
    } else {
      log.warn('Assessment finished but no report file was generated.');
    }

    log.divider();
    log.header('Output', `Artifacts in ${outDir}`);
    log.dim(`  app-model.json — session knowledge graph`);
    log.dim(`  final-security-report.${opts.format || 'html'} — assessment results`);

    await new Promise((r) => setTimeout(r, 500));
    process.exit(0);
  });

// ── learn: Two-phase app flow mapping ──
program
  .command('learn')
  .description('Phase 1: auto-crawl all routes. Phase 2: interactive user workflow recording — generates site-map, HAR, Playwright tests')
  .option('-t, --target <url>', 'Target URL')
  .option('-o, --output <dir>', 'Output directory', './output')
  .option('--headless', 'Run browser in headless mode')
  .option('--depth <n>', 'Crawl depth (default 2)', '2')
  .option('--provider <provider>', 'LLM provider')
  .option('--model <model>', 'Model ID')
  .action(async (opts) => {
    if (!opts.target) { log.error('No target specified. Use -t <url>'); process.exit(1); }

    const outDir = path.resolve(opts.output);
    fs.mkdirSync(outDir, { recursive: true });
    const target = opts.target.replace(/\/$/, '');

    const { getSharedBrowserManager: getMgr } = await import('../tools/browser-tools');
    const mgr = getMgr(opts.headless);

    // ── Phase 1: Spider crawl ──
    log.header('Phase 1: Spider Crawl', target);
    const { SpiderCrawler } = await import('../core/spider');
    const spider = new SpiderCrawler(mgr);
    const crawlResult = await spider.crawl(target, parseInt(opts.depth, 10) || 2);

    // Save spider trace as HAR
    if (crawlResult.trace.length > 0) {
      const { traceToHar } = await import('../flow/build-from-trace');
      fs.writeFileSync(path.join(outDir, 'spider-session.har'), traceToHar(crawlResult.trace));
    }

    // Write site-map
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
    const { fixWriteTodosMiddleware } = await import('../core/fix-todos');
    const { toolRegistry: toolReg } = await import('../tools/tool-registry');
    const config = await loadRuntimeConfig({ ...opts });
    const model = await loadModel(config);

    // Start trace on 'default' session — browser tools default to this
    await mgr.startTrace('default');
    mgr.startRecording('default');

    const allTools = toolReg.getByCategory('browser') as DynamicStructuredTool[];
    const traceTool = toolReg.get('build_flow_from_trace');
    if (traceTool) allTools.push(traceTool);

    const agent = createDeepAgent({
      model,
      tools: allTools,
      middleware: [fixWriteTodosMiddleware],
      systemPrompt: `You are recording a user workflow on ${target}. The browser already has an open session.

Discovered routes (${crawlResult.routes.length}):
${crawlResult.routes.map((r) => `  ${r.path} — ${r.title} (${r.forms} forms, ${r.linkCount} links)`).join('\n')}

${crawlResult.routes.length <= 1 ? '⚠️  Few routes discovered — this may be a private app behind login. Ask the user to navigate to the login page and authenticate.\n' : ''}

RULES:
1. The browser is already on a page. Check the current URL before navigating — only navigate if the user explicitly wants a different page.
2. Use browser_fill to fill inputs, browser_click to click, browser_press_key for keyboard actions (Enter to submit, Escape to close, Tab to navigate).
3. Use browser_extract(type="text") to read visible page content. Avoid dumping raw HTML.
4. After each action, briefly describe what happened in 1 sentence. Do not echo raw tool output.
5. Wait for the user's next instruction after each action.`,
    });

    const { createInterface } = await import('readline');
    const chalk = (await import('chalk')).default;
    const rl = createInterface({ input: process.stdin, output: process.stdout, prompt: chalk.cyan('> ') });

    rl.write(`Session ready. ${crawlResult.totalRoutes} routes crawled. Type actions or /close.\n`);
    rl.write(`  /close       — finish and generate Playwright test file\n`);
    rl.write(`  /record start — start manual browser recording\n`);
    rl.write(`  /record stop  — stop recording and merge steps\n`);
    rl.prompt();

    for await (const line of rl) {
      const input = line.trim();
      if (input === '/close' || input === '/quit') break;
      if (!input) { rl.prompt(); continue; }

      // ── Manual recording in learn phase ──
      if (input.startsWith('/record')) {
        const sub = input.split(/\s+/)[1] || 'start';
        if (sub === 'start') {
          await mgr.startManualRecording('default');
          log.info('Manual recording started. Interact with the visible browser directly. Type /record stop when done.');
        } else if (sub === 'stop') {
          const steps = await mgr.stopManualRecording('default');
          if (steps.length > 0) {
            log.success(`Captured ${steps.length} manual steps.`);
            const summary = steps.map((s, i) => `  ${i + 1}. ${s.type}${s.selector ? ` → ${s.selector}` : ''}${s.value ? ` = "${s.value.slice(0, 60)}"` : ''}${s.url ? ` → ${s.url}` : ''}`).join('\n');
            console.log(summary);
            // Merge into recording
            const existing = mgr.getRecording('default');
            for (const s of steps) existing.push(s);
          } else {
            log.warn('No manual steps captured.');
          }
        } else {
          const steps = mgr.getRecording('default');
          log.info(`Manual recording active: ${steps.length} steps so far.`);
        }
        rl.prompt();
        continue;
      }

      const stream = await agent.stream(
        { messages: [{ role: 'user', content: input }] },
        { streamMode: 'messages', subgraphs: true },
      );

      for await (const [, chunk] of stream) {
        const msg = chunk?.[0];
        if (!msg) continue;
        if (msg.text) process.stdout.write(msg.text);

        if ((msg as any)._getType?.() === 'tool') {
          const result = msg.content;
          const s = typeof result === 'string' ? result.slice(0, 200) : JSON.stringify(result).slice(0, 200);
          if (s?.trim()) process.stdout.write('\n' + colors.dim(`  [${s.replace(/\n/g, ' ').trim()}]\n`));
        }
      }

      process.stdout.write('\n');
      rl.prompt();
    }

    rl.close();
    log.divider();

    // ── Write recorded flow ──
    const userTrace = mgr.stopTrace('default');
    const userSteps = mgr.stopRecording('default');
    if (userTrace.length > 0) {
      const { traceToHar: toHar } = await import('../flow/build-from-trace');
      fs.writeFileSync(path.join(outDir, 'user-session.har'), toHar(userTrace));
    }
    const { generatePlaywrightTest } = await import('../flow/generate-test');
    const { filePath: flowPath } = generatePlaywrightTest({
      steps: userSteps,
      target,
      outputDir: outDir,
      totalRoutes: crawlResult.totalRoutes,
    });

    log.success(`User flow recorded: ${userSteps.length} actions → ${flowPath}`);
    await spider.close();
    await new Promise((r) => setTimeout(r, 500));

    log.header('Mapping Complete', `Artifacts in ${opts.output}`);
    log.dim(`  site-map.json — ${crawlResult.totalRoutes} routes`);
    log.dim(`  site-map.yaml — route tree`);
    log.dim(`  spider-session.har — ${crawlResult.trace.length} network entries`);
    log.dim(`  spider-recording — ${crawlResult.recording.length} steps`);
    log.dim(`  user-session.har — ${userTrace.length} network entries`);
    log.dim(`  user-flow.spec.ts — ${userSteps.length} test steps`);
    process.exit(0);
  });

// ── demo: Quick mock scan ──
program
  .command('demo')
  .description('Run demo assessment (no API key needed)')
  .option('-o, --output <dir>', 'Output directory', './output')
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

// ── interact: Live REPL chat loop ──
program
  .command('interact')
  .description('Live REPL chat loop with the autonomous agent. Type /record start for manual browser recording.')
  .option('-t, --target <url>', 'Target URL')
  .action(async (opts) => {
    const config = await loadRuntimeConfig({ ...opts });
    const model = await loadModel(config);
    const { startRepl } = await import('./repl');
    await startRepl({
      model,
      targetUrl: opts.target || '',
      outputDir: config.output?.dir || './output',
    });
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
              case 'navigate': return `NAV|${s.url}`;
              case 'click': return `CLI|${s.selector}`;
              case 'fill': return `FIL|${s.selector}|${s.value}`;
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

// ── verify: Re-run findings against a new deployment ──
program
  .command('verify')
  .description('Re-run previous findings against a new target deployment to check which vulnerabilities are fixed')
  .option('-a, --app-model <path>', 'Path to existing app-model.json from a previous assessment')
  .option('-t, --target <url>', 'New target URL to verify against')
  .option('-o, --output <dir>', 'Output directory', './verify-output')
  .option('--timeout <ms>', 'Request timeout in ms', '10000')
  .action(async (opts) => {
    if (!opts.appModel || !opts.target) {
      log.error('Both --app-model and --target are required.');
      log.info('  ultimatrix verify -a ./assess-output/app-model.json -t https://new-deployment.com');
      process.exit(1);
    }
    const outDir = path.resolve(opts.output);
    fs.mkdirSync(outDir, { recursive: true });
    log.header('Verification', `Re-running findings against ${opts.target}`);

    const { verifyFindings } = await import('../verification');
    const result = await verifyFindings(opts.appModel, opts.target, outDir, { timeout: parseInt(opts.timeout, 10) || 10000 });

    log.divider();
    log.header('Results', `${result.summary.total} findings verified`);
    log.info(`  ${result.summary.fixed} fixed`);
    log.info(`  ${result.summary.regressed} regressed`);
    log.info(`  ${result.summary.unchanged} unchanged`);

    if (result.summary.regressed > 0) {
      log.warn(`⚠️ ${result.summary.regressed} finding(s) regressed. Check verified-findings.json for details.`);
    }
    log.dim(`Full results: ${path.join(outDir, 'verified-findings.json')}`);
    process.exit(result.summary.regressed > 0 ? 1 : 0);
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
