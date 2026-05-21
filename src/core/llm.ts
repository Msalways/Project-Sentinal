import type { LLMProviderName } from './types';

export interface Message {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: string;
}

export interface LLMResponse {
  content: string;
  toolCalls: ToolCall[];
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  finishReason: string;
}

export interface LLMProviderOptions {
  apiKey: string;
  modelId: string;
  temperature?: number;
  maxTokens?: number;
}

export interface AzureOpenAIOptions extends LLMProviderOptions {
  endpoint: string;
  apiVersion?: string;
}

export interface LLMProvider {
  readonly providerName: LLMProviderName;
  chat(messages: Message[], options?: {
    tools?: ToolDefinition[];
    temperature?: number;
    maxTokens?: number;
  }): Promise<LLMResponse>;
}
