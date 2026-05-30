import { z } from 'zod';
import { tool, type DynamicStructuredTool } from '@langchain/core/tools';
import { getSharedBrowserManager } from './browser-tools';
import { SpiderCrawler } from '../explorer/spider';
import { spiderResultToAppModel } from '../explorer/spider-bridge';
import { updateAppModelSection, DEFAULT_MODEL } from '../core/app-model';
import { getAppModelPath } from '../core/app-model-path';

const CrawlDiscoverSchema = z.object({
  url: z.string().describe('Target URL to spider and discover routes'),
  maxDepth: z.number().optional().default(2).describe('Maximum crawl depth (default 2)'),
  maxPages: z.number().optional().default(30).describe('Maximum pages to crawl (default 30)'),
});

export function createCrawlDiscoverTool(): DynamicStructuredTool {
  return tool(async (input) => {
    const { url, maxDepth, maxPages } = CrawlDiscoverSchema.parse(input);

    const mgr = getSharedBrowserManager();
    const spider = new SpiderCrawler(mgr);
    const result = await spider.crawl(url, maxDepth);

    let summary = `Crawl completed: ${result.totalRoutes} routes in ${result.durationMs}ms\n`;
    summary += `Routes:\n`;
    for (const r of result.routes) {
      summary += `  ${r.path} — ${r.title} (${r.forms} forms, ${r.linkCount} links)\n`;
    }
    if (Object.keys(result.cookies).length > 0) {
      summary += `\nCookies captured: ${Object.keys(result.cookies).length} keys`;
    }
    if (result.techStack.length > 0) {
      summary += `\nDetected tech: ${result.techStack.join(', ')}`;
    }

    try {
      const appModelPath = getAppModelPath();
      const bridge = spiderResultToAppModel(result, url);
      const model = { ...DEFAULT_MODEL, ...bridge.model };
      const fs = await import('fs');
      fs.writeFileSync(appModelPath, JSON.stringify(model, null, 2));
      summary += `\n\nApp model saved to ${appModelPath}`;
      if (bridge.privateAppHint) {
        summary += `\n⚠️  ${bridge.privateAppHint}`;
      }
    } catch { /* no global app model path — skip auto-save */ }

    return summary;
  }, {
    name: 'crawl_discover',
    description: 'Run the automated spider to discover routes, forms, links, cookies, and tech stack on a target URL. Results auto-save to the app model. Use this to rapidly map a new target or discover endpoints the agent hasn\'t seen yet.',
    schema: CrawlDiscoverSchema,
  });
}
