import { z } from 'zod';
import { tool, DynamicStructuredTool } from '@langchain/core/tools';
import fs from 'fs';
import path from 'path';
import { BrowserSessionManager } from '../core/browser-session';
import { PlaywrightTestGenerator } from '../tools/test-generator';
import { FlowStore } from './flow-store';
import type { AppFlowModel, AuthModel } from './flow-model';

export type ExportFormat = 'yaml' | 'json' | 'playwright' | 'har' | 'all';

export function createExportFlowModelTool(browser: BrowserSessionManager, flowStore: FlowStore): DynamicStructuredTool {
  return tool(async (input) => {
    const { sessionId, targetUrl, appName, outputDir, formats } = input;
    const pages = flowStore.getPages();
    if (pages.length === 0) return 'No pages observed yet. Use observe_page on each page first.';

    const target = targetUrl || flowStore.getMeta('baseUrl') || 'http://localhost:3000';
    const name = appName || new URL(target).hostname;
    const out = outputDir || './flow-output';
    const formatList: ExportFormat[] = (formats as ExportFormat[]) || ['all'];
    const all = formatList.includes('all');

    fs.mkdirSync(out, { recursive: true });
    const artifacts: string[] = [];

    const authPages = pages.filter(p => p.auth !== 'public');
    const auth: AuthModel = {
      type: 'unknown',
      roles: ['default'],
    };

    const allEndpoints = new Set<string>();
    for (const p of pages) for (const ep of p.detectedEndpoints) allEndpoints.add(ep);

    const model: AppFlowModel = {
      appName: name,
      baseUrl: target,
      version: '1.0.0',
      generatedAt: new Date().toISOString(),
      pages,
      apis: [],
      auth,
      flows: [],
      summary: {
        totalPages: pages.length,
        totalApis: 0,
        totalFlows: 0,
        authPages: authPages.length,
        formsFound: pages.reduce((s, p) => s + p.forms.length, 0),
        endpointsDetected: allEndpoints.size,
      },
    };

    if (all || formatList.includes('yaml')) {
      const yamlPath = path.join(out, 'flow.yaml');
      fs.writeFileSync(yamlPath, toYaml(model));
      artifacts.push(yamlPath);
    }

    if (all || formatList.includes('json')) {
      const jsonPath = path.join(out, 'flow.json');
      fs.writeFileSync(jsonPath, JSON.stringify(model, null, 2));
      artifacts.push(jsonPath);
    }

    if (all || formatList.includes('playwright')) {
      const steps = browser.getRecording(sessionId);
      if (steps.length > 0) {
        const testDir = path.join(out, 'tests');
        const manifest = {
          target,
          roles: [{ name: 'default', credentials: {} }],
          workflows: [{
            name: `${name} Mapped Flow`,
            test: {
              happy: steps.map(s => {
                switch (s.type) {
                  case 'navigate': return `Navigate to ${s.url}`;
                  case 'click': return `Click ${s.selector}`;
                  case 'fill': return `Fill ${s.selector} with "${s.value}"`;
                  default: return `${s.type}`;
                }
              }),
              sad: [],
            },
          }],
        };
        const generator = new PlaywrightTestGenerator(target);
        fs.mkdirSync(testDir, { recursive: true });
        const files = generator.generateFromManifest(manifest as any, testDir);
        artifacts.push(...files);
      }
    }

    if (all || formatList.includes('har')) {
      const harPath = path.join(out, 'session.har');
      const entries = stepsToHar(browser.getRecording(sessionId), target);
      fs.writeFileSync(harPath, JSON.stringify({ log: { version: '1.2', creator: { name: 'Ultimatrix FlowMapper', version: '1.0' }, entries } }, null, 2));
      artifacts.push(harPath);
    }

    const summary = artifacts.map(f => `  ${f}`).join('\n');
    return `Exported flow model for "${name}" to ${out}:\n${summary}\n\nPages: ${model.summary.totalPages} | Forms: ${model.summary.formsFound} | Endpoints: ${model.summary.endpointsDetected} | Auth: ${auth.type}`;
  }, {
    name: 'export_flow_model',
    description: 'Export the observed page flow data as artifacts: flow.yaml, flow.json, Playwright tests, session HAR. Call after observe_page on all pages.',
    schema: z.object({
      sessionId: z.string().default('default'),
      targetUrl: z.string().optional().describe('Base target URL (defaults to first observed page)'),
      appName: z.string().optional().describe('Application name (defaults to hostname)'),
      outputDir: z.string().optional().describe('Output directory for generated artifacts'),
      formats: z.array(z.enum(['yaml', 'json', 'playwright', 'har', 'all'])).optional().default(['all']).describe('Artifact formats to export'),
    }),
  });
}

function toYaml(model: AppFlowModel): string {
  const lines: string[] = [];
  lines.push(`app: "${model.appName}"`);
  lines.push(`base_url: "${model.baseUrl}"`);
  lines.push(`version: "${model.version}"`);
  lines.push(`generated_at: "${model.generatedAt}"`);
  lines.push('');
  for (const p of model.pages) {
    lines.push(`- path: "${p.path}"`);
    lines.push(`  title: "${p.title.replace(/"/g, '\\"')}"`);
    lines.push(`  type: "${p.type}"`);
    lines.push(`  auth: "${p.auth}"`);
    if (p.forms.length > 0) {
      lines.push('  forms:');
      for (const f of p.forms) {
        lines.push(`    - action: "${f.action}"`);
        lines.push(`      method: ${f.method}`);
        lines.push(`      fields: [${f.fields.map(fd => `{name: "${fd.name}", type: "${fd.type}"}`).join(', ')}]`);
      }
    }
    if (p.transitions.length > 0) {
      lines.push('  transitions:');
      for (const t of p.transitions.slice(0, 15)) {
        const to = t.to.length > 60 ? t.to.slice(0, 60) + '...' : t.to;
        lines.push(`    - ["${t.trigger}", "${to}"]`);
      }
    }
    if (p.detectedEndpoints.length > 0) {
      lines.push('  endpoints:');
      for (const ep of p.detectedEndpoints.slice(0, 20)) lines.push(`    - "${ep}"`);
    }
  }
  lines.push('');
  lines.push('summary:');
  lines.push(`  pages: ${model.summary.totalPages}`);
  lines.push(`  forms: ${model.summary.formsFound}`);
  lines.push(`  endpoints: ${model.summary.endpointsDetected}`);
  return lines.join('\n');
}

function stepsToHar(steps: import('../core/browser-session').MacroStep[], baseUrl: string): any[] {
  return steps.filter(s => s.type === 'navigate' && s.url).map((s, i) => ({
    startedDateTime: new Date(Date.now() - (steps.length - i) * 500).toISOString(),
    time: 120,
    request: { method: 'GET', url: s.url!, headers: [] },
    response: { status: 200, statusText: 'OK', headers: [] },
  }));
}
