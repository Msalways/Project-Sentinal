import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Logger } from '../../src/cli/logger';

describe('Logger', () => {
  let logger: Logger;
  let stdoutSpy: ReturnType<typeof vi.spyOn>;
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    logger = new Logger();
  });

  afterEach(() => {
    stdoutSpy.mockRestore();
    consoleLogSpy.mockRestore();
    logger.close();
  });

  describe('log levels', () => {
    it('info() writes to console.log with message', () => {
      logger.info('hello info');
      expect(consoleLogSpy).toHaveBeenCalledTimes(1);
      expect(consoleLogSpy.mock.calls[0][0]).toContain('hello info');
    });

    it('success() writes to console.log with message', () => {
      logger.success('task done');
      expect(consoleLogSpy).toHaveBeenCalledTimes(1);
      expect(consoleLogSpy.mock.calls[0][0]).toContain('task done');
    });

    it('warn() writes to console.log with message', () => {
      logger.warn('careful');
      expect(consoleLogSpy).toHaveBeenCalledTimes(1);
      expect(consoleLogSpy.mock.calls[0][0]).toContain('careful');
    });

    it('error() writes to console.log with message', () => {
      logger.error('failed');
      expect(consoleLogSpy).toHaveBeenCalledTimes(1);
      expect(consoleLogSpy.mock.calls[0][0]).toContain('failed');
    });

    it('dim() writes to console.log with message', () => {
      logger.dim('subtle text');
      expect(consoleLogSpy).toHaveBeenCalledTimes(1);
      expect(consoleLogSpy.mock.calls[0][0]).toContain('subtle text');
    });
  });

  describe('header / step / divider', () => {
    it('header() writes label, value, and optional meta', () => {
      logger.header('Target:', 'https://example.com');
      const output = consoleLogSpy.mock.calls[0][0];
      expect(output).toContain('Target:');
      expect(output).toContain('https://example.com');
    });

    it('header() includes meta when provided', () => {
      logger.header('Target:', 'https://example.com', 'production');
      expect(consoleLogSpy.mock.calls[0][0]).toContain('production');
    });

    it('step() writes message with arrow', () => {
      logger.step('Scanning hosts');
      expect(consoleLogSpy.mock.calls[0][0]).toContain('Scanning hosts');
    });

    it('divider() writes a line', () => {
      logger.divider();
      expect(consoleLogSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('progress lines', () => {
    it('progress() writes to stdout with message', () => {
      logger.progress('Loading...');
      expect(stdoutSpy).toHaveBeenCalled();
      const call = stdoutSpy.mock.calls.find((c) => c[0].includes('Loading...'));
      expect(call).toBeTruthy();
    });

    it('progressDone() writes a newline', () => {
      logger.progress('Working');
      logger.progressDone();
      expect(stdoutSpy.mock.calls.some((c) => c[0] === '\n')).toBe(true);
    });
  });

  describe('spinner', () => {
    it('spinStart writes frames to stdout via interval callback', () => {
      vi.useFakeTimers();
      logger.spinStart('Processing');
      vi.advanceTimersByTime(200);
      expect(stdoutSpy).toHaveBeenCalled();
      logger.spinStop();
      vi.useRealTimers();
    });

    it('spinUpdate changes the label', () => {
      vi.useFakeTimers();
      logger.spinStart('First');
      logger.spinUpdate('Second');
      logger.spinStop();
      vi.useRealTimers();
    });

    it('spinStop clears the line', () => {
      vi.useFakeTimers();
      logger.spinStart('Test');
      logger.spinStop();
      expect(stdoutSpy).toHaveBeenCalled();
      vi.useRealTimers();
    });
  });

  describe('deduplication', () => {
    it('once() returns true and prints on first call', () => {
      const result = logger.once('unique message');
      expect(result).toBe(true);
      expect(consoleLogSpy).toHaveBeenCalledTimes(1);
    });

    it('once() returns false and does not print on duplicate', () => {
      logger.once('unique message');
      const result = logger.once('unique message');
      expect(result).toBe(false);
      expect(consoleLogSpy).toHaveBeenCalledTimes(1);
    });

    it('once() uses specified log level', () => {
      logger.once('error msg', 'error');
      expect(consoleLogSpy.mock.calls[0][0]).toContain('error msg');
    });

    it('resetCache() clears dedup set so once() prints again', () => {
      logger.once('dedup');
      expect(logger.once('dedup')).toBe(false);
      logger.resetCache();
      expect(logger.once('dedup')).toBe(true);
    });
  });
});
