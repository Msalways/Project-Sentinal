import type { WorkflowNode, WorkflowEdge, AppModelEndpoint } from '../core/app-model';
import type { DOMSnapshot } from './dom-observer';
import type { CapturedRequest } from './network-recorder';
import type { Interaction } from './interaction-planner';

export interface Transition {
  beforeSnapshot: DOMSnapshot;
  afterSnapshot: DOMSnapshot;
  trigger: Interaction;
  requests: CapturedRequest[];
}

function hashUrl(url: string): string {
  const cleaned = url.replace(/https?:\/\//, '').replace(/\/$/, '').toLowerCase();
  return 'n_' + cleaned.replace(/[^a-zA-Z0-9]/g, '_').slice(0, 60);
}

function typeFromUrl(url: string): WorkflowNode['type'] {
  const lower = url.toLowerCase();
  if (lower.includes('/login') || lower.includes('/auth') || lower.includes('/signin')) return 'login';
  if (lower.includes('/api/') || lower.includes('/graphql') || lower.includes('/rest/')) return 'api';
  return 'page';
}

export function buildWorkflowGraph(transitions: Transition[], target: string): {
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  endpoints: AppModelEndpoint[];
  authBoundaries: Array<{ url: string; method: string; requiresAuth: boolean; authWith: string; evidence: string }>;
  techStack: string[];
} {
  const nodeMap = new Map<string, WorkflowNode>();
  const edges: WorkflowEdge[] = [];
  const endpointSet = new Map<string, AppModelEndpoint>();
  const authBoundaries: Array<{ url: string; method: string; requiresAuth: boolean; authWith: string; evidence: string }> = [];
  const techStackHints = new Set<string>();

  // Detect tech stack from response headers
  function detectTech(headers: Record<string, string>): void {
    const server = headers['server']?.toLowerCase() || '';
    const poweredBy = headers['x-powered-by']?.toLowerCase() || '';
    const setCookie = headers['set-cookie']?.toLowerCase() || '';
    if (server.includes('express') || poweredBy.includes('express')) techStackHints.add('Express.js');
    if (server.includes('nginx')) techStackHints.add('Nginx');
    if (server.includes('apache')) techStackHints.add('Apache');
    if (server.includes('cloudflare')) techStackHints.add('Cloudflare');
    if (poweredBy.includes('asp.net')) techStackHints.add('ASP.NET');
    if (poweredBy.includes('php')) techStackHints.add('PHP');
    if (poweredBy.includes('flask') || poweredBy.includes('python')) techStackHints.add('Flask/Python');
    if (poweredBy.includes('django')) techStackHints.add('Django');
    if (poweredBy.includes('next.js') || poweredBy.includes('nextjs')) techStackHints.add('Next.js');
    if (setCookie.includes('sessionid=')) techStackHints.add('Django');
    if (setCookie.includes('jsessionid=')) techStackHints.add('Java EE');
    if (setCookie.includes('PHPSESSID')) techStackHints.add('PHP');
    if (setCookie.includes('.AspNetCore')) techStackHints.add('ASP.NET Core');
  }

  function getOrCreateNode(url: string, title: string, fromId: string | null, method: string): WorkflowNode {
    const key = hashUrl(url);
    if (nodeMap.has(key)) return nodeMap.get(key)!;
    const node: WorkflowNode = {
      id: key,
      url,
      title: title || url,
      type: typeFromUrl(url),
      authRequired: /login|auth|signin/.test(url.toLowerCase()),
      authVerified: false,
      discoveredFrom: fromId,
      discoveryMethod: method === 'fill_and_submit' ? 'form_submit' : method === 'click' ? 'click' : 'navigation',
    };
    nodeMap.set(key, node);
    return node;
  }

  for (const t of transitions) {
    const beforeUrl = t.beforeSnapshot.url;
    const afterUrl = t.afterSnapshot.url;

    const fromNode = getOrCreateNode(beforeUrl, t.beforeSnapshot.title, null, 'navigation');
    const toNode = getOrCreateNode(afterUrl, t.afterSnapshot.title, fromNode.id, t.trigger.type);

    edges.push({
      fromId: fromNode.id,
      toId: toNode.id,
      trigger: t.trigger.type === 'fill_and_submit' ? 'form_submit' : t.trigger.type === 'click' ? 'click' : 'navigation',
      selector: t.trigger.targetSelector,
      formData: t.trigger.formData,
      label: t.trigger.label,
    });

    // Extract endpoints from captured requests
    for (const req of t.requests) {
      const parsedUrl = new URL(req.url);
      if (parsedUrl.origin !== new URL(target).origin) continue;
      if (req.resourceType === 'document' || req.resourceType === 'stylesheet' || req.resourceType === 'font' || req.resourceType === 'image') continue;

      const path = parsedUrl.pathname;
      const method = req.method;
      const key = `${method}:${path}`;

      detectTech(req.responseHeaders);

      if (!endpointSet.has(key)) {
        const params: AppModelEndpoint['params'] = [];
        parsedUrl.searchParams.forEach((value, name) => {
          params.push({ name, type: 'string', required: true });
        });
        endpointSet.set(key, {
          path,
          method,
          params,
          requiresAuth: false,
          responseStatus: req.status,
          contentType: req.contentType,
          bodyPreview: (req.responseBody || '').slice(0, 500),
        });
      }

      // Check for auth-related responses
      if (req.status === 401 || req.status === 403) {
        authBoundaries.push({
          url: req.url,
          method: req.method,
          requiresAuth: true,
          authWith: 'cookie',
          evidence: `Status ${req.status} on ${path}`,
        });
      }

      if (req.responseHeaders['set-cookie']) {
        authBoundaries.push({
          url: req.url,
          method: req.method,
          requiresAuth: false,
          authWith: 'cookie',
          evidence: `Set-Cookie from ${path}`,
        });
      }
    }
  }

  const visitedNewUrls = new Set<string>();
  for (const n of nodeMap.values()) {
    visitedNewUrls.add(n.url);
  }

  return {
    nodes: Array.from(nodeMap.values()),
    edges,
    endpoints: Array.from(endpointSet.values()),
    authBoundaries,
    techStack: Array.from(techStackHints),
  };
}
