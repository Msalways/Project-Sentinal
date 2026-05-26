import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import type { LLMProviderName, UltimatrixConfig, AgentName } from './types';

const DEFAULT_MODEL_IDS: Record<LLMProviderName, string> = {
  'azure-openai': 'gpt-4o',
  openai: 'gpt-4o',
  openrouter: 'openai/gpt-4o',
  anthropic: 'claude-sonnet-4-20250514',
  bedrock: 'anthropic.claude-sonnet-4-v2',
  gemini: 'gemini-2.0-flash',
  groq: 'llama-3.3-70b-versatile',
  together: 'mistralai/Mixtral-8x22B-Instruct-v0.1',
  mistral: 'mistral-large-latest',
  nvidia: 'meta/llama-3.1-70b-instruct',
  mock: 'mock',
};

const DEFAULT_AGENTS: UltimatrixConfig['agents'] = {
  agents: [],
  terminationPrompt: '',
  maxRounds: 3,
};

export interface UltimatrixFileConfig {
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
    bedrock: process.env.AWS_ACCESS_KEY_ID || '',
    gemini: process.env.GEMINI_API_KEY || '',
    groq: process.env.GROQ_API_KEY || '',
    together: process.env.TOGETHER_API_KEY || '',
    mistral: process.env.MISTRAL_API_KEY || '',
    nvidia: process.env.NVIDIA_API_KEY || '',
    mock: 'mock',
  };
  return envKeys[provider];
}

export function loadFileConfig(configPath?: string): UltimatrixFileConfig {
  const searchPaths = [
    configPath,
    path.join(process.cwd(), 'ultimatrix.json'),
    path.join(process.cwd(), 'ultimatrix.yaml'),
    path.join(process.cwd(), '.ultimatrix.json'),
  ].filter(Boolean) as string[];

  for (const p of searchPaths) {
    if (p && fs.existsSync(p)) {
      try {
        const content = fs.readFileSync(p, 'utf-8');
        if (p.endsWith('.json')) return JSON.parse(content);
        if (p.endsWith('.yaml') || p.endsWith('.yml')) return yaml.load(content) as UltimatrixFileConfig;
      } catch { /* skip invalid files */ }
    }
  }
  return {};
}

export function createConfig(overrides: Partial<UltimatrixConfig> = {}, fileConfig: UltimatrixFileConfig = {}): UltimatrixConfig {
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

export function getAgentConfig(config: UltimatrixConfig, name: AgentName) {
  return config.agents.agents.find((a) => a.name === name);
}

export const defaultConfig = createConfig();
