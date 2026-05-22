import fs from 'fs';
import type { HARFile, HAREntry, DependencyNode, DependencyEdge, DependencyGraph } from '../core/types';

export class HARParser {
  private har: HARFile;

  constructor(har: HARFile);
  constructor(content: string);
  constructor(input: HARFile | string) {
    if (typeof input === 'string') this.har = JSON.parse(input);
    else this.har = input;
  }

  static fromFile(path: string): HARParser {
    return new HARParser(fs.readFileSync(path, 'utf-8'));
  }

  getEntries(): HAREntry[] { return this.har.log.entries; }

  getUniqueUrls(): string[] {
    const urls = new Set<string>();
    for (const entry of this.har.log.entries) urls.add(entry.request.url);
    return Array.from(urls);
  }

  getEndpoints(): { url: string; method: string; status: number }[] {
    const endpoints: { url: string; method: string; status: number }[] = [];
    const seen = new Set<string>();
    for (const entry of this.har.log.entries) {
      const key = `${entry.request.method}:${entry.request.url}`;
      if (!seen.has(key)) { seen.add(key); endpoints.push({ url: entry.request.url, method: entry.request.method, status: entry.response.status }); }
    }
    return endpoints;
  }

  getAuthEndpoints(): { url: string; method: string; hasAuth: boolean; authType?: string }[] {
    const results: { url: string; method: string; hasAuth: boolean; authType?: string }[] = [];
    for (const entry of this.har.log.entries) {
      const authHeader = entry.request.headers.find((h) => h.name.toLowerCase() === 'authorization');
      const cookieHeader = entry.request.headers.find((h) => h.name.toLowerCase() === 'cookie');
      let authType: string | undefined;
      if (authHeader) {
        if (authHeader.value.startsWith('Bearer ')) authType = 'jwt';
        else if (authHeader.value.startsWith('Basic ')) authType = 'basic';
        else authType = 'custom';
      } else if (cookieHeader) authType = 'session';
      results.push({ url: entry.request.url, method: entry.request.method, hasAuth: !!authHeader || !!cookieHeader, authType });
    }
    return results;
  }

  getSensitiveData(): { url: string; type: string; value: string }[] {
    const patterns = [
      { type: 'email', regex: /[\w.-]+@[\w.-]+\.\w+/ },
      { type: 'phone', regex: /\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/ },
      { type: 'ssn', regex: /\b\d{3}-\d{2}-\d{4}\b/ },
      { type: 'credit_card', regex: /\b\d{4}[- ]?\d{4}[- ]?\d{4}[- ]?\d{4}\b/ },
      { type: 'api_key', regex: /(?:api[_-]?key|apikey)[=:]\s*[\w-]{16,}/i },
      { type: 'password', regex: /(?:password|passwd|pwd)[=:]\s*\S+/i },
      { type: 'jwt', regex: /eyJ[A-Za-z0-9-_]+\.eyJ[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+/ },
    ];
    const findings: { url: string; type: string; value: string }[] = [];
    for (const entry of this.har.log.entries) {
      const body = entry.response.content.text || '';
      for (const pattern of patterns) {
        const matches = body.match(pattern.regex);
        if (matches) {
          for (const match of matches.slice(0, 3)) findings.push({ url: entry.request.url, type: pattern.type, value: match });
        }
      }
    }
    return findings;
  }

  buildDependencyGraph(): DependencyGraph {
    const nodes: DependencyNode[] = [];
    const edges: DependencyEdge[] = [];
    const endpoints = this.getEndpoints();
    const authInfo = this.getAuthEndpoints();

    for (const ep of endpoints) {
      const url = new URL(ep.url);
      const service = this.inferService(url);
      const auth = authInfo.find((a) => a.url === ep.url);
      const nodeId = `${ep.method}:${ep.url}`;
      nodes.push({ id: nodeId, url: ep.url, service, authType: auth?.authType, methods: [ep.method], sensitiveData: [] });
    }

    for (const entry of this.har.log.entries) {
      const fromId = `${entry.request.method}:${entry.request.url}`;
      const referrer = entry.request.headers.find((h) => h.name.toLowerCase() === 'referer');
      if (referrer) {
        const toNode = nodes.find((n) => referrer.value.startsWith(n.url));
        if (toNode) edges.push({ from: toNode.id, to: fromId, type: 'calls', label: 'referer' });
      }
    }

    return { nodes, edges };
  }

  private inferService(url: URL): string {
    const path = url.pathname;
    const parts = path.split('/').filter(Boolean);
    if (parts.length > 0) {
      const firstSegment = parts[0];
      if (!firstSegment.match(/^_[a-z]/i) && !firstSegment.includes('.')) {
        return firstSegment;
      }
    }
    return url.hostname;
  }
}
