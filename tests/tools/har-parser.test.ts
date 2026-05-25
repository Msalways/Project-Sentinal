import { describe, it, expect, vi } from 'vitest';
import { HARParser } from '../../src/tools/har-parser';
import type { HARFile } from '../../src/core/types';

function makeHarFile(entries: Partial<HARFile['log']['entries'][number]>[] = []): HARFile {
  return {
    log: {
      version: '1.2',
      creator: { name: 'test', version: '1.0' },
      entries: entries.map((e) => ({
        startedDateTime: e.startedDateTime || '2025-01-01T00:00:00Z',
        time: e.time || 100,
        request: {
          method: e.request?.method || 'GET',
          url: e.request?.url || 'https://example.com/api/test',
          httpVersion: 'HTTP/1.1',
          headers: e.request?.headers || [],
          queryString: e.request?.queryString || [],
        } as HARFile['log']['entries'][number]['request'],
        response: {
          status: e.response?.status ?? 200,
          statusText: 'OK',
          httpVersion: 'HTTP/1.1',
          headers: e.response?.headers || [],
          content: {
            mimeType: 'application/json',
            text: e.response?.content?.text || '',
            size: e.response?.content?.text?.length || 0,
          },
        } as HARFile['log']['entries'][number]['response'],
        cache: {},
        timings: {},
      })),
    },
  };
}

describe('HARParser', () => {
  describe('constructor', () => {
    it('parses from HARFile object', () => {
      const har = makeHarFile();
      const parser = new HARParser(har);
      expect(parser.getEntries()).toHaveLength(0);
    });

    it('parses from JSON string', () => {
      const har = makeHarFile();
      const parser = new HARParser(JSON.stringify(har));
      expect(parser.getEntries()).toHaveLength(0);
    });

    it('throws on invalid JSON string', () => {
      expect(() => new HARParser('not json')).toThrow();
    });
  });

  describe('fromFile', () => {
    it('reads and parses a HAR file', () => {
      const har = makeHarFile([{ request: { url: 'https://example.com/api', method: 'GET', headers: [], queryString: [] }, response: { status: 200, content: { text: 'ok', mimeType: 'text/plain', size: 2 } } }]);
      const fs = require('fs');
      const readSpy = vi.spyOn(fs, 'readFileSync').mockReturnValue(JSON.stringify(har));
      const parser = HARParser.fromFile('/fake/test.har');
      expect(parser.getEntries()).toHaveLength(1);
      readSpy.mockRestore();
    });
  });

  describe('getEntries', () => {
    it('returns all entries', () => {
      const har = makeHarFile([
        { request: { url: 'https://a.com/1', method: 'GET', headers: [], queryString: [] } },
        { request: { url: 'https://a.com/2', method: 'POST', headers: [], queryString: [] } },
      ]);
      const parser = new HARParser(har);
      expect(parser.getEntries()).toHaveLength(2);
    });

    it('returns empty array for empty log', () => {
      const har = makeHarFile([]);
      const parser = new HARParser(har);
      expect(parser.getEntries()).toEqual([]);
    });
  });

  describe('getUniqueUrls', () => {
    it('returns unique URLs', () => {
      const har = makeHarFile([
        { request: { url: 'https://a.com/api', method: 'GET', headers: [], queryString: [] } },
        { request: { url: 'https://a.com/api', method: 'POST', headers: [], queryString: [] } },
        { request: { url: 'https://a.com/other', method: 'GET', headers: [], queryString: [] } },
      ]);
      const parser = new HARParser(har);
      const urls = parser.getUniqueUrls();
      expect(urls).toHaveLength(2);
      expect(urls).toContain('https://a.com/api');
      expect(urls).toContain('https://a.com/other');
    });
  });

  describe('getEndpoints', () => {
    it('returns deduplicated endpoints with method, url, status', () => {
      const har = makeHarFile([
        { request: { url: 'https://a.com/api', method: 'GET', headers: [], queryString: [] }, response: { status: 200 } },
        { request: { url: 'https://a.com/api', method: 'GET', headers: [], queryString: [] }, response: { status: 200 } },
        { request: { url: 'https://a.com/api', method: 'POST', headers: [], queryString: [] }, response: { status: 201 } },
      ]);
      const parser = new HARParser(har);
      const endpoints = parser.getEndpoints();
      expect(endpoints).toHaveLength(2);
      expect(endpoints[0]).toEqual({ url: 'https://a.com/api', method: 'GET', status: 200 });
      expect(endpoints[1]).toEqual({ url: 'https://a.com/api', method: 'POST', status: 201 });
    });
  });

  describe('getAuthEndpoints', () => {
    it('detects Bearer auth', () => {
      const har = makeHarFile([
        {
          request: {
            url: 'https://a.com/secure',
            method: 'GET',
            headers: [{ name: 'Authorization', value: 'Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjMifQ.test' }],
            queryString: [],
          },
        },
      ]);
      const parser = new HARParser(har);
      const auth = parser.getAuthEndpoints();
      expect(auth[0].hasAuth).toBe(true);
      expect(auth[0].authType).toBe('jwt');
    });

    it('detects Basic auth', () => {
      const har = makeHarFile([
        {
          request: {
            url: 'https://a.com/basic',
            method: 'GET',
            headers: [{ name: 'Authorization', value: 'Basic dXNlcjpwYXNz' }],
            queryString: [],
          },
        },
      ]);
      const parser = new HARParser(har);
      const auth = parser.getAuthEndpoints();
      expect(auth[0].hasAuth).toBe(true);
      expect(auth[0].authType).toBe('basic');
    });

    it('detects session cookie auth', () => {
      const har = makeHarFile([
        {
          request: {
            url: 'https://a.com/app',
            method: 'GET',
            headers: [{ name: 'Cookie', value: 'session=abc123' }],
            queryString: [],
          },
        },
      ]);
      const parser = new HARParser(har);
      const auth = parser.getAuthEndpoints();
      expect(auth[0].hasAuth).toBe(true);
      expect(auth[0].authType).toBe('session');
    });

    it('marks endpoints without auth headers', () => {
      const har = makeHarFile([
        {
          request: {
            url: 'https://a.com/public',
            method: 'GET',
            headers: [{ name: 'Accept', value: 'application/json' }],
            queryString: [],
          },
        },
      ]);
      const parser = new HARParser(har);
      const auth = parser.getAuthEndpoints();
      expect(auth[0].hasAuth).toBe(false);
      expect(auth[0].authType).toBeUndefined();
    });
  });

  describe('getSensitiveData', () => {
    it('detects email in response body', () => {
      const har = makeHarFile([
        {
          request: { url: 'https://a.com/users', method: 'GET', headers: [], queryString: [] },
          response: { content: { text: 'Contact: user@example.com', mimeType: 'text/html', size: 0 } },
        },
      ]);
      const parser = new HARParser(har);
      const data = parser.getSensitiveData();
      expect(data.length).toBeGreaterThanOrEqual(1);
      expect(data[0].type).toBe('email');
    });

    it('detects SSN in response body', () => {
      const har = makeHarFile([
        {
          request: { url: 'https://a.com/hr', method: 'GET', headers: [], queryString: [] },
          response: { content: { text: 'SSN: 123-45-6789', mimeType: 'text/plain', size: 0 } },
        },
      ]);
      const parser = new HARParser(har);
      const data = parser.getSensitiveData();
      expect(data.some((d) => d.type === 'ssn' && d.value.includes('123-45-6789'))).toBe(true);
    });

    it('detects credit card in response body', () => {
      const har = makeHarFile([
        {
          request: { url: 'https://a.com/billing', method: 'GET', headers: [], queryString: [] },
          response: { content: { text: 'Card: 4111-1111-1111-1111', mimeType: 'text/plain', size: 0 } },
        },
      ]);
      const parser = new HARParser(har);
      const data = parser.getSensitiveData();
      expect(data.some((d) => d.type === 'credit_card')).toBe(true);
    });

    it('detects password in response body', () => {
      const har = makeHarFile([
        {
          request: { url: 'https://a.com/debug', method: 'GET', headers: [], queryString: [] },
          response: { content: { text: 'password=supersecret123', mimeType: 'text/plain', size: 0 } },
        },
      ]);
      const parser = new HARParser(har);
      const data = parser.getSensitiveData();
      expect(data.some((d) => d.type === 'password')).toBe(true);
    });

    it('detects JWT in response body', () => {
      const har = makeHarFile([
        {
          request: { url: 'https://a.com/auth', method: 'GET', headers: [], queryString: [] },
          response: { content: { text: 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjMifQ.test-token', mimeType: 'text/plain', size: 0 } },
        },
      ]);
      const parser = new HARParser(har);
      const data = parser.getSensitiveData();
      expect(data.some((d) => d.type === 'jwt')).toBe(true);
    });

    it('returns empty for clean responses', () => {
      const har = makeHarFile([
        {
          request: { url: 'https://a.com/ok', method: 'GET', headers: [], queryString: [] },
          response: { content: { text: '{"status":"ok"}', mimeType: 'application/json', size: 0 } },
        },
      ]);
      const parser = new HARParser(har);
      expect(parser.getSensitiveData()).toEqual([]);
    });
  });

  describe('buildDependencyGraph', () => {
    it('builds nodes from endpoints', () => {
      const har = makeHarFile([
        {
          request: { url: 'https://api.example.com/users', method: 'GET', headers: [], queryString: [] },
          response: { status: 200 },
        },
      ]);
      const parser = new HARParser(har);
      const graph = parser.buildDependencyGraph();
      expect(graph.nodes).toHaveLength(1);
      expect(graph.nodes[0].id).toBe('GET:https://api.example.com/users');
      expect(graph.nodes[0].service).toBe('users');
    });

    it('infers service from URL path', () => {
      const har = makeHarFile([
        {
          request: { url: 'https://api.example.com/orders/123', method: 'GET', headers: [], queryString: [] },
          response: { status: 200 },
        },
      ]);
      const parser = new HARParser(har);
      const graph = parser.buildDependencyGraph();
      expect(graph.nodes[0].service).toBe('orders');
    });

    it('uses hostname when path is empty or has no segments', () => {
      const har = makeHarFile([
        {
          request: { url: 'https://api.example.com/', method: 'GET', headers: [], queryString: [] },
          response: { status: 200 },
        },
      ]);
      const parser = new HARParser(har);
      const graph = parser.buildDependencyGraph();
      expect(graph.nodes[0].service).toBe('api.example.com');
    });
  });
});
