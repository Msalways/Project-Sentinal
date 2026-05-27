import { z } from 'zod';
import { tool, DynamicStructuredTool } from '@langchain/core/tools';
import fs from 'fs';
import path from 'path';
import { type TraceEntry, type MacroStep } from '../core/browser-session';
import { getSharedBrowserManager } from '../tools/browser-tools';
import type { AppFlowModel, AppPage, AppApi, AuthModel, PageForm, FormField } from './flow-model';

function getBrowserManager() { return getSharedBrowserManager(); }

/** Parent directory of a pathname — `/users/1` → `/users`, `/users` → `/` */
function parentPath(pathname: string): string {
  const segs = pathname.split('/').filter(Boolean);
  if (segs.length <= 1) return '/';
  return '/' + segs.slice(0, -1).join('/');
}

function safeName(pathname: string): string {
  const segs = pathname.split('/').filter(Boolean);
  const name = segs.length > 0 ? segs[segs.length - 1] : 'root';
  return name.replace(/[^a-z0-9]/gi, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') || 'root';
}

function groupStepsByPage(steps: MacroStep[]): Array<{ page: string; steps: MacroStep[] }> {
  const groups: Array<{ page: string; steps: MacroStep[] }> = [];
  let currentGroup: MacroStep[] = [];
  let currentPage = '/';
  for (const step of steps) {
    if (step.type === 'navigate' && step.url) {
      if (currentGroup.length > 0) groups.push({ page: currentPage, steps: currentGroup });
      try { currentPage = parentPath(new URL(step.url).pathname); } catch { currentPage = '/'; }
      currentGroup = [step];
    } else { currentGroup.push(step); }
  }
  if (currentGroup.length > 0) groups.push({ page: currentPage, steps: currentGroup });
  return groups;
}

export function createBuildFlowFromTraceTool(): DynamicStructuredTool {
  return tool(async (input) => {
    const { sessionId, targetUrl, appName, outputDir } = input;
    const mgr = getBrowserManager();
    // Auto-stop trace if still running (LLM often forgets)
    try { mgr.stopTrace(sessionId); } catch { /* ok */ }
    const trace = mgr.getTrace(sessionId);
    if (trace.length === 0) return 'No trace data found. Start browser_start_trace before navigating, then call this after browser_stop_trace.';

    const target = targetUrl || extractBaseUrl(trace) || 'http://localhost:3000';
    const name = appName || new URL(target).hostname;
    const out = outputDir || './flow-output';
    fs.mkdirSync(out, { recursive: true });

    const pages = buildPages(trace, target);
    const apis = buildApis(trace, target);
    const auth = detectAuth(trace);
    const summary = {
      totalPages: pages.length, totalApis: apis.length, totalFlows: 0,
      authPages: pages.filter(p => p.auth !== 'public').length,
      formsFound: pages.reduce((s, p) => s + p.forms.length, 0),
      endpointsDetected: apis.length,
    };
    const model: AppFlowModel = {
      appName: name, baseUrl: target, version: '1.0.0', generatedAt: new Date().toISOString(),
      pages, apis, auth, flows: [], summary,
    };

    const artifacts: string[] = [];
    const yamlPath = path.join(out, 'flow.yaml');
    fs.writeFileSync(yamlPath, toYaml(model)); artifacts.push(yamlPath);
    const jsonPath = path.join(out, 'flow.json');
    fs.writeFileSync(jsonPath, JSON.stringify(model, null, 2)); artifacts.push(jsonPath);
    const harPath = path.join(out, 'session.har');
    fs.writeFileSync(harPath, traceToHar(trace)); artifacts.push(harPath);

    let testSteps = mgr.getRecording(sessionId);
    if (testSteps.length === 0) {
      try { testSteps = mgr.stopRecording(sessionId); } catch { /* ok */ }
    }
    if (testSteps.length > 0) {
      const { PlaywrightTestGenerator } = await import('../tools/test-generator');
      const testDir = path.join(out, 'tests');
      fs.mkdirSync(testDir, { recursive: true });
      const pageGroups = groupStepsByPage(testSteps);
      const workflows = pageGroups.map(g => ({
        name: safeName(g.page),
        test: { happy: g.steps.map(s => {
          switch (s.type) {
            case 'navigate': return `NAV|${s.url}`;
            case 'click': return `CLI|${s.selector}`;
            case 'fill': return `FIL|${s.selector}|${s.value}`;
            default: return `${s.type}`;
          }
        }), sad: [] },
      }));
      const generator = new PlaywrightTestGenerator(target);
      const files = generator.generateFromManifest({ target, roles: [{ name: 'default', credentials: {} }], workflows } as any, testDir);
      artifacts.push(...files);
    }

    const pageList = pages.map(p => `  [${p.type}] ${p.path} — ${p.title}`).join('\n');
    const apiList = apis.slice(0, 20).map(a => `  ${a.method} ${a.path}`).join('\n');
    return [
      `Built flow model for "${name}" from ${trace.length} trace entries.`,
      `Pages: ${summary.totalPages} | APIs: ${summary.totalApis} | Forms: ${summary.formsFound} | Auth: ${auth.type}`,
      `Artifacts in ${out}:`, ...artifacts.map(f => `  - ${f}`), '',
      'Pages:', pageList, '', 'APIs:', apiList,
    ].join('\n');
  }, {
    name: 'build_flow_from_trace',
    description: 'Automatically build the app flow model from captured network trace + action recording. Start browser_start_trace + browser_start_recording, navigate, then browser_stop_trace + browser_stop_recording, then call this. Generates flow.yaml, flow.json, session.har, and Playwright .spec.ts tests.',
    schema: z.object({
      sessionId: z.string().default('default'),
      targetUrl: z.string().optional().describe('Base target URL (auto-detected from trace if omitted)'),
      appName: z.string().optional().describe('Application name'),
      outputDir: z.string().optional().describe('Output directory for generated artifacts'),
      existingTestDir: z.string().optional().describe('Directory with existing per-page .spec.ts files for incremental updates (unchanged pages are skipped)'),
      changedPaths: z.array(z.string()).optional().default([]).describe('Page paths that changed — only these will regenerate tests. Empty = regenerate all.'),
    }),
  });
}

function extractBaseUrl(trace: TraceEntry[]): string {
  const nav = trace.find(e => e.type === 'navigation' && e.status === 200);
  if (nav) {
    try {
      const u = new URL(nav.url);
      return `${u.protocol}//${u.host}`;
    } catch {}
  }
  return '';
}

function buildPages(trace: TraceEntry[], baseUrl: string): AppPage[] {
  const pageMap = new Map<string, AppPage>();

  for (const entry of trace) {
    if (entry.type !== 'navigation') continue;
    try {
      const u = new URL(entry.url);
      if (!urlMatches(u, baseUrl)) continue;
      const page = parentPath(u.pathname);

      if (!pageMap.has(page)) {
        pageMap.set(page, {
          path: page,
          title: '',
          type: 'page',
          auth: 'public',
          forms: [],
          transitions: [],
          actions: [],
          detectedEndpoints: [],
        });
      }
    } catch {}
  }

  const navOrder: string[] = trace.filter(e => e.type === 'navigation').map(e => {
    try { return parentPath(new URL(e.url).pathname); } catch { return ''; }
  }).filter(Boolean);

  for (let i = 1; i < navOrder.length; i++) {
    const from = navOrder[i - 1];
    const to = navOrder[i];
    const fromPage = pageMap.get(from);
    if (fromPage && from !== to) {
      const exists = fromPage.transitions.some(t => t.to === to);
      if (!exists) {
        fromPage.transitions.push({
          trigger: 'navigation',
          from,
          to,
          method: 'GET',
          endpoint: to,
          requiresAuth: false,
        });
      }
    }
  }

  const seenForms = new Set<string>();
  for (const entry of trace) {
    if (entry.type !== 'form' && entry.method !== 'POST') continue;
    const sourcePage = extractPath(entry.sourcePage);
    const page = pageMap.get(sourcePage) || pageMap.get('/');
    if (!page) continue;

    try {
      const u = new URL(entry.url);
      if (!urlMatches(u, baseUrl)) continue;
      const formKey = `${entry.method}:${u.pathname}`;
      if (seenForms.has(formKey)) continue;
      seenForms.add(formKey);

      const body = entry.requestBody || '';
      const fields: FormField[] = [];
      if (body.includes('=')) {
        const pairs = body.split('&');
        for (const pair of pairs) {
          const [k] = pair.split('=');
          if (k) fields.push({ name: decodeURIComponent(k), type: 'text', required: false });
        }
      }
      if (body.startsWith('{')) {
        try {
          const parsed = JSON.parse(body);
          for (const k of Object.keys(parsed)) {
            fields.push({ name: k, type: typeof parsed[k], required: false });
          }
        } catch {}
      }

      page.forms.push({
        action: u.pathname,
        method: entry.method,
        fields,
      });
    } catch {}
  }

  return Array.from(pageMap.values());
}

function buildApis(trace: TraceEntry[], baseUrl: string): AppApi[] {
  const seen = new Set<string>();
  const apis: AppApi[] = [];

  for (const entry of trace) {
    if (entry.type !== 'xhr' && entry.type !== 'fetch') continue;
    try {
      const u = new URL(entry.url);
      if (!urlMatches(u, baseUrl)) continue;
      const key = `${entry.method}:${u.pathname}`;
      if (seen.has(key)) continue;
      seen.add(key);

      const headers = Object.keys(entry.requestHeaders);
      const hasAuth = headers.some(h => /authorization|cookie/i.test(h));

      apis.push({
        method: entry.method,
        path: u.pathname,
        params: [...u.searchParams.keys()],
        headers,
        auth: hasAuth,
        sampleResponse: entry.status ? `${entry.status}` : undefined,
      });
    } catch {}
  }

  return apis;
}

function detectAuth(trace: TraceEntry[]): AuthModel {
  let tokenInHeader = false;
  let tokenInCookie = false;
  let hasLogin = false;

  for (const entry of trace) {
    const headers = Object.keys(entry.requestHeaders);
    if (headers.some(h => /^authorization$/i.test(h))) tokenInHeader = true;
    if (headers.some(h => /^cookie$/i.test(h))) tokenInCookie = true;
    if (entry.url.includes('login') || entry.url.includes('signin')) hasLogin = true;
  }

  return {
    type: tokenInHeader ? 'jwt' : tokenInCookie ? 'session' : hasLogin ? 'multi' : 'none',
    roles: ['default'],
    tokenLocation: tokenInHeader ? 'header' : tokenInCookie ? 'cookie' : undefined,
  };
}

function extractPath(url: string): string {
  try { return new URL(url).pathname; } catch { return '/'; }
}

function urlMatches(u: URL, baseUrl: string): boolean {
  try {
    const base = new URL(baseUrl);
    return u.hostname === base.hostname;
  } catch { return true; }
}

function toYaml(model: AppFlowModel): string {
  const lines: string[] = [];
  lines.push(`app: "${model.appName}"`);
  lines.push(`base_url: "${model.baseUrl}"`);
  lines.push(`generated_at: "${model.generatedAt}"`);
  lines.push('');
  lines.push(`auth: ${model.auth.type}`);
  if (model.auth.tokenLocation) lines.push(`token: ${model.auth.tokenLocation}`);
  lines.push('');
  for (const p of model.pages) {
    lines.push(`- path: "${p.path}"`);
    lines.push(`  type: "${p.type}"`);
    if (p.forms.length > 0) {
      lines.push('  forms:');
      for (const f of p.forms) {
        lines.push(`    ${f.method} ${f.action}`);
        if (f.fields.length > 0) lines.push(`      fields: [${f.fields.map(fd => fd.name).join(', ')}]`);
      }
    }
    if (p.transitions.length > 0) {
      for (const t of p.transitions) lines.push(`  ${t.trigger}: ${t.from} → ${t.to}`);
    }
  }
  lines.push('');
  lines.push('apis:');
  for (const a of model.apis) {
    lines.push(`  ${a.method} ${a.path}${a.auth ? ' [auth]' : ''}`);
  }
  lines.push('');
  lines.push('summary:');
  lines.push(`  pages: ${model.summary.totalPages}`);
  lines.push(`  apis: ${model.summary.totalApis}`);
  return lines.join('\n');
}

export function traceToHar(trace: TraceEntry[]): string {
  const entries = trace.map((e, i) => ({
    startedDateTime: new Date(Date.now() - (trace.length - i) * 500).toISOString(),
    time: Math.max(e.duration, 1),
    request: {
      method: e.method,
      url: e.url,
      headers: Object.entries(e.requestHeaders).map(([n, v]) => ({ name: n, value: v })),
      postData: e.requestBody ? { mimeType: 'application/x-www-form-urlencoded', text: e.requestBody } : undefined,
    },
    response: {
      status: e.status,
      statusText: `${e.status}`,
      headers: Object.entries(e.responseHeaders).map(([n, v]) => ({ name: n, value: v })),
    },
  }));

  return JSON.stringify({
    log: {
      version: '1.2',
      creator: { name: 'Ultimatrix Trace', version: '1.0' },
      entries,
    },
  }, null, 2);
}
