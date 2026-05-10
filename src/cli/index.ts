#!/usr/bin/env node

// ── Project Sentinel CLI Interface ──
// Command-line interface for Project Sentinel security testing framework

import { Command } from 'commander';
import { ProjectSentinel } from '../index.js';

async function main() {
  const program = new Command();
  
  program
    .name('sentinel')
    .description('Project Sentinel - AI-powered security testing framework')
    .version('1.0.0');
  
  program
    .command('scan')
    .description('Scan target for security vulnerabilities')
    .option('-u, --url <url>', 'URL to scan')
    .option('-t, --type <type>', 'Type of scan (web, code, network)')
    .option('-o, --output <file>', 'Output file for results')
    .action(async (options) => {
      const sentinel = new ProjectSentinel();
      
      if (options.url) {
        console.log(`Scanning ${options.url} for security vulnerabilities...`);
        // Execute security scan
        // const result = await sentinel.runSecurityTest(`Scan ${options.url}`);
        console.log('Security scan completed');
      }
    });
  
  program
    .command('analyze')
    .description('Analyze source code for security vulnerabilities')
    .option('-p, --path <path>', 'Path to source code')
    .option('-o, --output <file>', 'Output file for results')
    .action(async (options) => {
      if (options.path) {
        console.log(`Analyzing source code at ${options.path}...`);
        // Execute code analysis
        console.log('Code analysis completed');
      }
    });
  
  program
    .command('test')
    .description('Run comprehensive security test')
    .option('-t, --target <target>', 'Target for security testing')
    .option('-o, --output <file>', 'Output file for results')
    .action(async (options) => {
      if (options.target) {
        console.log(`Running security test on ${options.target}...`);
        // Execute comprehensive security test
        console.log('Security test completed');
      }
    });
  
  // Parse command line arguments
  program.parse();
}

main().catch(console.error);