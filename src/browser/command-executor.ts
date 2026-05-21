import type { Viewport } from './viewport';

export type CommandName =
  | 'navigate'
  | 'click'
  | 'type'
  | 'extract'
  | 'evaluate'
  | 'screenshot'
  | 'content'
  | 'elements'
  | 'network';

export interface CommandResult {
  success: boolean;
  output: string;
  error?: string;
}

export class CommandExecutor {
  private viewport: Viewport;

  constructor(viewport: Viewport) {
    this.viewport = viewport;
  }

  async execute(name: CommandName, args: Record<string, unknown>): Promise<CommandResult> {
    try {
      switch (name) {
        case 'navigate': {
          const url = args.url as string;
          if (!url) return { success: false, output: '', error: 'Missing url' };
          const result = await this.viewport.navigate(url);
          return { success: true, output: `Navigated to ${result.url} (status: ${result.status})\nTitle: ${result.title}` };
        }

        case 'click': {
          const selector = args.selector as string;
          if (!selector) return { success: false, output: '', error: 'Missing selector' };
          await this.viewport.click(selector);
          return { success: true, output: `Clicked: ${selector}` };
        }

        case 'type': {
          const selector = args.selector as string;
          const text = args.text as string;
          if (!selector || !text) return { success: false, output: '', error: 'Missing selector or text' };
          await this.viewport.type(selector, text);
          return { success: true, output: `Typed "${text}" into ${selector}` };
        }

        case 'extract': {
          const selector = args.selector as string;
          if (!selector) return { success: false, output: '', error: 'Missing selector' };
          const content = await this.viewport.extract(selector);
          return { success: true, output: content.slice(0, 2000) };
        }

        case 'evaluate': {
          const script = args.script as string;
          if (!script) return { success: false, output: '', error: 'Missing script' };
          const result = await this.viewport.evaluate(script);
          return { success: true, output: JSON.stringify(result, null, 2).slice(0, 2000) };
        }

        case 'screenshot': {
          const fullPage = (args.fullPage as boolean) || false;
          await this.viewport.screenshot(fullPage);
          return { success: true, output: 'Screenshot captured' };
        }

        case 'content': {
          const content = await this.viewport.getPageContent();
          return { success: true, output: content.slice(0, 3000) };
        }

        case 'elements': {
          const elements = await this.viewport.getInteractiveElements();
          const output = elements.map((e) => `[${e.type}] ${e.selector} - "${e.text}"`).join('\n');
          return { success: true, output: output || 'No interactive elements found' };
        }

        case 'network': {
          const log = this.viewport.getNetworkLog();
          const output = log.map((e) => `${e.method} ${e.url} → ${e.status}`).join('\n');
          return { success: true, output: output || 'No network requests logged' };
        }

        default:
          return { success: false, output: '', error: `Unknown command: ${name}` };
      }
    } catch (error) {
      return {
        success: false,
        output: '',
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}
