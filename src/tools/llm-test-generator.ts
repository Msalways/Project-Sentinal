import fs from 'fs';
import path from 'path';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import type { ScenarioManifest } from './scenario-parser';

interface HarEndpoint {
  method: string;
  url: string;
  status: number;
  contentType: string;
  isApi: boolean;
  isPage: boolean;
  path: string;
}

interface GeneratedTest {
  file: string;
  content: string;
  workflowName: string;
  endpoints: string[];
}

export interface TestGenerationResult {
  files: string[];
  newFiles: string[];
  updatedFiles: string[];
  staleFiles: string[];
  preservedFiles: string[];
}

export class LLMTestGenerator {
  private model: BaseChatModel;
  private target: string;

  constructor(model: BaseChatModel, target: string) {
    this.model = model;
    this.target = target;
  }

  async generateFromHar(harPath: string, outputDir: string): Promise<TestGenerationResult> {
    const { TestManager } = await import('./test-manager');
    const manager = new TestManager(outputDir);

    const har = JSON.parse(fs.readFileSync(harPath, 'utf-8'));
    const endpoints = await this.filterEndpoints(har);
    const grouped = this.groupByPage(endpoints);

    const newTests: GeneratedTest[] = [];

    for (const [pageName, pageData] of Object.entries(grouped)) {
      const testCode = await this.generateTestForPage(pageName, pageData);
      if (!testCode) continue;

      const safeName = pageName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      const filePath = path.join(outputDir, `${safeName}.spec.ts`);
      const allEndpoints = [...pageData.apis.map((a) => a.url), ...pageData.resources.map((r) => r.url)];

      newTests.push({
        file: filePath,
        content: testCode,
        workflowName: pageName,
        endpoints: allEndpoints,
      });
    }

    const reconciliation = manager.reconcile(newTests.map((t) => ({
      file: t.file,
      workflowName: t.workflowName,
      endpoints: t.endpoints,
    })));

    for (const test of newTests) {
      manager.writeTestFile(test.file, test.content);
    }

    for (const file of reconciliation.staleFiles) {
      manager.markStale(file);
    }

    manager.saveManifest(reconciliation.manifest);

    return {
      files: newTests.map((t) => t.file),
      newFiles: reconciliation.newFiles,
      updatedFiles: reconciliation.updatedFiles,
      staleFiles: reconciliation.staleFiles,
      preservedFiles: reconciliation.preservedFiles,
    };
  }

  async generateFromManifest(manifest: ScenarioManifest, outputDir: string): Promise<TestGenerationResult> {
    const { TestManager } = await import('./test-manager');
    const manager = new TestManager(outputDir);

    fs.mkdirSync(outputDir, { recursive: true });
    const newTests: GeneratedTest[] = [];

    for (const workflow of manifest.workflows) {
      const testCode = await this.generateTestForWorkflow(workflow);
      if (!testCode) continue;

      const safeName = workflow.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      const filePath = path.join(outputDir, `${safeName}.spec.ts`);
      const endpoints = workflow.test.happy.map((step) => {
        const match = step.match(/(?:GET|POST|PUT|DELETE|PATCH)\s+(https?:\/\/[^\s]+)/);
        return match ? match[1] : '';
      }).filter(Boolean);

      newTests.push({
        file: filePath,
        content: testCode,
        workflowName: workflow.name,
        endpoints,
      });
    }

    const reconciliation = manager.reconcile(newTests.map((t) => ({
      file: t.file,
      workflowName: t.workflowName,
      endpoints: t.endpoints,
    })));

    for (const test of newTests) {
      manager.writeTestFile(test.file, test.content);
    }

    for (const file of reconciliation.staleFiles) {
      manager.markStale(file);
    }

    manager.saveManifest(reconciliation.manifest);

    return {
      files: newTests.map((t) => t.file),
      newFiles: reconciliation.newFiles,
      updatedFiles: reconciliation.updatedFiles,
      staleFiles: reconciliation.staleFiles,
      preservedFiles: reconciliation.preservedFiles,
    };
  }

  private async filterEndpoints(har: any): Promise<HarEndpoint[]> {
    const entries = har.log?.entries || [];
    const requestList = entries.map((e: any) => ({
      method: e.request.method,
      url: e.request.url,
      status: e.response?.status,
      contentType: e.response?.content?.mimeType,
    }));

    const prompt = `Filter this list of HTTP requests and return only the ones relevant for security testing.

Target: ${this.target}

Requests:
${JSON.stringify(requestList, null, 2).slice(0, 10000)}

Rules:
1. Keep page navigations, API calls, form submissions, and authentication requests
2. Remove static assets (CSS, JS bundles, fonts, images, icons, favicons)
3. Remove analytics, tracking, and telemetry requests
4. Remove CDN and infrastructure requests
5. Remove blob URLs and data URLs
6. Remove framework-specific asset requests
7. Keep any request that carries business logic or user data

Return a JSON array of the relevant request indices (0-based) from the original list.
Return ONLY the array of numbers, no explanation.

Example: [0, 3, 7, 12, 15]`;

    try {
      const response = await this.model.invoke([
        new SystemMessage('You are a security analyst filtering HTTP traffic for relevant requests.'),
        new HumanMessage(prompt),
      ]);

      const content = typeof response.content === 'string'
        ? response.content
        : Array.isArray(response.content)
          ? (response.content[0] as any)?.text || String(response.content[0] || '')
          : '';

      const cleaned = content.replace(/^```json\n?/gm, '').replace(/```$/gm, '').trim();
      const indices = JSON.parse(cleaned);
      const relevant = indices.map((i: number) => entries[i]).filter(Boolean);

      return relevant.map((entry: any) => {
        const url = entry.request.url;
        const method = entry.request.method;
        const contentType = (entry.response?.content?.mimeType || '').toLowerCase();
        const status = entry.response?.status || 0;

        let isApi = false;
        let isPage = false;
        let path = '';

        try {
          const parsed = new URL(url);
          path = parsed.pathname + parsed.search;
          isApi = contentType.includes('json') || contentType.includes('xml') || contentType.includes('graphql');
          isPage = !isApi && !path.match(/\.[a-z0-9]+$/i);
        } catch {
          path = url;
        }

        return { method, url, status, contentType, isApi, isPage, path };
      });
    } catch {
      return this.fallbackFilter(entries);
    }
  }

  private groupByPage(endpoints: HarEndpoint[]): Record<string, { pageUrl: string; apis: HarEndpoint[]; resources: HarEndpoint[] }> {
    const groups: Record<string, { pageUrl: string; apis: HarEndpoint[]; resources: HarEndpoint[] }> = {};

    for (const ep of endpoints) {
      let pageName = 'home';

      if (ep.isPage) {
        const parts = ep.path.split('/').filter(Boolean);
        pageName = parts.length > 0 ? parts[parts.length - 1].split('?')[0] : 'home';
        if (pageName.length < 2) pageName = 'home';
      }

      if (!groups[pageName]) {
        groups[pageName] = { pageUrl: ep.isPage ? ep.url : this.target, apis: [], resources: [] };
      }

      if (ep.isApi) groups[pageName].apis.push(ep);
      else if (ep.isPage) groups[pageName].resources.push(ep);
    }

    return groups;
  }

  private async generateTestForPage(pageName: string, pageData: { pageUrl: string; apis: HarEndpoint[]; resources: HarEndpoint[] }): Promise<string | null> {
    const apisSummary = pageData.apis.map((a) => `  - ${a.method} ${a.path} → ${a.status}`).join('\n') || '  (none)';
    const pagesSummary = pageData.resources.map((r) => `  - ${r.method} ${r.path} → ${r.status}`).join('\n') || '  (none)';

    const prompt = `Generate a Playwright test file for the "${pageName}" page of ${this.target}.

Page URL: ${pageData.pageUrl}

API endpoints called on this page:
${apisSummary}

Page navigations/resources:
${pagesSummary}

Rules:
1. Use @playwright/test with test.describe and test
2. Navigate to the page, wait for it to load
3. Test each API endpoint with proper assertions
4. Include at least one happy path test and one security test
5. Use realistic selectors (e.g., [data-testid], role-based, or common patterns)
6. Add comments explaining what each test does
7. Export nothing — just the test file

Return ONLY the TypeScript code, no markdown fences, no explanation.`;

    try {
      const response = await this.model.invoke([
        new SystemMessage('You are an expert Playwright test engineer. You write clean, production-ready E2E tests with proper assertions, waits, and error handling.'),
        new HumanMessage(prompt),
      ]);

      const content = typeof response.content === 'string'
        ? response.content
        : Array.isArray(response.content)
          ? (response.content[0] as any)?.text || String(response.content[0] || '')
          : '';
      return this.cleanCode(content);
    } catch (error) {
      console.error(`Failed to generate test for ${pageName}:`, error);
      return null;
    }
  }

  private async generateTestForWorkflow(workflow: ScenarioManifest['workflows'][number]): Promise<string | null> {
    const happySteps = workflow.test.happy.join('\n');
    const sadSteps = workflow.test.sad.join('\n');

    const prompt = `Generate a Playwright test file for the "${workflow.name}" workflow on ${this.target}.

Happy path steps:
${happySteps}

Security/sad path steps:
${sadSteps || '(none provided)'}

Rules:
1. Use @playwright/test with test.describe and test
2. Create one test for the happy path, one for security tests
3. Use realistic selectors and proper assertions
4. Add comments explaining what each test does
5. Return ONLY the TypeScript code, no markdown fences, no explanation.`;

    try {
      const response = await this.model.invoke([
        new SystemMessage('You are an expert Playwright test engineer. You write clean, production-ready E2E tests.'),
        new HumanMessage(prompt),
      ]);

      const content = typeof response.content === 'string'
        ? response.content
        : Array.isArray(response.content)
          ? (response.content[0] as any)?.text || String(response.content[0] || '')
          : '';
      return this.cleanCode(content);
    } catch (error) {
      console.error(`Failed to generate test for ${workflow.name}:`, error);
      return null;
    }
  }

  private cleanCode(content: string): string {
    let code = content;
    code = code.replace(/^```typescript?\n?/gm, '').replace(/```$/gm, '').trim();
    if (!code.includes('import') && !code.includes('test.')) {
      code = `import { test, expect } from '@playwright/test';\n\n${code}`;
    }
    return code;
  }

  private fallbackFilter(entries: any[]): HarEndpoint[] {
    const seen = new Set<string>();
    const endpoints: HarEndpoint[] = [];

    for (const entry of entries) {
      const url = entry.request.url;
      const method = entry.request.method;
      const key = `${method}:${url}`;

      if (seen.has(key)) continue;
      seen.add(key);

      try {
        const parsed = new URL(url);
        const pathname = parsed.pathname;

        if (pathname.match(/\.(css|js|woff2?|png|svg|ico|map|jpg|jpeg|gif|ttf|eot)$/i)) continue;
        if (url.includes('gtag') || url.includes('google-analytics') || url.includes('googletagmanager') || url.includes('doubleclick')) continue;
        if (url.includes('cdn-cgi') || url.includes('cloudflareinsights')) continue;
        if (url.includes('blob:')) continue;
        if (pathname.includes('/_next/static/') || pathname.includes('/_next/image')) continue;
        if (pathname.includes('/ingest/') || pathname.includes('/analytics') || pathname.includes('/rum?')) continue;

        const contentType = (entry.response?.content?.mimeType || '').toLowerCase();
        const isApi = contentType.includes('json') || contentType.includes('xml') || contentType.includes('graphql');
        const isPage = !isApi && !pathname.match(/\.[a-z0-9]+$/i);
        const status = entry.response?.status || 0;

        endpoints.push({
          method,
          url,
          status,
          contentType,
          isApi,
          isPage,
          path: pathname + parsed.search,
        });
      } catch {
        continue;
      }
    }

    return endpoints;
  }
}
