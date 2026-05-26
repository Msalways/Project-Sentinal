import type { AppPage } from './flow-model';

export class FlowStore {
  private pages = new Map<string, AppPage>();
  private meta: Record<string, string> = {};

  recordPage(page: AppPage): void {
    this.pages.set(page.path, page);
  }

  getPage(path: string): AppPage | undefined {
    return this.pages.get(path);
  }

  getPages(): AppPage[] {
    return Array.from(this.pages.values());
  }

  getPageCount(): number {
    return this.pages.size;
  }

  setMeta(key: string, value: string): void {
    this.meta[key] = value;
  }

  getMeta(key: string): string | undefined {
    return this.meta[key];
  }

  clear(): void {
    this.pages.clear();
    this.meta = {};
  }
}
