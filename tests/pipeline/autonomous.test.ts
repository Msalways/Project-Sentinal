import { describe, it, expect, vi } from 'vitest';

describe('AutonomousOrchestrator', () => {
  it('should export AutonomousOrchestrator class', async () => {
    const mod = await import('../../src/pipeline/autonomous');
    expect(mod.AutonomousOrchestrator).toBeDefined();
  });

  it('should have 4 phases defined with names and goal prompts', async () => {
    const mod = await import('../../src/pipeline/autonomous');
    expect(mod.PHASES).toBeDefined();
    expect(Array.isArray(mod.PHASES)).toBe(true);
    expect(mod.PHASES.length).toBe(4);
    expect(mod.PHASES[0].name).toBe('recon');
    expect(mod.PHASES[1].name).toBe('vuln');
    expect(mod.PHASES[2].name).toBe('exploit');
    expect(mod.PHASES[3].name).toBe('report');
  });

  it('each phase should have a name and goalPrompt', async () => {
    const mod = await import('../../src/pipeline/autonomous');
    for (const phase of mod.PHASES) {
      expect(phase.name).toBeTruthy();
      expect(phase.goalPrompt).toBeTruthy();
    }
  });

  it('should export SKILL_SECTION constant', async () => {
    const mod = await import('../../src/pipeline/autonomous');
    expect(mod.SKILL_SECTION).toBeDefined();
    expect(typeof mod.SKILL_SECTION).toBe('string');
  });
});
