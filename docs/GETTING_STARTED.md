# Getting Started with Project Sentinel

**AI-powered security team-in-a-box.** Learn your app, generate tests, and find vulnerabilities autonomously.

---

## Table of Contents

1. [What is Project Sentinel?](#what-is-project-sentinel)
2. [Installation](#installation)
3. [Quick Start — 60 Seconds](#quick-start--60-seconds)
4. [Configure Your L
 Provider](#configure-your-llm-provider)
5. [Learn Your Application](#learn-your-application)
6. [Run a Security Scan](#run-a-security-scan)
7. [Working with HAR Files](#working-with-har-files)
8. [Generate Playwright Tests](#generate-playwright-tests)
9. [CLI Command Reference](#cli-command-reference)
10. [SDK Usage](#sdk-usage)
11. [Advanced: Scenario Manifest](#advanced-scenario-manifest)
12. [Adding Custom Tools](#adding-custom-tools)
13. [Adding Custom Agents](#adding-custom-agents)
14. [Troubleshooting](#troubleshooting)

---

## What is Project Sentinel?

Project Sentinel is an AI-powered security testing platform that works in three phases:

| Phase | What It Does | Output |
|-------|-------------|--------|
| **Learn** | Records your app's real workflows via browser | HAR file, Playwright tests, scenario manifest |
| **Scan** | Spawns a team of AI security agents | Vulnerability report with proof-of-concepts |
| **Report** | Correlates findings, scores risk, generates output | HTML dashboard, JSON, Markdown |

### The Agent Team

Sentinel coordinates 5 specialized security agents:

| Agent | Specialty | What It Tests |
|-------|-----------|---------------|
| **recon-agent** | Attack surface mapping | Endpoints, technologies, exposed data |
| **web-agent** | Browser-based testing | XSS, SQLi, CSRF, auth bypass |
| **code-agent** | Static code analysis | Injection flaws, secrets, weak crypto |
| **network-agent** | Infrastructure security | Open ports, SSL, missing headers |
| **exploit-agent** | Proof-of-concept validation | Confirms findings, kills false positives |

---

## Installation

### Prerequisites

- **Node.js 20+** — [Download](https://nodejs.org/)
- **npm** — comes with Node.js

### Install

```bash
# Clone the repository
git clone https://github.com/your-org/project-sentinal.git
cd project-sentinal

# Install dependencies
npm install
```

That's it. No build step needed — Sentinel runs directly with `tsx`.

---

## Quick Start — 60 Seconds

Run the demo to see Sentinel in action. No API key required.

```bash
npx tsx src/cli/index.ts demo
```

**Output:**

```
🛡️  Project Sentinel - Demo Mode

📊 Demo Results:
   Risk Score: 86/100 (CRITICAL)
   Findings: 6
   Agents Used: recon, web, code, network, exploit, report

🔍 Findings:
   [CRITICAL] SQL injection in login form
   [HIGH] IDOR in user profile API
   [HIGH] Reflected XSS in search parameter
   [HIGH] Hardcoded API key in source code
   [MEDIUM] Missing CSRF protection
   [MEDIUM] Missing HSTS header

📄 Report saved: sentinel-report-1779273143570.html
```

Open the generated HTML file in your browser to see the full security dashboard.

---

## Configure Your LLM Provider

Sentinel supports 4 LLM providers. Choose one based on your needs:

| Provider | Best For | Cost | Setup |
|----------|----------|------|-------|
| **Azure OpenAI** | Enterprise, hackathon submissions | Pay-per-use | Azure portal |
| **OpenAI** | Quick start, familiar API | Pay-per-use | OpenAI dashboard |
| **OpenRouter** | Multi-model flexibility | Pay-per-use | OpenRouter dashboard |
| **Anthropic** | Claude models, reasoning | Pay-per-use | Anthropic console |

### Option 1: Azure OpenAI (Recommended for Hackathon)

**Step 1:** Create an Azure OpenAI resource
1. Go to [Azure Portal](https://portal.azure.com/)
2. Search for "Azure AI Foundry" or "Azure OpenAI"
3. Create a new resource (select `gpt-4o` model)
4. Note your **Endpoint** and **API Key**

**Step 2:** Configure Sentinel

```bash
npx tsx src/cli/index.ts init \
  --provider azure-openai \
  --endpoint https://your-resource.openai.azure.com
```

**Step 3:** Set your API key

```bash
# Windows PowerShell
$env:AZURE_OPENAI_API_KEY = "your-key-here"

# Linux/macOS
export AZURE_OPENAI_API_KEY="your-key-here"
```

### Option 2: OpenAI

```bash
# Get key from https://platform.openai.com/api-keys
export OPENAI_API_KEY="sk-..."

npx tsx src/cli/index.ts init --provider openai
```

### Option 3: OpenRouter (Access 100+ models)

```bash
# Get key from https://openrouter.ai/settings
export OPENROUTER_API_KEY="sk-or-..."

npx tsx src/cli/index.ts init --provider openrouter --model openai/gpt-4o
```

### Option 4: Anthropic (Claude)

```bash
# Get key from https://console.anthropic.com/settings/keys
export ANTHROPIC_API_KEY="sk-ant-..."

npx tsx src/cli/index.ts init --provider anthropic --model claude-sonnet-4-20250514
```

### Verify Your Setup

```bash
# Check available providers
npx tsx src/cli/index.ts providers
```

**Output:**
```
🧠 Available LLM Providers:

  azure-openai (Azure OpenAI)
    Required env: AZURE_OPENAI_API_KEY, AZURE_OPENAI_ENDPOINT

  openai (OpenAI)
    Required env: OPENAI_API_KEY

  openrouter (OpenRouter)
    Required env: OPENROUTER_API_KEY

  anthropic (Anthropic)
    Required env: ANTHROPIC_API_KEY
```

---

## Learn Your Application

The **learn** mode opens a browser and records your workflows. This is how Sentinel understands your app.

```bash
npx tsx src/cli/index.ts learn https://your-app.com --output ./my-project
```

**What happens:**
1. A browser window opens
2. Navigate through your app — login, browse, checkout, admin panel, etc.
3. Sentinel records every network request, DOM state, and user action
4. Close the browser when done

**Generated files:**
```
my-project/
├── session.har              # Network traffic capture
├── sentinel.yaml            # Auto-generated scenario manifest
└── tests/
    ├── login.spec.ts        # Playwright test - happy path
    ├── login-security.spec.ts # Playwright test - security variants
    ├── checkout.spec.ts
    ├── checkout-security.spec.ts
    └── fixtures/
        └── auth.ts          # Multi-role auth fixtures
```

### What Gets Captured

| Captured | Used For |
|----------|----------|
| HTTP requests/responses | Endpoint mapping, auth analysis |
| Auth tokens & cookies | Role detection, session analysis |
| Form submissions | Input point identification |
| API responses | Sensitive data exposure detection |
| Page structure | DOM-based vulnerability testing |

---

## Run a Security Scan

### Scan from a Project (Learn Output)

```bash
npx tsx src/cli/index.ts scan --project ./my-project
```

### Scan from a HAR File

```bash
npx tsx src/cli/index.ts scan \
  --har ./session.har \
  --target https://your-app.com
```

### Scan with a Scenario Manifest

```bash
npx tsx src/cli/index.ts scan \
  --scenario ./sentinel.yaml \
  --target https://your-app.com
```

### CI/CD Mode (Blocks on Critical Vulns)

```bash
npx tsx src/cli/index.ts scan \
  --project ./my-project \
  --ci \
  --fail-on critical
```

Returns exit code `1` if critical vulnerabilities are found — perfect for GitHub Actions.

### Output

```
🛡️  Starting security scan...
   Target: https://your-app.com
   Provider: azure-openai
   Model: gpt-4o

📊 Results:
   Risk Score: 72/100 (CRITICAL)
   Findings: 8
   Critical: 2
   High: 3
   Medium: 2
   Low: 1

🔍 Top Findings:
   [CRITICAL] SQL injection in login form
     Location: https://your-app.com/api/login
   [HIGH] IDOR in user profile API
     Location: https://your-app.com/api/users/{id}
   [HIGH] Reflected XSS in search parameter
     Location: https://your-app.com/api/products?search=

📄 Report saved: sentinel-report-1779273143570.html
```

### Report Formats

```bash
# HTML (default) — visual dashboard
npx tsx src/cli/index.ts scan --project ./my-project --format html

# JSON — for CI/CD pipelines
npx tsx src/cli/index.ts scan --project ./my-project --format json

# Markdown — for issue trackers
npx tsx src/cli/index.ts scan --project ./my-project --format markdown
```

---

## Working with HAR Files

### What is a HAR File?

A HAR (HTTP Archive) file is a JSON record of all network requests made by a browser. It contains URLs, headers, request bodies, and responses.

### Export a HAR File from Your Browser

**Chrome/Edge:**
1. Press `F12` to open DevTools
2. Go to the **Network** tab
3. Check **"Preserve log"**
4. Navigate through your app (login, browse, etc.)
5. Click the **Export HAR** icon (⬇️ down arrow)
6. Save as `session.har`

**Firefox:**
1. Press `F12` → **Network** tab
2. Navigate through your app
3. Right-click any request → **"Save All As HAR"**

### Analyze a HAR File

```bash
npx tsx src/cli/index.ts har session.har
```

**Output:**
```
📊 HAR Analysis:
   Unique URLs: 47
   Endpoints: 47
   Auth endpoints: 32
   Unauthenticated: 15
   Sensitive data: 9

⚠️  Sensitive Data Found:
   [email] https://app.com/api/users - user@test.com
   [jwt] https://app.com/api/login - eyJhbGci...
   [ssn] https://app.com/api/users - 123-45-6789
```

### JSON Output (for scripts)

```bash
npx tsx src/cli/index.ts har session.har --format json
```

---

## Generate Playwright Tests

Sentinel auto-generates Playwright tests from your scenario manifest:

```bash
npx tsx src/cli/index.ts test https://your-app.com \
  --manifest ./sentinel.yaml \
  --output ./tests
```

**Generated tests include:**

- **Happy path tests** — verify workflows work correctly
- **Security tests** — SQLi, XSS, IDOR, brute force, auth bypass variants
- **Auth fixtures** — multi-role login helpers

### Example: Generated Login Test

```typescript
// tests/login.spec.ts
import { test, expect } from '@playwright/test';

test.describe('Login Flow - Happy Path', () => {
  test.step('valid credentials → 200 + JWT token', async () => {
    await page.goto('https://your-app.com/login');
    await page.fill('#email', 'user@test.com');
    await page.fill('#password', 'correct-password');
    await page.click('[type="submit"]');
    await expect(page).toHaveURL(/dashboard/);
  });
});

// tests/login-security.spec.ts
test.describe('Login Flow - Security Tests', () => {
  test('SQL injection in username → blocked', async ({ page }) => {
    await page.goto('https://your-app.com/login');
    await page.fill('#email', "' OR 1=1--");
    await page.fill('#password', 'anything');
    await page.click('[type="submit"]');
    await expect(page).toHaveURL(/login/);
    await expect(page.locator('.error')).toBeVisible();
  });

  test('brute force protection → rate limited', async ({ page }) => {
    for (let i = 0; i < 10; i++) {
      await page.goto('https://your-app.com/login');
      await page.fill('#email', 'user@test.com');
      await page.fill('#password', `wrong-${i}`);
      await page.click('[type="submit"]');
    }
    await expect(page.locator('.rate-limit')).toBeVisible();
  });
});
```

---

## CLI Command Reference

| Command | Description | Example |
|---------|-------------|---------|
| `init` | Initialize configuration | `sentinel init --provider azure-openai` |
| `learn` | Record workflows, generate tests | `sentinel learn https://app.com -o ./project` |
| `scan` | Run security assessment | `sentinel scan --project ./project` |
| `demo` | Run demo (no API key) | `sentinel demo` |
| `test` | Generate Playwright tests | `sentinel test https://app.com -m manifest.yaml` |
| `har` | Analyze HAR file | `sentinel har session.har` |
| `report` | Generate report from JSON | `sentinel report results.json --format html` |
| `tools` | List available security tools | `sentinel tools` |
| `agents` | List available security agents | `sentinel agents` |
| `providers` | List LLM providers | `sentinel providers` |

### Global Options

| Option | Description |
|--------|-------------|
| `--provider <name>` | LLM provider (azure-openai, openai, openrouter, anthropic) |
| `--model <id>` | Model ID (e.g., gpt-4o, claude-sonnet-4-20250514) |
| `--endpoint <url>` | Azure OpenAI endpoint |
| `--output <dir>` | Output directory |
| `--format <fmt>` | Output format (html, json, markdown) |
| `--headless` | Run browser headless |
| `--ci` | CI/CD mode (exit 1 on critical vulns) |

---

## SDK Usage

### Basic Scan

```typescript
import { createSentinel } from 'project-sentinal';

const sentinel = createSentinel({
  provider: 'azure-openai',
  apiKey: process.env.AZURE_OPENAI_API_KEY,
  azureEndpoint: process.env.AZURE_OPENAI_ENDPOINT,
});

const result = await sentinel.scan({
  url: 'https://your-app.com',
  harPath: './session.har',
});

console.log(`Risk: ${result.riskScore}/100 (${result.riskLevel})`);
console.log(`Findings: ${result.findings.length}`);

for (const finding of result.findings) {
  console.log(`[${finding.severity.toUpperCase()}] ${finding.title}`);
  console.log(`  Location: ${finding.location}`);
  console.log(`  Fix: ${finding.remediation}`);
}
```

### Learn Mode

```typescript
const learned = await sentinel.learn('https://your-app.com', './project');

console.log('HAR:', learned.harPath);
console.log('Tests:', learned.testsDir);
console.log('Manifest:', learned.manifestPath);
```

### Generate Report

```typescript
const reportPath = sentinel.generateReport(result, './reports', 'html');
// → ./reports/sentinel-report-1234567890.html
```

### Generate Tests

```typescript
const files = sentinel.generateTests(
  'https://your-app.com',
  './sentinel.yaml',
  './tests'
);
// → ['./tests/login.spec.ts', './tests/login-security.spec.ts', ...]
```

### Demo Mode

```typescript
const result = await sentinel.demo();
// No API key needed — uses mock responses
```

---

## Advanced: Scenario Manifest

The scenario manifest tells Sentinel **what to test** — not just the endpoints, but the expected behavior.

### Create `sentinel.yaml`

```yaml
target: https://shop.example.com

roles:
  - name: customer
    credentials: { username: "user@test.com", password: "pass123" }
    har: sessions/customer.har

  - name: admin
    credentials: { username: "admin@shop.com", password: "admin123" }
    har: sessions/admin.har

workflows:
  - name: "Login Flow"
    har: sessions/login.har
    test:
      happy:
        - "valid credentials → 200 + JWT token"
        - "valid credentials + MFA → 200 + JWT + MFA challenge"
      sad:
        - "wrong password → 401 + rate limit header"
        - "locked account → 403 + lockout message"
        - "SQL injection in username → blocked"
        - "empty password → 400 + validation error"

  - name: "Checkout Flow"
    har: sessions/checkout.har
    test:
      happy:
        - "valid card → payment success → order created"
        - "coupon code → discount applied"
      sad:
        - "expired card → payment declined"
        - "tampered price in request → server validates"
        - "double-submit order → idempotent"

  - name: "Admin Panel"
    har: sessions/admin.har
    test:
      happy:
        - "admin creates user → 201"
        - "admin exports data → 200 + CSV"
      sad:
        - "customer accesses /admin → 403"
        - "customer tries admin API with their JWT → 403"
        - "XSS in user name field → sanitized"
```

### How Sentinel Uses It

1. **Happy paths** → Playwright tests verify workflows work
2. **Sad paths** → Security tests verify attacks are blocked
3. **Roles** → Multi-role testing (privilege escalation, IDOR)
4. **HAR files** → Real traffic data for endpoint mapping

---

## Adding Custom Tools

Sentinel's tool registry makes it easy to add new security capabilities.

### Add a Tool

Edit `src/tools/tool-registry.ts`:

```typescript
import { z } from 'zod';
import { tool } from '@langchain/core/tools';

toolRegistry.register({
  name: 'ssl_check',
  category: 'network',
  description: 'Check SSL/TLS certificate validity and configuration',
  tags: ['ssl', 'tls', 'certificate', 'network'],
  factory: () => tool(async (input) => {
    const { url } = z.object({ url: z.string() }).parse(input);
    // Your implementation here
    return `SSL check results for ${url}...`;
  }, {
    name: 'ssl_check',
    description: 'Check SSL/TLS certificate',
    schema: z.object({ url: z.string() }),
  }),
});
```

### Use It in an Agent

Edit `src/agents/agent-registry.ts`:

```typescript
agentRegistry.register({
  name: 'ssl-agent',
  description: 'SSL/TLS certificate analysis',
  systemPrompt: 'You are an SSL/TLS specialist...',
  requiredTools: ['ssl_check'],
  tags: ['ssl', 'tls'],
});
```

That's it. The agent will automatically get the tool, and the CLI will list both.

---

## Adding Custom Agents

```typescript
// In src/agents/agent-registry.ts

agentRegistry.register({
  name: 'api-agent',
  description: 'API security testing — rate limits, pagination, versioning',
  systemPrompt: `You are an API security specialist.

Your role:
1. Test API rate limiting and throttling
2. Check for pagination vulnerabilities
3. Verify API versioning security
4. Test for mass assignment vulnerabilities

Report findings in this format:
1. [Finding title] - Severity: [critical/high/medium/low]
   Description: [what you found]
   Location: [endpoint]
   Evidence: [proof]
   Remediation: [fix]`,
  requiredTools: ['http_request', 'header_analyze'],
  tags: ['api', 'rate-limit', 'pagination'],
});
```

The main agent will automatically discover and use your new agent when relevant.

---

## Troubleshooting

### "API key not found"

```bash
# Check which env var your provider needs
npx tsx src/cli/index.ts providers

# Set the correct one
export AZURE_OPENAI_API_KEY="your-key"
# or
export OPENAI_API_KEY="sk-..."
```

### "Azure OpenAI requires azureEndpoint"

```bash
npx tsx src/cli/index.ts init \
  --provider azure-openai \
  --endpoint https://your-resource.openai.azure.com
```

### "Agent execution failed"

- Check that your API key has access to the specified model
- For Azure OpenAI, ensure the deployment name matches your modelId
- Try `--provider openai` as a fallback

### HAR file analysis shows no results

- Make sure "Preserve log" was checked in DevTools
- Verify the HAR file is valid JSON
- Try the sample HAR: `npx tsx src/cli/index.ts har sample-data/shop.har`

### Browser doesn't open in learn mode

- Make sure Playwright browsers are installed: `npx playwright install`
- Check that no other browser instances are blocking the port

---

## Next Steps

- **Read the architecture docs** — see `docs/ARCHITECTURE.md`
- **Explore the sample data** — `sample-data/shop.har` and `sample-data/sentinel.yaml`
- **Check the hackathon deck** — `hackathon/DECK_CONTENT.md`
- **Watch the demo script** — `hackathon/DEMO_SCRIPT.md`
