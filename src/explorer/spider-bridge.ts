import type { AppModel, WorkflowNode, WorkflowEdge, AppModelForm, AppModelEndpoint } from '../core/app-model';
import type { CrawlResult } from './spider';
import type { TraceEntry } from '../core/browser-session';

const STATIC_EXT = /\.(css|js|woff2?|png|svg|ico|map|jpg|jpeg|gif|webp|ttf|eot|pdf)$/i;
const API_CONTENT_TYPES = /json|xml|grpc|protobuf|graphql|form-data|x-www-form-urlencoded/i;

export interface SpiderBridgeResult {
  model: Partial<AppModel>;
  privateAppHint: string;
}

function mineTraceForEndpoints(trace: TraceEntry[]): AppModelEndpoint[] {
  const seen = new Set<string>();
  const endpoints: AppModelEndpoint[] = [];

  for (const entry of trace) {
    if (entry.type !== 'xhr' && entry.type !== 'fetch') continue;

    let url: URL;
    try {
      url = new URL(entry.url);
    } catch {
      continue;
    }

    const pathname = url.pathname;
    if (STATIC_EXT.test(pathname)) continue;

    const CHALLENGE_PATHS = /^\/(cdn-cgi|__cf|__static)\//;
    if (CHALLENGE_PATHS.test(pathname)) continue;

    const contentType = (entry.responseHeaders?.['content-type'] || '').toLowerCase();

    const params: Array<{ name: string; type: string; required: boolean }> = [];
    url.searchParams.forEach((_, key) => {
      params.push({ name: key, type: 'query', required: false });
    });

    const uniqueKey = `${entry.method}:${pathname}`;
    if (seen.has(uniqueKey)) continue;
    seen.add(uniqueKey);

    endpoints.push({
      path: pathname,
      method: entry.method || 'GET',
      params,
      requiresAuth: false,
      responseStatus: entry.status,
      contentType,
      bodyPreview: entry.requestBody || '',
    });
  }

  return endpoints;
}

export function spiderResultToAppModel(crawl: CrawlResult, target: string): SpiderBridgeResult {
  const nodes: WorkflowNode[] = [];
  const edges: WorkflowEdge[] = [];
  const forms: AppModelForm[] = [];
  let privateAppHint = '';

  // Convert routes to workflow nodes
  for (const route of crawl.routes) {
    const nodeId = `spider-${route.path.replace(/[^a-zA-Z0-9]/g, '_') || 'root'}`;
    const isLogin = /login|auth|signin|logon/.test(route.path);
    nodes.push({
      id: nodeId,
      url: route.url,
      title: route.title,
      type: isLogin ? 'login' : 'page',
      authRequired: false,
      authVerified: false,
      discoveredFrom: null,
      discoveryMethod: 'navigation',
    });

    // Convert forms from DOM snapshots
    const snapshot = crawl.snapshots.find(s => s.url === route.url);
    if (snapshot) {
      for (const f of snapshot.forms) {
        const exists = forms.some(
          (ef) => ef.pageUrl === snapshot.url && ef.action === f.action
        );
        if (!exists) {
          forms.push({
            pageUrl: snapshot.url,
            action: f.action,
            method: f.method,
            fields: f.fields.map((field) => ({
              name: field.name,
              type: field.type,
              placeholder: field.placeholder,
              required: field.required,
            })),
          });
        }
      }
    }
  }

  // Build edges from depth transitions
  const sorted = [...crawl.routes].sort((a, b) => a.visitedAt - b.visitedAt);
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    const curr = sorted[i];
    const fromNode = nodes.find(
      (n) => n.url === prev.url || n.url.replace(/\/$/, '') === prev.url.replace(/\/$/, '')
    );
    const toNode = nodes.find(
      (n) => n.url === curr.url || n.url.replace(/\/$/, '') === curr.url.replace(/\/$/, '')
    );
    if (fromNode && toNode && fromNode.id !== toNode.id) {
      const exists = edges.some((e) => e.fromId === fromNode.id && e.toId === toNode.id);
      if (!exists) {
        edges.push({
          fromId: fromNode.id,
          toId: toNode.id,
          trigger: 'navigation',
          label: `spider depth ${curr.depth}`,
        });
      }
    }
  }

  // Private app detection
  if (crawl.visitedUrls.length <= 1 && crawl.routes.length <= 1) {
    privateAppHint = 'Only one page discovered — likely behind authentication';
  } else if (crawl.routes.length <= 2 && Object.keys(crawl.cookies).length === 0) {
    privateAppHint = 'Few routes and no cookies — may require login';
  }

  // Cookies present but no session cookie → partial auth
  const hasSessionCookie = Object.keys(crawl.cookies).some(
    (k) => /session|token|auth|sid|jwt|connect\.sid|phpsessid|jsessionid/i.test(k)
  );

  const minedEndpoints = mineTraceForEndpoints(crawl.trace || []);

  return {
    model: {
      target,
      techStack: crawl.techStack || [],
      auth: {
        type: hasSessionCookie ? 'session' : 'unknown',
        loginEndpoint: '',
        endpoints: [],
        cookies: crawl.cookies,
        tokens: [],
        sessions: {},
      },
      workflow: { nodes, edges },
      endpoints: minedEndpoints,
      forms,
      scripts: [],
      cookies: crawl.cookies,
      localStorage: crawl.localStorage,
      findings: [],
      verifications: [],
      parameterClassifications: [],
      authBoundaries: [],
      recordedSessions: {
        'spider-auto': crawl.recording || [],
      },
      hypotheses: [],
      nextSteps: [
        'Read workflow graph',
        'Probe auth boundaries',
        'Test discovered endpoints',
      ],
      visitedUrls: crawl.visitedUrls || [],
      oastCallbacks: [],
      coverage: [],
    },
    privateAppHint,
  };
}
