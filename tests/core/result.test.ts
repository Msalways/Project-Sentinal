import { describe, it, expect } from 'vitest';
import { ok, err, asyncResult } from '../../src/core/result';

describe('ok', () => {
  it('creates an Ok result', () => {
    const r = ok(42);
    expect(r.ok).toBe(true);
  });

  it('wraps a value', () => {
    const r = ok('hello');
    expect(r.unwrap()).toBe('hello');
  });

  it('maps over the value', () => {
    const r = ok(5).map((x) => x * 2);
    expect(r.unwrap()).toBe(10);
  });

  it('flatMaps over the value', () => {
    const r = ok(3).flatMap((x) => ok(x + 1));
    expect(r.unwrap()).toBe(4);
  });

  it('unwrapOr returns the value', () => {
    const r = ok('actual');
    expect(r.unwrapOr('fallback')).toBe('actual');
  });

  it('expect returns the value', () => {
    const r = ok('value');
    expect(r.expect('should not throw')).toBe('value');
  });

  it('map preserves Ok', () => {
    const r = ok(10).map((x) => x.toString());
    expect(r.ok).toBe(true);
    expect(r.unwrap()).toBe('10');
  });

  it('flatMap can chain ok results', () => {
    const r = ok(1).flatMap((a) => ok(a + 2)).flatMap((b) => ok(b * 3));
    expect(r.unwrap()).toBe(9);
  });
});

describe('err', () => {
  it('creates an Err result', () => {
    const r = err('oops');
    expect(r.ok).toBe(false);
  });

  it('stores the error', () => {
    const r = err(new Error('fail'));
    expect(r.error.message).toBe('fail');
  });

  it('map returns Err', () => {
    const r = err('error').map((x: number) => x * 2);
    expect(r.ok).toBe(false);
    expect(r.error).toBe('error');
  });

  it('flatMap returns Err', () => {
    const r = err('error').flatMap((x: number) => ok(x + 1));
    expect(r.ok).toBe(false);
    expect(r.error).toBe('error');
  });

  it('unwrap throws', () => {
    const r = err('broken');
    expect(() => r.unwrap()).toThrow('Called unwrap on an Err: broken');
  });

  it('unwrapOr returns fallback', () => {
    const r = err('broken');
    expect(r.unwrapOr('fallback')).toBe('fallback');
  });

  it('expect throws with message', () => {
    const r = err(new Error('db failure'));
    expect(() => r.expect('Config error')).toThrow('Config error: Error: db failure');
  });

  it('works with string error', () => {
    const r = err('string error');
    expect(() => r.expect('msg')).toThrow('msg: string error');
  });
});

describe('asyncResult', () => {
  it('wraps a successful async function', async () => {
    const r = await asyncResult(() => Promise.resolve(99));
    expect(r.ok).toBe(true);
    expect(r.unwrap()).toBe(99);
  });

  it('wraps a failed async function as Err', async () => {
    const r = await asyncResult(() => Promise.reject(new Error('async fail')));
    expect(r.ok).toBe(false);
    expect(r.error.message).toBe('async fail');
  });

  it('preserves value type through generic', async () => {
    const r = await asyncResult<string>(() => Promise.resolve('data'));
    expect(r.ok).toBe(true);
    expect(r.unwrap()).toBe('data');
  });

  it('handles thrown values as errors', async () => {
    const r = await asyncResult(() => {
      throw new Error('sync throw');
    });
    expect(r.ok).toBe(false);
    expect(r.error.message).toBe('sync throw');
  });

  it('chains after success', async () => {
    const r = await asyncResult(() => Promise.resolve(5));
    const mapped = r.map((x) => x * 10);
    expect(mapped.unwrap()).toBe(50);
  });

  it('short-circuits map after failure', async () => {
    const r = await asyncResult<number>(() => Promise.reject(new Error('nope')));
    const mapped = r.map((x) => x * 10);
    expect(mapped.ok).toBe(false);
    expect(mapped.error.message).toBe('nope');
  });

  it('works with void-returning functions', async () => {
    const r = await asyncResult<void>(() => Promise.resolve());
    expect(r.ok).toBe(true);
  });
});
