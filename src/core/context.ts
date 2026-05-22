export interface TargetContext {
  url: string;
  detectedTech: string[];
  authFlows: AuthFlow[];
  endpoints: EndpointInfo[];
  sensitiveData: SensitiveData[];
  apiType?: 'rest' | 'graphql' | 'soap' | 'grpc';
  framework?: string;
  language?: string;
  dbType?: string;
  cloudProvider?: string;
}

export interface AuthFlow {
  type: 'jwt' | 'session' | 'oauth' | 'saml' | 'basic' | 'api_key';
  endpoint: string;
  method: string;
}

export interface EndpointInfo {
  url: string;
  method: string;
  status: number;
  authRequired: boolean;
  contentType: string;
}

export interface SensitiveData {
  type: string;
  url: string;
  value: string;
}

export interface ToolContext {
  target: TargetContext;
  customPayloads?: Record<string, string[]>;
  smartWordlist?: string[];
  servicePorts?: number[];
}

export function buildTargetContext(harData?: any, targetUrl?: string): TargetContext {
  const context: TargetContext = {
    url: targetUrl || '',
    detectedTech: [],
    authFlows: [],
    endpoints: [],
    sensitiveData: [],
  };

  if (!harData) return context;

  const urls = new Set<string>();
  const techSignatures: Record<string, RegExp[]> = {
    'React': [/react/i, /__next/i, /react-dom/i],
    'Next.js': [/_next\//i, /__NEXT_DATA__/i],
    'Vue.js': [/vue\.js/i, /vue-router/i, /\[Vue warn\]/i],
    'Angular': [/ng-version/i, /@angular/i, /ng-app/i],
    'Django': [/csrftoken/i, /django/i, /__admin/i],
    'Rails': [/authenticity_token/i, /rails/i, /csrf-param/i],
    'Laravel': [/laravel_session/i, /XSRF-TOKEN/i],
    'WordPress': [/wp-content/i, /wp-includes/i, /wp-json/i],
    'Express': [/x-powered-by: express/i, /connect\.sid/i],
    'Flask': [/werkzeug/i, /flask/i],
    'Spring Boot': [/spring/i, /actuator/i],
    'Node.js': [/x-powered-by: express/i, /node\.js/i],
    'PHP': [/x-powered-by: php/i, /phpsessid/i],
    'ASP.NET': [/x-aspnet-version/i, /__viewstate/i, /aspnet_sessionid/i],
    'GraphQL': [/graphql/i, /__schema/i, /introspection/i],
    'REST API': [/\/api\/v\d+/i, /\/api\/\w+/i],
  };

  const dbSignatures: Record<string, RegExp[]> = {
    'PostgreSQL': [/postgresql/i, /pg_catalog/i, /psql/i],
    'MySQL': [/mysql/i, /information_schema/i, /mysqli/i],
    'MongoDB': [/mongodb/i, /mongo/i, /bson/i],
    'Redis': [/redis/i, /redis-cli/i],
    'SQLite': [/sqlite/i, /sqlite3/i],
    'SQL Server': [/sql server/i, /mssql/i, /tds/i],
  };

  for (const entry of harData.log?.entries || []) {
    const url = entry.request.url;
    const method = entry.request.method;
    const status = entry.response?.status || 0;
    const contentType = entry.response?.content?.mimeType || '';
    const headers = entry.response?.headers || [];
    const body = entry.response?.content?.text || '';

    if (!urls.has(url)) {
      urls.add(url);
      context.endpoints.push({
        url,
        method,
        status,
        authRequired: headers.some((h: any) => h.name.toLowerCase() === 'authorization' || h.name.toLowerCase() === 'cookie'),
        contentType,
      });
    }

    for (const [tech, patterns] of Object.entries(techSignatures)) {
      if (patterns.some((p) => p.test(body) || p.test(headers.map((h: any) => `${h.name}: ${h.value}`).join('\n')))) {
        if (!context.detectedTech.includes(tech)) context.detectedTech.push(tech);
      }
    }

    for (const [db, patterns] of Object.entries(dbSignatures)) {
      if (patterns.some((p) => p.test(body) || p.test(url))) {
        context.dbType = db;
        break;
      }
    }

    if (contentType.includes('graphql') || body.includes('__schema') || body.includes('introspection')) {
      context.apiType = 'graphql';
    } else if (contentType.includes('json') || contentType.includes('xml')) {
      context.apiType = 'rest';
    }

    if (body.includes('jwt') || body.includes('token') || body.includes('bearer')) {
      if (!context.authFlows.some((f) => f.type === 'jwt')) {
        context.authFlows.push({ type: 'jwt', endpoint: url, method });
      }
    }

    if (body.includes('session') || body.includes('cookie') || body.includes('csrf')) {
      if (!context.authFlows.some((f) => f.type === 'session' && f.endpoint === url)) {
        context.authFlows.push({ type: 'session', endpoint: url, method });
      }
    }
  }

  if (context.detectedTech.includes('React') || context.detectedTech.includes('Next.js')) {
    context.framework = 'React';
    context.language = 'JavaScript/TypeScript';
  } else if (context.detectedTech.includes('Django') || context.detectedTech.includes('Flask')) {
    context.framework = context.detectedTech.find((t) => ['Django', 'Flask'].includes(t)) || 'Python';
    context.language = 'Python';
  } else if (context.detectedTech.includes('Rails')) {
    context.framework = 'Ruby on Rails';
    context.language = 'Ruby';
  } else if (context.detectedTech.includes('Laravel') || context.detectedTech.includes('PHP')) {
    context.framework = 'Laravel';
    context.language = 'PHP';
  } else if (context.detectedTech.includes('Spring Boot')) {
    context.framework = 'Spring Boot';
    context.language = 'Java';
  } else if (context.detectedTech.includes('ASP.NET')) {
    context.framework = 'ASP.NET';
    context.language = 'C#';
  }

  return context;
}

export function getContextSummary(ctx: TargetContext): string {
  let summary = `Target: ${ctx.url}\n`;
  summary += `Tech Stack: ${ctx.detectedTech.join(', ') || 'Unknown'}\n`;
  if (ctx.framework) summary += `Framework: ${ctx.framework}\n`;
  if (ctx.language) summary += `Language: ${ctx.language}\n`;
  if (ctx.dbType) summary += `Database: ${ctx.dbType}\n`;
  if (ctx.apiType) summary += `API Type: ${ctx.apiType}\n`;
  summary += `Auth Flows: ${ctx.authFlows.map((f) => `${f.type}@${f.endpoint}`).join(', ') || 'None detected'}\n`;
  summary += `Endpoints: ${ctx.endpoints.length} total, ${ctx.endpoints.filter((e) => e.authRequired).length} authenticated\n`;
  summary += `Sensitive Data: ${ctx.sensitiveData.length} exposures\n`;
  return summary;
}
