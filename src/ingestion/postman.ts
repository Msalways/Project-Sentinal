import fs from 'fs';
import type { AppModel, AppModelEndpoint } from '../core/app-model';

interface PostmanItem {
  name?: string;
  request?: {
    method?: string;
    url?: {
      raw?: string;
      path?: Array<string | { value: string }>;
      query?: Array<{ key: string; value?: string; description?: string }>;
      variable?: Array<{ key: string; value?: string }>;
    };
    header?: Array<{ key: string; value: string }>;
    body?: {
      mode?: string;
      raw?: string;
      urlencoded?: Array<{ key: string; value: string; description?: string }>;
      formdata?: Array<{ key: string; value: string; description?: string }>;
    };
    auth?: any;
  };
  item?: PostmanItem[];
  auth?: any;
}

export function ingestPostman(collectionPath: string): Partial<AppModel> {
  try {
    const raw = fs.readFileSync(collectionPath, 'utf-8');
    const collection = JSON.parse(raw);

    const info = collection.info;
    const collectionAuth = collection.auth || info?.auth || (collection.item as PostmanItem)?.auth;
    const variables = collection.variable || [];

    const endpoints: AppModelEndpoint[] = [];
    const visitedUrls: string[] = [];
    const techStack: string[] = [];
    const authTokens: string[] = [];
    let authType: string | null = null;

    if (collectionAuth) {
      const detected = detectAuth(collectionAuth);
      if (detected) {
        authType = detected.type;
        if (detected.token) authTokens.push(detected.token);
      }
    }

    if (Array.isArray(variables)) {
      for (const v of variables) {
        const key = (v.key || '').toLowerCase();
        const val = (v.value || '').toLowerCase();
        if (key.includes('base_url') || key.includes('baseurl')) {
          if (val && !visitedUrls.includes(val)) visitedUrls.push(val);
        }
        if (key.includes('api_key') || key.includes('apikey') || key.includes('token')) {
          if (v.value) authTokens.push(v.value);
          authType = authType || 'JWT';
        }
      }
    }

    const seen = new Set<string>();
    function extractItems(items: PostmanItem[], parentName = '') {
      for (const item of items) {
        const fullName = parentName ? parentName + ' > ' + (item.name || '') : (item.name || '');

        if (item.request) {
          const req = item.request;
          const method = (req.method || 'GET').toUpperCase();

          let urlPath = '';
          if (req.url) {
            const raw = req.url.raw || '';
            try {
              const parsed = new URL(raw);
              urlPath = parsed.pathname;
              const baseUrl = parsed.origin;
              if (!visitedUrls.includes(baseUrl)) visitedUrls.push(baseUrl);
            } catch {
              urlPath = raw.replace(/{{[^}]+}}/g, '');
              if (urlPath.includes('/')) {
                const parts = urlPath.split('/');
                urlPath = '/' + parts.slice(1).join('/');
              }
            }

            if (Array.isArray(req.url.path)) {
              const joined = req.url.path.map((s: any) => (typeof s === 'string' ? s : s.value)).join('/');
              if (joined) urlPath = '/' + joined;
            }
          }

          if (!urlPath) {
            urlPath = fullName || '/unknown';
          }

          const dedupKey = method + ':' + urlPath;
          const params: Array<{ name: string; type: string; required: boolean }> = [];

          if (Array.isArray(req.url?.query)) {
            for (const q of req.url.query) {
              params.push({ name: q.key, type: 'query', required: !!q.value });
            }
          }

          if (Array.isArray(req.url?.variable)) {
            for (const v of req.url.variable) {
              params.push({ name: v.key, type: 'path', required: true });
            }
          }

          if (req.body?.urlencoded && Array.isArray(req.body.urlencoded)) {
            for (const p of req.body.urlencoded) {
              params.push({ name: p.key, type: 'body', required: true });
            }
          }
          if (req.body?.formdata && Array.isArray(req.body.formdata)) {
            for (const p of req.body.formdata) {
              params.push({ name: p.key, type: 'body', required: true });
            }
          }
          if (req.body?.raw) {
            try {
              const body = JSON.parse(req.body.raw);
              for (const key of Object.keys(body)) {
                params.push({ name: key, type: 'body', required: true });
              }
            } catch {
              // non-JSON body
            }
          }

          let requiresAuth = !!authType;
          if (item.request?.auth) {
            const detected = detectAuth(item.request.auth);
            if (detected) {
              requiresAuth = true;
              if (detected.type) authType = detected.type;
              if (detected.token) authTokens.push(detected.token);
            }
          }

          if (Array.isArray(req.header)) {
            for (const h of req.header) {
              const key = (h.key || '').toLowerCase();
              if (key === 'authorization' || key === 'x-api-key' || key === 'cookie') {
                requiresAuth = true;
                if (key === 'authorization' && h.value?.startsWith('Bearer ')) {
                  authType = 'JWT';
                }
              }
            }
          }

          let contentType = '';
          if (Array.isArray(req.header)) {
            const ct = req.header.find((h: any) => (h.key || '').toLowerCase() === 'content-type');
            if (ct) contentType = ct.value;
          }

          if (!seen.has(dedupKey)) {
            seen.add(dedupKey);
            endpoints.push({
              path: urlPath,
              method,
              params,
              requiresAuth,
              responseStatus: 0,
              contentType,
              bodyPreview: req.body?.raw ? req.body.raw.slice(0, 200) : '',
            });
          }
        }

        if (Array.isArray(item.item)) {
          extractItems(item.item, fullName);
        }
      }
    }

    if (Array.isArray(collection.item)) {
      extractItems(collection.item);
    }

    console.log('[postman] Ingested ' + endpoints.length + ' endpoints');

    return {
      endpoints,
      techStack,
      visitedUrls,
      auth: { sessions: {},
        type: (authType as AppModel['auth']['type']) || 'unknown',
        loginEndpoint: '',
        endpoints: endpoints.filter(e => e.requiresAuth).map(e => e.method + ':' + e.path),
        cookies: {},
        tokens: authTokens,
      },
    };
  } catch (err) {
    console.error('[postman] Failed to ingest ' + collectionPath + ':', err);
    return emptyResult();
  }
}

function detectAuth(auth: any): { type: string; token?: string } | null {
  if (!auth) return null;

  if (auth.type === 'bearer') {
    const token = extractAuthValue(auth, 'token');
    return { type: 'JWT', token };
  }
  if (auth.type === 'apikey') {
    return { type: 'session' };
  }
  if (auth.type === 'basic') {
    return { type: 'basic' };
  }
  if (auth.type === 'oauth2') {
    return { type: 'oauth' };
  }
  if (auth.type === 'session') {
    return { type: 'session' };
  }

  return null;
}

function extractAuthValue(auth: any, key: string): string | undefined {
  if (Array.isArray(auth[auth.type])) {
    const entry = auth[auth.type].find((e: any) => e.key === key);
    return entry?.value;
  }
  return undefined;
}

function emptyResult(): Partial<AppModel> {
  return {
    endpoints: [],
    techStack: [],
    visitedUrls: [],
    auth: { type: 'unknown', loginEndpoint: '', endpoints: [], cookies: {}, tokens: [], sessions: {} },
  };
}
