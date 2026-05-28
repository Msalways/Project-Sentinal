import { describe, it, expect } from 'vitest';
import { buildWorkflowGraph, type Transition } from '../../src/explorer/workflow-builder';
import type { DOMSnapshot } from '../../src/explorer/dom-observer';
import type { CapturedRequest } from '../../src/explorer/network-recorder';
import type { Interaction } from '../../src/explorer/interaction-planner';

function makeSnapshot(overrides: Partial<DOMSnapshot> = {}): DOMSnapshot {
  return {
    url: 'https://example.com/',
    title: 'Home',
    forms: [],
    interactive: [],
    textContent: '',
    hash: 'abc',
    ...overrides,
  };
}

function makeRequest(overrides: Partial<CapturedRequest> = {}): CapturedRequest {
  return {
    id: 'req-1',
    method: 'GET',
    url: 'https://example.com/api/users',
    status: 200,
    statusText: 'OK',
    contentType: 'application/json',
    requestHeaders: {},
    responseHeaders: {},
    requestBody: null,
    responseBody: '[{"id":1}]',
    initiatorUrl: 'https://example.com/',
    timestamp: 1000,
    duration: 50,
    resourceType: 'xhr',
    ...overrides,
  };
}

function makeInteraction(overrides: Partial<Interaction> = {}): Interaction {
  return {
    type: 'click',
    targetSelector: '#users-link',
    label: 'click Users',
    ...overrides,
  };
}

describe('buildWorkflowGraph', () => {
  it('returns empty graph for no transitions', () => {
    const result = buildWorkflowGraph([], 'https://example.com');
    expect(result.nodes).toEqual([]);
    expect(result.edges).toEqual([]);
    expect(result.endpoints).toEqual([]);
  });

  it('builds nodes and edges from a single transition', () => {
    const t: Transition = {
      beforeSnapshot: makeSnapshot({ url: 'https://example.com/', title: 'Home' }),
      afterSnapshot: makeSnapshot({ url: 'https://example.com/users', title: 'Users' }),
      trigger: makeInteraction(),
      requests: [],
    };
    const result = buildWorkflowGraph([t], 'https://example.com');
    expect(result.nodes).toHaveLength(2);
    expect(result.edges).toHaveLength(1);
    expect(result.edges[0].trigger).toBe('click');
    expect(result.edges[0].label).toBe('click Users');
  });

  it('deduplicates nodes by URL', () => {
    const t1: Transition = {
      beforeSnapshot: makeSnapshot({ url: 'https://example.com/', title: 'Home' }),
      afterSnapshot: makeSnapshot({ url: 'https://example.com/users', title: 'Users' }),
      trigger: makeInteraction({ label: 'first click' }),
      requests: [],
    };
    const t2: Transition = {
      beforeSnapshot: makeSnapshot({ url: 'https://example.com/', title: 'Home' }),
      afterSnapshot: makeSnapshot({ url: 'https://example.com/users', title: 'Users' }),
      trigger: makeInteraction({ label: 'second click' }),
      requests: [],
    };
    const result = buildWorkflowGraph([t1, t2], 'https://example.com');
    expect(result.nodes).toHaveLength(2);
    expect(result.edges).toHaveLength(2);
  });

  it('extracts API endpoints from request data', () => {
    const t: Transition = {
      beforeSnapshot: makeSnapshot(),
      afterSnapshot: makeSnapshot({ url: 'https://example.com/users', title: 'Users' }),
      trigger: makeInteraction(),
      requests: [makeRequest()],
    };
    const result = buildWorkflowGraph([t], 'https://example.com');
    expect(result.endpoints).toHaveLength(1);
    expect(result.endpoints[0].path).toBe('/api/users');
    expect(result.endpoints[0].method).toBe('GET');
    expect(result.endpoints[0].params).toEqual([]);
  });

  it('extracts URL parameters as endpoint params', () => {
    const t: Transition = {
      beforeSnapshot: makeSnapshot(),
      afterSnapshot: makeSnapshot({ url: 'https://example.com/search', title: 'Search' }),
      trigger: makeInteraction(),
      requests: [makeRequest({ url: 'https://example.com/api/search?q=test&page=1' })],
    };
    const result = buildWorkflowGraph([t], 'https://example.com');
    expect(result.endpoints).toHaveLength(1);
    expect(result.endpoints[0].params).toHaveLength(2);
    expect(result.endpoints[0].params.map(p => p.name)).toEqual(['q', 'page']);
  });

  it('detects auth from 401/403 responses', () => {
    const t: Transition = {
      beforeSnapshot: makeSnapshot(),
      afterSnapshot: makeSnapshot({ url: 'https://example.com/admin', title: 'Admin' }),
      trigger: makeInteraction(),
      requests: [makeRequest({ url: 'https://example.com/admin', status: 401 })],
    };
    const result = buildWorkflowGraph([t], 'https://example.com');
    expect(result.authBoundaries).toHaveLength(1);
    expect(result.authBoundaries[0].requiresAuth).toBe(true);
    expect(result.authBoundaries[0].evidence).toContain('401');
  });

  it('detects Set-Cookie from auth endpoints', () => {
    const t: Transition = {
      beforeSnapshot: makeSnapshot(),
      afterSnapshot: makeSnapshot({ url: 'https://example.com/login', title: 'Login' }),
      trigger: makeInteraction({ type: 'fill_and_submit' }),
      requests: [makeRequest({
        url: 'https://example.com/api/login',
        method: 'POST',
        status: 200,
        responseHeaders: { 'set-cookie': 'session=abc123' },
      })],
    };
    const result = buildWorkflowGraph([t], 'https://example.com');
    expect(result.authBoundaries).toHaveLength(1);
    expect(result.authBoundaries[0].requiresAuth).toBe(false);
    expect(result.authBoundaries[0].evidence).toContain('Set-Cookie');
  });

  it('detects tech stack from response headers', () => {
    const t: Transition = {
      beforeSnapshot: makeSnapshot(),
      afterSnapshot: makeSnapshot({ url: 'https://example.com/page', title: 'Page' }),
      trigger: makeInteraction(),
      requests: [makeRequest({
        url: 'https://example.com/api/page',
        responseHeaders: { 'x-powered-by': 'Express', server: 'nginx' },
      })],
    };
    const result = buildWorkflowGraph([t], 'https://example.com');
    expect(result.techStack).toContain('Express.js');
    expect(result.techStack).toContain('Nginx');
  });

  it('classifies login URLs as login node type', () => {
    const t: Transition = {
      beforeSnapshot: makeSnapshot({ url: 'https://example.com/', title: 'Home' }),
      afterSnapshot: makeSnapshot({ url: 'https://example.com/login', title: 'Sign In' }),
      trigger: makeInteraction({ label: 'click Sign In' }),
      requests: [],
    };
    const result = buildWorkflowGraph([t], 'https://example.com');
    const loginNode = result.nodes.find(n => n.url === 'https://example.com/login');
    expect(loginNode?.type).toBe('login');
    expect(loginNode?.authRequired).toBe(true);
  });

  it('handles form_submit trigger type', () => {
    const t: Transition = {
      beforeSnapshot: makeSnapshot(),
      afterSnapshot: makeSnapshot({ url: 'https://example.com/dashboard', title: 'Dashboard' }),
      trigger: makeInteraction({ type: 'fill_and_submit', label: 'submit login form' }),
      requests: [],
    };
    const result = buildWorkflowGraph([t], 'https://example.com');
    expect(result.edges[0].trigger).toBe('form_submit');
  });
});
