import type { Finding } from '../core/types';

export interface ToolResult {
  tool: string;
  success: boolean;
  raw: string;
  evidence?: string;
  duration: number;
  error?: string;
}

export interface AgentState {
  name: string;
  status: 'thinking' | 'testing' | 'found' | 'done';
  currentTool?: string;
  currentThinking?: string;
  findings: number;
}
