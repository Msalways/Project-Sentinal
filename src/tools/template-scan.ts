import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { TemplateEngine } from '../core/template-engine';
import path from 'path';

export function createTemplateScanTool(): DynamicStructuredTool {
  return new DynamicStructuredTool({
    name: 'template_scan',
    description: 'Execute Nuclei-compatible YAML templates against a target URL for vulnerability detection',
    schema: z.object({
      target: z.string().describe('Target URL to scan (e.g. https://example.com)'),
      templateId: z.string().optional().describe('Specific template ID to execute'),
      severity: z.enum(['info', 'low', 'medium', 'high', 'critical']).optional().describe('Filter by minimum severity'),
      timeout: z.number().optional().default(60).describe('Timeout per request in seconds'),
    }),
    func: async (input) => {
      const { target, templateId, severity, timeout } = input;
      const templatesDir = path.join(process.cwd(), 'templates');
      const engine = new TemplateEngine(templatesDir);

      try {
        let findings;

        if (templateId) {
          const template = engine.getTemplate(templateId);
          if (!template) return `Template "${templateId}" not found. Available: ${engine.getAllTemplates().map((t) => t.id).join(', ')}`;
          findings = await engine.executeTemplate(template, target);
        } else {
          findings = await engine.executeAll(target, severity);
        }

        if (findings.length === 0) return `No vulnerabilities detected by template scan on ${target}`;

        const bySeverity: Record<string, number> = {};
        for (const f of findings) {
          bySeverity[f.severity] = (bySeverity[f.severity] || 0) + 1;
        }
        const summary = Object.entries(bySeverity).map(([s, c]) => `${s}: ${c}`).join(', ');

        return `Template Scan Results for ${target}\n\nSummary: ${findings.length} findings (${summary})\n\n${findings.slice(0, 20).map((f) => `[${f.severity}] ${f.title}\n  ${f.description}\n  Location: ${f.location}\n  Evidence: ${f.evidence}`).join('\n\n')}`;
      } catch (error) {
        return `Template scan error: ${error instanceof Error ? error.message : String(error)}`;
      }
    },
  });
}
