import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { OOBServer } from '../core/oob-server';

const OOBFindSchema = z.object({
  callbackIds: z.array(z.string()).describe('Array of OOB callback IDs to check'),
});

export function createOOBFindTool(oobServer: OOBServer): DynamicStructuredTool {
  return new DynamicStructuredTool({
    name: 'oob_find',
    description: 'Check OOB callback server for received callbacks to confirm blind SSRF, XXE, or SQLi vulnerabilities',
    schema: OOBFindSchema,
    func: async (input) => {
      const { callbackIds } = input;
      const results: Array<{
        id: string;
        received: boolean;
        callbacks: Array<{ method: string; url: string; timestamp: string; remoteAddr: string }>;
      }> = [];

      for (const id of callbackIds) {
        const callbacks = oobServer.getCallbacks(id);
        results.push({
          id,
          received: callbacks.length > 0,
          callbacks: callbacks.map((c) => ({
            method: c.method,
            url: c.url,
            timestamp: c.timestamp,
            remoteAddr: c.remoteAddr,
          })),
        });
      }

      return JSON.stringify({
        checked: callbackIds.length,
        confirmed: results.filter((r) => r.received).length,
        results,
      }, null, 2);
    },
  });
}
