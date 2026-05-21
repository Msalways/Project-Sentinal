import type { LLMProviderName, SentinelConfig, AgentName } from './types';

const DEFAULT_MODEL_IDS: Record<LLMProviderName, string> = {
  'azure-openai': 'gpt-4o',
  openai: 'gpt-4o',
  openrouter: 'openai/gpt-4o',
  anthropic: 'claude-sonnet-4-20250514',
  mock: 'mock',
};

const DEFAULT_AGENTS: SentinelConfig['agents'] = {
  agents: [
    {
      name: 'recon',
      description: 'Reconnaissance agent for surface mapping and information gathering',
      systemPrompt: 'You are a security reconnaissance specialist. Map the attack surface, enumerate services, identify technologies, and discover entry points.',
      tools: ['http-request', 'dns-lookup', 'tech-detect', 'subdomain-enum'],
      maxSteps: 15,
    },
    {
      name: 'web',
      description: 'Web application security testing agent',
      systemPrompt: 'You are a web security testing specialist. Test for XSS, SQLi, CSRF, SSRF, authentication bypass, and other web vulnerabilities using browser automation.',
      tools: ['navigate', 'click', 'type', 'extract', 'evaluate', 'screenshot'],
      maxSteps: 20,
    },
    {
      name: 'code',
      description: 'Static code analysis agent for vulnerability discovery',
      systemPrompt: 'You are a static analysis specialist. Scan source code for security vulnerabilities including injection flaws, insecure crypto, hardcoded secrets, and unsafe deserialization.',
      tools: ['file-read', 'pattern-match', 'dataflow-trace', 'sast-scan'],
      maxSteps: 15,
    },
    {
      name: 'network',
      description: 'Network and infrastructure security testing agent',
      systemPrompt: 'You are a network security specialist. Scan for open ports, service versions, misconfigurations, and infrastructure-level vulnerabilities.',
      tools: ['port-scan', 'service-detect', 'ssl-check', 'header-analyze'],
      maxSteps: 15,
    },
    {
      name: 'exploit',
      description: 'Exploit verification agent — validates findings with proof-of-concept',
      systemPrompt: 'You are an exploit verification specialist. Take vulnerability findings and create safe proof-of-concept tests to confirm they are real, not false positives.',
      tools: ['http-request', 'navigate', 'inject-payload', 'extract'],
      maxSteps: 10,
    },
    {
      name: 'report',
      description: 'Report generation agent — correlates findings and generates security report',
      systemPrompt: 'You are a security reporting specialist. Correlate findings from all agents, deduplicate, prioritize by risk, and generate a comprehensive security report with remediation guidance.',
      tools: ['correlate', 'score', 'generate-report'],
      maxSteps: 5,
    },
  ],
  terminationPrompt: 'All security testing is complete. Summarize findings and generate the final report.',
  maxRounds: 3,
};

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

function resolveModelId(provider: LLMProviderName, explicit?: string): string {
  return explicit || DEFAULT_MODEL_IDS[provider];
}

export function createConfig(overrides: Partial<SentinelConfig> = {}): SentinelConfig {
  const provider = (overrides.provider || process.env.SENTINEL_PROVIDER || 'openai') as LLMProviderName;
  const apiKey = overrides.apiKey || resolveApiKey(provider);
  const modelId = resolveModelId(provider, overrides.modelId);

  return {
    provider,
    apiKey,
    modelId,
    azureEndpoint: overrides.azureEndpoint || process.env.AZURE_OPENAI_ENDPOINT,
    azureApiVersion: overrides.azureApiVersion || process.env.AZURE_OPENAI_API_VERSION || '2024-02-01',
    agents: overrides.agents || DEFAULT_AGENTS,
    headless: overrides.headless ?? true,
    timeout: overrides.timeout || 60000,
    scopeManifest: overrides.scopeManifest,
    outputFormat: overrides.outputFormat || 'html',
    outputDir: overrides.outputDir || '.',
  };
}

export function getAgentConfig(config: SentinelConfig, name: AgentName) {
  return config.agents.agents.find((a) => a.name === name);
}

export const defaultConfig = createConfig();
