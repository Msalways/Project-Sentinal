import { z } from 'zod';
import { tool, DynamicStructuredTool } from '@langchain/core/tools';
import { readAppModelSection, updateAppModelSection, type AppModelSection } from '../core/app-model';
import { getAppModelPath } from '../core/app-model-path';

const VALID_SECTIONS: AppModelSection[] = [
  'target', 'techStack', 'auth', 'workflow', 'endpoints', 'forms', 'scripts',
  'cookies', 'localStorage', 'findings', 'verifications', 'parameterClassifications',
  'authBoundaries', 'recordedSessions', 'hypotheses', 'nextSteps', 'visitedUrls',
  'oastCallbacks', 'coverage', 'currentPage', 'warnings', 'eventLog', 'artifacts',
  'browserSessions', 'navigationHistory', 'errors', '_meta',
];

export function createReadAppModelTool(): DynamicStructuredTool {
  return tool(async (input) => {
    const { section } = ReadAppModelSchema.parse(input);
    const path = getAppModelPath();
    if (section) {
      const data = readAppModelSection(path, section as AppModelSection);
      return JSON.stringify({ section, data }, null, 2);
    }
    const fs = require('fs');
    if (!fs.existsSync(path)) return JSON.stringify({ error: 'App model not found. Initialize it first.' });
    const raw = fs.readFileSync(path, 'utf-8');
    return raw;
  }, {
    name: 'read_app_model',
    description: 'Read the app model JSON file. Optionally pass a section name to read only that part (target, techStack, auth, workflow, endpoints, forms, scripts, cookies, localStorage, findings, verifications, parameterClassifications, authBoundaries, recordedSessions, hypotheses, nextSteps, visitedUrls, oastCallbacks, coverage)',
    schema: ReadAppModelSchema,
  });
}

export function createUpdateAppModelTool(): DynamicStructuredTool {
  return tool(async (input) => {
    const { section, data, merge } = UpdateAppModelSchema.parse(input);
    const path = getAppModelPath();
    if (!VALID_SECTIONS.includes(section as AppModelSection)) {
      return JSON.stringify({ error: `Invalid section "${section}". Valid sections: ${VALID_SECTIONS.join(', ')}` });
    }
    const updated = updateAppModelSection(path, section as AppModelSection, JSON.parse(typeof data === 'string' ? data : JSON.stringify(data)), merge !== false);
    return JSON.stringify({ section, updated: (updated as any)[section], status: 'ok' }, null, 2);
  }, {
    name: 'update_app_model',
    description: 'Update a section of the app model JSON file. Provide section name and data. Arrays are merged by default (no duplicates). Objects are merged at top-level keys. Pass merge=false to overwrite entirely.',
    schema: UpdateAppModelSchema,
  });
}

const ReadAppModelSchema = z.object({
  section: z.string().optional().catch(undefined).describe('Optional section name: target, techStack, auth, workflow, endpoints, forms, scripts, cookies, localStorage, findings, verifications, parameterClassifications, authBoundaries, recordedSessions, hypotheses, nextSteps, visitedUrls, oastCallbacks, coverage, currentPage, warnings, eventLog, artifacts, browserSessions, navigationHistory, errors, _meta'),
});

const UpdateAppModelSchema = z.object({
  section: z.string().describe('Section name: target, techStack, auth, workflow, endpoints, forms, scripts, cookies, localStorage, findings, verifications, parameterClassifications, authBoundaries, recordedSessions, hypotheses, nextSteps, visitedUrls, oastCallbacks, coverage, currentPage, warnings, eventLog, artifacts, browserSessions, navigationHistory, errors, _meta'),
  data: z.any().describe('The data to write to this section. For arrays, new items are merged (deduplicated by path/name/src). For objects, keys are merged at the top level.'),
  merge: z.boolean().optional().default(true).describe('Whether to merge with existing data (true) or overwrite entirely (false). Default: true'),
});
