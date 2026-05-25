import chalk from 'chalk';
import fs from 'fs';
import path from 'path';
import os from 'os';

// ── Color tokens (consistent palette, inspired by theme systems) ──
export const colors = {
  brand: chalk.hex('#e8a84c'),
  info: chalk.cyan,
  success: chalk.green,
  warn: chalk.yellow,
  error: chalk.red,
  dim: chalk.dim,
  bold: chalk.bold,
  header: chalk.cyan,
  recording: chalk.red,
  highlight: chalk.hex('#e8a84c'),
};

const SPINNER_FRAMES = ['\u25D0', '\u25D3', '\u25D1', '\u25D2'];
const SPINNER_INTERVAL = 120;

type LogLevel = 'debug' | 'info' | 'success' | 'warn' | 'error';

export class Logger {
  // ── Debug log file ──
  private debugPath: string | null = null;
  private debugStream: fs.WriteStream | null = null;

  // ── Spinner state ──
  private spinnerTimer: ReturnType<typeof setInterval> | null = null;
  private spinnerFrame = 0;
  private spinnerLabel = '';
  private spinnerLineLen = 0;

  // ── Message dedup ──
  private messageSeen = new Set<string>();

  constructor(debugFile?: string) {
    if (debugFile) {
      this.debugPath = debugFile;
      fs.mkdirSync(path.dirname(debugFile), { recursive: true });
      this.debugStream = fs.createWriteStream(debugFile, { flags: 'a' });
    }
  }

  // ── Public display methods ──

  info(msg: string): void { this.emit('info', chalk.cyan(`  \u2139\uFE0F  ${msg}`)); }
  success(msg: string): void { this.emit('success', chalk.green(`  \u2713 ${msg}`)); }
  warn(msg: string): void { this.emit('warn', chalk.yellow(`  \u26A0 ${msg}`)); }
  error(msg: string): void { this.emit('error', chalk.red(`  \u2717 ${msg}`)); }
  dim(msg: string): void { this.emit('info', chalk.dim(`  ${msg}`)); }

  header(label: string, value: string, meta?: string): void {
    const m = meta ? chalk.dim(` (${meta})`) : '';
    this.emit('info', `\n  ${chalk.cyan(label)} ${chalk.bold(value)}${m}`);
  }

  step(label: string): void {
    this.emit('info', `  ${chalk.dim('\u2192')} ${chalk.dim(label)}...`);
  }

  divider(): void {
    this.emit('info', chalk.dim('  \u2500'.repeat(30)));
  }

  // ── In-place progress line (replaces same terminal line) ──

  progress(msg: string): void {
    const line = chalk.dim(`  ${msg}`);
    const clear = ' '.repeat(this.spinnerLineLen);
    process.stdout.write(`\r${clear}\r${line}`);
    this.spinnerLineLen = line.length;
  }

  progressDone(): void {
    process.stdout.write('\n');
    this.spinnerLineLen = 0;
  }

  // ── Spinner (runs until stopped, shows frame + label) ──

  spinStart(label: string): void {
    this.spinnerLabel = label;
    this.spinnerFrame = 0;
    if (this.spinnerTimer) clearInterval(this.spinnerTimer);
    this.spinnerTimer = setInterval(() => {
      const frame = SPINNER_FRAMES[this.spinnerFrame % SPINNER_FRAMES.length];
      const line = chalk.cyan(`  ${frame} ${chalk.dim(this.spinnerLabel)}`);
      const clear = ' '.repeat(this.spinnerLineLen);
      process.stdout.write(`\r${clear}\r${line}`);
      this.spinnerLineLen = line.length;
      this.spinnerFrame++;
    }, SPINNER_INTERVAL);
  }

  spinUpdate(label: string): void {
    this.spinnerLabel = label;
  }

  spinStop(): void {
    if (this.spinnerTimer) {
      clearInterval(this.spinnerTimer);
      this.spinnerTimer = null;
    }
    const clear = ' '.repeat(this.spinnerLineLen);
    process.stdout.write(`\r${clear}\r`);
    this.spinnerLineLen = 0;
  }

  // ── Deduplication (skip if same msg was already printed) ──

  once(msg: string, level: keyof Logger = 'dim'): boolean {
    if (this.messageSeen.has(msg)) return false;
    this.messageSeen.add(msg);
    (this[level] as (msg: string) => void)(msg);
    return true;
  }

  resetCache(): void { this.messageSeen.clear(); }

  // ── Internal ──

  private emit(level: LogLevel, formatted: string): void {
    console.log(formatted);
    if (this.debugStream) {
      this.debugStream.write(`[${level.toUpperCase()}] ${formatted.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '')}\n`);
    }
  }

  close(): void {
    this.spinStop();
    if (this.debugStream) {
      this.debugStream.end();
      this.debugStream = null;
    }
  }
}
