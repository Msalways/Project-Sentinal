import fs from 'fs';
import path from 'path';

export interface TaintSource {
  name: string;
  patterns: RegExp[];
  category: string;
}

export interface TaintSink {
  name: string;
  patterns: RegExp[];
  severity: 'critical' | 'high' | 'medium';
  vulnerabilityClass: string;
}

export interface TaintFlow {
  file: string;
  line: number;
  source: string;
  sink: string;
  sinkLine: number;
  code: string;
  vulnerabilityClass: string;
  severity: string;
  confidence: number;
}

export const TAINT_SOURCES: TaintSource[] = [
  { name: 'HTTP request body', category: 'http', patterns: [/req\.body/i, /request\.body/i, /\.json\(\)/, /req\.rawBody/i, /request\.rawBody/i, /req\.files/i, /request\.files/i, /req\.form/i, /request\.form/i] },
  { name: 'HTTP query params', category: 'http', patterns: [/req\.query/i, /request\.query/i, /req\.params/i, /request\.params/i, /req\.url\.searchParams/i, /useSearchParams\(\)/] },
  { name: 'HTTP headers', category: 'http', patterns: [/req\.headers/i, /request\.headers/i, /req\.header\(/i, /request\.header\(/i, /req\.get\(/i] },
  { name: 'URL path params', category: 'http', patterns: [/req\.params\./i, /request\.params\./i, /:(\w+)/g, /req\.route/i, /request\.route/i] },
  { name: 'Cookies', category: 'http', patterns: [/req\.cookies/i, /request\.cookies/i, /req\.cookie/i, /request\.cookie/i] },
  { name: 'Environment variables', category: 'env', patterns: [/process\.env\./i, /process\.env\[/i, /os\.environ/i, /os\.getenv/i, /getenv\(/i] },
  { name: 'File input', category: 'file', patterns: [/fs\.readFile/i, /readFileSync/i, /open\([^)]+\)/i, /io\.open/i, /file_get_contents/i] },
  { name: 'Standard input', category: 'cli', patterns: [/process\.argv/i, /sys\.argv/i, /os\.Args/i, /readline/i, /stdin/i, /prompt\(/i, /input\(/i] },
  { name: 'Database input', category: 'db', patterns: [/db\.query/i, /db\.execute/i, /db\.all/i, /cursor\.fetch/i, /\.find\(/i, /\.findOne\(/i, /\.aggregate\(/i] },
  { name: 'WebSocket', category: 'ws', patterns: [/ws\.on\('message/i, /socket\.on\('message/i, /websocket\.onmessage/i, /\.send\(/i] },
  { name: 'GraphQL args', category: 'gql', patterns: [/args\./i, /parent\./i, /info\.variableValues/i, /context\./i] },
  { name: 'Form data / multipart', category: 'http', patterns: [/req\.body\./i, /formData/i, /multipart/i, /fileUpload/i, /upload\./i] },
];

export const TAINT_SINKS: TaintSink[] = [
  { name: 'SQL query execution', patterns: [/\.query\(/, /\.execute\(/, /\.exec\(/, /query\(.*\+/, /execute\(.*\+/, /exec\(.*\+/, /db\.run\(/, /db\.all\(/, /db\.get\(/], severity: 'critical', vulnerabilityClass: 'sqli' },
  { name: 'SQL string concat', patterns: [/(?:query|execute|exec)\s*\(\s*(`|'|")\s*\+/, /\+\s*(`|'|")\s*\)/], severity: 'critical', vulnerabilityClass: 'sqli' },
  { name: 'eval / Function()', patterns: [/eval\s*\(/, /Function\s*\(/, /setTimeout\s*\(\s*['"`]/, /setInterval\s*\(\s*['"`]/], severity: 'critical', vulnerabilityClass: 'code_injection' },
  { name: 'OS command execution', patterns: [/exec\s*\(/, /spawn\s*\(/, /execSync\s*\(/, /spawnSync\s*\(/, /system\s*\(/, /popen\s*\(/, /subprocess\.(call|run|check_output|Popen)/, /child_process\./, /shell_exec\(/, /passthru\(/], severity: 'critical', vulnerabilityClass: 'command_injection' },
  { name: 'HTML output (XSS)', patterns: [/res\.send\(/, /res\.write\(/, /res\.json\(/, /res\.render\(/, /innerHTML\s*=/, /outerHTML\s*=/, /document\.write\(/, /dangerouslySetInnerHTML/, /v-html=/, /ng-bind-html=/, /\.html\(/, /\.append\(/, /\.prepend\(/], severity: 'high', vulnerabilityClass: 'xss' },
  { name: 'File write', patterns: [/fs\.writeFile/, /writeFileSync/, /fs\.appendFile/, /open\(.*['"]w['"]/, /io\.open\(.*['"]w/, /file_put_contents/, /fwrite\(/, /\.save\(/], severity: 'high', vulnerabilityClass: 'path_traversal' },
  { name: 'Deserialization', patterns: [/JSON\.parse\(/, /pickle\.loads\(/, /yaml\.load\(/, /unserialize\(/, /deserialize\(/, /JSONB\.parse\(/, /Jackson\.parse\(/], severity: 'high', vulnerabilityClass: 'deserialization' },
  { name: 'Template rendering', patterns: [/render_template_string\(/, /Template\(/, /Handlebars\.compile\(/, /ejs\.render\(/, /pug\.render\(/, /nunjucks\.renderString\(/, /\.render\s*\(/, /template\(/, /mustache\.render\(/], severity: 'high', vulnerabilityClass: 'ssti' },
  { name: 'HTTP requests (SSRF)', patterns: [/fetch\(/, /axios\(/, /request\(/, /got\(/, /superagent/, /http\.get\(/, /https\.get\(/, /urlopen\(/, /urllib\.request/, /httpx\./, /\.post\(/, /\.get\(/, /\.put\(/, /\.delete\(/], severity: 'high', vulnerabilityClass: 'ssrf' },
  { name: 'Redirect', patterns: [/res\.redirect\(/, /Response\.redirect\(/, /Redirect\(/, /header\('Location'/, /\.redirect\(/], severity: 'medium', vulnerabilityClass: 'open_redirect' },
  { name: 'NoSQL query', patterns: [/\.find\s*\(/, /\.findOne\s*\(/, /\.findOneAndUpdate/, /\.aggregate\s*\(/, /\.updateOne\s*\(/, /\.deleteOne\s*\(/, /db\.collection\(/], severity: 'high', vulnerabilityClass: 'nosqli' },
  { name: 'Prototype pollution', patterns: [/Object\.assign\(/, /_.merge\(/, /_.extend\(/, /_.cloneDeep\(/, /\.assign\(/, /lodash\.merge\(/, /deepmerge\(/, /$.extend\(/], severity: 'high', vulnerabilityClass: 'prototype_pollution' },
  { name: 'WebSocket send', patterns: [/ws\.send\(/, /socket\.emit\(/, /\.send\(.*req/], severity: 'medium', vulnerabilityClass: 'ws_injection' },
  { name: 'LDAP query', patterns: [/ldap\.search\(/, /ldapjs\.createClient/, /ActiveDirectory\./, /\.find\(/], severity: 'high', vulnerabilityClass: 'ldapi' },
];

export function scanFileForTaintFlows(filePath: string, content?: string): TaintFlow[] {
  const flows: TaintFlow[] = [];
  const sourceMatches: Array<{ name: string; line: number; code: string }> = [];

  const sourceMap = new Map<number, string>();
  const sinkMap = new Map<number, { name: string; severity: string; vulnClass: string }>();
  const sourceNames = new Map<number, string>();

  const lines = (content || fs.readFileSync(filePath, 'utf-8')).split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    for (const source of TAINT_SOURCES) {
      for (const pattern of source.patterns) {
        if (pattern.test(line)) {
          sourceMap.set(i, source.name);
          sourceNames.set(i, source.name);
        }
      }
    }

    for (const sink of TAINT_SINKS) {
      for (const pattern of sink.patterns) {
        if (pattern.test(line)) {
          const prevSource = findNearestSource(i, sourceMap);
          if (prevSource !== null) {
            flows.push({
              file: filePath,
              line: i + 1,
              source: sourceNames.get(prevSource) || 'unknown',
              sink: sink.name,
              sinkLine: i + 1,
              code: lines[i].trim().slice(0, 150),
              vulnerabilityClass: sink.vulnerabilityClass,
              severity: sink.severity,
              confidence: calculateConfidence(sink.vulnerabilityClass, lines, prevSource, i),
            });
          }
          sinkMap.set(i, { name: sink.name, severity: sink.severity, vulnClass: sink.vulnerabilityClass });
        }
      }
    }
  }

  return flows;
}

function findNearestSource(sinkLine: number, sourceMap: Map<number, string>): number | null {
  let nearest = null;
  let nearestDist = Infinity;
  for (const [line] of sourceMap) {
    if (line < sinkLine && sinkLine - line < nearestDist) {
      nearest = line;
      nearestDist = sinkLine - line;
    }
  }
  return nearestDist < 50 ? nearest : null;
}

function calculateConfidence(vulnClass: string, lines: string[], sourceLine: number, sinkLine: number): number {
  let confidence = 60;
  const distance = sinkLine - sourceLine;
  if (distance < 5) confidence += 20;
  else if (distance < 15) confidence += 10;
  const betweenLines = lines.slice(sourceLine, sinkLine);
  const hasSanitizer = betweenLines.some((l) =>
    /sanitize|escape|validate|purify|encode|strip|filter|clean/i.test(l)
  );
  if (hasSanitizer) confidence -= 30;
  const hasTypeCheck = betweenLines.some((l) =>
    /typeof|instanceof|\.type|\.kind|\.isString|\.isNumber|parseInt|Number\(|parseFloat/i.test(l)
  );
  if (hasTypeCheck) confidence -= 15;
  if (vulnClass === 'command_injection' || vulnClass === 'code_injection') confidence = Math.min(confidence + 10, 90);
  return Math.max(10, Math.min(95, confidence));
}

export function scanDirectoryForTaintFlows(dirPath: string): TaintFlow[] {
  const allFlows: TaintFlow[] = [];
  const files = getAllFiles(dirPath);
  for (const file of files) {
    try {
      const flows = scanFileForTaintFlows(file);
      allFlows.push(...flows);
    } catch { /* skip unreadable files */ }
  }
  return allFlows;
}

function getAllFiles(dir: string): string[] {
  const files: string[] = [];
  if (!fs.existsSync(dir)) return files;
  const stat = fs.statSync(dir);
  if (stat.isFile()) return [dir];
  for (const entry of fs.readdirSync(dir)) {
    const fullPath = path.join(dir, entry);
    if (entry === 'node_modules' || entry === '.git' || entry === 'dist') continue;
    const entryStat = fs.statSync(fullPath);
    if (entryStat.isDirectory()) files.push(...getAllFiles(fullPath));
    else if (/\.(js|ts|jsx|tsx|py|rb|go|java|php|cs|kt|swift)$/.test(entry)) files.push(fullPath);
  }
  return files;
}
