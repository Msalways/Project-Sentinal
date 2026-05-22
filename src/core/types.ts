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

export type OWASPCategory =
  | 'A01:2021-broken-access-control'
  | 'A02:2021-cryptographic-failures'
  | 'A03:2021-injection'
  | 'A04:2021-insecure-design'
  | 'A05:2021-security-misconfiguration'
  | 'A06:2021-vulnerable-components'
  | 'A07:2021-auth-failures'
  | 'A08:2021-data-integrity'
  | 'A09:2021-logging-failures'
  | 'A10:2021-ssrf';

export interface Finding {
  id: string;
  title: string;
  description: string;
  severity: Severity;
  category: string;
  owaspCategory?: OWASPCategory;
  cweId?: string;
  cvssScore?: number;
  confidence: number;
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
  confidence: number;
}

export type ScanEventType =
  | 'agent:start'
  | 'agent:complete'
  | 'agent:thinking'
  | 'tool:start'
  | 'tool:complete'
  | 'finding:new'
  | 'pipeline:status'
  | 'pipeline:progress';

export interface ScanEvent {
  type: ScanEventType;
  timestamp: string;
  agent?: string;
  tool?: string;
  message?: string;
  thinking?: string;
  finding?: Finding;
  progress?: number;
  details?: Record<string, unknown>;
}

export type ScanEventCallback = (event: ScanEvent) => void;

export class ScanEventEmitter {
  private listeners: ScanEventCallback[] = [];

  on(callback: ScanEventCallback): void {
    this.listeners.push(callback);
  }

  emit(event: Omit<ScanEvent, 'timestamp'>): void {
    const fullEvent: ScanEvent = { ...event, timestamp: new Date().toISOString() };
    for (const listener of this.listeners) {
      try {
        listener(fullEvent);
      } catch {
        // ignore listener errors
      }
    }
  }

  agentStart(agent: string, details?: Record<string, unknown>): void {
    this.emit({ type: 'agent:start', agent, details });
  }

  agentComplete(agent: string, details?: Record<string, unknown>): void {
    this.emit({ type: 'agent:complete', agent, details });
  }

  agentThinking(agent: string, thinking: string): void {
    this.emit({ type: 'agent:thinking', agent, thinking });
  }

  toolStart(tool: string, agent?: string, details?: Record<string, unknown>): void {
    this.emit({ type: 'tool:start', tool, agent, details });
  }

  toolComplete(tool: string, agent?: string, details?: Record<string, unknown>): void {
    this.emit({ type: 'tool:complete', tool, agent, details });
  }

  newFinding(finding: Finding): void {
    this.emit({ type: 'finding:new', finding });
  }

  pipelineStatus(status: string, progress?: number): void {
    this.emit({ type: 'pipeline:status', message: status, progress });
  }

  pipelineProgress(progress: number, message: string): void {
    this.emit({ type: 'pipeline:progress', progress, message });
  }
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
