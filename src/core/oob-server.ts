import http from 'http';
import os from 'os';

export interface OOBCallback {
  id: string;
  method: string;
  url: string;
  headers: Record<string, string>;
  timestamp: string;
  remoteAddr: string;
}

export class OOBServer {
  private server: http.Server | null = null;
  private callbacks: Map<string, OOBCallback[]> = new Map();
  private port: number;
  private hostIp: string;

  constructor(port = 8089) {
    this.port = port;
    this.hostIp = this.detectHostIp();
  }

  private detectHostIp(): string {
    const interfaces = os.networkInterfaces();
    for (const iface of Object.values(interfaces)) {
      if (!iface) continue;
      for (const addr of iface) {
        if (addr.family === 'IPv4' && !addr.internal) {
          return addr.address;
        }
      }
    }
    return '127.0.0.1';
  }

  start(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server = http.createServer((req, res) => {
        const url = req.url || '/';
        const match = url.match(/\/oob\/([^/?#]+)/);
        const callbackId = match ? match[1] : 'unknown';

        const headers: Record<string, string> = {};
        for (const [k, v] of Object.entries(req.headers)) {
          headers[k] = typeof v === 'string' ? v : (v || []).join(', ');
        }

        const callback: OOBCallback = {
          id: callbackId,
          method: req.method || 'GET',
          url,
          headers,
          timestamp: new Date().toISOString(),
          remoteAddr: req.socket.remoteAddress || 'unknown',
        };

        if (!this.callbacks.has(callbackId)) {
          this.callbacks.set(callbackId, []);
        }
        this.callbacks.get(callbackId)!.push(callback);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok', callbackId }));
      });

      this.server.on('error', reject);

      this.server.listen(this.port, '0.0.0.0', () => {
        resolve();
      });
    });
  }

  stop(): Promise<void> {
    return new Promise((resolve) => {
      if (!this.server) {
        resolve();
        return;
      }
      this.server.close(() => {
        this.server = null;
        resolve();
      });
    });
  }

  getCallbacks(id: string): OOBCallback[] {
    return this.callbacks.get(id) || [];
  }

  generatePayload(id: string, scheme: 'http' | 'https' | 'dns' = 'http'): string {
    if (scheme === 'dns') {
      return `${id}.${this.hostIp.replace(/\./g, '-')}.oob.ultimatrix`;
    }
    return `${scheme}://${this.hostIp}:${this.port}/oob/${id}`;
  }

  getBaseUrl(): string {
    return `http://${this.hostIp}:${this.port}`;
  }

  hasCallback(id: string): boolean {
    return this.callbacks.has(id) && this.callbacks.get(id)!.length > 0;
  }

  clearCallbacks(id?: string): void {
    if (id) {
      this.callbacks.delete(id);
    } else {
      this.callbacks.clear();
    }
  }
}
