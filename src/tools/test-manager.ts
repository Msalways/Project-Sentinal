import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

export interface TestManifest {
  version: string;
  generatedAt: string;
  targetUrl: string;
  tests: TestEntry[];
}

export interface TestEntry {
  file: string;
  workflowName: string;
  endpoints: string[];
  hash: string;
  status: 'active' | 'stale' | 'new';
  generatedAt: string;
}

export class TestManager {
  private outputDir: string;
  private manifestPath: string;

  constructor(outputDir: string) {
    this.outputDir = outputDir;
    this.manifestPath = path.join(outputDir, '.ultimatrix-tests.json');
  }

  loadManifest(): TestManifest | null {
    if (!fs.existsSync(this.manifestPath)) return null;
    try {
      return JSON.parse(fs.readFileSync(this.manifestPath, 'utf-8'));
    } catch {
      return null;
    }
  }

  saveManifest(manifest: TestManifest): void {
    fs.mkdirSync(this.outputDir, { recursive: true });
    fs.writeFileSync(this.manifestPath, JSON.stringify(manifest, null, 2));
  }

  hashEndpoints(endpoints: string[]): string {
    return crypto.createHash('md5').update(endpoints.sort().join('|')).digest('hex').slice(0, 8);
  }

  getExistingTests(): Map<string, TestEntry> {
    const manifest = this.loadManifest();
    if (!manifest) return new Map();
    return new Map(manifest.tests.map((t) => [t.file, t]));
  }

  reconcile(newTests: { file: string; workflowName: string; endpoints: string[] }[]): {
    newFiles: string[];
    updatedFiles: string[];
    staleFiles: string[];
    preservedFiles: string[];
    manifest: TestManifest;
  } {
    const existing = this.getExistingTests();
    const newTestMap = new Map(newTests.map((t) => [t.file, t]));
    const newFiles: string[] = [];
    const updatedFiles: string[] = [];
    const staleFiles: string[] = [];
    const preservedFiles: string[] = [];

    const updatedManifest: TestManifest = {
      version: '2.0.0',
      generatedAt: new Date().toISOString(),
      targetUrl: newTests[0]?.endpoints[0] || '',
      tests: [],
    };

    for (const [file, newTest] of newTestMap.entries()) {
      const hash = this.hashEndpoints(newTest.endpoints);
      const existingTest = existing.get(file);

      if (!existingTest) {
        newFiles.push(file);
        updatedManifest.tests.push({
          file,
          workflowName: newTest.workflowName,
          endpoints: newTest.endpoints,
          hash,
          status: 'new',
          generatedAt: new Date().toISOString(),
        });
      } else if (existingTest.hash !== hash) {
        updatedFiles.push(file);
        updatedManifest.tests.push({
          file,
          workflowName: newTest.workflowName,
          endpoints: newTest.endpoints,
          hash,
          status: 'active',
          generatedAt: existingTest.generatedAt,
        });
      } else {
        preservedFiles.push(file);
        updatedManifest.tests.push({ ...existingTest, status: 'active' });
      }
    }

    for (const [file, existingTest] of existing.entries()) {
      if (!newTestMap.has(file)) {
        staleFiles.push(file);
        updatedManifest.tests.push({ ...existingTest, status: 'stale' });
      }
    }

    return { newFiles, updatedFiles, staleFiles, preservedFiles, manifest: updatedManifest };
  }

  writeTestFile(filePath: string, content: string): void {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, content);
  }

  markStale(filePath: string): void {
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf-8');
      if (!content.includes('// STALE:')) {
        const updated = `// STALE: This test was generated for a workflow that no longer exists in the current HAR.\n// Review and remove if the feature has been removed.\n\n${content}`;
        fs.writeFileSync(filePath, updated);
      }
    }
  }
}
