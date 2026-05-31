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
  accessKeyId?: string;
  secretAccessKey?: string;
  region?: string;
  baseURL?: string;
  organizationId?: string;
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
          'HTTP-Referer': 'https://ultimatrix.dev',
          'X-Title': 'Ultimatrix',
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

// ── AWS Bedrock ──

providerRegistry.register({
  name: 'bedrock',
  label: 'AWS Bedrock',
  envVars: ['AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'AWS_REGION'],
  create: (config) => {
    const { ChatBedrockConverse } = require('@langchain/aws');
    return new ChatBedrockConverse({
      region: config.region || process.env.AWS_REGION || 'us-east-1',
      credentials: {
        accessKeyId: config.accessKeyId || process.env.AWS_ACCESS_KEY_ID || '',
        secretAccessKey: config.secretAccessKey || process.env.AWS_SECRET_ACCESS_KEY || '',
      },
      model: config.modelId || 'anthropic.claude-sonnet-4-v2',
      temperature: config.temperature ?? 0.3,
      maxTokens: config.maxTokens ?? 4096,
    });
  },
});

// ── Google Gemini ──

providerRegistry.register({
  name: 'gemini',
  label: 'Google Gemini',
  envVars: ['GEMINI_API_KEY'],
  create: (config) => {
    const { ChatGoogleGenerativeAI } = require('@langchain/google-genai');
    return new ChatGoogleGenerativeAI({
      apiKey: config.apiKey,
      model: config.modelId || 'gemini-2.0-flash',
      temperature: config.temperature ?? 0.3,
      maxTokens: config.maxTokens ?? 4096,
    });
  },
});

// ── Groq ──

providerRegistry.register({
  name: 'groq',
  label: 'Groq',
  envVars: ['GROQ_API_KEY'],
  create: (config) => {
    const { ChatGroq } = require('@langchain/groq');
    return new ChatGroq({
      apiKey: config.apiKey,
      model: config.modelId || 'llama-3.3-70b-versatile',
      temperature: config.temperature ?? 0.3,
      maxTokens: config.maxTokens ?? 4096,
    });
  },
});

// ── Together AI (via OpenAI-compatible API) ──

providerRegistry.register({
  name: 'together',
  label: 'Together AI',
  envVars: ['TOGETHER_API_KEY'],
  create: (config) => {
    const { ChatOpenAI } = require('@langchain/openai');
    return new ChatOpenAI({
      apiKey: config.apiKey,
      model: config.modelId || 'mistralai/Mixtral-8x22B-Instruct-v0.1',
      temperature: config.temperature ?? 0.3,
      maxTokens: config.maxTokens ?? 4096,
      configuration: {
        baseURL: 'https://api.together.xyz/v1',
      },
    });
  },
});

// ── Mistral AI ──

providerRegistry.register({
  name: 'mistral',
  label: 'Mistral AI',
  envVars: ['MISTRAL_API_KEY'],
  create: (config) => {
    const { ChatMistralAI } = require('@langchain/mistralai');
    return new ChatMistralAI({
      apiKey: config.apiKey,
      model: config.modelId || 'mistral-large-latest',
      temperature: config.temperature ?? 0.3,
      maxTokens: config.maxTokens ?? 4096,
    });
  },
});

// ── NVIDIA NIM (OpenAI-compatible API) ──

providerRegistry.register({
  name: 'nvidia',
  label: 'NVIDIA NIM',
  envVars: ['NVIDIA_API_KEY'],
  create: (config) => {
    const { ChatOpenAI } = require('@langchain/openai');
    return new ChatOpenAI({
      apiKey: config.apiKey,
      model: config.modelId || 'meta/llama-3.1-70b-instruct',
      temperature: config.temperature ?? 0.3,
      maxTokens: config.maxTokens ?? 4096,
      modelKwargs: { parallel_tool_calls: false },
      configuration: {
        baseURL: config.baseURL || 'https://integrate.api.nvidia.com/v1',
      },
    });
  },
});

// ── Mock (for testing without API key) ──

providerRegistry.register({
  name: 'mock',
  label: 'Mock',
  envVars: [],
  create: () => {
    const { FakeListChatModel } = require('@langchain/core/utils/testing');
    return new FakeListChatModel({
      responses: ['No vulnerabilities found during mock scan.'],
    });
  },
});
