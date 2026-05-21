import type { SentinelConfig, ScanTarget } from './core/types';
import { createConfig } from './core/config';
import { Pipeline } from './pipeline';
import { ReportGenerator } from './pipeline/report-generator';
import { Viewport } from './browser/viewport';
import { HARParser } from './tools/har-parser';
import { ScenarioParser } from './tools/scenario-parser';
import { PlaywrightTestGenerator } from './tools/test-generator';
import { toolRegistry } from './tools/tool-registry';
import { agentRegistry } from './agents/agent-registry';
import { providerRegistry } from './providers/provider-registry';
import { createSentinelAgent, parseFindingsFromOutput } from './agents/deep-agent';

export interface SentinelOptions {
  provider?: SentinelConfig['provider'];
  apiKey?: string;
  modelId?: string;
  azureEndpoint?: string;
  azureApiVersion?: string;
  headless?: boolean;
  timeout?: number;
}

export class ProjectSentinel {
  private config: SentinelConfig;

  constructor(options: SentinelOptions = {}) {
    this.config = createConfig(options);
  }

  async scan(target: ScanTarget): Promise<ReturnType<typeof Pipeline.prototype.run>> {
    const pipeline = new Pipeline(this.config);
    return pipeline.run(target);
  }

  async learn(target: string, outputDir: string): Promise<{ harPath: string; testsDir: string; manifestPath: string }> {
    const pipeline = new Pipeline(this.config);
    return pipeline.learn(target, outputDir);
  }

  async demo(): Promise<ReturnType<typeof Pipeline.prototype.demo>> {
    const pipeline = new Pipeline(this.config);
    return pipeline.demo();
  }

  generateReport(result: Awaited<ReturnType<typeof Pipeline.prototype.run>>, outputDir: string, format: 'html' | 'json' | 'markdown' = 'html'): string {
    const generator = new ReportGenerator(result);
    return generator.save(outputDir, format);
  }

  generateTests(target: string, manifestPath: string, outputDir: string): string[] {
    const manifest = ScenarioParser.fromFile(manifestPath);
    const generator = new PlaywrightTestGenerator(target);
    return generator.generateFromManifest(manifest, outputDir);
  }
}

export function createSentinel(options: SentinelOptions = {}): ProjectSentinel {
  return new ProjectSentinel(options);
}

export { createConfig };
export { Pipeline, ReportGenerator, Viewport, HARParser, ScenarioParser, PlaywrightTestGenerator };
export { toolRegistry, agentRegistry, providerRegistry };
export { createSentinelAgent, parseFindingsFromOutput };
export type {
  Severity, AgentName, LLMProviderName, TestStatus, PipelineStatus,
  Finding, TestResult, ScanTarget, AgentConfig, TeamConfig,
  SentinelConfig, PipelineResult,
  HARRequest, HARResponse, HAREntry, HARLog, HARFile,
  DependencyNode, DependencyEdge, DependencyGraph,
} from './core/types';
export type { Message, ToolDefinition, ToolCall, LLMResponse, LLMProvider } from './core/llm';
export { ok, err, asyncResult, type Result } from './core/result';
export type { ToolRegistryEntry, ToolRegistry } from './tools/tool-registry';
export type { AgentRegistryEntry, AgentRegistry } from './agents/agent-registry';
export type { ProviderFactory, ProviderRegistry } from './providers/provider-registry';
