// ── Project Sentinel Configuration ──
// Configuration file for Project Sentinel framework

export interface SentinelConfig {
  // LLM configuration
  llm: {
    provider: string;
    model: string;
    apiKey?: string;
    apiEndpoint?: string;
  };
  
  // Security testing configuration
  security: {
    defaultTimeout?: number;
    userAgent?: string;
    allowedDomains?: string[];
  };
  
  // Reporting configuration
  reporting: {
    outputFormat: 'json' | 'html' | 'pdf';
    outputPath?: string;
  };
}

// Default configuration
export const defaultConfig: SentinelConfig = {
  llm: {
    provider: 'openai',
    model: 'gpt-4',
  },
  security: {
    defaultTimeout: 30000,
    allowedDomains: ['localhost', '127.0.0.1']
  },
  reporting: {
    outputFormat: 'json'
  }
};