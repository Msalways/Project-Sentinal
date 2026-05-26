import { z } from 'zod';
import { tool, DynamicStructuredTool } from '@langchain/core/tools';
import { BrowserSessionManager } from '../core/browser-session';

let _browserManager: BrowserSessionManager | null = null;
function getBrowserManager(): BrowserSessionManager {
  if (!_browserManager) _browserManager = new BrowserSessionManager(false);
  return _browserManager;
}

const SessionIdSchema = z.object({
  sessionId: z.string().default('default').describe('Browser session ID (defaults to "default")'),
});

export function createBrowserNavigateTool(): DynamicStructuredTool {
  return tool(async (input) => {
    const { sessionId, url } = input;
    const finalUrl = await getBrowserManager().navigate(sessionId, url);
    return `Navigated to ${finalUrl}`;
  }, {
    name: 'browser_navigate',
    description: 'Navigate a browser session to a URL',
    schema: z.object({
      sessionId: z.string().default('default'),
      url: z.string().describe('The URL to navigate to'),
    }),
  });
}

export function createBrowserClickTool(): DynamicStructuredTool {
  return tool(async (input) => {
    const { sessionId, selector } = input;
    const result = await getBrowserManager().click(sessionId, selector);
    return result;
  }, {
    name: 'browser_click',
    description: 'Click an element identified by CSS selector in a browser session',
    schema: z.object({
      sessionId: z.string().default('default'),
      selector: z.string().describe('CSS selector for the element to click'),
    }),
  });
}

export function createBrowserFillTool(): DynamicStructuredTool {
  return tool(async (input) => {
    const { sessionId, selector, value } = input;
    const result = await getBrowserManager().fill(sessionId, selector, value);
    return result;
  }, {
    name: 'browser_fill',
    description: 'Fill a form field with a value in a browser session',
    schema: z.object({
      sessionId: z.string().default('default'),
      selector: z.string().describe('CSS selector for the input element'),
      value: z.string().describe('Value to fill into the field'),
    }),
  });
}

export function createBrowserScreenshotTool(): DynamicStructuredTool {
  return tool(async (input) => {
    const { sessionId, fullPage } = input;
    const base64 = await getBrowserManager().screenshot(sessionId, fullPage);
    return base64;
  }, {
    name: 'browser_screenshot',
    description: 'Take a screenshot of the current page in a browser session (returns base64 PNG)',
    schema: z.object({
      sessionId: z.string().default('default'),
      fullPage: z.boolean().optional().default(false),
    }),
  });
}

export function createBrowserExtractTool(): DynamicStructuredTool {
  return tool(async (input) => {
    const { sessionId, type } = input;
    const mgr = getBrowserManager();
    switch (type) {
      case 'text': return mgr.extractText(sessionId);
      case 'html': return mgr.extractHtml(sessionId);
      case 'links': return mgr.extractLinks(sessionId);
      default: return mgr.extractText(sessionId);
    }
  }, {
    name: 'browser_extract',
    description: 'Extract content from the current page in a browser session (text, html, or links)',
    schema: z.object({
      sessionId: z.string().default('default'),
      type: z.enum(['text', 'html', 'links']).default('text').describe('What to extract: text (visible text), html (full DOM), or links (all anchor hrefs)'),
    }),
  });
}

export function createBrowserEvaluateTool(): DynamicStructuredTool {
  return tool(async (input) => {
    const { sessionId, script } = input;
    const result = await getBrowserManager().evaluate(sessionId, script);
    return result;
  }, {
    name: 'browser_evaluate',
    description: 'Execute JavaScript in the browser session page context',
    schema: z.object({
      sessionId: z.string().default('default'),
      script: z.string().describe('JavaScript code to execute in the page context'),
    }),
  });
}

export function createBrowserCloseTool(): DynamicStructuredTool {
  return tool(async (input) => {
    const { sessionId } = input;
    await getBrowserManager().close(sessionId);
    return `Session ${sessionId} closed`;
  }, {
    name: 'browser_close',
    description: 'Close a browser session and release all resources',
    schema: SessionIdSchema,
  });
}
