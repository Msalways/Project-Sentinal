import fs from 'fs';
import path from 'path';
import os from 'os';
import type { AppFlowModel } from './flow-model';

export interface FlowDiff {
  addedPages: string[];
  removedPages: string[];
  changedPages: Array<{ path: string; changes: string[] }>;
  addedApis: string[];
  removedApis: string[];
  impactedFlows: string[];
  hasChanges: boolean;
}

export class LocalRegistry {
  private appDir: string;

  constructor(appNameOrUrl: string) {
    const name = appNameOrUrl.replace(/https?:\/\//, '').replace(/[^a-z0-9.-]/g, '-').toLowerCase();
    this.appDir = path.join(os.homedir(), '.ultimatrix', 'registry', name);
  }

  get path(): string {
    return this.appDir;
  }

  get flowPath(): string {
    return path.join(this.appDir, 'flow.json');
  }

  loadPrevious(): AppFlowModel | null {
    if (!fs.existsSync(this.flowPath)) return null;
    try {
      return JSON.parse(fs.readFileSync(this.flowPath, 'utf-8')) as AppFlowModel;
    } catch {
      return null;
    }
  }

  save(current: AppFlowModel): void {
    fs.mkdirSync(this.appDir, { recursive: true });
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    fs.writeFileSync(path.join(this.appDir, `flow-${timestamp}.json`), JSON.stringify(current, null, 2));
    fs.writeFileSync(this.flowPath, JSON.stringify(current, null, 2));
  }

  diff(current: AppFlowModel): FlowDiff {
    const previous = this.loadPrevious();
    if (!previous) {
      return { addedPages: [], removedPages: [], changedPages: [], addedApis: [], removedApis: [], impactedFlows: [], hasChanges: true };
    }

    const prevPaths = new Set(previous.pages.map(p => p.path));
    const currPaths = new Set(current.pages.map(p => p.path));
    const prevApis = new Set(previous.apis.map(a => `${a.method}:${a.path}`));
    const currApis = new Set(current.apis.map(a => `${a.method}:${a.path}`));

    const addedPages = current.pages.filter(p => !prevPaths.has(p.path)).map(p => p.path);
    const removedPages = previous.pages.filter(p => !currPaths.has(p.path)).map(p => p.path);

    const changedPages: FlowDiff['changedPages'] = [];
    for (const currPage of current.pages) {
      const prevPage = previous.pages.find(p => p.path === currPage.path);
      if (!prevPage) continue;
      const changes: string[] = [];
      if (currPage.title !== prevPage.title) changes.push(`title changed: "${prevPage.title}" → "${currPage.title}"`);
      if (currPage.type !== prevPage.type) changes.push(`type changed: ${prevPage.type} → ${currPage.type}`);
      if (currPage.auth !== prevPage.auth) changes.push(`auth changed: ${prevPage.auth} → ${currPage.auth}`);
      const prevFormKeys = new Set(prevPage.forms.map(f => `${f.method}:${f.action}`));
      const currFormKeys = new Set(currPage.forms.map(f => `${f.method}:${f.action}`));
      const newForms = currPage.forms.filter(f => !prevFormKeys.has(`${f.method}:${f.action}`));
      if (newForms.length > 0) changes.push(`new forms: ${newForms.map(f => `${f.method} ${f.action}`).join(', ')}`);
      const removedForms = prevPage.forms.filter(f => !currFormKeys.has(`${f.method}:${f.action}`));
      if (removedForms.length > 0) changes.push(`removed forms: ${removedForms.map(f => `${f.method} ${f.action}`).join(', ')}`);
      const prevEndpoints = new Set(prevPage.detectedEndpoints);
      const currEndpoints = new Set(currPage.detectedEndpoints);
      const newEps = currPage.detectedEndpoints.filter(e => !prevEndpoints.has(e));
      if (newEps.length > 0) changes.push(`new endpoints: ${newEps.join(', ')}`);
      if (changes.length > 0) changedPages.push({ path: currPage.path, changes });
    }

    const addedApis = current.apis.filter(a => !prevApis.has(`${a.method}:${a.path}`)).map(a => `${a.method} ${a.path}`);
    const removedApis = previous.apis.filter(a => !currApis.has(`${a.method}:${a.path}`)).map(a => `${a.method} ${a.path}`);

    const impactedFlows = this.computeImpacted(current, prevPaths, currPaths, prevApis, currApis);

    return {
      addedPages, removedPages, changedPages, addedApis, removedApis, impactedFlows,
      hasChanges: addedPages.length > 0 || removedPages.length > 0 || changedPages.length > 0 || addedApis.length > 0 || removedApis.length > 0,
    };
  }

  private computeImpacted(current: AppFlowModel, prevPaths: Set<string>, _currPaths: Set<string>, _prevApis: Set<string>, _currApis: Set<string>): string[] {
    const impacted = new Set<string>();
    const newPages = current.pages.filter(p => !prevPaths.has(p.path));
    for (const p of newPages) {
      const linkingPages = current.pages.filter(p2 => p2.transitions.some(t => t.to === p.path || t.to.endsWith(p.path)));
      for (const lp of linkingPages) impacted.add(`${lp.path} → ${p.path}`);
    }
    return Array.from(impacted);
  }
}
