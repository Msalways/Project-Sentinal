import type { Message, ToolCall } from '../core/llm';
import type { Viewport } from './viewport';
import { CommandExecutor, type CommandName } from './command-executor';

export interface AgentOptions {
  name: string;
  systemPrompt: string;
  maxSteps: number;
}

export interface AgentStep {
  step: number;
  thought: string;
  action?: string;
  actionInput?: Record<string, unknown>;
  observation: string;
}

export interface AgentResult {
  name: string;
  steps: AgentStep[];
  finalAnswer: string;
  success: boolean;
}

export class Agent {
  private name: string;
  private systemPrompt: string;
  private maxSteps: number;
  private executor: CommandExecutor;

  constructor(options: AgentOptions, viewport: Viewport) {
    this.name = options.name;
    this.systemPrompt = options.systemPrompt;
    this.maxSteps = options.maxSteps;
    this.executor = new CommandExecutor(viewport);
  }

  async run(
    task: string,
    chatFn: (messages: Message[]) => Promise<{ content: string; toolCalls: ToolCall[] }>
  ): Promise<AgentResult> {
    const messages: Message[] = [
      { role: 'system', content: this.systemPrompt },
      { role: 'user', content: task },
    ];

    const steps: AgentStep[] = [];
    let finalAnswer = '';

    for (let step = 0; step < this.maxSteps; step++) {
      const response = await chatFn(messages);

      if (response.toolCalls.length > 0) {
        const toolCall = response.toolCalls[0];
        let actionInput: Record<string, unknown> = {};
        try {
          actionInput = JSON.parse(toolCall.arguments);
        } catch {
          actionInput = { raw: toolCall.arguments };
        }

        const commandName = toolCall.name as CommandName;
        const result = await this.executor.execute(commandName, actionInput);

        steps.push({
          step: step + 1,
          thought: response.content || `Executing ${toolCall.name}`,
          action: toolCall.name,
          actionInput,
          observation: result.success ? result.output : `Error: ${result.error}`,
        });

        messages.push({
          role: 'assistant',
          content: JSON.stringify({ tool: toolCall.name, input: actionInput }),
        });
        messages.push({
          role: 'user',
          content: result.success ? result.output : `Error: ${result.error}`,
        });
      } else {
        finalAnswer = response.content;
        steps.push({
          step: step + 1,
          thought: response.content,
          observation: 'Task complete',
        });
        break;
      }
    }

    return {
      name: this.name,
      steps,
      finalAnswer: finalAnswer || 'Max steps reached',
      success: finalAnswer.length > 0,
    };
  }
}
