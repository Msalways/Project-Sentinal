import type { AppModel, AppModelEndpoint } from '../core/app-model';
import { ingestOpenApi } from './openapi';
import { ingestHar } from './har';
import { ingestPostman } from './postman';
import { ingestSourceCode } from './source-scanner';

export { ingestOpenApi, ingestHar, ingestPostman, ingestSourceCode };

export interface IngestArtifacts {
  openapi?: string;
  har?: string;
  postman?: string;
  sourceDir?: string;
}

function mergeResults(results: Partial<AppModel>[]): Partial<AppModel> {
  let merged: Partial<AppModel> = {
    target: '',
    techStack: [],
    auth: { type: 'unknown', loginEndpoint: '', endpoints: [], cookies: {}, tokens: [], sessions: {} },
    endpoints: [],
    cookies: {},
    visitedUrls: [],
  };

  for (const r of results) {
    if (!r) continue;

    // target: first non-empty wins
    if (r.target && !merged.target) {
      merged.target = r.target;
    }

    // techStack: unique merge
    if (Array.isArray(r.techStack)) {
      merged.techStack = mergeUnique(merged.techStack || [], r.techStack);
    }

    // endpoints: dedup by path+method
    if (Array.isArray(r.endpoints)) {
      merged.endpoints = dedupEndpoints([...(merged.endpoints || []), ...r.endpoints]);
    }

    // cookies: object merge (later keys win)
    if (r.cookies && typeof r.cookies === 'object') {
      merged.cookies = { ...(merged.cookies || {}), ...r.cookies };
    }

    // visitedUrls: unique merge
    if (Array.isArray(r.visitedUrls)) {
      merged.visitedUrls = mergeUnique(merged.visitedUrls || [], r.visitedUrls);
    }

    // auth: merge types, prefer more specific
    if (r.auth) {
      const auth = merged.auth || { type: 'unknown' as AppModel['auth']['type'], loginEndpoint: '', endpoints: [], cookies: {}, tokens: [], sessions: {} };
      if (r.auth.type && r.auth.type !== 'unknown') {
        auth.type = r.auth.type;
      }
      if (Array.isArray(r.auth.endpoints)) {
        auth.endpoints = mergeUnique(auth.endpoints, r.auth.endpoints);
      }
      if (r.auth.tokens) {
        auth.tokens = mergeUnique(auth.tokens, r.auth.tokens);
      }
      if (r.auth.cookies) {
        auth.cookies = { ...auth.cookies, ...r.auth.cookies };
      }
      if (r.auth.loginEndpoint && !auth.loginEndpoint) {
        auth.loginEndpoint = r.auth.loginEndpoint;
      }
      merged.auth = auth;
    }
  }

  return merged;
}

function mergeUnique(arr1: string[], arr2: string[]): string[] {
  const set = new Set([...arr1, ...arr2]);
  return Array.from(set);
}

function dedupEndpoints(endpoints: AppModelEndpoint[]): AppModelEndpoint[] {
  const seen = new Set<string>();
  const result: AppModelEndpoint[] = [];
  for (const ep of endpoints) {
    const key = ep.method + ':' + ep.path;
    if (!seen.has(key)) {
      seen.add(key);
      result.push(ep);
    }
  }
  return result;
}

export function ingestAll(artifacts: IngestArtifacts, targetUrl?: string): Partial<AppModel> {
  const results: Partial<AppModel>[] = [];

  if (artifacts.openapi) {
    console.log('[ingest] Ingesting OpenAPI spec: ' + artifacts.openapi);
    results.push(ingestOpenApi(artifacts.openapi, targetUrl));
  }

  if (artifacts.har) {
    console.log('[ingest] Ingesting HAR file: ' + artifacts.har);
    results.push(ingestHar(artifacts.har));
  }

  if (artifacts.postman) {
    console.log('[ingest] Ingesting Postman collection: ' + artifacts.postman);
    results.push(ingestPostman(artifacts.postman));
  }

  if (artifacts.sourceDir) {
    console.log('[ingest] Ingesting source code: ' + artifacts.sourceDir);
    results.push(ingestSourceCode(artifacts.sourceDir));
  }

  const merged = mergeResults(results);

  // Set target from parameter if not already set
  if (targetUrl && !merged.target) {
    merged.target = targetUrl;
  }

  console.log('[ingest] Merge complete: ' + (merged.endpoints?.length || 0) + ' endpoints, ' +
    (merged.techStack?.length || 0) + ' tech stack entries, ' +
    (merged.visitedUrls?.length || 0) + ' URLs');

  return merged;
}
