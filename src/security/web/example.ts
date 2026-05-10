// ── Web Security Testing Framework Usage Example ──
// Example of how to use the Project Sentinel web security testing framework

import { WebSecurityTester, VulnerabilityScanner } from '../security/web/index.js';

// Example usage of the web security testing framework
async function exampleWebSecurityTest() {
  // Initialize the web security tester
  const webSecurityTester = new WebSecurityTester({
    testAuthentication: true,
    scanVulnerabilities: true,
    timeout: 30000,
  });

  // Example vulnerability scanner
  const vulnerabilityScanner = new VulnerabilityScanner();

  // Test a single URL
  try {
    const result = await webSecurityTester.testUrl('https://example.com');
    console.log('Web security test completed:', result);
  } catch (error) {
    console.error('Web security test failed:', error);
  }
}

// Run the example
// exampleWebSecurityTest();