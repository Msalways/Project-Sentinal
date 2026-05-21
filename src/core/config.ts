import fs from 'fs';
import path from 'path';
import type { LLMProviderName, SentinelConfig, AgentName } from './types';

const DEFAULT_MODEL_IDS: Record<LLMProviderName, string> = {
  'azure-openai': 'gpt-4o',
  openai: 'gpt-4o',
  openrouter: 'openai/gpt-4o',
  anthropic: 'claude-sonnet-4-20250514',
  mock: 'mock',
};

const DEFAULT_AGENTS: SentinelConfig['agents'] = {
  agents: [],
  terminationPrompt: '',
  maxRounds: 3,
};

export interface SentinelFileConfig {
  provider?: LLMProviderName;
  model?: string;
  target?: string;
  har?: string;
  project?: string;
  scenario?: string;
  output?: string;
  format?: 'html' | 'json' | 'markdown';
  headless?: boolean;
  ci?: boolean;
}

function resolveApiKey(provider: LLMProviderName): string {
  const envKeys: Record<LLMProviderName, string> = {
    'azure-openai': process.env.AZURE_OPENAI_API_KEY || '',
    openai: process.env.OPENAI_API_KEY || '',
    openrouter: process.env.OPENROUTER_API_KEY || '',
    anthropic: process.env.ANTHROPIC_API_KEY || '',
    mock: 'mock',
  };
  return envKeys[provider];
}

export function loadFileConfig(configPath?: string): SentinelFileConfig {
  const searchPaths = [
    configPath,
    path.join(process.cwd(), 'sentinel.json'),
    path.join(process.cwd(), 'sentinel.yaml'),
    path.join(process.cwd(), '.sentinel.json'),
  ].filter(Boolean) as string[];

  for (const p of searchPaths) {
    if (p && fs.existsSync(p)) {
      try {
        const content = fs.readFileSync(p, 'utf-8');
        if (p.endsWith('.json')) return JSON.parse(content);
      } catch { /* skip invalid files */ }
    }
  }
  return {};
}

export function createConfig(overrides: Partial<SentinelConfig> = {}, fileConfig: SentinelFileConfig = {}): SentinelConfig {
  const provider = (overrides.provider || fileConfig.provider || process.env.SENTINEL_PROVIDER || 'openai') as LLMProviderName;
  const apiKey = overrides.apiKey || resolveApiKey(provider);
  const modelId = overrides.modelId || fileConfig.model || DEFAULT_MODEL_IDS[provider];

  return {
    provider,
    apiKey,
    modelId,
    azureEndpoint: overrides.azureEndpoint || process.env.AZURE_OPENAI_ENDPOINT,
    azureApiVersion: overrides.azureApiVersion || process.env.AZURE_OPENAI_API_VERSION || '2024-02-01',
    agents: DEFAULT_AGENTS,
    headless: overrides.headless ?? fileConfig.headless ?? true,
    timeout: overrides.timeout || 60000,
    scopeManifest: overrides.scopeManifest || fileConfig.scenario,
    outputFormat: overrides.outputFormat || fileConfig.format || 'html',
    outputDir: overrides.outputDir || fileConfig.output || '.',
  };
}

export function getAgentConfig(config: SentinelConfig, name: AgentName) {
  return config.agents.agents.find((a) => a.name === name);
}

export const defaultConfig = createConfig();
