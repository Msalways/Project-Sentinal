import { describe, it, expect, vi } from 'vitest';

describe('AutonomousOrchestrator', () => {
  it('should export AutonomousOrchestrator class', async () => {
    const mod = await import('../../src/pipeline/autonomous');
    expect(mod.AutonomousOrchestrator).toBeDefined();
  });

  it('STRATEGIST_PROMPT should guide strategist behavior', async () => {
    const mod = await import('../../src/prompts/threat-model');
    expect(mod.STRATEGIST_PROMPT).toBeDefined();
    expect(typeof mod.STRATEGIST_PROMPT).toBe('string');
    expect(mod.STRATEGIST_PROMPT).toContain('security strategist');
    expect(mod.STRATEGIST_PROMPT).toContain('spawn_worker');
    expect(mod.STRATEGIST_PROMPT).toContain('techniques');
    expect(mod.STRATEGIST_PROMPT).toContain('FIRE-AND-FORGET');
  });

  it('AutonomousOrchestrator should construct with model, target, outputDir', async () => {
    const mod = await import('../../src/pipeline/autonomous');
    const mockModel = {} as any;
    const orchestrator = new mod.AutonomousOrchestrator({
      model: mockModel,
      target: 'https://example.com',
      outputDir: '/tmp/test',
    });
    expect(orchestrator).toBeDefined();
    expect(orchestrator.run).toBeDefined();
    expect(typeof orchestrator.run).toBe('function');
  });
});
