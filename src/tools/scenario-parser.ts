import fs from 'fs';
import path from 'path';

export interface ScenarioRole {
  name: string;
  credentials: Record<string, string>;
  har?: string;
}

export interface ScenarioTest {
  happy: string[];
  sad: string[];
}

export interface ScenarioWorkflow {
  name: string;
  har?: string;
  test: ScenarioTest;
}

export interface ScenarioManifest {
  target: string;
  roles: ScenarioRole[];
  workflows: ScenarioWorkflow[];
  mcp?: { name: string; command: string; args: string[]; description: string }[];
}

export class ScenarioParser {
  static fromYaml(content: string): ScenarioManifest {
    const manifest: ScenarioManifest = { target: '', roles: [], workflows: [] };
    const lines = content.split('\n');
    let currentSection: 'roles' | 'workflows' | 'mcp' | null = null;
    let currentItem: Record<string, unknown> = {};
    let currentSubSection: string | null = null;

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;

      if (trimmed.startsWith('target:')) manifest.target = trimmed.replace('target:', '').trim().replace(/['"]/g, '');
      else if (trimmed === 'roles:') currentSection = 'roles';
      else if (trimmed === 'workflows:') currentSection = 'workflows';
      else if (trimmed === 'mcp:') currentSection = 'mcp';
      else if (trimmed.startsWith('- name:') && currentSection) {
        if (Object.keys(currentItem).length > 0) this.pushItem(manifest, currentSection, currentItem);
        currentItem = { name: trimmed.replace('- name:', '').trim().replace(/['"]/g, '') };
        currentSubSection = null;
      } else if (trimmed.startsWith('login:') && currentSection === 'roles') {
        currentItem.credentials = this.parseInlineObject(trimmed.replace('login:', '').trim());
      } else if (trimmed.startsWith('har:') && currentSection) {
        currentItem.har = trimmed.replace('har:', '').trim().replace(/['"]/g, '');
      } else if (trimmed.startsWith('test:') && currentSection === 'workflows') {
        currentSubSection = 'test';
        currentItem.happy = [];
        currentItem.sad = [];
      } else if (trimmed.startsWith('happy:') && (currentSubSection === 'test' || currentSubSection === 'sad')) currentSubSection = 'happy';
      else if (trimmed.startsWith('sad:') && (currentSubSection === 'test' || currentSubSection === 'happy')) currentSubSection = 'sad';
      else if (trimmed.startsWith('- ') && (currentSubSection === 'happy' || currentSubSection === 'sad')) {
        const value = trimmed.slice(2).replace(/['"]/g, '');
        (currentItem[currentSubSection] as string[]).push(value);
      } else if (trimmed.startsWith('command:') && currentSection === 'mcp') {
        currentItem.command = trimmed.replace('command:', '').trim().replace(/['"]/g, '');
      } else if (trimmed.startsWith('description:') && currentSection === 'mcp') {
        currentItem.description = trimmed.replace('description:', '').trim().replace(/['"]/g, '');
      } else if (trimmed.startsWith('args:') && currentSection === 'mcp') {
        currentItem.args = JSON.parse(trimmed.replace('args:', '').trim());
      }
    }

    if (Object.keys(currentItem).length > 0) this.pushItem(manifest, currentSection, currentItem);
    return manifest;
  }

  static fromFile(filePath: string): ScenarioManifest {
    return this.fromYaml(fs.readFileSync(filePath, 'utf-8'));
  }

  static fromHar(harPath: string, target: string): ScenarioManifest {
    const har = JSON.parse(fs.readFileSync(harPath, 'utf-8'));
    const urls = new Set<string>();
    const endpoints: { url: string; method: string }[] = [];
    for (const entry of har.log.entries) {
      const key = `${entry.request.method}:${entry.request.url}`;
      if (!urls.has(key)) { urls.add(key); endpoints.push({ url: entry.request.url, method: entry.request.method }); }
    }
    return {
      target,
      roles: [{ name: 'default', credentials: {} }],
      workflows: [{ name: 'Recorded Session', har: harPath, test: { happy: endpoints.map((ep) => `${ep.method} ${ep.url} → 200 OK`), sad: [] } }],
    };
  }

  private static pushItem(manifest: ScenarioManifest, section: string | null, item: Record<string, unknown>) {
    if (section === 'roles') manifest.roles.push({ name: item.name as string, credentials: (item.credentials as Record<string, string>) || {}, har: item.har as string });
    else if (section === 'workflows') manifest.workflows.push({ name: item.name as string, har: item.har as string, test: { happy: (item.happy as string[]) || [], sad: (item.sad as string[]) || [] } });
    else if (section === 'mcp') { manifest.mcp = manifest.mcp || []; manifest.mcp.push({ name: item.name as string, command: item.command as string, args: (item.args as string[]) || [], description: item.description as string }); }
  }

  private static parseInlineObject(str: string): Record<string, string> {
    const result: Record<string, string> = {};
    const pairs = str.match(/\{([^}]+)\}/)?.[1] || str;
    for (const pair of pairs.split(',')) {
      const [key, value] = pair.split(':').map((s) => s.trim().replace(/['"]/g, ''));
      if (key && value) result[key] = value;
    }
    return result;
  }
}
