import { z } from 'zod';
import { tool, DynamicStructuredTool } from '@langchain/core/tools';
import { BrowserSessionManager } from '../core/browser-session';
import { u } from './tool-registry';
import { readAppModelSection, updateAppModelSection } from '../core/app-model';
import { getAppModelPath } from '../core/app-model-path';

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

export function createBrowserGetFormsTool(): DynamicStructuredTool {
  return tool(async (input) => {
    const { sessionId } = input;
    return getBrowserManager().extractForms(sessionId);
  }, {
    name: 'browser_get_forms',
    description: 'Extract all forms from the current page with fields, actions, and methods',
    schema: SessionIdSchema,
  });
}

export function createBrowserGetCookiesTool(): DynamicStructuredTool {
  return tool(async (input) => {
    const { sessionId } = input;
    return getBrowserManager().getCookies(sessionId);
  }, {
    name: 'browser_get_cookies',
    description: 'Get all cookies for the current page context',
    schema: SessionIdSchema,
  });
}

export function createBrowserGetScriptsTool(): DynamicStructuredTool {
  return tool(async (input) => {
    const { sessionId } = input;
    return getBrowserManager().getScripts(sessionId);
  }, {
    name: 'browser_get_scripts',
    description: 'List all external scripts loaded on the current page',
    schema: SessionIdSchema,
  });
}

export function createBrowserGetStorageTool(): DynamicStructuredTool {
  return tool(async (input) => {
    const { sessionId } = input;
    return getBrowserManager().getLocalStorage(sessionId);
  }, {
    name: 'browser_get_storage',
    description: 'Get all localStorage entries for the current page origin',
    schema: SessionIdSchema,
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

export function createBrowserReplayMacroTool(): DynamicStructuredTool {
  return tool(async (input) => {
    const { sessionId, name } = z.object({
      sessionId: z.string().default('default'),
      name: z.string().describe('Name of the recorded macro to replay from app model recordedSessions'),
    }).parse(input);
    const path = getAppModelPath();
    const sessions = readAppModelSection(path, 'recordedSessions') as Record<string, any>;
    const steps = sessions?.[name];
    if (!steps || !Array.isArray(steps)) return `No recorded session named "${name}" found in app model. Use macro_list to see available macros.`;
    const result = await getBrowserManager().replayMacro(sessionId, steps as any);
    return JSON.stringify(result, null, 2);
  }, {
    name: 'browser_replay_macro',
    description: 'Replay a named recorded macro on a browser session. Reads steps from app model\'s recordedSessions section.',
    schema: z.object({
      sessionId: z.string().default('default'),
      name: z.string().describe('Name of the recorded macro to replay'),
    }),
  });
}

export function createMacroListTool(): DynamicStructuredTool {
  return tool(async (_input) => {
    const path = getAppModelPath();
    const sessions = readAppModelSection(path, 'recordedSessions') as Record<string, any>;
    const names = Object.keys(sessions || {});
    if (names.length === 0) return 'No recorded macros found in app model.';
    const details = names.map((n) => `- ${n}: ${sessions[n].length} steps`).join('\n');
    return `Recorded macros:\n${details}`;
  }, {
    name: 'macro_list',
    description: 'List all recorded macros from the app model\'s recordedSessions section',
    schema: z.object({}),
  });
}

export function createInjectCookieTool(): DynamicStructuredTool {
  return tool(async (input) => {
    const { sessionId, name, value, url } = z.object({
      sessionId: z.string().default('default'),
      name: z.string().describe('Cookie name'),
      value: z.string().describe('Cookie value'),
      url: z.string().optional().describe('URL scope for the cookie (defaults to current page URL)'),
    }).parse(input);
    return getBrowserManager().addCookie(sessionId, name, value, url);
  }, {
    name: 'inject_cookie',
    description: 'Set a cookie in the browser context. Useful for injecting auth tokens or session cookies discovered via app model.',
    schema: z.object({
      sessionId: z.string().default('default'),
      name: z.string().describe('Cookie name'),
      value: z.string().describe('Cookie value'),
      url: z.string().optional().describe('URL to scope the cookie to (defaults to current page URL)'),
    }),
  });
}

export function createCreateBrowserSessionTool(): DynamicStructuredTool {
  return tool(async (input) => {
    const { sessionId, label, userAgent } = z.object({
      sessionId: z.string().describe('Unique name for the new browser session'),
      label: z.string().optional().describe('Human-readable label (e.g. "admin-user", "anonymous")'),
      userAgent: z.string().optional().describe('Custom user agent string'),
    }).parse(input);
    await getBrowserManager().getOrCreate(sessionId, { label, userAgent });
    return `Created browser session "${sessionId}"${label ? ` (${label})` : ''}. Use browser_navigate(sessionId="${sessionId}") to navigate.`;
  }, {
    name: 'create_browser_session',
    description: 'Create a named browser session with optional label and user agent. Sessions are isolated (separate cookies, storage, and browser context). Use this for multi-role testing (e.g. create "admin" and "user" sessions).',
    schema: z.object({
      sessionId: z.string().describe('Unique session name'),
      label: z.string().optional().describe('Human-readable label'),
      userAgent: z.string().optional().describe('Custom user agent'),
    }),
  });
}

export function createListBrowserSessionsTool(): DynamicStructuredTool {
  return tool(async () => {
    const mgr = getBrowserManager();
    const ids = mgr.listSessions();
    if (ids.length === 0) return 'No active browser sessions.';
    const lines = ids.map((id) => {
      const info = mgr.getSessionInfo(id);
      if (!info) return `- ${id} (no info)`;
      return `- ${id}${info.label ? ` (${info.label})` : ''} — ${info.url} [created ${info.createdAt}]`;
    });
    return `Active sessions:\n${lines.join('\n')}`;
  }, {
    name: 'list_browser_sessions',
    description: 'List all active browser sessions with their labels, current URLs, and creation times.',
    schema: z.object({}),
  });
}

export function createSaveStorageStateTool(): DynamicStructuredTool {
  return tool(async (input) => {
    const { sessionId, name, outputDir } = z.object({
      sessionId: z.string().default('default').describe('Browser session to save'),
      name: z.string().describe('Name for this saved state (e.g. "admin-logged-in")'),
      outputDir: z.string().describe('Output directory to save session files'),
    }).parse(input);
    const filePath = require('path').join(outputDir, 'sessions', `${name}.json`);
    return getBrowserManager().saveStorageState(sessionId, filePath);
  }, {
    name: 'save_storage_state',
    description: 'Save the current browser session state (cookies + localStorage) to a file. Use this after logging in so you can restore the session later with load_storage_state.',
    schema: z.object({
      sessionId: z.string().default('default'),
      name: z.string().describe('Name for the saved state'),
      outputDir: z.string().describe('Output directory'),
    }),
  });
}

export function createLoadStorageStateTool(): DynamicStructuredTool {
  return tool(async (input) => {
    const { sessionId, name, outputDir } = z.object({
      sessionId: z.string().default('default').describe('Browser session to restore into'),
      name: z.string().describe('Name of the saved state to load'),
      outputDir: z.string().describe('Output directory containing session files'),
    }).parse(input);
    const filePath = require('path').join(outputDir, 'sessions', `${name}.json`);
    return getBrowserManager().loadStorageState(sessionId, filePath);
  }, {
    name: 'load_storage_state',
    description: 'Restore a previously saved browser session state (cookies + localStorage). Use this to re-authenticate without going through the login flow.',
    schema: z.object({
      sessionId: z.string().default('default'),
      name: z.string().describe('Name of the saved state to load'),
      outputDir: z.string().describe('Output directory'),
    }),
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

// ── Manual Recording Tools ──

export function createManualRecordStartTool(): DynamicStructuredTool {
  return tool(async (input) => {
    const { sessionId } = input;
    const mgr = getBrowserManager();
    const result = await mgr.startManualRecording(sessionId);
    return result;
  }, {
    name: 'manual_record_start',
    description: 'Start recording direct manual browser interactions. Opens the visible Playwright window so a human can click, type, and navigate. Every action is captured as a macro step. Use manual_record_stop to finish and get the recorded steps.',
    schema: SessionIdSchema,
  });
}

export function createManualRecordStopTool(): DynamicStructuredTool {
  return tool(async (input) => {
    const { sessionId } = input;
    const mgr = getBrowserManager();
    const steps = await mgr.stopManualRecording(sessionId);
    if (steps.length === 0) return `No steps were recorded for session "${sessionId}".`;
    const summary = steps.map((s, i) => `  ${i + 1}. ${s.type}${s.selector ? ` → ${s.selector}` : ''}${s.value ? ` = "${s.value.slice(0, 60)}"` : ''}${s.url ? ` → ${s.url}` : ''}`).join('\n');
    return `Manual recording stopped for session "${sessionId}". Captured ${steps.length} steps:\n${summary}`;
  }, {
    name: 'manual_record_stop',
    description: 'Stop manual recording and return the captured macro steps. Use update_app_model to save them to the app model for later replay.',
    schema: SessionIdSchema,
  });
}
