import { z } from 'zod';
import { tool, DynamicStructuredTool } from '@langchain/core/tools';
import { BrowserSessionManager } from '../core/browser-session';
import { u } from './tool-registry';

let _browserManager: BrowserSessionManager | null = null;
export function getSharedBrowserManager(headless?: boolean): BrowserSessionManager {
  if (!_browserManager) _browserManager = new BrowserSessionManager(headless ?? false);
  return _browserManager;
}
function getBrowserManager(): BrowserSessionManager {
  return getSharedBrowserManager();
}

const SessionIdSchema = z.object({
  sessionId: z.string().default('default').describe('Browser session ID (defaults to "default")'),
});

export function createBrowserNavigateTool(): DynamicStructuredTool {
  return tool(async (input) => {
    const { sessionId, url } = z.object({
      sessionId: z.string().default('default'),
      url: z.string(),
    }).parse(u(input));
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

export function createBrowserPressKeyTool(): DynamicStructuredTool {
  return tool(async (input) => {
    const { sessionId, key } = input;
    const result = await getBrowserManager().pressKey(sessionId, key);
    return result;
  }, {
    name: 'browser_press_key',
    description: 'Press a keyboard key in the browser session (e.g. "Enter", "Escape", "Tab", "ArrowDown", "Control+a"). Use this after browser_fill to submit forms.',
    schema: z.object({
      sessionId: z.string().default('default'),
      key: z.string().describe('Key to press (e.g. "Enter", "Escape", "Tab", "ArrowDown", "Control+a")'),
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

export function createBrowserStartRecordingTool(): DynamicStructuredTool {
  return tool(async (input) => {
    const { sessionId } = input;
    getBrowserManager().startRecording(sessionId);
    return `Started recording actions for session ${sessionId}`;
  }, {
    name: 'browser_start_recording',
    description: 'Start recording browser actions (navigate, click, fill) for later test generation',
    schema: SessionIdSchema,
  });
}

export function createBrowserStopRecordingTool(): DynamicStructuredTool {
  return tool(async (input) => {
    const { sessionId } = input;
    const steps = getBrowserManager().stopRecording(sessionId);
    const summary = steps.map((s, i) => `  ${i + 1}. ${s.type}${s.selector ? ` "${s.selector}"` : ''}${s.value ? ` = "${s.value}"` : ''}${s.url ? ` → ${s.url}` : ''}`).join('\n');
    return `Stopped recording for session ${sessionId}. Recorded ${steps.length} steps:\n${summary}`;
  }, {
    name: 'browser_stop_recording',
    description: 'Stop recording browser actions and return the recorded steps',
    schema: SessionIdSchema,
  });
}

export function createBrowserGetRecordingTool(): DynamicStructuredTool {
  return tool(async (input) => {
    const { sessionId } = input;
    const steps = getBrowserManager().getRecording(sessionId);
    const summary = steps.map((s, i) => `  ${i + 1}. ${s.type}${s.selector ? ` "${s.selector}"` : ''}${s.value ? ` = "${s.value}"` : ''}${s.url ? ` → ${s.url}` : ''}`).join('\n');
    return `Session ${sessionId} has ${steps.length} recorded steps:\n${summary}`;
  }, {
    name: 'browser_get_recording',
    description: 'Get the current recorded actions for a browser session without stopping recording',
    schema: SessionIdSchema,
  });
}

export function createBrowserStartTraceTool(): DynamicStructuredTool {
  return tool(async (input) => {
    const { sessionId } = input;
    const result = await getBrowserManager().startTrace(sessionId);
    return result;
  }, {
    name: 'browser_start_trace',
    description: 'Start automatic request tracing on a browser session. Captures all network requests, payloads, headers, and responses silently. Use browser_stop_trace to retrieve.',
    schema: SessionIdSchema,
  });
}

export function createBrowserStopTraceTool(): DynamicStructuredTool {
  return tool(async (input) => {
    const { sessionId } = input;
    const entries = getBrowserManager().stopTrace(sessionId);
    const navs = entries.filter(e => e.type === 'navigation').length;
    const apis = entries.filter(e => e.type === 'xhr' || e.type === 'fetch').length;
    const authHeaders = entries.some(e => Object.keys(e.requestHeaders).some(h => /authorization|cookie/i.test(h)));
    return `Stopped trace for session "${sessionId}". Captured ${entries.length} entries (${navs} navigations, ${apis} API calls)${authHeaders ? ', auth headers detected' : ''}.`;
  }, {
    name: 'browser_stop_trace',
    description: 'Stop automatic request tracing and return the number of captured entries',
    schema: SessionIdSchema,
  });
}

export function createBrowserGetTraceTool(): DynamicStructuredTool {
  return tool(async (input) => {
    const { sessionId, filterType } = input;
    const entries = getBrowserManager().getTrace(sessionId);
    const filtered = filterType ? entries.filter(e => e.type === filterType) : entries;
    const lines = filtered.slice(0, 30).map((e, i) => `  ${i + 1}. [${e.method}] ${e.url} → ${e.status} (${e.type})`);
    const auth = entries.some(e => Object.keys(e.requestHeaders).some(h => /authorization|cookie/i.test(h)));
    return `Session "${sessionId}": ${entries.length} total entries${filterType ? `, ${filtered.length} of type "${filterType}"` : ''}${auth ? ', auth present' : ''}\n${lines.join('\n')}${filtered.length > 30 ? `\n  ... and ${filtered.length - 30} more` : ''}`;
  }, {
    name: 'browser_get_trace',
    description: 'Show captured network trace entries for a session. Optionally filter by type.',
    schema: z.object({
      sessionId: z.string().default('default'),
      filterType: z.enum(['navigation', 'xhr', 'fetch', 'form', 'resource', 'script']).optional().describe('Filter by request type'),
    }),
  });
}
