import type { ScanEvent, Finding, OWASPCategory } from '../core/types';
import { confidenceLabel } from '../tools/confidence';
import { OWASP_CATEGORIES } from '../tools/owasp-mapper';

const SPINNERS = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

interface AgentState {
  status: 'idle' | 'running' | 'complete' | 'failed';
  thinking?: string;
  toolsUsed: string[];
  findings: number;
  startTime?: number;
}

interface ToolState {
  status: 'idle' | 'running' | 'complete';
  agent?: string;
  startTime?: number;
}

export class StatusDisplay {
  private agentStates: Map<string, AgentState> = new Map();
  private toolStates: Map<string, ToolState> = new Map();
  private findings: Finding[] = [];
  private currentPhase: string = '';
  private progress: number = 0;
  private spinnerIndex: number = 0;
  private intervalId?: NodeJS.Timeout;
  private totalAgents: number = 0;
  private completedAgents: number = 0;

  init(agentNames: string[]): void {
    this.totalAgents = agentNames.length;
    for (const name of agentNames) {
      this.agentStates.set(name, { status: 'idle', toolsUsed: [], findings: 0 });
    }
    this.startSpinner();
  }

  startSpinner(): void {
    this.intervalId = setInterval(() => {
      this.render();
      this.spinnerIndex = (this.spinnerIndex + 1) % SPINNERS.length;
    }, 100);
  }

  stopSpinner(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = undefined;
    }
    process.stdout.write('\x1B[?25h');
  }

  clearLine(): void {
    process.stdout.write('\r\x1B[K');
  }

  handleEvent(event: ScanEvent): void {
    switch (event.type) {
      case 'agent:start':
        if (event.agent) {
          const state = this.agentStates.get(event.agent);
          if (state) {
            state.status = 'running';
            state.startTime = Date.now();
          }
        }
        break;

      case 'agent:complete':
        if (event.agent) {
          const state = this.agentStates.get(event.agent);
          if (state) {
            state.status = 'complete';
            this.completedAgents++;
          }
        }
        break;

      case 'agent:thinking':
        if (event.agent && event.thinking) {
          const state = this.agentStates.get(event.agent);
          if (state) {
            state.thinking = event.thinking;
          }
        }
        break;

      case 'tool:start':
        if (event.tool) {
          this.toolStates.set(event.tool, {
            status: 'running',
            agent: event.agent,
            startTime: Date.now(),
          });
          if (event.agent) {
            const state = this.agentStates.get(event.agent);
            if (state && !state.toolsUsed.includes(event.tool)) {
              state.toolsUsed.push(event.tool);
            }
          }
        }
        break;

      case 'tool:complete':
        if (event.tool) {
          const toolState = this.toolStates.get(event.tool);
          if (toolState) {
            toolState.status = 'complete';
          }
        }
        break;

      case 'finding:new':
        if (event.finding) {
          this.findings.push(event.finding);
          if (event.finding.agent) {
            const state = this.agentStates.get(event.finding.agent);
            if (state) {
              state.findings++;
            }
          }
        }
        break;

      case 'pipeline:status':
        if (event.message) {
          this.currentPhase = event.message;
        }
        if (event.progress !== undefined) {
          this.progress = event.progress;
        }
        break;

      case 'pipeline:progress':
        if (event.progress !== undefined) {
          this.progress = event.progress;
        }
        if (event.message) {
          this.currentPhase = event.message;
        }
        break;
    }

    this.render();
  }

  render(): void {
    const lines: string[] = [];

    lines.push(`\n${SPINNERS[this.spinnerIndex]} ${this.currentPhase || 'Initializing...'} ${this.progress}%`);
    lines.push('');

    lines.push('┌─ Agents ──────────────────────────────────────────────────────┐');
    for (const [name, state] of this.agentStates.entries()) {
      const icon = state.status === 'running' ? SPINNERS[this.spinnerIndex] :
                   state.status === 'complete' ? '✓' :
                   state.status === 'failed' ? '✗' : '○';
      const tools = state.toolsUsed.length > 0 ? ` [${state.toolsUsed.join(', ')}]` : '';
      const findings = state.findings > 0 ? ` ⚠${state.findings}` : '';
      const thinking = state.thinking ? `\n   └─ ${state.thinking}` : '';
      lines.push(`│ ${icon} ${name}${tools}${findings}${thinking}`);
    }
    lines.push(`│ ${this.completedAgents}/${this.totalAgents} complete${' '.repeat(Math.max(0, 50 - this.completedAgents.toString().length - 10))}│`);
    lines.push('└─────────────────────────────────────────────────────────────────┘');

    const activeTools = Array.from(this.toolStates.entries()).filter(([, s]) => s.status === 'running');
    if (activeTools.length > 0) {
      lines.push('');
      lines.push('┌─ Active Tools ────────────────────────────────────────────────┐');
      for (const [name, state] of activeTools) {
        const agent = state.agent ? ` (${state.agent})` : '';
        const elapsed = state.startTime ? `${((Date.now() - state.startTime) / 1000).toFixed(1)}s` : '';
        lines.push(`│ ${SPINNERS[this.spinnerIndex]} ${name}${agent} ${elapsed}`);
      }
      lines.push('└─────────────────────────────────────────────────────────────────┘');
    }

    if (this.findings.length > 0) {
      lines.push('');
      lines.push(`┌─ Findings (${this.findings.length}) ────────────────────────────────────────┐`);
      const recent = this.findings.slice(-5);
      for (const f of recent) {
        const sev = f.severity.toUpperCase().padEnd(8);
        const conf = confidenceLabel(f.confidence || 50);
        const owasp = f.owaspCategory ? ` [${f.owaspCategory.split(':')[0]}]` : '';
        lines.push(`│ [${sev}] ${f.title}${owasp} (${conf})`);
      }
      lines.push('└─────────────────────────────────────────────────────────────────┘');
    }

    process.stdout.write('\x1B[?25l');
    process.stdout.write('\x1B[H\x1B[2J');
    process.stdout.write(lines.join('\n'));
  }

  printFinalSummary(findings: Finding[]): void {
    this.stopSpinner();
    process.stdout.write('\n\n');

    const bySeverity: Record<string, number> = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
    const byOWASP: Record<string, number> = {};
    const byConfidence: Record<string, number> = { Confirmed: 0, High: 0, Medium: 0, Low: 0, Speculative: 0 };

    for (const f of findings) {
      bySeverity[f.severity] = (bySeverity[f.severity] || 0) + 1;
      const conf = confidenceLabel(f.confidence || 50);
      byConfidence[conf] = (byConfidence[conf] || 0) + 1;
      if (f.owaspCategory) {
        const cat = OWASP_CATEGORIES[f.owaspCategory]?.name || f.owaspCategory;
        byOWASP[cat] = (byOWASP[cat] || 0) + 1;
      }
    }

    console.log('┌─ Scan Summary ──────────────────────────────────────────────────┐');
    console.log(`│ Severity: ${bySeverity.critical}C ${bySeverity.high}H ${bySeverity.medium}M ${bySeverity.low}L ${bySeverity.info}I${' '.repeat(Math.max(0, 50 - 30))}│`);
    console.log(`│ Confidence: ${byConfidence.Confirmed} confirmed, ${byConfidence.High} high, ${byConfidence.Medium} medium${' '.repeat(Math.max(0, 50 - 40))}│`);

    if (Object.keys(byOWASP).length > 0) {
      console.log('│ OWASP Categories:');
      for (const [cat, count] of Object.entries(byOWASP)) {
        console.log(`│   - ${cat}: ${count}`);
      }
    }
    console.log('└─────────────────────────────────────────────────────────────────┘');

    console.log('\n┌─ Detailed Findings ─────────────────────────────────────────────┐');
    for (const f of findings) {
      const conf = confidenceLabel(f.confidence || 50);
      const owasp = f.owaspCategory ? ` [${OWASP_CATEGORIES[f.owaspCategory]?.name || f.owaspCategory}]` : '';
      console.log(`│ [${f.severity.toUpperCase().padEnd(8)}] ${f.title}${owasp}`);
      console.log(`│   Confidence: ${conf} (${f.confidence || 50}%)`);
      console.log(`│   Location: ${f.location}`);
      console.log(`│   ${f.description.slice(0, 100)}${f.description.length > 100 ? '...' : ''}`);
      console.log(`│   Fix: ${f.remediation.slice(0, 100)}${f.remediation.length > 100 ? '...' : ''}`);
      console.log('│');
    }
    console.log('└─────────────────────────────────────────────────────────────────┘');
  }
}
