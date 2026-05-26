import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { execSync } from 'child_process';
import type { Finding, Severity } from '../core/types';

const severityMap: Record<string, Severity> = {
  ERROR: 'critical',
  WARNING: 'high',
  INFO: 'medium',
  INVENTORY: 'low',
};

function mapSemgrepSeverity(severity: string): Severity {
  return severityMap[severity.toUpperCase()] || 'medium';
}

export function createSemgrepTool() {
  return tool(
    async (input: { path: string; rules?: string; timeout?: number }): Promise<string> => {
      const { path: scanPath, rules, timeout = 120 } = input;

      try {
        execSync('semgrep --version', { stdio: 'pipe', timeout: 5000 });
      } catch {
        return 'Error: semgrep is not installed. Install it with: pip install semgrep';
      }

      try {
        const cmd = rules
          ? `semgrep scan --json --config ${rules} "${scanPath}"`
          : `semgrep scan --json "${scanPath}"`;

        const output = execSync(cmd, {
          encoding: 'utf-8',
          timeout: timeout * 1000,
          maxBuffer: 10 * 1024 * 1024,
        });

        const parsed = JSON.parse(output);
        const results = parsed.results || [];

        if (results.length === 0) {
          return `Semgrep scan complete for ${scanPath}: 0 findings`;
        }

        const findings: Finding[] = results.map((r: Record<string, unknown>, i: number) => {
          const extra = (r.extra as Record<string, unknown>) || {};
          const location = r.path as string || 'unknown';
          const start = (r.start as Record<string, number>) || {};
          const end = (r.end as Record<string, number>) || {};
          const lines = start.line && end.line
            ? `:${start.line}-${end.line}`
            : start.line
              ? `:${start.line}`
              : '';
          const severity = mapSemgrepSeverity(extra.severity as string || 'WARNING');
          const message = extra.message as string || 'No message';

          return {
            id: `semgrep-${i + 1}`,
            title: (extra.metadata as Record<string, unknown>)?.title as string || extra.check_id as string || 'Semgrep Finding',
            description: message.slice(0, 500),
            severity,
            category: 'sast',
            confidence: 70,
            location: `${location}${lines}`,
            evidence: (extra.lines as string || '').slice(0, 200) || message.slice(0, 200),
            remediation: extra.fix as string || 'Review code and apply security fix.',
            agent: 'code',
            timestamp: new Date().toISOString(),
          } as Finding;
        });

        const bySeverity: Record<string, number> = {};
        for (const f of findings) {
          bySeverity[f.severity] = (bySeverity[f.severity] || 0) + 1;
        }

        let summary = `Semgrep scan complete for ${scanPath}: ${findings.length} findings\n`;
        for (const [sev, count] of Object.entries(bySeverity)) {
          summary += `- ${sev}: ${count}\n`;
        }
        summary += '\nFindings:\n';
        summary += findings.slice(0, 50).map((f) =>
          `[${f.severity.toUpperCase()}] ${f.title}\n  Location: ${f.location}\n  ${f.description.slice(0, 200)}`
        ).join('\n\n');

        return summary;
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : String(error);
        if (errMsg.includes('ETIMEDOUT') || errMsg.includes('timed out')) {
          return `Error: Semgrep scan timed out after ${timeout}s for ${scanPath}`;
        }
        return `Error running semgrep: ${errMsg}`;
      }
    },
    {
      name: 'semgrep_scan',
      description: 'Run Semgrep SAST scan on a source directory. Semgrep must be installed separately (pip install semgrep). Returns findings mapped to Finding format.',
      schema: z.object({
        path: z.string().describe('Source directory path to scan'),
        rules: z.string().optional().describe('Semgrep rule configuration (path to rule file, directory, or registry path like p/python)'),
        timeout: z.number().optional().default(120).describe('Scan timeout in seconds'),
      }),
    }
  );
}
