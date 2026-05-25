import { describe, it, expect, vi } from 'vitest';
import { ScanEventEmitter } from '../../src/core/types';
import type { Finding } from '../../src/core/types';

describe('ScanEventEmitter', () => {
  it('emits events to registered listeners', () => {
    const emitter = new ScanEventEmitter();
    const listener = vi.fn();
    emitter.on(listener);
    emitter.emit({ type: 'pipeline:status', message: 'starting' });
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('includes timestamp on emitted events', () => {
    const emitter = new ScanEventEmitter();
    const listener = vi.fn();
    emitter.on(listener);
    emitter.emit({ type: 'pipeline:status', message: 'test' });
    const event = listener.mock.calls[0][0];
    expect(event.timestamp).toBeDefined();
    expect(typeof event.timestamp).toBe('string');
  });

  it('does not crash when a listener throws', () => {
    const emitter = new ScanEventEmitter();
    emitter.on(() => { throw new Error('listener error'); });
    const listener2 = vi.fn();
    emitter.on(listener2);
    expect(() => emitter.emit({ type: 'pipeline:status', message: 'go' })).not.toThrow();
    expect(listener2).toHaveBeenCalledTimes(1);
  });

  it('agentStart emits agent:start', () => {
    const emitter = new ScanEventEmitter();
    const listener = vi.fn();
    emitter.on(listener);
    emitter.agentStart('recon', { phase: 1 });
    const event = listener.mock.calls[0][0];
    expect(event.type).toBe('agent:start');
    expect(event.agent).toBe('recon');
    expect(event.details).toEqual({ phase: 1 });
  });

  it('agentComplete emits agent:complete', () => {
    const emitter = new ScanEventEmitter();
    const listener = vi.fn();
    emitter.on(listener);
    emitter.agentComplete('web', { findings: 3 });
    const event = listener.mock.calls[0][0];
    expect(event.type).toBe('agent:complete');
    expect(event.agent).toBe('web');
    expect(event.details).toEqual({ findings: 3 });
  });

  it('agentThinking emits agent:thinking', () => {
    const emitter = new ScanEventEmitter();
    const listener = vi.fn();
    emitter.on(listener);
    emitter.agentThinking('exploit', 'analyzing...');
    const event = listener.mock.calls[0][0];
    expect(event.type).toBe('agent:thinking');
    expect(event.agent).toBe('exploit');
    expect(event.thinking).toBe('analyzing...');
  });

  it('toolStart emits tool:start', () => {
    const emitter = new ScanEventEmitter();
    const listener = vi.fn();
    emitter.on(listener);
    emitter.toolStart('browser_navigate', 'web', { url: 'http://test.com' });
    const event = listener.mock.calls[0][0];
    expect(event.type).toBe('tool:start');
    expect(event.tool).toBe('browser_navigate');
    expect(event.agent).toBe('web');
    expect(event.details).toEqual({ url: 'http://test.com' });
  });

  it('toolStart works without agent', () => {
    const emitter = new ScanEventEmitter();
    const listener = vi.fn();
    emitter.on(listener);
    emitter.toolStart('exec_command');
    const event = listener.mock.calls[0][0];
    expect(event.type).toBe('tool:start');
    expect(event.tool).toBe('exec_command');
    expect(event.agent).toBeUndefined();
  });

  it('toolComplete emits tool:complete', () => {
    const emitter = new ScanEventEmitter();
    const listener = vi.fn();
    emitter.on(listener);
    emitter.toolComplete('browser_click', 'web', { success: true });
    const event = listener.mock.calls[0][0];
    expect(event.type).toBe('tool:complete');
    expect(event.tool).toBe('browser_click');
    expect(event.agent).toBe('web');
    expect(event.details).toEqual({ success: true });
  });

  it('newFinding emits finding:new with Finding', () => {
    const emitter = new ScanEventEmitter();
    const listener = vi.fn();
    emitter.on(listener);
    const finding: Finding = {
      id: 'F-001',
      title: 'SQL Injection',
      description: 'SQLi in login',
      severity: 'critical',
      category: 'injection',
      confidence: 0.95,
      location: '/login',
      evidence: "1' OR '1'='1",
      remediation: 'use parameterized queries',
      agent: 'web',
      timestamp: new Date().toISOString(),
    };
    emitter.newFinding(finding);
    const event = listener.mock.calls[0][0];
    expect(event.type).toBe('finding:new');
    expect(event.finding).toEqual(finding);
  });

  it('pipelineStatus emits pipeline:status', () => {
    const emitter = new ScanEventEmitter();
    const listener = vi.fn();
    emitter.on(listener);
    emitter.pipelineStatus('running', 50);
    const event = listener.mock.calls[0][0];
    expect(event.type).toBe('pipeline:status');
    expect(event.message).toBe('running');
    expect(event.progress).toBe(50);
  });

  it('pipelineProgress emits pipeline:progress', () => {
    const emitter = new ScanEventEmitter();
    const listener = vi.fn();
    emitter.on(listener);
    emitter.pipelineProgress(75, 'scanning endpoints');
    const event = listener.mock.calls[0][0];
    expect(event.type).toBe('pipeline:progress');
    expect(event.progress).toBe(75);
    expect(event.message).toBe('scanning endpoints');
  });

  it('multiple listeners all receive events', () => {
    const emitter = new ScanEventEmitter();
    const a = vi.fn();
    const b = vi.fn();
    emitter.on(a);
    emitter.on(b);
    emitter.emit({ type: 'agent:start', agent: 'recon' });
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
  });

  it('emitted event carries all fields', () => {
    const emitter = new ScanEventEmitter();
    const listener = vi.fn();
    emitter.on(listener);
    emitter.emit({
      type: 'agent:start',
      agent: 'recon',
      tool: 'navigate',
      message: 'starting',
      thinking: 'planning...',
      progress: 10,
      details: { key: 'val' },
    });
    const event = listener.mock.calls[0][0];
    expect(event.agent).toBe('recon');
    expect(event.tool).toBe('navigate');
    expect(event.message).toBe('starting');
    expect(event.thinking).toBe('planning...');
    expect(event.progress).toBe(10);
    expect(event.details).toEqual({ key: 'val' });
  });

  it('emits finding:new without agent field', () => {
    const emitter = new ScanEventEmitter();
    const listener = vi.fn();
    emitter.on(listener);
    const finding: Finding = {
      id: 'F-002',
      title: 'XSS',
      description: 'desc',
      severity: 'medium',
      category: 'injection',
      confidence: 0.7,
      location: '/search',
      evidence: '<script>',
      remediation: 'encode output',
      agent: 'web',
      timestamp: new Date().toISOString(),
    };
    emitter.newFinding(finding);
    const event = listener.mock.calls[0][0];
    expect(event.type).toBe('finding:new');
    expect(event.agent).toBeUndefined();
    expect(event.finding).toBeDefined();
  });
});
