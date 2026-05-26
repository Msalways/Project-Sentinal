import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { execSync } from 'child_process';
import type { Finding, Severity } from '../core/types';

const severityMap: Record<string, Severity> = {
  CRITICAL: 'critical',
  HIGH: 'high',
  MEDIUM: 'medium',
  LOW: 'low',
};

function mapTrivySeverity(severity: string): Severity {
  return severityMap[severity.toUpperCase()] || 'medium';
}

function extractVulnId(vuln: Record<string, unknown>): string {
  return (vuln.VulnerabilityID as string) || (vuln.ID as string) || 'unknown';
}

function extractTitle(vuln: Record<string, unknown>, pkgName: string): string {
  return `${extractVulnId(vuln)} in ${pkgName}`;
}

export function createTrivyTool() {
  return tool(
    async (input: { target: string; scanType?: string; severity?: string; timeout?: number }): Promise<string> => {
      const { target, scanType = 'fs', severity: severityFilter, timeout = 120 } = input;

      try {
        execSync('trivy --version', { stdio: 'pipe', timeout: 5000 });
      } catch {
        return 'Error: trivy is not installed. Install it from: https://github.com/aquasecurity/trivy#installation';
      }

      try {
        let cmd = `trivy ${scanType} --format json --quiet`;
        if (severityFilter) {
          cmd += ` --severity ${severityFilter}`;
        }
        cmd += ` "${target}"`;

        const output = execSync(cmd, {
          encoding: 'utf-8',
          timeout: timeout * 1000,
          maxBuffer: 50 * 1024 * 1024,
        });

        const parsed = JSON.parse(output);
        const findings: Finding[] = [];
        const result = parsed.Results || [];

        for (const resultEntry of result) {
          const targetStr = (resultEntry.Target as string) || target;
          const vulns = (resultEntry.Vulnerabilities || []) as Record<string, unknown>[];
          const misconfigs = (resultEntry.Misconfigurations || []) as Record<string, unknown>[];

          for (const vuln of vulns) {
            const pkgName = (vuln.PkgName as string) || 'unknown';
            const vulnId = extractVulnId(vuln);
            const sev = mapTrivySeverity((vuln.Severity as string) || 'MEDIUM');

            findings.push({
              id: `trivy-${targetStr}-${vulnId}`.replace(/[^a-zA-Z0-9_-]/g, '-'),
              title: extractTitle(vuln, pkgName),
              description: (vuln.Description as string || `Vulnerability ${vulnId} in ${pkgName}`).slice(0, 500),
              severity: sev,
              category: 'sca',
              confidence: 85,
              location: targetStr,
              evidence: `Package: ${pkgName} ${vuln.InstalledVersion as string || ''}\nFixed: ${vuln.FixedVersion as string || 'N/A'}\nSeverity: ${vuln.Severity as string}`,
              remediation: `Upgrade ${pkgName} to version ${vuln.FixedVersion as string || 'the latest patched version'}`,
              agent: 'code',
              timestamp: new Date().toISOString(),
            });
          }

          for (const misconfig of misconfigs) {
            const mcId = (misconfig.ID as string) || 'unknown';
            const mcTitle = (misconfig.Title as string) || misconfig.Message as string || mcId;
            const sev = mapTrivySeverity((misconfig.Severity as string) || 'MEDIUM');

            const causeMeta = misconfig.CauseMetadata as Record<string, unknown> | undefined;
            findings.push({
              id: `trivy-mc-${targetStr}-${mcId}`.replace(/[^a-zA-Z0-9_-]/g, '-'),
              title: mcTitle,
              description: (misconfig.Description as string || misconfig.Message as string || `Misconfiguration ${mcId}`).slice(0, 500),
              severity: sev,
              category: 'misconfiguration',
              confidence: 80,
              location: `${targetStr}:${(causeMeta?.StartLine as number) || 0}-${(causeMeta?.EndLine as number) || 0}`,
              evidence: JSON.stringify({
                id: mcId,
                severity: misconfig.Severity,
                resolution: misconfig.Resolution,
                message: misconfig.Message,
              }).slice(0, 500),
              remediation: (misconfig.Resolution as string) || 'Review and fix the misconfiguration.',
              agent: 'code',
              timestamp: new Date().toISOString(),
            });
          }
        }

        if (findings.length === 0) {
          return `Trivy ${scanType} scan complete for ${target}: 0 findings${severityFilter ? ` (filtered: ${severityFilter})` : ''}`;
        }

        const bySeverity: Record<string, number> = {};
        const byCategory: Record<string, number> = {};
        for (const f of findings) {
          bySeverity[f.severity] = (bySeverity[f.severity] || 0) + 1;
          byCategory[f.category] = (byCategory[f.category] || 0) + 1;
        }

        let summary = `Trivy ${scanType} scan complete for ${target}: ${findings.length} findings\n`;
        for (const [sev, count] of Object.entries(bySeverity)) {
          summary += `- ${sev}: ${count}\n`;
        }

        const topFindings = findings.slice(0, 30);
        summary += '\nTop Findings:\n';
        summary += topFindings.map((f) =>
          `[${f.severity.toUpperCase()}] ${f.title}\n  Location: ${f.location}\n  ${f.description.slice(0, 150)}`
        ).join('\n\n');

        if (findings.length > 30) {
          summary += `\n\n... and ${findings.length - 30} more findings`;
        }

        return summary;
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : String(error);
        if (errMsg.includes('ETIMEDOUT') || errMsg.includes('timed out')) {
          return `Error: Trivy scan timed out after ${timeout}s for ${target}`;
        }
        return `Error running trivy: ${errMsg}`;
      }
    },
    {
      name: 'trivy_scan',
      description: 'Run Trivy scanner on container images, filesystems, Kubernetes clusters, or SBOM files. Trivy must be installed separately (https://github.com/aquasecurity/trivy). Returns findings mapped to Finding format.',
      schema: z.object({
        target: z.string().describe('Scan target: image name (e.g. alpine:3.18), filesystem path, k8s context, or SBOM path'),
        scanType: z.enum(['image', 'fs', 'k8s', 'sbom']).optional().default('fs').describe('Type of scan to perform'),
        severity: z.enum(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']).optional().describe('Filter by minimum severity'),
        timeout: z.number().optional().default(120).describe('Scan timeout in seconds'),
      }),
    }
  );
}
