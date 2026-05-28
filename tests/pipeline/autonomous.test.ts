import { describe, it, expect, vi } from 'vitest';

describe('AutonomousOrchestrator', () => {
  it('should export AutonomousOrchestrator class', async () => {
    const mod = await import('../../src/pipeline/autonomous');
    expect(mod.AutonomousOrchestrator).toBeDefined();
  });

  it('should export THREAT_MODEL_PROMPT with explore/analyze/attack guidance', async () => {
    const mod = await import('../../src/pipeline/autonomous');
    expect(mod.THREAT_MODEL_PROMPT).toBeDefined();
    expect(typeof mod.THREAT_MODEL_PROMPT).toBe('string');
    expect(mod.THREAT_MODEL_PROMPT).toContain('EXPLORE');
    expect(mod.THREAT_MODEL_PROMPT).toContain('ANALYZE');
    expect(mod.THREAT_MODEL_PROMPT).toContain('ATTACK');
  });

  it('THREAT_MODEL_PROMPT should include threat-model.json guidance', async () => {
    const mod = await import('../../src/pipeline/autonomous');
    expect(mod.THREAT_MODEL_PROMPT).toContain('threat-model.json');
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
