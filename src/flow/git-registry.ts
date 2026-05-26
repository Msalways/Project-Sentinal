import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

export type RegistryConfig = {
  repoUrl: string;
  branch?: string;
  localPath?: string;
};

export class FlowRegistry {
  private config: RegistryConfig;

  constructor(config: RegistryConfig) {
    this.config = config;
  }

  get localPath(): string {
    return this.config.localPath || path.join(process.cwd(), '.flow-registry');
  }

  ensureRepo(): boolean {
    if (fs.existsSync(path.join(this.localPath, '.git'))) {
      this.exec('git pull', this.localPath);
      return true;
    }
    if (this.config.repoUrl) {
      fs.mkdirSync(path.dirname(this.localPath), { recursive: true });
      this.exec(`git clone "${this.config.repoUrl}" "${this.localPath}"`, path.dirname(this.localPath));
      return true;
    }
    return false;
  }

  syncFrom(): string {
    if (!fs.existsSync(path.join(this.localPath, '.git'))) return '';
    this.exec('git pull', this.localPath);
    const log = this.exec('git log --oneline -5', this.localPath);
    return log;
  }

  commit(artifactsDir: string, message: string): boolean {
    this.ensureRepo();
    const targetDir = this.localPath;
    if (!fs.existsSync(path.join(targetDir, '.git'))) {
      this.exec('git init', targetDir);
      this.exec('git config user.email "ultimatrix@sentinel.local"', targetDir);
      this.exec('git config user.name "Ultimatrix FlowMapper"', targetDir);
    }

    const files = this.collectFiles(artifactsDir);
    for (const file of files) {
      const relative = path.relative(artifactsDir, file);
      const dest = path.join(targetDir, relative);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.copyFileSync(file, dest);
    }

    this.exec('git add -A', targetDir);
    const status = this.exec('git status --porcelain', targetDir);
    if (!status.trim()) return false;

    this.exec(`git commit -m "${message}"`, targetDir);
    if (this.config.repoUrl) {
      const branch = this.config.branch || 'main';
      this.exec(`git push origin ${branch} 2>/dev/null || true`, targetDir);
    }
    return true;
  }

  diff(fromRef?: string): string {
    if (!fs.existsSync(path.join(this.localPath, '.git'))) return '';
    const ref = fromRef || 'HEAD~1..HEAD';
    return this.exec(`git diff ${ref} --name-only`, this.localPath);
  }

  getLastVersion(): string {
    if (!fs.existsSync(path.join(this.localPath, '.git'))) return '';
    return this.exec('git log --oneline -1', this.localPath).trim();
  }

  private collectFiles(dir: string): string[] {
    const files: string[] = [];
    if (!fs.existsSync(dir)) return files;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) files.push(...this.collectFiles(full));
      else files.push(full);
    }
    return files;
  }

  private exec(cmd: string, cwd: string): string {
    try {
      return execSync(cmd, { cwd, encoding: 'utf-8', timeout: 30000 }).toString();
    } catch {
      return '';
    }
  }
}
