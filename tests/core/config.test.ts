import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createConfig, defaultConfig, getAgentConfig } from '../../src/core/config';

describe('createConfig', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns default config with no overrides', () => {
    const config = createConfig();
    expect(config.provider).toBe('openai');
    expect(config.apiKey).toBe('');
    expect(config.modelId).toBe('gpt-4o');
    expect(config.headless).toBe(true);
    expect(config.timeout).toBe(60000);
    expect(config.outputFormat).toBe('html');
    expect(config.outputDir).toBe('.');
  });

  it('uses provider from overrides', () => {
    const config = createConfig({ provider: 'anthropic' });
    expect(config.provider).toBe('anthropic');
  });

  it('uses apiKey from overrides', () => {
    const config = createConfig({ apiKey: 'sk-test-key' });
    expect(config.apiKey).toBe('sk-test-key');
  });

  it('uses modelId from overrides', () => {
    const config = createConfig({ modelId: 'custom-model' });
    expect(config.modelId).toBe('custom-model');
  });

  it('picks azureEndpoint from overrides', () => {
    const config = createConfig({ azureEndpoint: 'https://test.openai.azure.com' });
    expect(config.azureEndpoint).toBe('https://test.openai.azure.com');
  });

  it('picks azureApiVersion from overrides', () => {
    const config = createConfig({ azureApiVersion: '2023-05-15' });
    expect(config.azureApiVersion).toBe('2023-05-15');
  });

  it('defaults azureApiVersion when not provided', () => {
    const config = createConfig();
    expect(config.azureApiVersion).toBe('2024-02-01');
  });

  it('picks headless from overrides', () => {
    const config = createConfig({ headless: false });
    expect(config.headless).toBe(false);
  });

  it('picks timeout from overrides', () => {
    const config = createConfig({ timeout: 30000 });
    expect(config.timeout).toBe(30000);
  });

  it('picks outputFormat from overrides', () => {
    const config = createConfig({ outputFormat: 'json' });
    expect(config.outputFormat).toBe('json');
  });

  it('picks outputDir from overrides', () => {
    const config = createConfig({ outputDir: './reports' });
    expect(config.outputDir).toBe('./reports');
  });

  it('picks scopeManifest from overrides', () => {
    const config = createConfig({ scopeManifest: 'scenario.yaml' });
    expect(config.scopeManifest).toBe('scenario.yaml');
  });

  it('overrides provider via SENTINEL_PROVIDER env', () => {
    vi.stubEnv('SENTINEL_PROVIDER', 'anthropic');
    const config = createConfig();
    expect(config.provider).toBe('anthropic');
    expect(config.modelId).toBe('claude-sonnet-4-20250514');
  });

  it('env provider is overridden by explicit provider override', () => {
    vi.stubEnv('SENTINEL_PROVIDER', 'anthropic');
    const config = createConfig({ provider: 'openai' });
    expect(config.provider).toBe('openai');
  });

  it('picks apiKey via env for openai', () => {
    vi.stubEnv('OPENAI_API_KEY', 'sk-env-key');
    const config = createConfig({ provider: 'openai' });
    expect(config.apiKey).toBe('sk-env-key');
  });

  it('picks apiKey via env for anthropic', () => {
    vi.stubEnv('ANTHROPIC_API_KEY', 'sk-ant-env');
    const config = createConfig({ provider: 'anthropic' });
    expect(config.apiKey).toBe('sk-ant-env');
  });

  it('picks apiKey via env for azure-openai', () => {
    vi.stubEnv('AZURE_OPENAI_API_KEY', 'az-key');
    const config = createConfig({ provider: 'azure-openai' });
    expect(config.apiKey).toBe('az-key');
  });

  it('picks apiKey via env for openrouter', () => {
    vi.stubEnv('OPENROUTER_API_KEY', 'or-key');
    const config = createConfig({ provider: 'openrouter' });
    expect(config.apiKey).toBe('or-key');
  });

  it('uses mock apiKey for mock provider', () => {
    const config = createConfig({ provider: 'mock' });
    expect(config.apiKey).toBe('mock');
  });

  it('explicit apiKey overrides env', () => {
    vi.stubEnv('OPENAI_API_KEY', 'sk-env-key');
    const config = createConfig({ provider: 'openai', apiKey: 'sk-explicit' });
    expect(config.apiKey).toBe('sk-explicit');
  });

  it('picks azureEndpoint from env when not in overrides', () => {
    vi.stubEnv('AZURE_OPENAI_ENDPOINT', 'https://env-endpoint.openai.azure.com');
    const config = createConfig({ provider: 'azure-openai' });
    expect(config.azureEndpoint).toBe('https://env-endpoint.openai.azure.com');
  });

  it('overrides env azureEndpoint with explicit', () => {
    vi.stubEnv('AZURE_OPENAI_ENDPOINT', 'https://env-endpoint.openai.azure.com');
    const config = createConfig({
      provider: 'azure-openai',
      azureEndpoint: 'https://explicit-endpoint.openai.azure.com',
    });
    expect(config.azureEndpoint).toBe('https://explicit-endpoint.openai.azure.com');
  });

  it('uses azureApiVersion from env', () => {
    vi.stubEnv('AZURE_OPENAI_API_VERSION', '2023-03-15-preview');
    const config = createConfig({ provider: 'azure-openai' });
    expect(config.azureApiVersion).toBe('2023-03-15-preview');
  });

  it('sets default model for azure-openai', () => {
    const config = createConfig({ provider: 'azure-openai' });
    expect(config.modelId).toBe('gpt-4o');
  });

  it('sets default model for mock provider', () => {
    const config = createConfig({ provider: 'mock' });
    expect(config.modelId).toBe('mock');
  });

  it('assigns default agents config', () => {
    const config = createConfig();
    expect(config.agents).toBeDefined();
    expect(config.agents.agents).toEqual([]);
    expect(config.agents.terminationPrompt).toBe('');
    expect(config.agents.maxRounds).toBe(3);
  });

  it('uses fileConfig provider when no override or env', () => {
    const config = createConfig({}, { provider: 'anthropic' });
    expect(config.provider).toBe('anthropic');
  });

  it('uses fileConfig model when no override', () => {
    const config = createConfig({}, { model: 'claude-3-opus' });
    expect(config.modelId).toBe('claude-3-opus');
  });

  it('uses fileConfig headless when not in overrides', () => {
    const config = createConfig({}, { headless: false });
    expect(config.headless).toBe(false);
  });

  it('override takes precedence over fileConfig', () => {
    const config = createConfig({ headless: true }, { headless: false });
    expect(config.headless).toBe(true);
  });

  it('uses fileConfig output format', () => {
    const config = createConfig({}, { format: 'markdown' });
    expect(config.outputFormat).toBe('markdown');
  });

  it('uses fileConfig output dir', () => {
    const config = createConfig({}, { output: './reports' });
    expect(config.outputDir).toBe('./reports');
  });

  it('uses fileConfig scenario as scopeManifest', () => {
    const config = createConfig({}, { scenario: 'my-scenario' });
    expect(config.scopeManifest).toBe('my-scenario');
  });
});

describe('defaultConfig', () => {
  it('is a valid config object', () => {
    expect(defaultConfig).toBeDefined();
    expect(defaultConfig.provider).toBe('openai');
    expect(defaultConfig.modelId).toBe('gpt-4o');
    expect(defaultConfig.headless).toBe(true);
    expect(defaultConfig.timeout).toBe(60000);
    expect(defaultConfig.outputFormat).toBe('html');
    expect(defaultConfig.outputDir).toBe('.');
  });
});

describe('getAgentConfig', () => {
  it('returns undefined when agent not found', () => {
    const config = createConfig();
    const agent = getAgentConfig(config, 'recon');
    expect(agent).toBeUndefined();
  });

  it('returns the matching agent config', () => {
    const config = createConfig();
    config.agents.agents.push({
      name: 'recon',
      description: 'Recon agent',
      systemPrompt: 'Do recon',
      tools: ['browser_navigate'],
      maxSteps: 10,
    });
    const agent = getAgentConfig(config, 'recon');
    expect(agent).toBeDefined();
    expect(agent!.name).toBe('recon');
    expect(agent!.description).toBe('Recon agent');
    expect(agent!.systemPrompt).toBe('Do recon');
    expect(agent!.tools).toEqual(['browser_navigate']);
    expect(agent!.maxSteps).toBe(10);
  });

  it('returns undefined for non-existent agent name', () => {
    const config = createConfig();
    config.agents.agents.push({
      name: 'web',
      description: 'Web agent',
      systemPrompt: 'Test',
      tools: [],
      maxSteps: 5,
    });
    const agent = getAgentConfig(config, 'report');
    expect(agent).toBeUndefined();
  });

  it('finds the correct agent among multiple', () => {
    const config = createConfig();
    config.agents.agents = [
      { name: 'recon', description: 'r', systemPrompt: 'r', tools: [], maxSteps: 1 },
      { name: 'exploit', description: 'e', systemPrompt: 'e', tools: ['exec'], maxSteps: 20 },
      { name: 'report', description: 'rp', systemPrompt: 'rp', tools: [], maxSteps: 5 },
    ];
    const agent = getAgentConfig(config, 'exploit');
    expect(agent).toBeDefined();
    expect(agent!.name).toBe('exploit');
    expect(agent!.tools).toEqual(['exec']);
  });
});
