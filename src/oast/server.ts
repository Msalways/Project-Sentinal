import http from 'http';
import { randomUUID } from 'crypto';
import fs from 'fs';

export interface CallbackRecord {
  uuid: string;
  timestamp: number;
  method: string;
  url: string;
  headers: Record<string, string>;
  body: string;
  remoteAddress: string;
}

export class OastServer {
  private server: http.Server | null = null;
  private callbacks: Map<string, CallbackRecord[]> = new Map();
  private port: number;
  private persistencePath: string | null;
  private publicUrlTemplate: string | null;

  constructor(port = 0, persistencePath?: string, publicUrlTemplate?: string) {
    this.port = port;
    this.persistencePath = persistencePath || null;
    this.publicUrlTemplate = publicUrlTemplate || null;
    this.loadPersisted();
  }

  private loadPersisted(): void {
    if (!this.persistencePath) return;
    try {
      if (fs.existsSync(this.persistencePath)) {
        const data = JSON.parse(fs.readFileSync(this.persistencePath, 'utf-8'));
        for (const [uuid, records] of Object.entries(data)) {
          this.callbacks.set(uuid, records as CallbackRecord[]);
        }
      }
    } catch { /* best effort */ }
  }

  private savePersisted(): void {
    if (!this.persistencePath) return;
    try {
      const data: Record<string, CallbackRecord[]> = {};
      for (const [uuid, records] of this.callbacks) {
        data[uuid] = records;
      }
      fs.writeFileSync(this.persistencePath, JSON.stringify(data, null, 2));
    } catch { /* best effort */ }
  }

  start(): Promise<number> {
    return new Promise((resolve, reject) => {
      this.server = http.createServer((req, res) => {
        const parsedUrl = new URL(req.url || '/', `http://localhost:${this.port || 0}`);

        // API: check for callbacks by UUID
        if (parsedUrl.pathname === '/api/check' && parsedUrl.searchParams.has('uuid')) {
          const uuid = parsedUrl.searchParams.get('uuid')!;
          const records = this.callbacks.get(uuid) || [];
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(records));
          return;
        }

        // Record callback
        const uuid = req.url?.split('/').filter(Boolean)[0] || 'unknown';
        const chunks: Buffer[] = [];
        req.on('data', (chunk: Buffer) => chunks.push(chunk));
        req.on('end', () => {
          const record: CallbackRecord = {
            uuid,
            timestamp: Date.now(),
            method: req.method || 'GET',
            url: req.url || '/',
            headers: req.headers as Record<string, string>,
            body: Buffer.concat(chunks).toString('utf-8').slice(0, 4096),
            remoteAddress: req.socket?.remoteAddress || 'unknown',
          };
          if (!this.callbacks.has(uuid)) this.callbacks.set(uuid, []);
          this.callbacks.get(uuid)!.push(record);
          this.savePersisted();
          res.writeHead(200, { 'Content-Type': 'text/plain' });
          res.end('ok');
        });
      });

      this.server.listen(this.port, () => {
        const addr = this.server?.address();
        if (addr && typeof addr === 'object') {
          this.port = addr.port;
          resolve(addr.port);
        } else {
          reject(new Error('Failed to get port'));
        }
      });
      this.server.on('error', reject);
    });
  }

  createUrl(): { uuid: string; url: string } {
    const uuid = randomUUID().replace(/-/g, '').slice(0, 12);
    if (this.publicUrlTemplate) {
      return { uuid, url: this.publicUrlTemplate.replace('{uuid}', uuid) };
    }
    return { uuid, url: `http://localhost:${this.port}/${uuid}` };
  }

  setPublicUrlTemplate(template: string): void {
    this.publicUrlTemplate = template;
  }

  checkCallbacks(uuid?: string): CallbackRecord[] {
    if (uuid) return this.callbacks.get(uuid) || [];
    const all: CallbackRecord[] = [];
    for (const records of this.callbacks.values()) all.push(...records);
    return all;
  }

  getPort(): number { return this.port; }

  stop(): void {
    this.savePersisted();
    if (this.server) {
      this.server.close();
      this.server = null;
    }
  }

  isRunning(): boolean { return this.server !== null; }

  getStats(): { totalCallbacks: number; uniqueUuids: number } {
    let totalCallbacks = 0;
    for (const records of this.callbacks.values()) totalCallbacks += records.length;
    return { totalCallbacks, uniqueUuids: this.callbacks.size };
  }
}
