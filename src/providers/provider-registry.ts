import { type BaseChatModel } from '@langchain/core/language_models/chat_models';
import type { LLMProviderName } from '../core/types';

export interface ProviderFactory {
  name: LLMProviderName;
  label: string;
  create: (config: ProviderConfig) => BaseChatModel | Promise<BaseChatModel>;
  envVars: string[];
}

export interface ProviderConfig {
  apiKey: string;
  modelId: string;
  azureEndpoint?: string;
  azureApiVersion?: string;
  temperature?: number;
  maxTokens?: number;
}

export class ProviderRegistry {
  private registry: Map<LLMProviderName, ProviderFactory> = new Map();

  register(factory: ProviderFactory): void {
    this.registry.set(factory.name, factory);
  }

  get(name: LLMProviderName): ProviderFactory | undefined {
    return this.registry.get(name);
  }

  async create(name: LLMProviderName, config: ProviderConfig): Promise<BaseChatModel> {
    const factory = this.registry.get(name);
    if (!factory) throw new Error(`Unknown LLM provider: ${name}`);
    return factory.create(config);
  }

  listAll(): ProviderFactory[] {
    return Array.from(this.registry.values());
  }

  has(name: LLMProviderName): boolean {
    return this.registry.has(name);
  }
}

export const providerRegistry = new ProviderRegistry();

// ── Azure OpenAI ──

providerRegistry.register({
  name: 'azure-openai',
  label: 'Azure OpenAI',
  envVars: ['AZURE_OPENAI_API_KEY', 'AZURE_OPENAI_ENDPOINT'],
  create: (config) => {
    const { ChatOpenAI } = require('@langchain/openai');
    if (!config.azureEndpoint) throw new Error('Azure OpenAI requires azureEndpoint');
    const instanceName = config.azureEndpoint.match(/https:\/\/([^.]+)\.openai\.azure\.com/)?.[1] || '';
    return new ChatOpenAI({
      azureOpenAIApiKey: config.apiKey,
      azureOpenAIApiInstanceName: instanceName,
      azureOpenAIApiDeploymentName: config.modelId,
      azureOpenAIApiVersion: config.azureApiVersion || '2024-02-01',
      temperature: config.temperature ?? 0.3,
      maxTokens: config.maxTokens ?? 4096,
    });
  },
});

// ── OpenAI ──

providerRegistry.register({
  name: 'openai',
  label: 'OpenAI',
  envVars: ['OPENAI_API_KEY'],
  create: (config) => {
    const { ChatOpenAI } = require('@langchain/openai');
    return new ChatOpenAI({
      apiKey: config.apiKey,
      model: config.modelId,
      temperature: config.temperature ?? 0.3,
      maxTokens: config.maxTokens ?? 4096,
    });
  },
});

// ── OpenRouter ──

providerRegistry.register({
  name: 'openrouter',
  label: 'OpenRouter',
  envVars: ['OPENROUTER_API_KEY'],
  create: (config) => {
    const { ChatOpenAI } = require('@langchain/openai');
    return new ChatOpenAI({
      apiKey: config.apiKey,
      model: config.modelId,
      temperature: config.temperature ?? 0.3,
      maxTokens: config.maxTokens ?? 4096,
      configuration: {
        baseURL: 'https://openrouter.ai/api/v1',
        defaultHeaders: {
          'HTTP-Referer': 'https://project-sentinal.dev',
          'X-Title': 'Project Sentinel',
        },
      },
    });
  },
});

// ── Anthropic ──

providerRegistry.register({
  name: 'anthropic',
  label: 'Anthropic',
  envVars: ['ANTHROPIC_API_KEY'],
  create: (config) => {
    const { ChatAnthropic } = require('@langchain/anthropic');
    return new ChatAnthropic({
      apiKey: config.apiKey,
      model: config.modelId,
      temperature: config.temperature ?? 0.3,
      maxTokens: config.maxTokens ?? 4096,
    });
  },
});
