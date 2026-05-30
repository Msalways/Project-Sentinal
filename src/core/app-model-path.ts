let currentPath: string | null = null;

export function setAppModelPath(path: string): void {
  currentPath = path;
}

export function getAppModelPath(): string {
  if (!currentPath) throw new Error('App model path not set. Call setAppModelPath() first.');
  return currentPath;
}
