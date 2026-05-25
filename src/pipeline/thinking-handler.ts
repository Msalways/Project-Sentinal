import { BaseCallbackHandler } from '@langchain/core/callbacks/base';
import chalk from 'chalk';

let currentLine = '';
let tokenCount = 0;

export class ThinkingCallbackHandler extends BaseCallbackHandler {
  name = 'ThinkingCallbackHandler';
  private agentLabel: string;

  constructor(agentLabel?: string) {
    super();
    this.agentLabel = agentLabel || '';
  }

  handleLLMStart(): void {
    tokenCount = 0;
    currentLine = '';
    if (this.agentLabel) {
      process.stdout.write(`\n${chalk.cyan(`[${this.agentLabel}]`)} `);
    }
  }

  handleLLMNewToken(token: string): void {
    tokenCount++;
    currentLine += token;

    const lines = currentLine.split('\n');
    if (lines.length > 1) {
      for (let i = 0; i < lines.length - 1; i++) {
        process.stdout.write(`${chalk.dim(lines[i])}\n`);
      }
      currentLine = lines[lines.length - 1];
    }
    process.stdout.write(`${chalk.dim(currentLine)}\r`);
  }

  handleLLMEnd(): void {
    if (currentLine) {
      process.stdout.write(`${chalk.green(currentLine)}\n`);
    } else {
      process.stdout.write('\n');
    }
    process.stdout.write(`${chalk.yellow(`  \u2514\u2500 ${tokenCount} tokens`)}\n`);
    currentLine = '';
  }

  handleLLMError(err: Error): void {
    if (currentLine) {
      process.stdout.write(`${currentLine}\n`);
    }
    process.stdout.write(`${chalk.yellow(`  \u2514\u2500 LLM error: ${err.message}`)}\n`);
    currentLine = '';
  }
}
