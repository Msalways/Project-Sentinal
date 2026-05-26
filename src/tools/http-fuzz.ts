import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { payloadLib } from '../core/payload-lib';

const COMMON_FILES = [
  '.env', '.git/config', 'config.json', 'config.php', 'config.js', 'settings.py',
  'credentials.json', 'secrets.yml', 'database.yml', 'wp-config.php',
  'package.json', 'composer.json', 'requirements.txt', 'Gemfile',
  'Dockerfile', 'docker-compose.yml', 'Makefile',
  'index.html', 'index.php', 'index.js', 'app.js', 'main.py', 'server.js',
  'favicon.ico', 'robots.txt', 'sitemap.xml', 'security.txt',
  'swagger.json', 'openapi.json', 'graphql', 'schema.graphql',
  'backup.sql', 'dump.sql', 'db.sql', 'data.json',
  'README.md', 'CHANGELOG.md', 'LICENSE',
  '.htaccess', 'web.config', 'nginx.conf', '.env.local', '.env.production',
];

const COMMON_DIRS = [
  'admin', 'login', 'api', 'v1', 'v2', 'graphql', 'swagger', 'docs',
  'backup', 'backups', 'db', 'database', 'test', 'tests', 'staging',
  'dev', 'debug', 'console', 'dashboard', 'config', 'configs',
  'uploads', 'files', 'assets', 'static', 'public', 'dist', 'build',
  'wp-admin', 'wp-content', 'wp-includes', 'administrator',
  'phpmyadmin', 'phpPgAdmin', 'adminer', 'server-status', 'server-info',
  '.git', '.svn', '.hg', '.idea', '.vscode', 'node_modules',
  'logs', 'log', 'error', 'errors', 'cache', 'temp', 'tmp',
  'api-docs', 'api/v1', 'api/v2', 'rest', 'soap', 'xmlrpc',
  '.well-known', 'acme-challenge', 'security.txt',
];

const BUILTIN_WORDLISTS: Record<string, string[]> = {
  dir_bruteforce: COMMON_DIRS,
  common_files: COMMON_FILES,
  common_dirs: COMMON_DIRS,
};

const HttpFuzzSchema = z.object({
  url: z.string().describe('Target URL containing FUZZ placeholder'),
  method: z.enum(['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS', 'HEAD']).optional().default('GET'),
  headers: z.record(z.string()).optional().describe('Headers dict, values can contain FUZZ'),
  body: z.string().optional().describe('Request body containing FUZZ placeholder'),
  wordlist: z.union([
    z.array(z.string()),
    z.enum(['sqli', 'xss', 'ssrf', 'cmd_inject', 'dir_bruteforce', 'common_files', 'common_dirs']),
  ]).describe('Wordlist array or built-in category name'),
  mode: z.enum(['single', 'clusterbomb']).optional().default('single').describe('FUZZ replacement mode'),
  includeStatus: z.array(z.number()).optional().describe('Only include responses with these status codes'),
  excludeStatus: z.array(z.number()).optional().describe('Exclude responses with these status codes'),
  minSize: z.number().optional().describe('Minimum response body size to include'),
  maxSize: z.number().optional().describe('Maximum response body size to include'),
  timeout: z.number().optional().default(10000).describe('Request timeout in ms'),
  maxResults: z.number().optional().default(50).describe('Maximum results to return'),
});

type HttpFuzzInput = z.infer<typeof HttpFuzzSchema>;

function resolveWordlist(wordlist: HttpFuzzInput['wordlist']): string[] {
  if (Array.isArray(wordlist)) return wordlist;
  if (BUILTIN_WORDLISTS[wordlist]) return BUILTIN_WORDLISTS[wordlist];
  const payloadEntries = payloadLib.get(wordlist);
  if (payloadEntries.length > 0) return payloadEntries.map((e) => e.payload);
  return [];
}

function replaceFuzz(template: string, value: string): string {
  return template.replace(/FUZZ/g, value);
}

async function sendFuzzRequest(
  url: string,
  method: string,
  headers: Record<string, string> | undefined,
  body: string | undefined,
  timeout: number,
): Promise<{ status: number; body: string; duration: number; headers: Record<string, string> }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  const start = Date.now();
  try {
    const responseHeaders: Record<string, string> = {};
    const res = await fetch(url, {
      method,
      headers: headers || {},
      body: body || undefined,
      signal: controller.signal,
    });
    res.headers.forEach((v, k) => { responseHeaders[k] = v; });
    const text = await res.text();
    const duration = Date.now() - start;
    return { status: res.status, body: text, duration, headers: responseHeaders };
  } catch (error) {
    const duration = Date.now() - start;
    return { status: 0, body: `Error: ${error instanceof Error ? error.message : String(error)}`, duration, headers: {} };
  } finally {
    clearTimeout(timer);
  }
}

export function createHttpFuzzTool(): DynamicStructuredTool {
  return new DynamicStructuredTool({
    name: 'http_fuzz',
    description: 'Fuzz HTTP endpoints by replacing FUZZ keyword in URL/headers/body with wordlist entries. Supports built-in wordlists (sqli, xss, ssrf, cmd_inject, dir_bruteforce, common_files, common_dirs) and custom arrays.',
    schema: HttpFuzzSchema,
    func: async (input) => {
      const { url, method, headers, body, wordlist, mode, includeStatus, excludeStatus, minSize, maxSize, timeout, maxResults } = input;

      const entries = resolveWordlist(wordlist);
      if (entries.length === 0) {
        return JSON.stringify({ error: 'Empty wordlist or unknown category', results: [] });
      }

      const results: Array<{
        word: string;
        url: string;
        status: number;
        size: number;
        duration: number;
      }> = [];

      for (const word of entries) {
        if (results.length >= maxResults) break;

        const fuzzedUrl = replaceFuzz(url, word);
        const fuzzedHeaders: Record<string, string> = {};
        if (headers) {
          for (const [k, v] of Object.entries(headers)) {
            fuzzedHeaders[k] = replaceFuzz(v as string, word);
          }
        }
        const fuzzedBody = body ? replaceFuzz(body, word) : undefined;

        const response = await sendFuzzRequest(fuzzedUrl, method, fuzzedHeaders, fuzzedBody, timeout);

        if (includeStatus && includeStatus.length > 0 && !includeStatus.includes(response.status)) continue;
        if (excludeStatus && excludeStatus.includes(response.status)) continue;
        if (minSize !== undefined && response.body.length < minSize) continue;
        if (maxSize !== undefined && response.body.length > maxSize) continue;

        results.push({
          word,
          url: fuzzedUrl,
          status: response.status,
          size: response.body.length,
          duration: response.duration,
        });
      }

      return JSON.stringify({
        mode,
        totalSent: entries.length,
        matchedResults: results.length,
        results,
      }, null, 2);
    },
  });
}
