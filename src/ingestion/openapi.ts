import fs from 'fs';
import path from 'path';
import type { AppModel, AppModelEndpoint } from '../core/app-model';

let jsYaml: any = null;
try {
  jsYaml = require('js-yaml');
} catch {
  // js-yaml not available
}

export function ingestOpenApi(specPath: string, targetUrl?: string): Partial<AppModel> {
  try {
    const raw = fs.readFileSync(specPath, 'utf-8');
    const ext = path.extname(specPath).toLowerCase();
    let spec: any;

    if ((ext === '.yaml' || ext === '.yml') && jsYaml) {
      spec = jsYaml.load(raw);
    } else if (ext === '.json' || ext === '.yaml' || ext === '.yml') {
      spec = JSON.parse(raw);
    } else {
      // Try JSON first, then YAML
      try {
        spec = JSON.parse(raw);
      } catch {
        if (jsYaml) spec = jsYaml.load(raw);
        else spec = JSON.parse(raw);
      }
    }

    if (!spec || !spec.openapi) {
      return emptyResult();
    }

    const endpoints: AppModelEndpoint[] = [];
    const authType: string[] = [];
    const servers: string[] = [];

    // Extract server URLs
    if (Array.isArray(spec.servers)) {
      for (const srv of spec.servers) {
        if (srv.url) servers.push(srv.url);
      }
    }

    // Detect global auth schemes
    const securitySchemes = spec.components?.securitySchemes || spec.securityDefinitions || {};
    for (const [name, scheme] of Object.entries<any>(securitySchemes)) {
      if (scheme.type === 'http' && scheme.scheme === 'bearer') {
        authType.push('JWT');
      } else if (scheme.type === 'apiKey') {
        authType.push('session');
      } else if (scheme.type === 'oauth2') {
        authType.push('oauth');
      } else if (scheme.type === 'http' && scheme.scheme === 'basic') {
        authType.push('basic');
      }
    }

    // Check global security requirements
    const requiresGlobalAuth = Array.isArray(spec.security) && spec.security.length > 0;

    // Extract paths
    if (spec.paths) {
      for (const [routePath, methods] of Object.entries<any>(spec.paths)) {
        for (const [method, details] of Object.entries<any>(methods)) {
          if (!['get', 'post', 'put', 'delete', 'patch', 'options', 'head'].includes(method)) continue;

          const params: Array<{ name: string; type: string; required: boolean }> = [];

          // Parameters from path/query/header
          if (Array.isArray(details.parameters)) {
            for (const p of details.parameters) {
              params.push({
                name: p.name,
                type: p.in || 'query',
                required: p.required === true,
              });
            }
          }

          // Request body parameters
          if (details.requestBody?.content) {
            for (const [contentType, content] of Object.entries<any>(details.requestBody.content)) {
              if (content.schema?.properties) {
                for (const [propName, propSchema] of Object.entries<any>(content.schema.properties)) {
                  const requiredArr = content.schema.required || [];
                  params.push({
                    name: propName,
                    type: 'body',
                    required: requiredArr.includes(propName),
                  });
                }
              }
            }
          }

          // Response info (use first 2xx response)
          let responseStatus = 200;
          let contentType = '';
          let bodyPreview = '';
          if (details.responses) {
            const successResponse = details.responses['200'] || details.responses['201'] || details.responses['204'] ||
              Object.values(details.responses).find((r: any) => {
                const code = parseInt(Object.keys(details.responses).find(k => details.responses[k] === r) || '0');
                return code >= 200 && code < 300;
              }) as any;
            if (successResponse) {
              const statusKey = details.responses['200'] ? '200' :
                details.responses['201'] ? '201' : '204';
              responseStatus = parseInt(statusKey) || 200;
              if (successResponse.content) {
                const ct = Object.keys(successResponse.content)[0];
                if (ct) {
                  contentType = ct;
                  const schema = successResponse.content[ct].schema;
                  if (schema) {
                    bodyPreview = JSON.stringify(schema).slice(0, 200);
                  }
                }
              }
              if (successResponse.description) {
                bodyPreview = bodyPreview || successResponse.description.slice(0, 200);
              }
            }
          }

          // Determine if endpoint requires auth
          const hasMethodSecurity = Array.isArray(details.security) && details.security.length > 0;
          const methodRequiresAuth = details.security === undefined ? requiresGlobalAuth : hasMethodSecurity;

          endpoints.push({
            path: routePath,
            method: method.toUpperCase(),
            params,
            requiresAuth: methodRequiresAuth,
            responseStatus,
            contentType,
            bodyPreview,
          });
        }
      }
    }

    // Determine target
    let target = targetUrl || '';
    if (!target && servers.length > 0) {
      target = servers[0];
    }

    console.log(`[openapi] Ingested ${endpoints.length} endpoints`);

    return {
      target,
      endpoints,
      auth: { sessions: {},
        type: authType.includes('JWT') ? 'JWT' :
          authType.includes('oauth') ? 'oauth' :
          authType.includes('basic') ? 'basic' :
          authType.includes('session') ? 'session' :
          'unknown',
        loginEndpoint: '',
        endpoints: endpoints.filter(e => e.requiresAuth).map(e => `${e.method}:${e.path}`),
        cookies: {},
        tokens: authType.includes('JWT') ? ['Bearer token detected in spec'] : [],
      },
    };
  } catch (err) {
    console.error(`[openapi] Failed to ingest ${specPath}:`, err);
    return emptyResult();
  }
}

function emptyResult(): Partial<AppModel> {
  return {
    target: '',
    endpoints: [],
    auth: { type: 'unknown', loginEndpoint: '', endpoints: [], cookies: {}, tokens: [], sessions: {} },
  };
}
