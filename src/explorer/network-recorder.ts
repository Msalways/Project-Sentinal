import type { Page, Route, Request, Response } from 'playwright';

export interface CapturedRequest {
  id: string;
  method: string;
  url: string;
  status: number;
  statusText: string;
  contentType: string;
  requestHeaders: Record<string, string>;
  responseHeaders: Record<string, string>;
  requestBody: string | null;
  responseBody: string | null;
  initiatorUrl: string;
  timestamp: number;
  duration: number;
  resourceType: string;
}

export class NetworkRecorder {
  private requests: CapturedRequest[] = [];
  private page: Page;
  private active: boolean = false;
  private counter: number = 0;

  constructor(page: Page) {
    this.page = page;
  }

  async start(): Promise<void> {
    this.active = true;
    this.requests = [];
    this.counter = 0;
    await this.page.route('**', (route: Route, request: Request) => {
      if (!this.active) {
        route.continue();
        return;
      }
      const id = `req-${++this.counter}`;
      const startTime = Date.now();
      const initiatorUrl = this.page.url();

      route.continue().then(() => {
        request.response().then(async (response: Response | null) => {
          if (!response) return;
          const status = response.status();
          const headers = response.headers();
          let body: string | null = null;
          try {
            const buffer = await response.body();
            body = buffer.length > 65536 ? buffer.slice(0, 65536).toString('utf-8') + '...[truncated]' : buffer.toString('utf-8');
          } catch {
            // response body not available (redirect, 304, etc.)
          }

          this.requests.push({
            id,
            method: request.method(),
            url: request.url(),
            status,
            statusText: response.statusText(),
            contentType: headers['content-type'] || '',
            requestHeaders: request.headers(),
            responseHeaders: headers,
            requestBody: request.postDataBuffer()?.toString('utf-8') || null,
            responseBody: body,
            initiatorUrl,
            timestamp: startTime,
            duration: Date.now() - startTime,
            resourceType: request.resourceType(),
          });
        }).catch(() => {});
      }).catch(() => {});
    });
  }

  stop(): CapturedRequest[] {
    this.active = false;
    return [...this.requests];
  }

  getRequestsSince(timestamp: number): CapturedRequest[] {
    return this.requests.filter(r => r.timestamp >= timestamp);
  }

  clear(): void {
    this.requests = [];
  }
}
