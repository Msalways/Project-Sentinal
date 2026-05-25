import { createSentinel } from '../src/index';
import fs from 'fs';

const OUTPUT = './e2e-learn-output';

async function main() {
  const sentinel = createSentinel({
    provider: 'mock',
    apiKey: 'mock',
    headless: true,
  });

  console.log('Starting learn pipeline...');
  const result = await sentinel.learn('https://example.com', OUTPUT);

  // Verify outputs
  const harExists = fs.existsSync(result.harPath);
  const contextExists = fs.existsSync(result.appContextPath);
  const testsDirExists = fs.existsSync(result.testsDir);
  const endpointsExists = fs.existsSync(`${OUTPUT}/endpoints-summary.json`);

  console.log(`\n=== Results ===`);
  console.log(`HAR:           ${result.harPath}  ${harExists ? '✓' : '✗'}`);
  console.log(`App Context:   ${result.appContextPath}  ${contextExists ? '✓' : '✗'}`);
  console.log(`Tests Dir:     ${result.testsDir}/  ${testsDirExists ? '✓' : '✗'}`);
  console.log(`Endpoints:     ${OUTPUT}/endpoints-summary.json  ${endpointsExists ? '✓' : '✗'}`);

  if (harExists) {
    const har = JSON.parse(fs.readFileSync(result.harPath, 'utf-8'));
    console.log(`  HAR entries: ${har.log?.entries?.length || 0}`);
  }

  if (endpointsExists) {
    const eps = JSON.parse(fs.readFileSync(`${OUTPUT}/endpoints-summary.json`, 'utf-8'));
    console.log(`  Filtered endpoints: ${eps.length}`);
  }

  if (testsDirExists) {
    const files = fs.readdirSync(result.testsDir);
    console.log(`  Test files: ${files.length}`);
    for (const f of files) console.log(`    - ${f}`);
  }

  const allOk = harExists && contextExists && testsDirExists;
  if (!allOk) {
    console.error('\nSome outputs missing!');
    process.exit(1);
  }

  console.log('\n✓ E2E learn pipeline passed');
}

main().catch((err) => {
  console.error('E2E test failed:', err);
  process.exit(1);
});
