import fs from 'fs';
import path from 'path';

export interface SkillInfo {
  name: string;
  path: string;
  description: string;
  subdomain: string;
  mitreAttack: string[];
  content: string;
}

export class SkillLoader {
  private skillDir: string;
  private cache: Map<string, SkillInfo> | null = null;

  constructor(skillDir: string) {
    this.skillDir = skillDir;
  }

  private parseFrontmatter(filePath: string): Partial<SkillInfo> & { body: string } {
    const raw = fs.readFileSync(filePath, 'utf-8');
    let description = '';
    let name = '';
    let mitreAttack: string[] = [];
    let body = raw;

    if (raw.startsWith('---')) {
      const end = raw.indexOf('---', 3);
      if (end !== -1) {
        const front = raw.slice(3, end).trim();
        body = raw.slice(end + 3).trim();
        for (const line of front.split('\n')) {
          const [k, ...v] = line.split(':');
          const key = k.trim();
          const val = v.join(':').trim();
          if (key === 'name') name = val;
          else if (key === 'description') description = val;
          else if (key === 'mitre_attack') mitreAttack = val.split(',').map((s: string) => s.trim());
        }
      }
    }

    return { name, description, mitreAttack, body };
  }

  loadAll(): SkillInfo[] {
    if (this.cache) return Array.from(this.cache.values());
    this.cache = new Map();
    const cache = this.cache;

    const walk = (dir: string) => {
      if (!fs.existsSync(dir)) return;
      for (const entry of fs.readdirSync(dir)) {
        const fullPath = path.join(dir, entry);
        const stat = fs.statSync(fullPath);
        if (stat.isDirectory()) {
          walk(fullPath);
        } else if (entry.toLowerCase() === 'skill.md') {
          const subdomain = path.basename(path.dirname(fullPath));
          const parsed = this.parseFrontmatter(fullPath);
          const skillName = parsed.name || subdomain;
          cache.set(skillName, { name: skillName, path: fullPath, description: parsed.description || subdomain, subdomain, mitreAttack: parsed.mitreAttack || [], content: parsed.body });
        }
      }
    };

    walk(this.skillDir);
    return Array.from(cache.values());
  }

  list(): SkillInfo[] {
    return this.loadAll();
  }

  get(name: string): SkillInfo | undefined {
    return this.loadAll().find((s) => s.name === name || s.subdomain === name);
  }

  search(query: string): SkillInfo[] {
    const lower = query.toLowerCase();
    return this.loadAll().filter((s) =>
      s.name.toLowerCase().includes(lower) ||
      s.description.toLowerCase().includes(lower) ||
      s.subdomain.toLowerCase().includes(lower) ||
      s.mitreAttack.some((m) => m.toLowerCase().includes(lower))
    );
  }

  getCatalog(): string {
    return this.loadAll().map((s) =>
      `- ${s.name} (${s.subdomain}): ${s.description}${s.mitreAttack.length ? ` [MITRE: ${s.mitreAttack.join(', ')}]` : ''}`
    ).join('\n');
  }
}

export const skillLoader = new SkillLoader(path.join(process.cwd(), 'skills'));
