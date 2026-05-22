import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import type { Finding, Severity } from '../core/types';
import type { TargetContext } from '../core/context';

export interface WorkflowStep {
  name: string;
  type: 'navigation' | 'api_call' | 'form_submit' | 'auth' | 'data_fetch';
  url: string;
  method: string;
  description: string;
}

export interface Workflow {
  name: string;
  steps: WorkflowStep[];
  authRequired: boolean;
  description: string;
}

export class LLMAnalyzer {
  private model: BaseChatModel;

  constructor(model: BaseChatModel) {
    this.model = model;
  }

  async filterRelevantRequests(harData: any, targetUrl: string): Promise<any[]> {
    const entries = harData.log?.entries || [];
    const requestList = entries.map((e: any) => ({
      method: e.request.method,
      url: e.request.url,
      status: e.response?.status,
      contentType: e.response?.content?.mimeType,
      size: e.response?.content?.size,
    }));

    const prompt = `Filter this list of HTTP requests and return only the ones relevant for security testing.

Target: ${targetUrl}

Requests:
${JSON.stringify(requestList, null, 2).slice(0, 10000)}

Rules:
1. Keep page navigations, API calls, form submissions, and authentication requests
2. Remove static assets (CSS, JS bundles, fonts, images, icons, favicons)
3. Remove analytics, tracking, and telemetry requests
4. Remove CDN and infrastructure requests
5. Remove blob URLs and data URLs
6. Remove framework-specific asset requests (e.g., Next.js chunks, webpack bundles)
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
      return indices.map((i: number) => entries[i]).filter(Boolean);
    } catch {
      return this.fallbackFilter(entries);
    }
  }

  async extractWorkflows(harData: any, targetUrl: string): Promise<Workflow[]> {
    const relevant = await this.filterRelevantRequests(harData, targetUrl);

    const harSummary = JSON.stringify({
      target: targetUrl,
      endpoints: relevant.map((e: any) => ({
        method: e.request.method,
        url: e.request.url,
        status: e.response?.status,
        contentType: e.response?.content?.mimeType,
      })),
      totalRequests: relevant.length,
    }, null, 2).slice(0, 8000);

    const prompt = `Analyze this HTTP traffic and extract logical user workflows.

A workflow is a sequence of related requests that accomplish a user goal (e.g., "Login", "Browse Products", "Checkout", "View Profile").

Traffic Data:
${harSummary}

Rules:
1. Group related requests into workflows based on URL patterns, timing, and purpose
2. Name each workflow descriptively
3. Identify authentication requirements
4. Include only meaningful requests
5. Skip infrastructure and asset requests

Return a JSON array of workflows:
[
  {
    "name": "Workflow Name",
    "description": "What this workflow does",
    "authRequired": true/false,
    "steps": [
      {
        "name": "Step description",
        "type": "navigation|api_call|form_submit|auth|data_fetch",
        "url": "https://...",
        "method": "GET|POST|...",
        "description": "What this step does"
      }
    ]
  }
]

Return ONLY valid JSON, no markdown fences, no explanation.`;

    try {
      const response = await this.model.invoke([
        new SystemMessage('You are a security analyst who extracts user workflows from HTTP traffic data.'),
        new HumanMessage(prompt),
      ]);

      const content = typeof response.content === 'string'
        ? response.content
        : Array.isArray(response.content)
          ? (response.content[0] as any)?.text || String(response.content[0] || '')
          : '';

      const cleaned = content.replace(/^```json\n?/gm, '').replace(/```$/gm, '').trim();
      return JSON.parse(cleaned);
    } catch {
      return this.fallbackWorkflows(relevant, targetUrl);
    }
  }

  async correlateFindings(findings: Finding[], context: TargetContext): Promise<Finding[]> {
    if (findings.length === 0) return findings;

    const findingsSummary = findings.map((f, i) =>
      `${i + 1}. [${f.severity.toUpperCase()}] ${f.title}\n   Location: ${f.location}\n   Evidence: ${f.evidence}\n   Category: ${f.category}`
    ).join('\n\n');

    const contextSummary = `Target: ${context.url}\nTech: ${context.detectedTech.join(', ')}\nAuth: ${context.authFlows.map((f) => f.type).join(', ')}\nEndpoints: ${context.endpoints.length}`;

    const prompt = `Correlate and deduplicate these security findings.

Context:
${contextSummary}

Findings:
${findingsSummary}

Rules:
1. Merge duplicate findings
2. Group related findings
3. Prioritize by actual risk
4. Identify attack chains
5. Remove false positives
6. Add context-specific remediation

Return a JSON array of correlated findings:
[
  {
    "id": "unique-id",
    "title": "Finding title",
    "description": "Detailed description",
    "severity": "critical|high|medium|low",
    "category": "category",
    "location": "URL or file path",
    "evidence": "Proof",
    "remediation": "Specific fix guidance",
    "relatedFindings": ["id1", "id2"],
    "attackChain": true/false
  }
]

Return ONLY valid JSON, no markdown fences, no explanation.`;

    try {
      const response = await this.model.invoke([
        new SystemMessage('You are a senior security analyst who correlates and prioritizes vulnerability findings.'),
        new HumanMessage(prompt),
      ]);

      const content = typeof response.content === 'string'
        ? response.content
        : Array.isArray(response.content)
          ? (response.content[0] as any)?.text || String(response.content[0] || '')
          : '';

      const cleaned = content.replace(/^```json\n?/gm, '').replace(/```$/gm, '').trim();
      const correlated = JSON.parse(cleaned);

      return correlated.map((f: any, i: number) => ({
        id: f.id || `correlated-${i + 1}`,
        title: f.title,
        description: f.description,
        severity: f.severity as Severity,
        category: f.category,
        location: f.location,
        evidence: f.evidence,
        remediation: f.remediation,
        agent: findings.find((orig) => orig.title === f.title)?.agent || 'recon',
        timestamp: new Date().toISOString(),
      }));
    } catch {
      return findings;
    }
  }

  async assessRisk(findings: Finding[], context: TargetContext): Promise<{ score: number; level: Severity; summary: string }> {
    const findingsSummary = findings.map((f) =>
      `- [${f.severity.toUpperCase()}] ${f.title} at ${f.location}`
    ).join('\n');

    const contextSummary = `Target: ${context.url}\nTech: ${context.detectedTech.join(', ')}\nFramework: ${context.framework || 'Unknown'}\nAuth: ${context.authFlows.map((f) => f.type).join(', ')}\nEndpoints: ${context.endpoints.length}`;

    const prompt = `Assess the security risk of this application.

Context:
${contextSummary}

Findings:
${findingsSummary || 'No findings reported'}

Rules:
1. Score from 0-100
2. Consider business impact
3. Factor in tech stack
4. Consider attack chains
5. Provide executive summary

Return ONLY a JSON object:
{
  "score": 0-100,
  "level": "critical|high|medium|low|info",
  "summary": "2-3 sentence executive summary"
}

Return ONLY valid JSON, no markdown fences, no explanation.`;

    try {
      const response = await this.model.invoke([
        new SystemMessage('You are a CISO assessing application security risk.'),
        new HumanMessage(prompt),
      ]);

      const content = typeof response.content === 'string'
        ? response.content
        : Array.isArray(response.content)
          ? (response.content[0] as any)?.text || String(response.content[0] || '')
          : '';

      const cleaned = content.replace(/^```json\n?/gm, '').replace(/```$/gm, '').trim();
      const result = JSON.parse(cleaned);

      return {
        score: Math.min(100, Math.max(0, result.score)),
        level: result.level as Severity,
        summary: result.summary,
      };
    } catch {
      const { calculateRiskScore, riskLevelFromScore } = await import('../tools/scoring');
      const score = calculateRiskScore(findings);
      return { score, level: riskLevelFromScore(score), summary: 'Risk assessment failed, using default scoring.' };
    }
  }

  private fallbackFilter(entries: any[]): any[] {
    return entries.filter((e: any) => {
      try {
        const url = new URL(e.request.url);
        const path = url.pathname;
        if (path.match(/\.(css|js|woff2?|png|svg|ico|map|jpg|jpeg|gif|ttf|eot)$/i)) return false;
        if (url.search.includes('utm_') || url.search.includes('utm_source')) return false;
        if (url.hostname.includes('google-analytics') || url.hostname.includes('googletagmanager')) return false;
        if (url.hostname.includes('doubleclick') || url.hostname.includes('facebook.com')) return false;
        if (url.protocol === 'blob:' || url.protocol === 'data:') return false;
        return true;
      } catch {
        return false;
      }
    });
  }

  private fallbackWorkflows(entries: any[], targetUrl: string): Workflow[] {
    const workflows: Workflow[] = [];
    const pages = new Map<string, any[]>();

    for (const entry of entries) {
      try {
        const url = new URL(entry.request.url);
        const path = url.pathname.split('/').filter(Boolean);
        const pageName = path.length > 0 ? path[path.length - 1].split('?')[0] : 'home';
        if (!pages.has(pageName)) pages.set(pageName, []);
        pages.get(pageName)!.push(entry);
      } catch {
        continue;
      }
    }

    for (const [name, requests] of pages.entries()) {
      workflows.push({
        name: name.charAt(0).toUpperCase() + name.slice(1),
        description: `Requests related to ${name}`,
        authRequired: requests.some((r: any) => {
          const hasAuthHeader = r.request.headers?.some((h: any) => h.name.toLowerCase() === 'authorization' || h.name.toLowerCase() === 'cookie');
          const contentType = r.response?.content?.mimeType || '';
          return contentType.includes('json') && hasAuthHeader;
        }),
        steps: requests.map((r: any) => ({
          name: `${r.request.method} ${new URL(r.request.url).pathname}`,
          type: r.request.method === 'GET' ? 'navigation' : 'api_call',
          url: r.request.url,
          method: r.request.method,
          description: `${r.request.method} request to ${new URL(r.request.url).pathname}`,
        })),
      });
    }

    return workflows;
  }
}
