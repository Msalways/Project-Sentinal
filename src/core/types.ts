export type Severity = 'critical' | 'high' | 'medium' | 'low' | 'info';

export type AgentName =
  | 'recon'
  | 'web'
  | 'code'
  | 'network'
  | 'exploit'
  | 'report';

export type LLMProviderName = 'azure-openai' | 'openai' | 'openrouter' | 'anthropic' | 'mock';

export type TestStatus = 'passed' | 'failed' | 'skipped' | 'error';

export type PipelineStatus = 'idle' | 'running' | 'completed' | 'failed' | 'cancelled';

export interface Finding {
  id: string;
  title: string;
  description: string;
  severity: Severity;
  category: string;
  cweId?: string;
  cvssScore?: number;
  location: string;
  evidence: string;
  remediation: string;
  agent: AgentName;
  timestamp: string;
}

export interface TestResult {
  id: string;
  name: string;
  status: TestStatus;
  severity: Severity;
  description: string;
  finding?: Finding;
  duration: number;
}

export interface ScanTarget {
  url?: string;
  harPath?: string;
  harContent?: string;
  sourcePath?: string;
  scope?: string[];
}

export interface AgentConfig {
  name: AgentName;
  description: string;
  systemPrompt: string;
  tools: string[];
  maxSteps: number;
}

export interface TeamConfig {
  agents: AgentConfig[];
  terminationPrompt: string;
  maxRounds: number;
}

export interface SentinelConfig {
  provider: LLMProviderName;
  apiKey: string;
  modelId: string;
  azureEndpoint?: string;
  azureApiVersion?: string;
  agents: TeamConfig;
  headless: boolean;
  timeout: number;
  scopeManifest?: string;
  outputFormat: 'json' | 'html' | 'markdown';
  outputDir: string;
}

export interface PipelineResult {
  success: boolean;
  duration: number;
  findings: Finding[];
  testResults: TestResult[];
  riskScore: number;
  riskLevel: Severity;
  summary: string;
  metadata: {
    target: ScanTarget;
    startedAt: string;
    completedAt: string;
    agentsUsed: AgentName[];
    modelUsed: string;
  };
}

export interface HARRequest {
  method: string;
  url: string;
  httpVersion: string;
  headers: { name: string; value: string }[];
  queryString: { name: string; value: string }[];
  postData?: { mimeType: string; text: string };
}

export interface HARResponse {
  status: number;
  statusText: string;
  httpVersion: string;
  headers: { name: string; value: string }[];
  content: { mimeType: string; text: string; size: number };
}

export interface HAREntry {
  startedDateTime: string;
  time: number;
  request: HARRequest;
  response: HARResponse;
  cache: Record<string, unknown>;
  timings: Record<string, unknown>;
}

export interface HARLog {
  version: string;
  creator: { name: string; version: string };
  entries: HAREntry[];
}

export interface HARFile {
  log: HARLog;
}

export interface DependencyNode {
  id: string;
  url: string;
  service: string;
  authType?: string;
  methods: string[];
  sensitiveData: string[];
}

export interface DependencyEdge {
  from: string;
  to: string;
  type: 'calls' | 'auth' | 'data' | 'redirect';
  label: string;
}

export interface DependencyGraph {
  nodes: DependencyNode[];
  edges: DependencyEdge[];
}
