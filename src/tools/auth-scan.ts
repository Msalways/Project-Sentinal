import { z } from 'zod';
import { tool, DynamicStructuredTool } from '@langchain/core/tools';
import { BrowserSessionManager, MacroStep } from '../core/browser-session';

export function createLoginMacroTool(browserManager: BrowserSessionManager): DynamicStructuredTool {
  const schema = z.object({
    sessionId: z.string(),
    steps: z.array(z.object({
      type: z.enum(['navigate', 'click', 'fill', 'wait', 'extract', 'screenshot', 'evaluate']),
      selector: z.string().optional(),
      value: z.string().optional(),
      url: z.string().optional(),
      script: z.string().optional(),
      waitMs: z.number().optional(),
    })),
    roleName: z.string().optional(),
  });

  return tool(async (input) => {
    const { sessionId, steps, roleName } = schema.parse(input);
    const result = await browserManager.replayMacro(sessionId, steps as MacroStep[]);
    const lines: string[] = [];
    if (roleName) lines.push(`Login macro for role: ${roleName}`);
    lines.push(`Success: ${result.success}`);
    lines.push(`Duration: ${result.duration}ms`);
    if (result.finalUrl) lines.push(`Final URL: ${result.finalUrl}`);
    lines.push('');
    lines.push('Step results:');
    for (const sr of result.stepResults) {
      lines.push(`  [${sr.step}] ${sr.type}: ${sr.ok ? 'OK' : `FAILED${sr.error ? ` — ${sr.error}` : ''}`}`);
    }
    if (result.extractedData && Object.keys(result.extractedData).length > 0) {
      lines.push('');
      lines.push('Extracted data:');
      for (const [key, val] of Object.entries(result.extractedData)) {
        lines.push(`  ${key}: ${val.slice(0, 200)}${val.length > 200 ? '...' : ''}`);
      }
    }
    return lines.join('\n');
  }, {
    name: 'browser_record_login',
    description: 'Replay a login macro (sequence of browser steps) to authenticate a session',
    schema,
  });
}

export function createSessionCheckTool(): DynamicStructuredTool {
  const schema = z.object({
    url: z.string(),
    cookieString: z.string().optional(),
    authHeader: z.string().optional(),
  });

  return tool(async (input) => {
    const { url, cookieString, authHeader } = schema.parse(input);
    const headers: Record<string, string> = {};
    if (cookieString) headers['Cookie'] = cookieString;
    if (authHeader) headers['Authorization'] = authHeader;

    try {
      const res = await fetch(url, { headers, redirect: 'manual' });
      const status = res.status;
      const authenticated = status !== 401 && status !== 403;
      return `URL: ${url}
Status: ${status}
Authenticated: ${authenticated ? 'YES' : 'NO'}
${res.headers.get('www-authenticate') ? `WWW-Authenticate: ${res.headers.get('www-authenticate')}` : ''}`;
    } catch (err) {
      return `Error checking session for ${url}: ${err instanceof Error ? err.message : String(err)}`;
    }
  }, {
    name: 'check_auth_session',
    description: 'Check if a URL is accessible with given auth credentials (cookies or Authorization header)',
    schema,
  });
}
