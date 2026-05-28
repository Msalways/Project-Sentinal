import fs from 'fs';
import type { AppModel, AppModelEndpoint } from '../core/app-model';

export function ingestHar(harPath: string): Partial<AppModel> {
  try {
    const raw = fs.readFileSync(harPath, 'utf-8');
    const har = JSON.parse(raw);

    const log = har.log;
    if (!log || !Array.isArray(log.entries)) {
      return emptyResult();
    }

    const seenEndpoints = new Set<string>();
    const endpoints: AppModelEndpoint[] = [];
    const cookies: Record<string, string> = {};
    const visitedUrls: string[] = [];
    const authTokens: string[] = [];
    let authType: string | null = null;

    for (const entry of log.entries) {
      const req = entry.request;
      const res = entry.response;

      if (!req || !res) continue;

      // Extract URL path
      let urlPath: string;
      try {
        const urlObj = new URL(req.url);
        urlPath = urlObj.pathname;
        if (!visitedUrls.includes(req.url)) {
          visitedUrls.push(req.url);
        }
      } catch {
        urlPath = req.url;
        if (!visitedUrls.includes(req.url)) {
          visitedUrls.push(req.url);
        }
      }

      const method = (req.method || 'GET').toUpperCase();

      // Auth detection from request headers
      if (Array.isArray(req.headers)) {
        for (const h of req.headers) {
          const name = (h.name || '').toLowerCase();
          const value = h.value || '';

          if (name === 'authorization') {
            if (value.startsWith('Bearer ')) {
              authType = 'JWT';
              if (!authTokens.includes(value.slice(0, 30) + '...')) {
                authTokens.push(value.slice(0, 30) + '...');
              }
            } else if (value.startsWith('Basic ')) {
              authType = 'basic';
            }
          } else if (name === 'cookie') {
            authType = authType || 'session';
          } else if (name === 'x-api-key') {
            authType = authType || 'session';
          }
        }
      }

      // Dedup endpoints by path + method
      const dedupKey = `${method}:${urlPath}`;
      if (!seenEndpoints.has(dedupKey)) {
        seenEndpoints.add(dedupKey);

        const params: Array<{ name: string; type: string; required: boolean }> = [];

        // Query params
        if (Array.isArray(req.queryString)) {
          for (const q of req.queryString) {
            params.push({ name: q.name, type: 'query', required: true });
          }
        }

        // Post body params
        if (req.postData?.params && Array.isArray(req.postData.params)) {
          for (const p of req.postData.params) {
            params.push({ name: p.name, type: 'body', required: true });
          }
        } else if (req.postData?.text) {
          try {
            const body = JSON.parse(req.postData.text);
            for (const key of Object.keys(body)) {
              params.push({ name: key, type: 'body', required: true });
            }
          } catch {
            // non-JSON body, skip
          }
        }

        const hasAuth = Array.isArray(req.headers) && req.headers.some(
          (h: any) => ['authorization', 'cookie', 'x-api-key'].includes((h.name || '').toLowerCase())
        );

        endpoints.push({
          path: urlPath,
          method,
          params,
          requiresAuth: hasAuth,
          responseStatus: res.status || 0,
          contentType: res.content?.mimeType || '',
          bodyPreview: res.content?.text ? res.content.text.slice(0, 200) : '',
        });
      }

      // Extract Set-Cookie headers
      if (Array.isArray(res.headers)) {
        for (const h of res.headers) {
          if ((h.name || '').toLowerCase() === 'set-cookie') {
            const parts = (h.value || '').split(';')[0].split('=');
            if (parts.length >= 2) {
              cookies[parts[0]] = parts.slice(1).join('=');
            }
          }
        }
      }
    }

    console.log(`[har] Ingested ${endpoints.length} endpoints, ${visitedUrls.length} URLs`);

    return {
      endpoints,
      cookies,
      visitedUrls,
      auth: { sessions: {},
        type: (authType as AppModel['auth']['type']) || 'unknown',
        loginEndpoint: '',
        endpoints: endpoints.filter(e => e.requiresAuth).map(e => `${e.method}:${e.path}`),
        cookies,
        tokens: authTokens,
      },
    };
  } catch (err) {
    console.error(`[har] Failed to ingest ${harPath}:`, err);
    return emptyResult();
  }
}

function emptyResult(): Partial<AppModel> {
  return {
    endpoints: [],
    cookies: {},
    visitedUrls: [],
    auth: { type: 'unknown', loginEndpoint: '', endpoints: [], cookies: {}, tokens: [], sessions: {} },
  };
}
