import { OastServer } from './server';

let instance: OastServer | null = null;

export function getOastServer(persistencePath?: string, publicUrlTemplate?: string): OastServer {
  if (!instance) {
    instance = new OastServer(0, persistencePath, publicUrlTemplate);
  }
  return instance;
}

export async function ensureOastRunning(persistencePath?: string, publicUrlTemplate?: string): Promise<number> {
  const srv = getOastServer(persistencePath, publicUrlTemplate);
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
