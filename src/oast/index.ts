import { OastServer } from './server';

let instance: OastServer | null = null;

export function getOastServer(): OastServer {
  if (!instance) {
    instance = new OastServer();
  }
  return instance;
}

export async function ensureOastRunning(): Promise<number> {
  const srv = getOastServer();
  if (!srv.isRunning()) {
    return await srv.start();
  }
  return srv.getPort();
}

export function stopOast(): void {
  if (instance) {
    instance.stop();
    instance = null;
  }
}

export { OastServer } from './server';
