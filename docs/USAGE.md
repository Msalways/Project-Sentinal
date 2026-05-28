# Usage Guide

This guide covers practical usage of Ultimatrix for security testing.

## Table of Contents
1. [Basic Usage](#basic-usage)
2. [CLI Commands](#cli-commands)
3. [Programmatic API](#programmatic-api)
4. [HAR File Format](#har-file-format)
5. [Interpreting Results](#interpreting-results)
6. [Common Scenarios](#common-scenarios)

---

## Basic Usage

### 1. Quick Demo

```bash
# Set API key
export OPENAI_API_KEY=sk-...

# Run demo with sample data
node dist/cli/index.js demo
```

This generates a sample security report without needing a HAR file.

### 2. Run with HAR File

```bash
# Export your browser session to HAR (Chrome DevTools → Network → Export HAR)
# Then run:

node dist/cli/index.js run \
  --file /path/to/your-session.har \
  --target https://api.yourapp.com
```

### 3. Generate Report

```bash
# From JSON results
node dist/cli/index.js report \
  --input results.json \
  --output report.html
```

---

## CLI Commands

### `sentinel run`

Main command for security scanning.

```bash
# Basic usage
sentinel run --file sample.har

# Full options
sentinel run \
  --file sample.har \                    # HAR file path (required)
  --target https://api.example.com \   # Target URL
  --output report.html \                # Output file
  --format html \                       # html, json, markdown
  --api-key sk-... \                    # API key (or use env)
  --model gpt-4o-mini                   # Model to use
```

### `sentinel demo`

Run with sample data for demonstration.

```bash
sentinel demo --output demo.html --format html
```

### `sentinel test`

Note: Live URL testing requires a HAR file. This command guides users.

```bash
sentinel test --target https://example.com
# Output: "Use sentinel run --file <har> --target <url>"
```

### `sentinel report`

Generate reports from previous results.

```bash
sentinel report --input results.json --format html
```

### `sentinel tools`

List available tools and capabilities.

```bash
sentinel tools
```

---

## Programmatic API

### Import the library

```typescript
import { 
  createPipeline,
  createOpenAIModel,
  createTestRunner,
  createReportGenerator,
} from './dist/index.js';
```

### Simple Pipeline

```typescript
const pipeline = createPipeline({
  apiKey: process.env.OPENAI_API_KEY,
});

const result = await pipeline.run({
  harFile: './sample.har',
  targetUrl: 'https://api.example.com',
});

console.log(result.report);  // HTML report
```

### Custom Agent Workflow

```typescript
import { 
  createOpenAIModel,
  createSemanticLinker,
  createAuthAuditor,
  createTestCaseGenerator,
  createTestRunner,
  createReportGenerator,
  loadHAR,
} from './dist/index.js';

// 1. Setup
const model = createOpenAIModel({ apiKey: process.env.OPENAI_API_KEY });

// 2. Parse HAR
const parsed = loadHAR('./sample.har');

// 3. Build dependency graph
const linker = createSemanticLinker({ model });
const graphResult = await linker.analyze(JSON.stringify({ 
  log: { entries: parsed.entries } 
}));

// 4. Audit authentication
const auditor = createAuthAuditor({ model });
const endpoints = graphResult.graph.nodes
  .filter(n => n.location === 'request')
  .map(n => ({ url: `${n.service}/${n.field}`, method: 'GET', headers: {} }));
const authResult = await auditor.auditEndpoints(endpoints);

// 5. Generate tests
const generator = createTestCaseGenerator({ model });
const testResult = await generator.generateTests(
  graphResult.graph,
  { endpoints: authResult.endpoints, issues: authResult.criticalIssues }
);

// 6. Run tests
const runner = createTestRunner({ headless: true });
const testRunResult = await runner.runTests(
  testResult.testCases,
  'https://api.example.com'
);
await runner.cleanup();

// 7. Generate report
const reportGen = createReportGenerator({ targetUrl: 'https://api.example.com' });
const report = reportGen.generateHTML(
  graphResult.graph,
  { endpoints: authResult.endpoints },
  testRunResult
);

// Save report
import * as fs from 'fs';
fs.writeFileSync('./report.html', report);
```

---

## HAR File Format

### What is HAR?

HAR (HTTP Archive) captures browser network traffic including:
- All HTTP requests/responses
- Headers, cookies, body content
- Timing information

### How to Export HAR

#### Chrome
1. Open DevTools (F12)
2. Go to Network tab
3. Perform actions you want to capture
4. Click "Export HAR" (down arrow icon)

#### Firefox
1. Open DevTools (F12)
2. Go to Network tab
3. Perform actions
4. Click Settings gear → Save All As HAR

### Sample HAR Structure

```json
{
  "log": {
    "version": "1.2",
    "entries": [
      {
        "startedDateTime": "2026-05-20T10:00:00.000Z",
        "time": 245,
        "request": {
          "method": "POST",
          "url": "https://api.example.com/auth/login",
          "headers": [
            { "name": "Content-Type", "value": "application/json" }
          ],
          "postData": {
            "text": "{\"email\":\"user@example.com\"}"
          }
        },
        "response": {
          "status": 200,
          "content": {
            "text": "{\"token\":\"abc123\"}"
          }
        }
      }
    ]
  }
}
```

---

## Interpreting Results

### Risk Levels

| Level | Score | Meaning |
|-------|-------|---------|
| 🔴 Critical | 50-100 | Immediate action required |
| 🟠 High | 30-49 | Urgent attention needed |
| 🟡 Medium | 10-29 | Review and remediate |
| 🟢 Low | 1-9 | Minor improvements |
| ✅ Safe | 0 | No issues found |

### Finding Categories

1. **Broken Access Control** - Unauthorized access to resources
2. **IDOR** - Insecure Direct Object Reference
3. **Authentication Bypass** - Weak auth mechanisms
4. **Data Exposure** - Sensitive data in responses
5. **Injection** - SQL, XSS, command injection

### Report Sections

1. **Risk Score** - Overall security posture (0-100)
2. **Test Summary** - Total tests run, passed, failed
3. **Findings** - Detailed security issues with:
   - Severity (critical/high/medium/low)
   - Description
   - Evidence
   - Recommendation

---

## Common Scenarios

### Scenario 1: Testing API Authentication

```bash
# 1. Login to your app in browser
# 2. Export HAR with login + some API calls
# 3. Run scan

sentinel run --file session.har --target https://api.yourapp.com
```

### Scenario 2: Finding Data Exposures

The sample HAR includes responses with:
- Hardcoded passwords
- API keys in responses
- PII (SSN, credit cards)

Run the demo to see how these are detected:

```bash
sentinel demo
```

### Scenario 3: Multi-step Workflow Testing

```typescript
// Generate tests for complex workflows
const result = await pipeline.run({
  harFile: './workflow.har',
  targetUrl: 'https://app.example.com',
});
```

### Scenario 4: Custom Test Cases

```typescript
// Add custom test cases to the generation
const generator = createTestCaseGenerator({ model });

// Custom test case format
const customTest = {
  id: 'custom-1',
  category: 'injection',
  name: 'SQL Injection Test',
  targetEndpoint: '/api/users',
  method: 'GET',
  modifiedQuery: "'; DROP TABLE users;--",
  successCriteria: 'Error or unexpected response',
};
```

---

## Troubleshooting

### "No API key provided"

```bash
export OPENAI_API_KEY=sk-your-key
```

### "HAR file not found"

```bash
# Check file path
ls -la sample.har
```

### "Timeout during test execution"

```typescript
// Increase timeout
const runner = createTestRunner({ 
  timeout: 60000,  // 60 seconds
});
```

### "Browser not launching"

```bash
# Install Playwright browsers
npx playwright install chromium
```

---

## Next Steps

- Review the [Architecture Documentation](ARCHITECTURE.md)
- Check out [API Reference](API.md)
- See [Contributing Guide](CONTRIBUTING.md)