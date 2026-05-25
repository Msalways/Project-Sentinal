import { describe, it, expect } from 'vitest';
import { buildTargetContext, getContextSummary } from '../../src/core/context';
import type { TargetContext } from '../../src/core/context';

describe('buildTargetContext', () => {
  it('returns empty context when no harData provided', () => {
    const ctx = buildTargetContext(undefined, 'http://test.com');
    expect(ctx.url).toBe('http://test.com');
    expect(ctx.detectedTech).toEqual([]);
    expect(ctx.authFlows).toEqual([]);
    expect(ctx.endpoints).toEqual([]);
    expect(ctx.sensitiveData).toEqual([]);
  });

  it('returns empty context when no args provided', () => {
    const ctx = buildTargetContext();
    expect(ctx.url).toBe('');
    expect(ctx.detectedTech).toEqual([]);
  });

  it('extracts endpoints from HAR entries', () => {
    const harData = {
      log: {
        entries: [
          {
            request: { url: 'http://test.com/api', method: 'GET' },
            response: { status: 200, content: { mimeType: 'application/json' }, headers: [] },
          },
        ],
      },
    };
    const ctx = buildTargetContext(harData, 'http://test.com');
    expect(ctx.endpoints).toHaveLength(1);
    expect(ctx.endpoints[0].url).toBe('http://test.com/api');
    expect(ctx.endpoints[0].method).toBe('GET');
    expect(ctx.endpoints[0].status).toBe(200);
    expect(ctx.endpoints[0].authRequired).toBe(false);
  });

  it('marks endpoint as authRequired when Authorization header present', () => {
    const harData = {
      log: {
        entries: [
          {
            request: { url: 'http://test.com/api', method: 'GET' },
            response: {
              status: 200,
              content: { mimeType: 'text/plain' },
              headers: [{ name: 'Authorization', value: 'Bearer token' }],
            },
          },
        ],
      },
    };
    const ctx = buildTargetContext(harData);
    expect(ctx.endpoints[0].authRequired).toBe(true);
  });

  it('marks endpoint as authRequired when Cookie header present', () => {
    const harData = {
      log: {
        entries: [
          {
            request: { url: 'http://test.com/api', method: 'GET' },
            response: {
              status: 200,
              content: { mimeType: 'text/plain' },
              headers: [{ name: 'Cookie', value: 'session=abc' }],
            },
          },
        ],
      },
    };
    const ctx = buildTargetContext(harData);
    expect(ctx.endpoints[0].authRequired).toBe(true);
  });

  it('deduplicates endpoints by URL', () => {
    const harData = {
      log: {
        entries: [
          {
            request: { url: 'http://test.com/api', method: 'GET' },
            response: { status: 200, content: { mimeType: 'text/plain' }, headers: [] },
          },
          {
            request: { url: 'http://test.com/api', method: 'POST' },
            response: { status: 201, content: { mimeType: 'text/plain' }, headers: [] },
          },
        ],
      },
    };
    const ctx = buildTargetContext(harData);
    expect(ctx.endpoints).toHaveLength(1);
  });

  it('detects React from response body', () => {
    const harData = {
      log: {
        entries: [
          {
            request: { url: 'http://test.com', method: 'GET' },
            response: {
              status: 200,
              content: { mimeType: 'text/html', text: 'React App with react-dom' },
              headers: [],
            },
          },
        ],
      },
    };
    const ctx = buildTargetContext(harData);
    expect(ctx.detectedTech).toContain('React');
    expect(ctx.framework).toBe('React');
    expect(ctx.language).toBe('JavaScript/TypeScript');
  });

  it('detects Django from response body', () => {
    const harData = {
      log: {
        entries: [
          {
            request: { url: 'http://test.com/admin', method: 'GET' },
            response: {
              status: 200,
              content: { mimeType: 'text/html', text: 'django admin' },
              headers: [{ name: 'Set-Cookie', value: 'csrftoken=abc' }],
            },
          },
        ],
      },
    };
    const ctx = buildTargetContext(harData);
    expect(ctx.detectedTech).toContain('Django');
    expect(ctx.framework).toBe('Django');
    expect(ctx.language).toBe('Python');
  });

  it('detects Next.js from response body', () => {
    const harData = {
      log: {
        entries: [
          {
            request: { url: 'http://test.com/page', method: 'GET' },
            response: { status: 200, content: { mimeType: 'text/html', text: '<div id="__NEXT_DATA__">{"props":{}}</div>' }, headers: [] },
          },
        ],
      },
    };
    const ctx = buildTargetContext(harData);
    expect(ctx.detectedTech).toContain('Next.js');
    expect(ctx.framework).toBe('React');
    expect(ctx.language).toBe('JavaScript/TypeScript');
  });

  it('detects WordPress from response body', () => {
    const harData = {
      log: {
        entries: [
          {
            request: { url: 'http://test.com/page', method: 'GET' },
            response: { status: 200, content: { mimeType: 'text/html', text: 'wp-content/themes/x/style.css' }, headers: [] },
          },
        ],
      },
    };
    const ctx = buildTargetContext(harData);
    expect(ctx.detectedTech).toContain('WordPress');
  });

  it('detects ASP.NET', () => {
    const harData = {
      log: {
        entries: [
          {
            request: { url: 'http://test.com', method: 'GET' },
            response: {
              status: 200,
              content: { mimeType: 'text/html', text: '__viewstate' },
              headers: [{ name: 'X-AspNet-Version', value: '4.0' }],
            },
          },
        ],
      },
    };
    const ctx = buildTargetContext(harData);
    expect(ctx.detectedTech).toContain('ASP.NET');
    expect(ctx.framework).toBe('ASP.NET');
    expect(ctx.language).toBe('C#');
  });

  it('detects Spring Boot', () => {
    const harData = {
      log: {
        entries: [
          {
            request: { url: 'http://test.com/actuator/health', method: 'GET' },
            response: { status: 200, content: { mimeType: 'application/json', text: 'spring' }, headers: [] },
          },
        ],
      },
    };
    const ctx = buildTargetContext(harData);
    expect(ctx.detectedTech).toContain('Spring Boot');
    expect(ctx.framework).toBe('Spring Boot');
    expect(ctx.language).toBe('Java');
  });

  it('detects Rails', () => {
    const harData = {
      log: {
        entries: [
          {
            request: { url: 'http://test.com', method: 'GET' },
            response: {
              status: 200,
              content: { mimeType: 'text/html', text: 'rails app' },
              headers: [{ name: 'Set-Cookie', value: 'csrf-param=abc' }],
            },
          },
        ],
      },
    };
    const ctx = buildTargetContext(harData);
    expect(ctx.detectedTech).toContain('Rails');
    expect(ctx.framework).toBe('Ruby on Rails');
    expect(ctx.language).toBe('Ruby');
  });

  it('detects Laravel from session cookie', () => {
    const harData = {
      log: {
        entries: [
          {
            request: { url: 'http://test.com', method: 'GET' },
            response: {
              status: 200,
              content: { mimeType: 'text/html', text: '' },
              headers: [{ name: 'Set-Cookie', value: 'laravel_session=abc' }],
            },
          },
        ],
      },
    };
    const ctx = buildTargetContext(harData);
    expect(ctx.detectedTech).toContain('Laravel');
  });

  it('detects GraphQL from contentType', () => {
    const harData = {
      log: {
        entries: [
          {
            request: { url: 'http://test.com/graphql', method: 'POST' },
            response: {
              status: 200,
              content: { mimeType: 'application/graphql-response+json', text: '{"data":{}}' },
              headers: [],
            },
          },
        ],
      },
    };
    const ctx = buildTargetContext(harData);
    expect(ctx.apiType).toBe('graphql');
  });

  it('detects GraphQL from introspection in body', () => {
    const harData = {
      log: {
        entries: [
          {
            request: { url: 'http://test.com/api', method: 'POST' },
            response: {
              status: 200,
              content: { mimeType: 'application/json', text: '__schema introspection' },
              headers: [],
            },
          },
        ],
      },
    };
    const ctx = buildTargetContext(harData);
    expect(ctx.apiType).toBe('graphql');
  });

  it('detects REST API from json contentType', () => {
    const harData = {
      log: {
        entries: [
          {
            request: { url: 'http://test.com/api/v1/users', method: 'GET' },
            response: {
              status: 200,
              content: { mimeType: 'application/json', text: '[]' },
              headers: [],
            },
          },
        ],
      },
    };
    const ctx = buildTargetContext(harData);
    expect(ctx.apiType).toBe('rest');
  });

  it('detects JWT auth flow', () => {
    const harData = {
      log: {
        entries: [
          {
            request: { url: 'http://test.com/login', method: 'POST' },
            response: {
              status: 200,
              content: { mimeType: 'application/json', text: '{"token":"eyJhbGci.eyJzdWI.SflKxw","type":"bearer"}' },
              headers: [],
            },
          },
        ],
      },
    };
    const ctx = buildTargetContext(harData);
    expect(ctx.authFlows).toHaveLength(1);
    expect(ctx.authFlows[0].type).toBe('jwt');
    expect(ctx.authFlows[0].endpoint).toBe('http://test.com/login');
  });

  it('detects session auth flow', () => {
    const harData = {
      log: {
        entries: [
          {
            request: { url: 'http://test.com/login', method: 'POST' },
            response: {
              status: 200,
              content: { mimeType: 'text/html', text: 'session cookie set' },
              headers: [{ name: 'Set-Cookie', value: 'sessionid=abc123' }],
            },
          },
        ],
      },
    };
    const ctx = buildTargetContext(harData);
    expect(ctx.authFlows).toHaveLength(1);
    expect(ctx.authFlows[0].type).toBe('session');
  });

  it('detects database from response body', () => {
    const harData = {
      log: {
        entries: [
          {
            request: { url: 'http://test.com/api', method: 'GET' },
            response: {
              status: 200,
              content: { mimeType: 'text/html', text: 'postgresql error: syntax error' },
              headers: [],
            },
          },
        ],
      },
    };
    const ctx = buildTargetContext(harData);
    expect(ctx.dbType).toBe('PostgreSQL');
  });

  it('detects MongoDB from URL', () => {
    const harData = {
      log: {
        entries: [
          {
            request: { url: 'mongodb://localhost:27017/test', method: 'GET' },
            response: { status: 200, content: { mimeType: 'text/plain', text: '' }, headers: [] },
          },
        ],
      },
    };
    const ctx = buildTargetContext(harData);
    expect(ctx.dbType).toBe('MongoDB');
  });

  it('handles empty HAR log gracefully', () => {
    const harData = { log: { entries: [] } };
    const ctx = buildTargetContext(harData, 'http://test.com');
    expect(ctx.url).toBe('http://test.com');
    expect(ctx.endpoints).toEqual([]);
    expect(ctx.detectedTech).toEqual([]);
  });

  it('handles malformed HAR data gracefully', () => {
    const harData = { log: null };
    const ctx = buildTargetContext(harData);
    expect(ctx.url).toBe('');
    expect(ctx.endpoints).toEqual([]);
  });

  it('handles HAR with missing fields in entries', () => {
    const harData = {
      log: {
        entries: [
          { request: { url: 'http://test.com/api', method: 'GET' } },
        ],
      },
    };
    const ctx = buildTargetContext(harData);
    expect(ctx.endpoints).toHaveLength(1);
    expect(ctx.endpoints[0].status).toBe(0);
    expect(ctx.endpoints[0].contentType).toBe('');
  });

  it('detects PHP from X-Powered-By header', () => {
    const harData = {
      log: {
        entries: [
          {
            request: { url: 'http://test.com', method: 'GET' },
            response: {
              status: 200,
              content: { mimeType: 'text/html', text: '' },
              headers: [{ name: 'X-Powered-By', value: 'PHP/8.0' }],
            },
          },
        ],
      },
    };
    const ctx = buildTargetContext(harData);
    expect(ctx.detectedTech).toContain('PHP');
  });

  it('detects Express', () => {
    const harData = {
      log: {
        entries: [
          {
            request: { url: 'http://test.com', method: 'GET' },
            response: {
              status: 200,
              content: { mimeType: 'text/html', text: '' },
              headers: [{ name: 'X-Powered-By', value: 'express' }],
            },
          },
        ],
      },
    };
    const ctx = buildTargetContext(harData);
    expect(ctx.detectedTech).toContain('Express');
    expect(ctx.detectedTech).toContain('Node.js');
  });

  it('detects Flask from body', () => {
    const harData = {
      log: {
        entries: [
          {
            request: { url: 'http://test.com', method: 'GET' },
            response: {
              status: 200,
              content: { mimeType: 'text/html', text: 'werkzeug debugger' },
              headers: [],
            },
          },
        ],
      },
    };
    const ctx = buildTargetContext(harData);
    expect(ctx.detectedTech).toContain('Flask');
    expect(ctx.language).toBe('Python');
  });
});

describe('getContextSummary', () => {
  it('returns summary for a basic context', () => {
    const ctx: TargetContext = {
      url: 'http://test.com',
      detectedTech: ['React', 'Node.js'],
      authFlows: [],
      endpoints: [
        { url: 'http://test.com/api', method: 'GET', status: 200, authRequired: false, contentType: 'application/json' },
      ],
      sensitiveData: [],
      framework: 'React',
      language: 'JavaScript/TypeScript',
    };
    const summary = getContextSummary(ctx);
    expect(summary).toContain('http://test.com');
    expect(summary).toContain('React, Node.js');
    expect(summary).toContain('Framework: React');
    expect(summary).toContain('Language: JavaScript/TypeScript');
    expect(summary).toContain('Auth Flows: None detected');
    expect(summary).toContain('Endpoints: 1 total, 0 authenticated');
    expect(summary).toContain('Sensitive Data: 0 exposures');
  });

  it('includes auth flows in summary', () => {
    const ctx: TargetContext = {
      url: 'http://test.com',
      detectedTech: [],
      authFlows: [{ type: 'jwt', endpoint: 'http://test.com/login', method: 'POST' }],
      endpoints: [],
      sensitiveData: [],
    };
    const summary = getContextSummary(ctx);
    expect(summary).toContain('jwt@http://test.com/login');
  });

  it('includes dbType when present', () => {
    const ctx: TargetContext = {
      url: 'http://test.com',
      detectedTech: [],
      authFlows: [],
      endpoints: [],
      sensitiveData: [],
      dbType: 'PostgreSQL',
    };
    const summary = getContextSummary(ctx);
    expect(summary).toContain('Database: PostgreSQL');
  });

  it('includes apiType when present', () => {
    const ctx: TargetContext = {
      url: 'http://test.com',
      detectedTech: [],
      authFlows: [],
      endpoints: [],
      sensitiveData: [],
      apiType: 'graphql',
    };
    const summary = getContextSummary(ctx);
    expect(summary).toContain('API Type: graphql');
  });

  it('counts authenticated endpoints correctly', () => {
    const ctx: TargetContext = {
      url: 'http://test.com',
      detectedTech: [],
      authFlows: [],
      endpoints: [
        { url: '/public', method: 'GET', status: 200, authRequired: false, contentType: 'text/html' },
        { url: '/admin', method: 'POST', status: 200, authRequired: true, contentType: 'text/html' },
      ],
      sensitiveData: [],
    };
    const summary = getContextSummary(ctx);
    expect(summary).toContain('Endpoints: 2 total, 1 authenticated');
  });

  it('shows unknown tech when none detected', () => {
    const ctx: TargetContext = {
      url: 'http://test.com',
      detectedTech: [],
      authFlows: [],
      endpoints: [],
      sensitiveData: [],
    };
    const summary = getContextSummary(ctx);
    expect(summary).toContain('Tech Stack: Unknown');
  });
});
