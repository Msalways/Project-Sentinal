#!/usr/bin/env node

/**
 * 🚀 Project Sentinel - Step by Step Setup
 * 
 * This script guides you through:
 * 1. Getting API key
 * 2. Building project
 * 3. Running demo
 * 4. Running with HAR file
 */

import { createPipeline } from '../dist/pipeline/index.js';
import * as fs from 'fs';

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
};

function log(msg, color = 'reset') {
  console.log(`${colors[color]}${msg}${colors.reset}`);
}

function step(number, title) {
  console.log(`\n${colors.blue}${'═'.repeat(50)}${colors.reset}`);
  log(`Step ${number}: ${title}`, 'cyan');
  console.log(`${colors.blue}${'═'.repeat(50)}${colors.reset}\n`);
}

async function main() {
  log('🛡️  Project Sentinel - Setup Wizard', 'green');
  console.log('\n');

  // Step 1: Check API Key
  step(1, 'Get OpenRouter API Key');
  console.log('1. Go to: https://openrouter.ai/settings');
  console.log('2. Click "Create API Key"');
  console.log('3. Copy the key (starts with sk-or-)');
  console.log('\nSet it as environment variable:');
  console.log('  export OPENROUTER_API_KEY=sk-or-your-key\n');

  const apiKey = process.env.OPENROUTER_API_KEY;
  
  if (!apiKey) {
    log('❌ OPENROUTER_API_KEY not set', 'red');
    console.log('\nRun: export OPENROUTER_API_KEY=sk-or-your-key');
    process.exit(1);
  }
  log('✅ API key found', 'green');

  // Step 2: Build
  step(2, 'Build Project');
  console.log('Building...');
  
  try {
    const { execSync } = await import('child_process');
    execSync('npx tsc', { cwd: './', stdio: 'inherit' });
    log('✅ Build successful', 'green');
  } catch (e) {
    log('❌ Build failed', 'red');
    process.exit(1);
  }

  // Step 3: Run Demo
  step(3, 'Run Demo (No HAR file needed)');
  console.log('Running demo with sample data...\n');

  try {
    const pipeline = createPipeline({
      modelProvider: 'openrouter',
      apiKey: apiKey,
      modelId: 'mistralai/mistral-small', // Fast & cheap!
    });

    const result = await pipeline.runQuickDemo();

    if (result.success) {
      log('✅ Demo completed successfully!', 'green');
      console.log(`\n📊 Test Results:`);
      console.log(`   - Total: ${result.testResults?.total || 0}`);
      console.log(`   - Passed: ${result.testResults?.passed || 0}`);
      console.log(`   - Failed: ${result.testResults?.failed || 0}`);
      console.log(`   - Findings: ${result.testResults?.findings?.length || 0}`);
      console.log(`\n⏱️  Duration: ${(result.duration / 1000).toFixed(2)}s`);

      if (result.report) {
        const reportPath = './sentinel-demo-report.html';
        fs.writeFileSync(reportPath, result.report);
        log(`\n📄 Report saved to: ${reportPath}`, 'yellow');
      }
    } else {
      log(`❌ Demo failed: ${result.error}`, 'red');
    }
  } catch (e) {
    log(`❌ Error: ${e.message}`, 'red');
  }

  // Step 4: Next Steps
  step(4, 'Next Steps');
  console.log('📚 To run with your own HAR file:');
  console.log('   1. Export HAR from Chrome/Firefox (Network tab → Export)');
  console.log('   2. Run: node dist/cli/index.js run --file your.har --target https://api.example.com');
  console.log('\n📖 Full docs: see README.md and docs/ folder');
  console.log('\n✅ Setup complete!');

  process.exit(0);
}

main().catch(e => {
  log(`Fatal error: ${e.message}`, 'red');
  process.exit(1);
});