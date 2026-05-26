import type { Finding, Severity } from './types';

export interface NucleiTemplate {
  id: string;
  info: {
    name: string;
    author?: string;
    severity?: 'info' | 'low' | 'medium' | 'high' | 'critical';
    description?: string;
    tags?: string[];
    reference?: string[];
  };
  requests: NucleiRequest[];
}

export interface NucleiRequest {
  method: string;
  path: string[];
  headers?: Record<string, string>;
  body?: string;
  matchers?: NucleiMatcher[];
  extractors?: NucleiExtractor[];
}

export interface NucleiMatcher {
  type: 'status' | 'word' | 'regex' | 'binary' | 'dsl';
  condition?: 'and' | 'or';
  status?: number[];
  words?: string[];
  regex?: string[];
  part?: 'body' | 'header' | 'all';
  negative?: boolean;
}

export interface NucleiExtractor {
  type: 'regex' | 'json' | 'xpath' | 'kval';
  name: string;
  regex?: string[];
  json?: string[];
  part?: 'body' | 'header' | 'all';
}

function parseYamlSimple(yaml: string): Record<string, unknown> {
  const lines = yaml.split('\n');
  const root: Record<string, unknown> = {};
  const stack: { indent: number; obj: Record<string, unknown>; key?: string }[] = [{ indent: -1, obj: root }];

  for (const raw of lines) {
    const trimmed = raw.trimEnd();
    if (trimmed.trim() === '' || trimmed.trim().startsWith('#')) continue;
    const indent = trimmed.length - trimmed.trimStart().length;
    const content = trimmed.trim();
    const arrayMatch = content.match(/^-\s+(.+)/);
    const kvMatch = content.match(/^(\w[\w_-]*):\s*(.*)/);

    while (stack.length > 1 && indent <= stack[stack.length - 1].indent) {
      stack.pop();
    }

    const parent = stack[stack.length - 1].obj;
    const parentKey = stack[stack.length - 1].key;

    if (arrayMatch) {
      const val = arrayMatch[1].trim();
      if (parentKey && !Array.isArray(parent[parentKey])) {
        parent[parentKey] = [];
      }
      if (parentKey) {
        (parent[parentKey] as unknown[]).push(parseScalar(val));
      }
    } else if (kvMatch) {
      const key = kvMatch[1];
      let val = kvMatch[2].trim();
      if (val === '' || val === '|') {
        const newObj: Record<string, unknown> = {};
        parent[key] = newObj;
        stack.push({ indent, obj: newObj, key });
      } else if (val.startsWith('"') && val.endsWith('"')) {
        parent[key] = val.slice(1, -1);
      } else if (val.startsWith("'") && val.endsWith("'")) {
        parent[key] = val.slice(1, -1);
      } else {
        parent[key] = parseScalar(val);
      }
    }
  }

  return root;
}

function parseScalar(val: string): string | number | boolean | string[] {
  if (val === 'true') return true;
  if (val === 'false') return false;
  if (/^\d+$/.test(val)) return parseInt(val, 10);
  if (/^\d+\.\d+$/.test(val)) return parseFloat(val);
  if (val.startsWith('[') && val.endsWith(']')) {
    return val.slice(1, -1).split(',').map((s) => s.trim().replace(/^["']|["']$/g, ''));
  }
  return val;
}

function parseYamlArray(lines: string[], startIdx: number): { items: unknown[]; nextIdx: number } {
  const items: unknown[] = [];
  let i = startIdx;
  while (i < lines.length && lines[i].trim().startsWith('-')) {
    items.push(lines[i].trim().replace(/^-\s*/, ''));
    i++;
  }
  return { items, nextIdx: i };
}

export class TemplateEngine {
  private templates: Map<string, NucleiTemplate> = new Map();
  private templateDir: string;

  static builtInTemplates: NucleiTemplate[] = [
    {
      id: 'basic-info',
      info: {
        name: 'Basic Information Disclosure',
        severity: 'medium',
        description: 'Checks for common information disclosure paths',
        tags: ['info', 'disclosure'],
      },
      requests: [
        {
          method: 'GET',
          path: [
            '/.env',
            '/.git/config',
            '/admin',
            '/debug',
            '/api/health',
            '/.well-known/security.txt',
            '/robots.txt',
            '/sitemap.xml',
          ],
          matchers: [
            {
              type: 'status',
              status: [200, 201, 204],
            },
          ],
        },
      ],
    },
    {
      id: 'xss-test',
      info: {
        name: 'Reflected XSS Detection',
        severity: 'medium',
        description: 'Checks for reflected XSS in common parameters',
        tags: ['xss', 'injection'],
      },
      requests: [
        {
          method: 'GET',
          path: [
            '/?q=<script>alert(1)</script>',
            '/?search=%3Cscript%3Ealert(1)%3C/script%3E',
            '/?name=%3Cimg%20src=x%20onerror=alert(1)%3E',
            '/?input=<svg onload=alert(1)>',
            '/?msg="><script>alert(1)</script>',
          ],
          matchers: [
            {
              type: 'word',
              words: [
                '<script>alert(1)</script>',
                '<img src=x onerror=alert(1)>',
                '<svg onload=alert(1)>',
              ],
              part: 'body',
            },
          ],
        },
      ],
    },
    {
      id: 'dir-enum',
      info: {
        name: 'Directory Enumeration',
        severity: 'medium',
        description: 'Checks for exposed directories and files',
        tags: ['enum', 'discovery'],
      },
      requests: [
        {
          method: 'GET',
          path: [
            '/.git/',
            '/.svn/',
            '/.DS_Store',
            '/backup/',
            '/config/',
            '/logs/',
            '/node_modules/',
            '/vendor/',
            '/wp-admin/',
            '/actuator/',
            '/swagger-ui/',
            '/graphql',
            '/.well-known/',
          ],
          matchers: [
            {
              type: 'status',
              status: [200, 201, 204, 401, 403],
            },
          ],
        },
      ],
    },
  ];

  constructor(templateDir?: string) {
    this.templateDir = templateDir || '';
    for (const tpl of TemplateEngine.builtInTemplates) {
      this.templates.set(tpl.id, tpl);
    }
  }

  loadTemplate(yaml: string): NucleiTemplate {
    const parsed = parseYamlSimple(yaml);
    const id = parsed.id as string;
    if (!id) throw new Error('Template missing required field: id');

    const infoRaw = parsed.info as Record<string, unknown> | undefined;
    if (!infoRaw) throw new Error('Template missing required field: info');

    const requestsRaw = parsed.requests as Record<string, unknown>[] | undefined;
    if (!requestsRaw) throw new Error('Template missing required field: requests');

    const template: NucleiTemplate = {
      id,
      info: {
        name: infoRaw.name as string || id,
        author: infoRaw.author as string | undefined,
        severity: infoRaw.severity as NucleiTemplate['info']['severity'],
        description: infoRaw.description as string | undefined,
        tags: infoRaw.tags as string[] | undefined,
        reference: infoRaw.reference as string[] | undefined,
      },
      requests: requestsRaw.map((r) => ({
        method: r.method as string || 'GET',
        path: Array.isArray(r.path) ? (r.path as string[]) : [r.path as string],
        headers: r.headers as Record<string, string> | undefined,
        body: r.body as string | undefined,
        matchers: (r.matchers as Record<string, unknown>[] | undefined)?.map((m) => ({
          type: m.type as NucleiMatcher['type'],
          condition: m.condition as 'and' | 'or' | undefined,
          status: m.status ? (m.status as number[]) : undefined,
          words: m.words ? (m.words as string[]) : undefined,
          regex: m.regex ? (m.regex as string[]) : undefined,
          part: m.part as 'body' | 'header' | 'all' | undefined,
          negative: m.negative as boolean | undefined,
        })),
        extractors: (r.extractors as Record<string, unknown>[] | undefined)?.map((e) => ({
          type: e.type as NucleiExtractor['type'],
          name: e.name as string,
          regex: e.regex ? (e.regex as string[]) : undefined,
          json: e.json ? (e.json as string[]) : undefined,
          part: e.part as 'body' | 'header' | 'all' | undefined,
        })),
      })),
    };

    this.templates.set(template.id, template);
    return template;
  }

  loadTemplatesFromDir(dir?: string): void {
    const targetDir = dir || this.templateDir;
    if (!targetDir) return;
    try {
      const fs = require('fs');
      const pathModule = require('path');
      if (!fs.existsSync(targetDir)) return;
      const files = fs.readdirSync(targetDir).filter((f: string) => f.endsWith('.yaml') || f.endsWith('.yml'));
      for (const file of files) {
        try {
          const yaml = fs.readFileSync(pathModule.join(targetDir, file), 'utf-8');
          this.loadTemplate(yaml);
        } catch {
          // skip invalid templates
        }
      }
    } catch {
      // skip if fs unavailable
    }
  }

  getTemplate(id: string): NucleiTemplate | undefined {
    return this.templates.get(id);
  }

  getAllTemplates(): NucleiTemplate[] {
    return Array.from(this.templates.values());
  }

  searchTemplates(query: string): NucleiTemplate[] {
    const lower = query.toLowerCase();
    return this.getAllTemplates().filter(
      (t) =>
        t.id.toLowerCase().includes(lower) ||
        t.info.name.toLowerCase().includes(lower) ||
        (t.info.description && t.info.description.toLowerCase().includes(lower)) ||
        (t.info.tags && t.info.tags.some((tag) => tag.toLowerCase().includes(lower)))
    );
  }

  async executeTemplate(template: NucleiTemplate, target: string): Promise<Finding[]> {
    const findings: Finding[] = [];
    const baseUrl = target.replace(/\/+$/, '');

    for (const request of template.requests) {
      for (const rawPath of request.path) {
        const path = rawPath.replace(/\{\{BaseURL\}\}/g, baseUrl);
        const url = path.startsWith('http') ? path : `${baseUrl}${path}`;

        try {
          const fetchOptions: RequestInit = {
            method: request.method,
            headers: { ...request.headers } as Record<string, string>,
          };

          if (request.body) {
            fetchOptions.body = request.body;
          }

          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 10000);
          fetchOptions.signal = controller.signal;

          const response = await fetch(url, fetchOptions);
          clearTimeout(timeout);

          const responseBody = await response.text();
          const responseHeaders: Record<string, string> = {};
          response.headers.forEach((v: string, k: string) => {
            responseHeaders[k] = v;
          });

          if (request.matchers && request.matchers.length > 0) {
            const matched = this.applyMatchers(request.matchers, response, responseBody, responseHeaders);
            if (matched) {
              const severity = template.info.severity || 'medium';
              findings.push({
                id: `${template.id}-${Buffer.from(url).toString('base64url').slice(0, 12)}`,
                title: template.info.name,
                description: template.info.description || `Matched on ${url}`,
                severity: severity as Severity,
                category: template.info.tags?.[0] || 'template',
                confidence: 75,
                location: url,
                evidence: `HTTP ${response.status} - Body length: ${responseBody.length}`,
                remediation: 'Review the exposed endpoint and restrict access if sensitive.',
                agent: 'web',
                timestamp: new Date().toISOString(),
              });
            }
          }
        } catch {
          // request failed, skip
        }
      }
    }

    return findings;
  }

  async executeAll(target: string, severity?: string): Promise<Finding[]> {
    const allFindings: Finding[] = [];
    const templates = this.getAllTemplates();

    for (const tpl of templates) {
      if (severity && tpl.info.severity !== severity) continue;
      const findings = await this.executeTemplate(tpl, target);
      allFindings.push(...findings);
    }

    return allFindings;
  }

  private applyMatchers(
    matchers: NucleiMatcher[],
    response: Response,
    body: string,
    headers: Record<string, string>
  ): boolean {
    const condition = matchers[0]?.condition || 'or';
    const results = matchers.map((matcher) => this.evaluateMatcher(matcher, response, body, headers));

    if (condition === 'and') {
      const allMatched = results.every(Boolean);
      return matchers[0]?.negative ? !allMatched : allMatched;
    }
    const anyMatched = results.some(Boolean);
    return matchers[0]?.negative ? !anyMatched : anyMatched;
  }

  private evaluateMatcher(
    matcher: NucleiMatcher,
    response: Response,
    body: string,
    headers: Record<string, string>
  ): boolean {
    const target = matcher.part === 'header'
      ? Object.entries(headers).map(([k, v]) => `${k}: ${v}`).join('\n')
      : matcher.part === 'all'
        ? `${response.status}\n${Object.entries(headers).map(([k, v]) => `${k}: ${v}`).join('\n')}\n${body}`
        : body;

    switch (matcher.type) {
      case 'status':
        return matcher.status?.includes(response.status) || false;

      case 'word':
        return matcher.words?.some((word) => target.includes(word)) || false;

      case 'regex':
        return matcher.regex?.some((pattern) => new RegExp(pattern).test(target)) || false;

      case 'binary':
        return matcher.words?.some((word) => {
          const buf = Buffer.from(word, 'hex');
          return body.includes(buf.toString());
        }) || false;

      case 'dsl':
        return true;

      default:
        return false;
    }
  }
}

export const templateEngine = new TemplateEngine();
