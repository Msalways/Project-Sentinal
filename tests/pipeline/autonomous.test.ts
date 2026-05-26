import { describe, it, expect, vi } from 'vitest';

describe('AutonomousOrchestrator', () => {
  it('should export AutonomousOrchestrator class', async () => {
    const mod = await import('../../src/pipeline/autonomous');
    expect(mod.AutonomousOrchestrator).toBeDefined();
  });

  it('should export ORCHESTRATOR_PROMPT with spawn_subagent guidance', async () => {
    const mod = await import('../../src/pipeline/autonomous');
    expect(mod.ORCHESTRATOR_PROMPT).toBeDefined();
    expect(typeof mod.ORCHESTRATOR_PROMPT).toBe('string');
    expect(mod.ORCHESTRATOR_PROMPT).toContain('spawn_subagent');
    expect(mod.ORCHESTRATOR_PROMPT).toContain('targetUrl');
  });

  it('should export SKILL_SECTION constant', async () => {
    const mod = await import('../../src/pipeline/autonomous');
    expect(mod.SKILL_SECTION).toBeDefined();
    expect(typeof mod.SKILL_SECTION).toBe('string');
  });

  it('ORCHESTRATOR_PROMPT should include targetUrl guidance', async () => {
    const mod = await import('../../src/pipeline/autonomous');
    expect(mod.ORCHESTRATOR_PROMPT).toContain('targetUrl');
    expect(mod.ORCHESTRATOR_PROMPT).toContain('How to Use Sub-Agents');
    expect(mod.ORCHESTRATOR_PROMPT).toContain('TARGET_URL_HERE');
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
