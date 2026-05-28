import path from 'path';
import fs from 'fs';
import { crawl, type CrawlOptions } from './crawler';
import type { BrowserSessionManager } from '../core/browser-session';
import type { AppModelForm } from '../core/app-model';
import type { ParameterClass } from '../core/app-model';

export interface ExploreOptions {
  target: string;
  browserManager: BrowserSessionManager;
  outputDir: string;
  maxDepth?: number;
  maxPages?: number;
  onProgress?: (msg: string) => void;
}

export interface ExploreResult {
  target: string;
  techStack: string[];
  auth: {
    type: 'JWT' | 'session' | 'basic' | 'oauth' | 'none' | 'unknown';
    loginEndpoint: string;
    endpoints: string[];
    cookies: Record<string, string>;
    tokens: string[];
    sessions: Record<string, { label: string; filePath: string; savedAt: string; url: string }>;
  };
  workflow: { nodes: any[]; edges: any[] };
  endpoints: any[];
  forms: AppModelForm[];
  scripts: any[];
  cookies: Record<string, string>;
  localStorage: Record<string, string>;
  findings: any[];
  verifications: any[];
  parameterClassifications: ParameterClass[];
  authBoundaries: any[];
  recordedSessions: Record<string, any[]>;
  hypotheses: string[];
  nextSteps: string[];
  visitedUrls: string[];
}

export async function runExploration(options: ExploreOptions): Promise<ExploreResult> {
  const { target, browserManager, outputDir, maxDepth = 2, maxPages = 30, onProgress } = options;
  const log = onProgress || ((msg: string) => {});

  log('Starting automated workflow exploration...');
  log(`Target: ${target}, maxDepth: ${maxDepth}, maxPages: ${maxPages}`);

  const crawlResult = await crawl({
    target,
    browserManager,
    maxDepth,
    maxPages,
    onProgress,
  });

  log(`Crawl complete: ${crawlResult.nodes.length} nodes, ${crawlResult.edges.length} edges, ${crawlResult.endpoints.length} endpoints`);

  // Save raw exploration artifacts
  const explorerDir = path.join(outputDir, 'explorer');
  fs.mkdirSync(explorerDir, { recursive: true });

  fs.writeFileSync(path.join(explorerDir, 'nodes.json'), JSON.stringify(crawlResult.nodes, null, 2));
  fs.writeFileSync(path.join(explorerDir, 'edges.json'), JSON.stringify(crawlResult.edges, null, 2));
  fs.writeFileSync(path.join(explorerDir, 'endpoints.json'), JSON.stringify(crawlResult.endpoints, null, 2));
  fs.writeFileSync(path.join(explorerDir, 'auth-boundaries.json'), JSON.stringify(crawlResult.authBoundaries, null, 2));
  fs.writeFileSync(path.join(explorerDir, 'visited-urls.json'), JSON.stringify(crawlResult.visitedUrls, null, 2));

  log('Exploration artifacts saved to explore/ directory');

  // Detect login endpoint from nodes
  const loginNode = crawlResult.nodes.find(n => n.type === 'login' || /login|auth|signin/.test(n.url.toLowerCase()));
  const loginEndpoint = loginNode?.url || '';

  // Build parameter classifications from forms
  const parameterClassifications: ParameterClass[] = [];
  for (const form of crawlResult.forms) {
    for (const field of form.fields) {
      parameterClassifications.push({
        paramName: field.name,
        pageUrl: form.pageUrl,
        classifiedAs: classifyField(field.name, field.type, field.placeholder),
        attackHints: attackHintsFor(classifyField(field.name, field.type, field.placeholder)),
      });
    }
  }

  return {
    target,
    techStack: crawlResult.techStack,
    auth: {
      type: loginEndpoint ? 'unknown' : 'none',
      loginEndpoint,
      endpoints: [],
      cookies: {},
      tokens: [],
      sessions: {},
    },
    workflow: { nodes: crawlResult.nodes, edges: crawlResult.edges },
    endpoints: crawlResult.endpoints,
    forms: crawlResult.forms,
    scripts: [],
    cookies: {},
    localStorage: {},
    findings: [],
    verifications: [],
    parameterClassifications,
    authBoundaries: crawlResult.authBoundaries,
    recordedSessions: {},
    hypotheses: [
      loginEndpoint ? `Try to authenticate at ${loginEndpoint}` : 'No login endpoint found',
      'Probe discovered endpoints for common vulnerabilities',
      'Test form submissions for injection attacks',
    ],
    nextSteps: ['Read app model workflow graph', 'Probe auth boundaries', 'Classify remaining parameters', 'Test inferred vulnerabilities'],
    visitedUrls: crawlResult.visitedUrls,
  };
}

function classifyField(name: string, type: string, placeholder: string): ParameterClass['classifiedAs'] {
  const combined = (name + ' ' + placeholder).toLowerCase();
  if (/email|e-mail/i.test(combined)) return 'email';
  if (/password|passwd/i.test(combined)) return 'password';
  if (/search|q|query/i.test(combined)) return 'search';
  if (/price|amount|cost|total|fee|tax/i.test(combined)) return 'price';
  if (/quantity|qty|count/i.test(combined)) return 'quantity';
  if (/first.?name|last.?name|full.?name|name/i.test(combined)) return 'name';
  if (/date|dob|birth/i.test(combined)) return 'date';
  if (/file|upload|attachment/i.test(combined)) return 'file';
  if (/token|jwt|bearer|api.?key/i.test(combined)) return 'token';
  if (/id|userId|accountId|memberId|sku/i.test(combined)) return 'id';
  return 'unknown';
}

function attackHintsFor(cls: ParameterClass['classifiedAs']): string[] {
  const hints: Record<string, string[]> = {
    id: ['SQL injection', 'IDOR / Insecure Direct Object Reference'],
    email: ['SQL injection', 'Account enumeration', 'NoSQL injection'],
    password: ['Auth bypass', 'SQL injection', 'Brute force'],
    search: ['XSS', 'SQL injection', 'LDAP injection'],
    price: ['Parameter pollution', 'Integer overflow', 'Price manipulation'],
    quantity: ['Integer overflow', 'Parameter pollution'],
    name: ['XSS', 'SQL injection'],
    date: ['Date manipulation', 'SQL injection'],
    file: ['Path traversal', 'File upload bypass'],
    token: ['JWT alg=none', 'Token forgery', 'Token replay'],
    unknown: ['XSS', 'SQL injection', 'Parameter pollution'],
  };
  return hints[cls] || ['XSS', 'SQL injection'];
}
