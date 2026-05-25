import { describe, it, expect } from 'vitest';
import { SkillLoader } from '../../src/core/skill-loader';
import path from 'path';

describe('SkillLoader', () => {
  const skillsDir = path.join(process.cwd(), 'skills');

  it('should load all skill files from the skills directory', () => {
    const loader = new SkillLoader(skillsDir);
    const skills = loader.loadAll();
    expect(skills.length).toBeGreaterThanOrEqual(4);
  });

  it('should return skills by name', () => {
    const loader = new SkillLoader(skillsDir);
    const skill = loader.get('web-recon');
    expect(skill).toBeDefined();
    expect(skill!.subdomain).toBe('web-recon');
  });

  it('should return skills by subdomain', () => {
    const loader = new SkillLoader(skillsDir);
    const skill = loader.get('web-recon');
    expect(skill).toBeDefined();
    expect(skill!.name).toBe('web-recon');
  });

  it('should return undefined for unknown skills', () => {
    const loader = new SkillLoader(skillsDir);
    expect(loader.get('nonexistent-skill')).toBeUndefined();
  });

  it('should search skills by keyword', () => {
    const loader = new SkillLoader(skillsDir);
    const results = loader.search('sql');
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results.some((s) => s.name.includes('sql'))).toBe(true);
  });

  it('should generate a catalog string', () => {
    const loader = new SkillLoader(skillsDir);
    const catalog = loader.getCatalog();
    expect(catalog).toContain('web-recon');
    expect(catalog).toContain('MITRE');
  });

  it('should parse frontmatter from skill files', () => {
    const loader = new SkillLoader(skillsDir);
    const skill = loader.get('sql-injection');
    expect(skill).toBeDefined();
    expect(skill!.mitreAttack.length).toBeGreaterThan(0);
    expect(skill!.description).toBeTruthy();
  });
});
