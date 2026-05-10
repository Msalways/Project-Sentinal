// ── Project Sentinel LLM Interface Module ──
// Interface for LLM-driven security testing workflows

import type { LanguageModel } from '../core/model/interface.js';

export interface LLMInterfaceOptions {
  /**
   * LLM model to use for analysis
   */
  model?: LanguageModel;
  
  /**
   * Maximum tokens for LLM responses
   */
  maxTokens?: number;
  
  /**
   * Temperature setting for LLM responses
   */
  temperature?: number;
}

export class LLMInterface {
  private options: LLMInterfaceOptions;
  
  constructor(options?: LLMInterfaceOptions) {
    this.options = {
      maxTokens: 1000,
      temperature: 0.7,
      ...options
    };
  }
  
  /**
   * Generate security testing plan using LLM
   */
  async generateSecurityPlan(prompt: string): Promise<SecurityWorkflow[]> {
    // This would interface with an LLM to generate a security testing plan
    // In a real implementation, this would call an LLM API
    
    // For now, return a basic workflow structure
    const workflow: SecurityWorkflow[] = [
      {
        name: 'Web Security Assessment',
        steps: [
          {
            name: 'Web Scanning',
            description: 'Scan web application for vulnerabilities',
            tool: 'WebSecurityTester',
            priority: 'high'
          },
          {
            name: 'Authentication Testing',
            description: 'Test authentication mechanisms',
            tool: 'AuthenticationTester',
            priority: 'medium'
          }
        ]
      }
    ];
    
    return workflow;
  }
  
  /**
   * Process security testing request with LLM
   */
  async processSecurityRequest(prompt: string): Promise<SecurityTestPlan> {
    // This would use LLM to process the security request
    // and generate an appropriate testing plan
    
    // For now, return a basic security test plan
    const testPlan: SecurityTestPlan = {
      workflow: [
        {
          name: 'Web Security Assessment',
          steps: [
            {
              name: 'Web Scanning',
              description: 'Scan web application for vulnerabilities',
              tool: 'WebSecurityTester',
              priority: 'high'
            }
          ]
        }
      ],
      tools: ['WebSecurityTester', 'AuthenticationTester'],
      priority: 'high',
      adaptions: []
    };
    
    return testPlan;
  }
}

export interface SecurityTestPlan {
  workflow: SecurityWorkflow[];
  tools: string[];
  priority: string;
  adaptions: string[];
}

export interface SecurityWorkflow {
  name: string;
  steps: WorkflowStep[];
}

export interface WorkflowStep {
  name: string;
  description: string;
  tool: string;
  priority: string;
}