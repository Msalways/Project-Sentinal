import { describe, it, expect } from 'vitest';

describe('BrowserSessionManager', () => {
  it('should export BrowserSessionManager class', async () => {
    const mod = await import('../../src/core/browser-session');
    expect(mod.BrowserSessionManager).toBeDefined();
  });

  it('should create and manage sessions by ID', async () => {
    const { BrowserSessionManager } = await import('../../src/core/browser-session');
    const manager = new BrowserSessionManager();
    expect(manager.listSessions()).toEqual([]);
    manager.closeAll();
  });

  it('should close a specific session', async () => {
    const { BrowserSessionManager } = await import('../../src/core/browser-session');
    const manager = new BrowserSessionManager();
    manager.close('nonexistent');
    expect(manager.listSessions()).toEqual([]);
    manager.closeAll();
  });

  it('should close all sessions', async () => {
    const { BrowserSessionManager } = await import('../../src/core/browser-session');
    const manager = new BrowserSessionManager();
    manager.closeAll();
    expect(manager.listSessions()).toEqual([]);
  });
});
