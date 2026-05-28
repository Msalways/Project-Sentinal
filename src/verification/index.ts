import fs from 'fs';
import path from 'path';
import { readAppModel } from '../core/app-model';
import type { AppModelFinding } from '../core/app-model';
import { hasSqlError, isPayloadReflected, isEndpointAlive } from './indicator-check';

export interface VerifiedFinding {
  findingIndex: number;
  type: string;
  endpoint: string;
  param: string;
  previousSeverity: string;
  previousEvidence: string;
  status: 'fixed' | 'regressed' | 'unchanged' | 'unknown';
  newResponse: { status: number; bodyLength: number; bodyPreview: string } | null;
  verifiedAt: string;
}

export interface VerifySummary {
  fixed: number;
  regressed: number;
  unchanged: number;
  total: number;
}

function adaptUrl(oldUrl: string, newBase: string): string {
  const newBaseUrl = newBase.replace(/\/+$/, '');
  try {
    const oldParsed = new URL(oldUrl);
    const newParsed = new URL(newBaseUrl);
    const relativePath = oldParsed.pathname + oldParsed.search;
    return `${newParsed.origin}${relativePath}`;
  } catch {
    const baseClean = newBaseUrl.replace(/\/+$/, '');
    const oldClean = oldUrl.startsWith('/') ? oldUrl : `/${oldUrl}`;
    return `${baseClean}${oldClean}`;
  }
}

function extractPayloadFromEvidence(findings: AppModelFinding): string | null {
  for (const ev of findings.evidence) {
    if (ev.type === 'text' || ev.type === 'raw_request' || ev.type === 'raw_response') {
      const data = ev.data || '';
      if (data.length > 0 && data.length < 5000) return data;
    }
  }
  return null;
}

function getResponsePreview(body: string): string {
  const cleaned = body.replace(/\s+/g, ' ').trim();
  return cleaned.length > 300 ? cleaned.slice(0, 300) + '...' : cleaned;
}

async function sendRequest(
  url: string,
  payload?: string,
  options?: { timeout?: number },
): Promise<{ status: number; body: string } | null> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), options?.timeout ?? 15000);

  try {
    const body = payload ? new URLSearchParams({ q: payload }).toString() : undefined;
    const res = await fetch(url, {
      method: body ? 'POST' : 'GET',
      headers: { 'User-Agent': 'Ultimatrix-Verification/1.0' },
      body,
      signal: controller.signal,
      redirect: 'manual',
    });
    const text = await res.text();
    clearTimeout(timeoutId);
    return { status: res.status, body: text };
  } catch {
    clearTimeout(timeoutId);
    return null;
  }
}

function classifyFinding(
  original: AppModelFinding,
  response: { status: number; body: string } | null,
  endpointAlive: boolean,
): { status: VerifiedFinding['status']; newResponse: VerifiedFinding['newResponse'] } {
  if (response === null) {
    return {
      status: 'unknown',
      newResponse: null,
    };
  }

  const newResponseData: VerifiedFinding['newResponse'] = {
    status: response.status,
    bodyLength: response.body.length,
    bodyPreview: getResponsePreview(response.body),
  };

  if (!endpointAlive && response.status !== 200) {
    return { status: 'unknown', newResponse: newResponseData };
  }

  const originalText = extractPayloadFromEvidence(original);
  const prevBodyPreview = original.evidence
    .filter((e) => e.type === 'text' || e.type === 'raw_response')
    .map((e) => e.data)
    .join(' ');

  const findingType = (original.type || '').toLowerCase();
  const prevSeverity = (original.severity || '').toLowerCase();

  if (findingType.includes('sqli') || findingType.includes('sql') || findingType.includes('injection')) {
    const previousHadError = hasSqlError(prevBodyPreview);
    const currentHasError = hasSqlError(response.body);

    if (previousHadError && !currentHasError) {
      return { status: 'fixed', newResponse: newResponseData };
    }
    if (!previousHadError && currentHasError) {
      return { status: 'regressed', newResponse: newResponseData };
    }
    if (previousHadError && currentHasError) {
      return { status: 'unchanged', newResponse: newResponseData };
    }
    return { status: 'unknown', newResponse: newResponseData };
  }

  if (findingType.includes('xss') || findingType.includes('cross-site') || findingType.includes('cross_site')) {
    const payload = originalText || '';
    const previousReflected = isPayloadReflected(prevBodyPreview, payload);
    const currentReflected = isPayloadReflected(response.body, payload);

    if (previousReflected && !currentReflected) {
      return { status: 'fixed', newResponse: newResponseData };
    }
    if (!previousReflected && currentReflected) {
      return { status: 'regressed', newResponse: newResponseData };
    }
    if (previousReflected && currentReflected) {
      return { status: 'unchanged', newResponse: newResponseData };
    }
    return { status: 'unknown', newResponse: newResponseData };
  }

  if (findingType.includes('auth') || findingType.includes('bypass') || findingType.includes('authentication')) {
    const originalStatus = original.evidence
      .filter((e) => e.type === 'raw_response')
      .map((e) => {
        const match = e.data.match(/HTTP\/\d\.\d\s+(\d{3})/);
        return match ? parseInt(match[1], 10) : null;
      })
      .find((s) => s !== null);

    if (originalStatus !== undefined) {
      if (originalStatus === 401 && response.status === 200) {
        return { status: 'regressed', newResponse: newResponseData };
      }
      if (originalStatus === 200 && response.status === 401) {
        return { status: 'fixed', newResponse: newResponseData };
      }
      if (originalStatus === response.status) {
        return { status: 'unchanged', newResponse: newResponseData };
      }
    }
    return { status: 'unknown', newResponse: newResponseData };
  }

  if (prevSeverity === 'critical' || prevSeverity === 'high') {
    const bodyChange = Math.abs(response.body.length - (prevBodyPreview.length || 0));
    if (response.status < 400 && bodyChange < 100) {
      return { status: 'unchanged', newResponse: newResponseData };
    }
    if (response.status >= 400) {
      return { status: 'fixed', newResponse: newResponseData };
    }
  }

  return { status: 'unknown', newResponse: newResponseData };
}

export async function verifyFindings(
  appModelPath: string,
  newTargetBaseUrl: string,
  outputDir: string,
  options?: { timeout?: number },
): Promise<{ verified: VerifiedFinding[]; summary: VerifySummary }> {
  const model = readAppModel(appModelPath);
  const findings = model.findings || [];
  const verified: VerifiedFinding[] = [];
  const counts = { fixed: 0, regressed: 0, unchanged: 0, unknown: 0 };

  for (let i = 0; i < findings.length; i++) {
    const finding = findings[i];
    const newUrl = adaptUrl(finding.endpoint, newTargetBaseUrl);
    const originalText = extractPayloadFromEvidence(finding) || undefined;

    const response = await sendRequest(newUrl, originalText, options);
    const endpointAlive = response !== null && isEndpointAlive(response.status);

    const result = classifyFinding(finding, response, endpointAlive);

    const prevEvidence = finding.evidence
      .filter((e) => e.type === 'text' || e.type === 'raw_response')
      .map((e) => e.label)
      .join('; ') || finding.evidence.map((e) => e.label).join('; ');

    const entry: VerifiedFinding = {
      findingIndex: i,
      type: finding.type,
      endpoint: finding.endpoint,
      param: finding.param,
      previousSeverity: finding.severity,
      previousEvidence: prevEvidence,
      status: result.status,
      newResponse: result.newResponse,
      verifiedAt: new Date().toISOString(),
    };

    verified.push(entry);
    if (result.status !== 'unknown') counts[result.status]++;
  }

  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(
    path.join(outputDir, 'verified-findings.json'),
    JSON.stringify({ verified, summary: { ...counts, total: findings.length } }, null, 2),
  );

  return {
    verified,
    summary: { ...counts, total: findings.length },
  };
}
