import type { Page } from 'playwright';
import { NetworkRecorder, type CapturedRequest } from './network-recorder';
import { takeSnapshot, type DOMSnapshot } from './dom-observer';
import { planInteractions, type Interaction } from './interaction-planner';
import { buildWorkflowGraph, type Transition } from './workflow-builder';
import type { BrowserSessionManager } from '../core/browser-session';

export interface CrawlOptions {
  target: string;
  browserManager: BrowserSessionManager;
  maxDepth: number;
  maxPages: number;
  onProgress?: (msg: string) => void;
}

export interface CrawlResult {
  nodes: ReturnType<typeof buildWorkflowGraph>['nodes'];
  edges: ReturnType<typeof buildWorkflowGraph>['edges'];
  endpoints: ReturnType<typeof buildWorkflowGraph>['endpoints'];
  authBoundaries: ReturnType<typeof buildWorkflowGraph>['authBoundaries'];
  techStack: ReturnType<typeof buildWorkflowGraph>['techStack'];
  visitedUrls: string[];
  forms: Array<{ pageUrl: string; action: string; method: string; fields: Array<{ name: string; type: string; placeholder: string; required: boolean }> }>;
}

interface QueueItem {
  url: string;
  depth: number;
  fromUrl: string | null;
  trigger: string | null;
}

export async function crawl(options: CrawlOptions): Promise<CrawlResult> {
  const { target, browserManager, maxDepth, maxPages, onProgress } = options;
  const page: Page = await browserManager.getOrCreate('default');
  const log = onProgress || ((msg: string) => {});

  const queue: QueueItem[] = [{ url: target, depth: 0, fromUrl: null, trigger: null }];
  const visited = new Set<string>();
  const seenSelectors = new Set<string>();
  const transitions: Transition[] = [];
  const allRequests: CapturedRequest[] = [];
  const recorder = new NetworkRecorder(page);
  const allForms: Array<{ pageUrl: string; action: string; method: string; fields: Array<{ name: string; type: string; placeholder: string; required: boolean }> }> = [];

  let pagesCrawled = 0;

  while (queue.length > 0 && pagesCrawled < maxPages) {
    const item = queue.shift()!;
    if (visited.has(item.url)) continue;
    if (item.depth > maxDepth) continue;

    visited.add(item.url);
    pagesCrawled++;

    log(`[${pagesCrawled}/${maxPages}] ${item.url} (depth ${item.depth})`);

    // Navigate to page
    try {
      await page.goto(item.url, { waitUntil: 'load', timeout: 15000 });
    } catch {
      log(`  Navigation failed: ${item.url}`);
      continue;
    }

    // Small wait for JS rendering
    await page.waitForTimeout(1000);

    // Start recording network
    recorder.start();
    const beforeSnapshot = await takeSnapshot(page);

    // Collect forms from this page
    for (const f of beforeSnapshot.forms) {
      allForms.push({
        pageUrl: beforeSnapshot.url,
        action: f.action,
        method: f.method,
        fields: f.fields,
      });
    }

    // Plan interactions (what to click/fill)
    const interactions = planInteractions(beforeSnapshot, visited, seenSelectors);

    for (const interaction of interactions) {
      if (pagesCrawled >= maxPages) break;

      log(`  → ${interaction.label}`);

      const beforeTransitionSnapshot = await takeSnapshot(page);
      const timestamp = Date.now();
      recorder.clear();

      try {
        if (interaction.type === 'click') {
          const el = await page.$(interaction.targetSelector);
          if (!el) continue;
          await el.click();
        } else if (interaction.type === 'fill_and_submit') {
          const form = await page.$(interaction.targetSelector);
          if (!form) continue;

          // Fill each field
          for (const [name, value] of Object.entries(interaction.formData || {})) {
            const field = await form.$(`[name="${name}"]`);
            if (field) {
              await field.fill(value);
            }
          }

          // Look for submit button
          const submitBtn = await form.$('button[type="submit"], input[type="submit"]');
          if (submitBtn) {
            await submitBtn.click();
          } else {
            // Submit form via enter on last field
            const lastField = await form.$('input:not([type="hidden"])');
            if (lastField) await lastField.press('Enter');
          }
        } else if (interaction.type === 'navigate') {
          const el = await page.$(interaction.targetSelector);
          if (!el) continue;
          await el.click();
        }

        // Wait for network + JS rendering
        await page.waitForTimeout(1000);
        try {
          await page.waitForLoadState('load', { timeout: 5000 });
        } catch {}

      } catch {
        log(`    failed`);
        continue;
      }

      const afterSnapshot = await takeSnapshot(page);

      // Collect forms from after snapshot too
      for (const f of afterSnapshot.forms) {
        const key = `${afterSnapshot.url}:${f.action}:${f.selector}`;
        if (allForms.some(ex => `${ex.pageUrl}:${ex.action}:${f.selector}` === key)) continue;
        allForms.push({
          pageUrl: afterSnapshot.url,
          action: f.action,
          method: f.method,
          fields: f.fields,
        });
      }

      // Check if DOM changed — if so, this is a real transition
      if (beforeTransitionSnapshot.hash !== afterSnapshot.hash) {
        const reqs = recorder.stop();
        allRequests.push(...reqs);

        transitions.push({
          beforeSnapshot: beforeTransitionSnapshot,
          afterSnapshot,
          trigger: interaction,
          requests: reqs,
        });

        // If the URL is new, add to BFS queue
        const newUrl = afterSnapshot.url;
        if (!visited.has(newUrl) && newUrl.startsWith(target.split('/').slice(0, 3).join('/'))) {
          visited.add(newUrl);
          queue.push({
            url: newUrl,
            depth: item.depth + 1,
            fromUrl: beforeTransitionSnapshot.url,
            trigger: interaction.type,
          });
        }

        // For 'fill_and_submit' — if URL changed, the form navigated somewhere worth exploring
        if (interaction.type === 'fill_and_submit' && afterSnapshot.url !== beforeTransitionSnapshot.url) {
          // Already added via the newUrl check above
        }

        log(`    → DOM changed → transition captured`);
      } else {
        log(`    → no DOM change`);
      }
    }

    recorder.stop();
  }

  // Build the workflow graph
  const graph = buildWorkflowGraph(transitions, target);

  return {
    nodes: graph.nodes,
    edges: graph.edges,
    endpoints: graph.endpoints,
    authBoundaries: graph.authBoundaries,
    techStack: graph.techStack,
    visitedUrls: Array.from(visited),
    forms: allForms,
  };
}
