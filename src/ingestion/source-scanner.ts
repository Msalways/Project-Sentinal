import fs from 'fs';
import path from 'path';
import type { AppModel, AppModelEndpoint } from '../core/app-model';

const SOURCE_EXTS = ['.js', '.ts', '.py'];

const EXPRESS_RE = /(?:app|router)\.(get|post|put|delete|patch)\s*\(\s*['"]([^'"]+)['"]\s*,/g;
const FLASK_RE = /@\w+\.route\s*\(\s*['"]([^'"]+)['"]\s*(?:,\s*methods\s*=\s*\[([^\]]*)\])?/g;
const FASTAPI_RE = /@\w+\.(?:get|post|put|delete|patch)\s*\(\s*['"]([^'"]*)['"]?\s*\)/g;
const NEXTJS_API_RE = /export\s+(?:async\s+)?function\s+(?:GET|POST|PUT|DELETE|PATCH)/g;

const FRAMEWORK_PATTERNS: Array<{ pattern: RegExp; name: string }> = [
  { pattern: /from\s+['"]express['"]/, name: 'Express.js' },
  { pattern: /require\s*\(\s*['"]express['"]\s*\)/, name: 'Express.js' },
  { pattern: /from\s+['"]flask['"]/, name: 'Flask' },
  { pattern: /from\s+['"]fastapi['"]/, name: 'FastAPI' },
  { pattern: /from\s+['"]next['"]/, name: 'Next.js' },
  { pattern: /import\s+.*\bNext\b/, name: 'Next.js' },
  { pattern: /from\s+['"]django['"]/, name: 'Django' },
  { pattern: /from\s+['"]aiohttp['"]/, name: 'aiohttp' },
  { pattern: /from\s+['"]tornado['"]/, name: 'Tornado' },
  { pattern: /from\s+['"]starlette['"]/, name: 'Starlette' },
];

export function ingestSourceCode(srcDir: string): Partial<AppModel> {
  try {
    if (!fs.existsSync(srcDir) || !fs.statSync(srcDir).isDirectory()) {
      console.error('[source-scanner] Directory not found: ' + srcDir);
      return emptyResult();
    }

    const files: string[] = [];
    walkDir(srcDir, files);

    const endpoints: AppModelEndpoint[] = [];
    const techStackSet = new Set<string>();
    const seenEndpoints = new Set<string>();

    for (const filePath of files) {
      try {
        const ext = path.extname(filePath).toLowerCase();
        if (!SOURCE_EXTS.includes(ext)) continue;

        const content = fs.readFileSync(filePath, 'utf-8');
        const relativePath = path.relative(srcDir, filePath).replace(/\\/g, '/');

        // Detect framework imports
        for (const fp of FRAMEWORK_PATTERNS) {
          if (fp.pattern.test(content)) {
            techStackSet.add(fp.name);
          }
        }

        if (ext === '.py') {
          // Flask
          let match: RegExpExecArray | null;
          const flaskRe = new RegExp(FLASK_RE.source, 'g');
          while ((match = flaskRe.exec(content)) !== null) {
            const routePath = match[1];
            const methodsStr = match[2];
            const methods = methodsStr
              ? methodsStr.split(',').map((m: string) => m.trim().replace(/['"]/g, '').toUpperCase())
              : ['GET'];
            for (const method of methods) {
              addEndpoint(endpoints, seenEndpoints, routePath, method, false, relativePath);
            }
          }

          // FastAPI
          const fastapiRe = new RegExp(FASTAPI_RE.source, 'g');
          while ((match = fastapiRe.exec(content)) !== null) {
            const routePath = match[1] || '/';
            // The decorator method is already in the regex
            const decLine = content.slice(Math.max(0, match.index - 40), match.index);
            const methodMatch = decLine.match(/@\w+\.(get|post|put|delete|patch)/);
            const method = methodMatch ? methodMatch[1].toUpperCase() : 'GET';
            addEndpoint(endpoints, seenEndpoints, routePath, method, false, relativePath);
          }
        } else {
          // Express.js
          const expressRe = new RegExp(EXPRESS_RE.source, 'g');
          let match: RegExpExecArray | null;
          while ((match = expressRe.exec(content)) !== null) {
            const method = match[1].toUpperCase();
            const routePath = match[2];
            addEndpoint(endpoints, seenEndpoints, routePath, method, false, relativePath);
          }
        }

        // Next.js API routes (convention-based)
        if (relativePath.match(/^(?:pages\/api\/|app\/api\/.*\/route\.ts)/)) {
          const nextMatch = content.match(NEXTJS_API_RE);
          if (nextMatch) {
            // Derive path from file location
            let apiPath = relativePath
              .replace(/^pages\/api\//, '/api/')
              .replace(/^app\/api\//, '/api/')
              .replace(/\/route\.ts$/, '')
              .replace(/\/route\.js$/, '')
              .replace(/\/index\.ts$/, '')
              .replace(/\/index\.js$/, '')
              .replace(/\.ts$/, '')
              .replace(/\.js$/, '')
              .replace(/\[\.\.\.(\w+)\]/g, '{$1*}')
              .replace(/\[(\w+)\]/g, '{$1}');

            if (!apiPath.startsWith('/')) apiPath = '/' + apiPath;

            // Detect exported HTTP methods
            const nextMethods = content.matchAll(NEXTJS_API_RE);
            for (const nm of nextMethods) {
              const fnName = nm[0].match(/function\s+(GET|POST|PUT|DELETE|PATCH)/);
              if (fnName) {
                addEndpoint(endpoints, seenEndpoints, apiPath, fnName[1], false, relativePath);
              } else {
                addEndpoint(endpoints, seenEndpoints, apiPath, 'GET', false, relativePath);
              }
            }
          }
        }
      } catch (err) {
        console.error('[source-scanner] Error processing ' + filePath + ':', err);
      }
    }

    console.log('[source-scanner] Found ' + endpoints.length + ' endpoints, ' + techStackSet.size + ' frameworks');

    return {
      endpoints,
      techStack: Array.from(techStackSet),
      auth: { type: 'unknown', loginEndpoint: '', endpoints: [], cookies: {}, tokens: [], sessions: {} },
    };
  } catch (err) {
    console.error('[source-scanner] Failed to scan ' + srcDir + ':', err);
    return emptyResult();
  }
}

function walkDir(dir: string, result: string[]): void {
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!entry.name.startsWith('.') && entry.name !== 'node_modules' && entry.name !== 'dist' && entry.name !== '__pycache__') {
          walkDir(fullPath, result);
        }
      } else if (entry.isFile()) {
        result.push(fullPath);
      }
    }
  } catch {
    // skip directories we can't read
  }
}

function addEndpoint(
  endpoints: AppModelEndpoint[],
  seen: Set<string>,
  routePath: string,
  method: string,
  requiresAuth: boolean,
  sourceFile: string,
): void {
  const key = method + ':' + routePath;
  if (seen.has(key)) return;
  seen.add(key);

  // Extract path params (:id, {id})
  const params: Array<{ name: string; type: string; required: boolean }> = [];
  const pathParamRe = /:(\w+)|{(\w+)}/g;
  let m: RegExpExecArray | null;
  while ((m = pathParamRe.exec(routePath)) !== null) {
    params.push({ name: m[1] || m[2], type: 'path', required: true });
  }

  endpoints.push({
    path: routePath,
    method,
    params,
    requiresAuth,
    responseStatus: 200,
    contentType: '',
    bodyPreview: 'Discovered in ' + sourceFile,
  });
}

function emptyResult(): Partial<AppModel> {
  return {
    endpoints: [],
    techStack: [],
    auth: { type: 'unknown', loginEndpoint: '', endpoints: [], cookies: {}, tokens: [], sessions: {} },
  };
}
