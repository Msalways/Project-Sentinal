import { z } from 'zod';
import { tool, type DynamicStructuredTool } from '@langchain/core/tools';
import { getSharedBrowserManager } from './browser-tools';
import { takeSnapshot } from '../explorer/dom-observer';

export function createGetSessionStatusTool(): DynamicStructuredTool {
  return tool(async (input) => {
    const { sessionId } = z.object({
      sessionId: z.string().optional().default('default').describe('Browser session ID'),
    }).parse(input);

    const mgr = getSharedBrowserManager();
    try {
      const page = await mgr.getOrCreate(sessionId);
      const url = page.url();
      const recording = mgr.getRecording(sessionId);
      return JSON.stringify({
        sessionId,
        url,
        recordingSteps: recording.length,
        tracing: true,
      }, null, 2);
    } catch {
      return JSON.stringify({ sessionId, error: 'Session not found or not active' }, null, 2);
    }
  }, {
    name: 'get_session_status',
    description: 'Check the current status of a browser session — returns URL, recording step count, and tracing state.',
    schema: z.object({
      sessionId: z.string().optional().default('default'),
    }),
  });
}

export function createGetDomSnapshotTool(): DynamicStructuredTool {
  return tool(async (input) => {
    const { sessionId } = z.object({
      sessionId: z.string().optional().default('default').describe('Browser session ID'),
    }).parse(input);

    const mgr = getSharedBrowserManager();
    try {
      const page = await mgr.getOrCreate(sessionId);
      const snapshot = await takeSnapshot(page);
      return JSON.stringify({
        url: snapshot.url,
        title: snapshot.title,
        forms: snapshot.forms.map(f => ({
          action: f.action,
          method: f.method,
          fields: f.fields.map(fi => `${fi.name}[${fi.type}]`),
        })),
        interactiveCount: snapshot.interactive.length,
        dialogs: snapshot.dialogs.filter(d => d.isVisible).map(d => d.text.slice(0, 100)),
        overlays: snapshot.overlays.map(o => o.text.slice(0, 100)),
        textLength: snapshot.textContent.length,
      }, null, 2);
    } catch {
      return JSON.stringify({ error: 'Could not take DOM snapshot — session may not have a page loaded' }, null, 2);
    }
  }, {
    name: 'get_dom_snapshot',
    description: 'Take a DOM snapshot of the current browser page — returns forms, interactive elements, dialogs, overlays, and text content. Use this to understand the current page state.',
    schema: z.object({
      sessionId: z.string().optional().default('default'),
    }),
  });
}

export function createExportHarTool(): DynamicStructuredTool {
  return tool(async (input) => {
    const { sessionId, outputPath } = z.object({
      sessionId: z.string().optional().default('default').describe('Browser session ID'),
      outputPath: z.string().describe('File path to save the HAR file'),
    }).parse(input);

    const mgr = getSharedBrowserManager();
    try {
      const trace = mgr.stopTrace(sessionId);
      if (trace.length === 0) {
        return 'No trace data available — start a trace with browser_start_trace first.';
      }
      const { traceToHar } = await import('../core/trace-utils');
      const fs = await import('fs');
      const har = traceToHar(trace);
      fs.writeFileSync(outputPath, har, 'utf-8');
      mgr.startTrace(sessionId);
      return `HAR file exported to ${outputPath} (${trace.length} entries)`;
    } catch (e) {
      return `Error exporting HAR: ${e instanceof Error ? e.message : String(e)}`;
    }
  }, {
    name: 'export_har',
    description: 'Stop the current network trace, export it as a HAR file, then restart tracing. Use this to capture the recorded HTTP traffic for analysis.',
    schema: z.object({
      sessionId: z.string().optional().default('default'),
      outputPath: z.string().describe('File path for the HAR output'),
    }),
  });
}

export function createWaitForNavigationTool(): DynamicStructuredTool {
  return tool(async (input) => {
    const { sessionId, timeout } = z.object({
      sessionId: z.string().optional().default('default').describe('Browser session ID'),
      timeout: z.number().optional().default(10000).describe('Maximum wait time in ms (default 10000)'),
    }).parse(input);

    const mgr = getSharedBrowserManager();
    try {
      const page = await mgr.getOrCreate(sessionId);
      const prevUrl = page.url();
      await page.waitForLoadState('load', { timeout });
      const newUrl = page.url();
      if (newUrl !== prevUrl) {
        return `Navigation detected: ${prevUrl} → ${newUrl}`;
      }
      return `Page loaded but URL unchanged (${newUrl})`;
    } catch {
      return 'Navigation wait timed out — page did not finish loading within the specified timeout.';
    }
  }, {
    name: 'wait_for_navigation',
    description: 'Wait for the current page to finish loading. Use after clicking a link or submitting a form to ensure the next page is ready before interacting.',
    schema: z.object({
      sessionId: z.string().optional().default('default'),
      timeout: z.number().optional().default(10000),
    }),
  });
}

export function createResetSessionTool(): DynamicStructuredTool {
  return tool(async (input) => {
    const { sessionId } = z.object({
      sessionId: z.string().optional().default('default').describe('Browser session ID'),
    }).parse(input);

    const mgr = getSharedBrowserManager();
    try {
      const page = await mgr.getOrCreate(sessionId);
      const context = page.context();
      await context.clearCookies();
      await page.evaluate(() => {
        localStorage.clear();
        sessionStorage.clear();
      });
      return `Session ${sessionId} reset: cookies, localStorage, and sessionStorage cleared.`;
    } catch (e) {
      return `Error resetting session: ${e instanceof Error ? e.message : String(e)}`;
    }
  }, {
    name: 'reset_session',
    description: 'Clear all cookies, localStorage, and sessionStorage for the current browser session. Use this to reset auth state or start fresh without closing the browser.',
    schema: z.object({
      sessionId: z.string().optional().default('default'),
    }),
  });
}
