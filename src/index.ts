import type { UltimatrixConfig, ScanTarget } from './core/types';
import { createConfig, loadFileConfig } from './core/config';
import { Pipeline } from './pipeline';
import { ReportGenerator } from './pipeline/report-generator';
import { Viewport } from './browser/viewport';
import { HARParser } from './tools/har-parser';
import { ScenarioParser } from './tools/scenario-parser';
import { PlaywrightTestGenerator } from './tools/test-generator';
import { LLMTestGenerator } from './tools/llm-test-generator';
import { LLMAnalyzer } from './tools/llm-analyzer';
import { toolRegistry } from './tools/tool-registry';
import { agentRegistry } from './agents/agent-registry';
import { providerRegistry } from './providers/provider-registry';
import { createUltimatrixAgent, parseFindingsFromOutput } from './agents/deep-agent';

export interface UltimatrixOptions {
  provider?: UltimatrixConfig['provider'];
  apiKey?: string;
  modelId?: string;
  azureEndpoint?: string;
  azureApiVersion?: string;
  headless?: boolean;
  timeout?: number;
}

export class Ultimatrix {
  private config: UltimatrixConfig;
  public pipeline: Pipeline;

  constructor(options: UltimatrixOptions = {}) {
    this.config = createConfig(options);
    this.pipeline = new Pipeline(this.config);
  }

  async scan(target: ScanTarget): Promise<ReturnType<typeof Pipeline.prototype.run>> {
    return this.pipeline.run(target);
  }

  async learn(target: string, outputDir: string): Promise<{ harPath: string; testsDir: string; manifestPath: string }> {
    return this.pipeline.learn(target, outputDir);
  }

  async demo(): Promise<ReturnType<typeof Pipeline.prototype.demo>> {
    return this.pipeline.demo();
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

export function createUltimatrix(options: UltimatrixOptions = {}): Ultimatrix {
  return new Ultimatrix(options);
}

export { createConfig, loadFileConfig };
export { Pipeline, ReportGenerator, Viewport, HARParser, ScenarioParser, PlaywrightTestGenerator, LLMTestGenerator, LLMAnalyzer };
export { toolRegistry, agentRegistry, providerRegistry };
export { createUltimatrixAgent, parseFindingsFromOutput };
export type {
  Severity, AgentName, LLMProviderName, TestStatus, PipelineStatus,
  Finding, TestResult, ScanTarget, AgentConfig, TeamConfig,
  UltimatrixConfig, PipelineResult,
  HARRequest, HARResponse, HAREntry, HARLog, HARFile,
  DependencyNode, DependencyEdge, DependencyGraph,
  ScanEvent, ScanEventCallback, ScanEventEmitter, ScanEventType, OWASPCategory,
} from './core/types';
export type { Message, ToolDefinition, ToolCall, LLMResponse, LLMProvider } from './core/llm';

export type { ToolRegistryEntry, ToolRegistry } from './tools/tool-registry';
export type { AgentRegistryEntry, AgentRegistry } from './agents/agent-registry';
export type { ProviderFactory, ProviderRegistry } from './providers/provider-registry';
