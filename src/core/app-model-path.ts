let currentPath: string | null = null;
let currentLlmConfig: { provider: string; apiKey: string; model: string } | null = null;

export function setAppModelPath(path: string): void {
  currentPath = path;
}

export function getAppModelPath(): string {
  if (!currentPath) throw new Error('App model path not set. Call setAppModelPath() first.');
  return currentPath;
}

export function setLlmConfig(config: { provider: string; apiKey: string; model: string }): void {
  currentLlmConfig = config;
}

export function getLlmConfig(): { provider: string; apiKey: string; model: string } {
  if (!currentLlmConfig) throw new Error('LLM config not set. Call setLlmConfig() first.');
  return currentLlmConfig;
}
