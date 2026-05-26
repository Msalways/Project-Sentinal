import { z } from 'zod';
import { tool, DynamicStructuredTool } from '@langchain/core/tools';
import { BrowserSessionManager } from '../core/browser-session';
import { PlaywrightTestGenerator } from './test-generator';

let _browserManager: BrowserSessionManager | null = null;
function getBrowserManager(): BrowserSessionManager {
  if (!_browserManager) _browserManager = new BrowserSessionManager(false);
  return _browserManager;
}

export function createGeneratePlaywrightTestTool(): DynamicStructuredTool {
  return tool(async (input) => {
    const { sessionId, workflowName, targetUrl, outputDir } = input;
    const steps = getBrowserManager().getRecording(sessionId);
    if (steps.length === 0) return `No recorded actions for session "${sessionId}". Use browser_start_recording first, then navigate/click/fill, then call this tool.`;

    const target = targetUrl || (steps.find(s => s.url)?.url) || 'http://localhost:3000';
    const manifest = {
      target,
      roles: [{ name: 'default', credentials: {} }],
      workflows: [{
        name: workflowName,
        test: {
          happy: steps.map(s => {
            switch (s.type) {
              case 'navigate': return `Navigate to ${s.url}`;
              case 'click': return `Click ${s.selector}`;
              case 'fill': return `Fill ${s.selector} with "${s.value}"`;
              default: return `${s.type}: ${JSON.stringify(s)}`;
            }
          }),
          sad: [],
        },
      }],
    };

    const generator = new PlaywrightTestGenerator(target);
    const baseDir = outputDir || 'playwright-tests';
    const fullDir = require('path').join(baseDir, workflowName.toLowerCase().replace(/[^a-z0-9]/g, '-'));
    require('fs').mkdirSync(fullDir, { recursive: true });
    const generated = generator.generateFromManifest(manifest as any, fullDir);

    return `Generated ${generated.length} test files in ${fullDir}:\n${generated.map(f => `  - ${f}`).join('\n')}`;
  }, {
    name: 'generate_playwright_test',
    description: 'Generate Playwright test files from recorded browser session actions. Use browser_start_recording first, then navigate/click/fill, then call this.',
    schema: z.object({
      sessionId: z.string().default('default').describe('Browser session ID with recorded actions'),
      workflowName: z.string().default('Recorded Workflow').describe('Name for the generated test workflow'),
      targetUrl: z.string().optional().describe('Base target URL (defaults to first navigated URL)'),
      outputDir: z.string().optional().describe('Output directory for generated tests (default: playwright-tests/)'),
    }),
  });
}
