# Ultimatrix — Usage Guide

## Prerequisites

```bash
node >= 20
npm
```

```bash
cd ultimatrix
npm install
```

## 1. Interactive Setup

```bash
npx tsx src/cli/index.ts init
```

Prompts for:
- LLM provider (openai, anthropic, bedrock, gemini, groq, together, mistral, nvidia, openrouter)
- API key
- Model ID
- Default target URL (optional)
- Output directory

Writes `ultimatrix.yaml` in the current directory and `~/.config/ultimatrix/providers.yaml` for secrets.

## 2. Run Full Assessment (`assess`)

Primary entry point. Two-phase operation: automated exploration builds the workflow graph, then the LLM attacks known endpoints.

### Basic usage

```bash
npx tsx src/cli/index.ts assess -t https://your-app.com -o ./output
```

### With automated exploration depth

```bash
# Depth 2 is default. Higher depth = more pages discovered
npx tsx src/cli/index.ts assess -t https://your-app.com -o ./output --depth 3

# Skip exploration entirely (fast re-scans against known targets)
npx tsx src/cli/index.ts assess -t https://your-app.com -o ./output --skip-explore
```

### With pre-existing artifacts

```bash
npx tsx src/cli/index.ts assess -t https://your-app.com -o ./output \
  --with-openapi ./api-spec.yaml \
  --with-har ./session.har \
  --with-postman ./collection.json \
  --with-src ./src
```

### With live dashboard

```bash
npx tsx src/cli/index.ts assess -t https://your-app.com -o ./output \
  --dashboard --dashboard-port 3000
```

Open `http://localhost:3000` in a browser to see real-time events.

### What happens

**Phase 1 — Automated Exploration:**
1. Playwright browser opens and navigates to the target
2. All HTTP traffic is intercepted via `page.route()` — captures URLs, methods, status, headers, bodies
3. BFS crawler visits pages, clicks links, fills forms with context-aware test data
4. DOM snapshots are taken before/after every interaction — hashes compared to detect state changes
5. Network requests are correlated with DOM transitions to build the workflow graph
6. Results saved to `./output/explorer/` (nodes, edges, endpoints, auth boundaries, visited URLs)

**Phase 2 — LLM Attack:**
1. Agent reads the pre-populated app model with workflow graph, endpoints, forms, auth boundaries
2. Agent probes auth boundaries, classifies parameters, crafts payloads based on parameter types
3. All findings saved to `app-model.json` with structured evidence
4. Auto-report compiled to `final-security-report.{html|json|md}`

### Output structure

```
output/
├── app-model.json              — 18-section knowledge graph
├── final-security-report.html  — Assessment report
├── explorer/
│   ├── nodes.json              — Workflow nodes discovered
│   ├── edges.json              — Workflow edges (transitions)
│   ├── endpoints.json          — API endpoints discovered
│   ├── auth-boundaries.json    — Auth-required URLs
│   └── visited-urls.json       — URLs visited during crawl
```

## 3. Autonomous Scan (`scan`)

Legacy entry point. Checks for existing `app-model.json` and passes it to the agent.

```bash
npx tsx src/cli/index.ts scan -t https://your-app.com -o ./output
```

## 4. Verify Findings (`verify`)

Re-runs previous findings against a new deployment to check which vulnerabilities are fixed:

```bash
npx tsx src/cli/index.ts verify \
  -a ./output/app-model.json \
  -t https://new-deployment.com \
  -o ./verify-output
```

Output:
- Each finding classified as `fixed`, `regressed`, `unchanged`, or `unknown`
- Exit code 1 if any regressions found

## 5. Interactive REPL (`interact`)

Live chat loop with the autonomous agent. Browser + all tools available:

```bash
npx tsx src/cli/index.ts interact -t https://your-app.com
```

## 6. Demo Mode

```bash
npx tsx src/cli/index.ts demo
```

Canned assessment with mock findings — no API key needed.

## 7. Explore Tools & Providers

```bash
# List all registered tools
npx tsx src/cli/index.ts tools

# List tools by category
npx tsx src/cli/index.ts tools -c browser

# List available LLM providers
npx tsx src/cli/index.ts providers

# List agent roles
npx tsx src/cli/index.ts agents
```

## 8. Build for Production

```bash
npm run build
# Output: dist/index.mjs, dist/cli/index.mjs (ESM)
#         dist/index.js, dist/cli/index.js (CJS)
```

## 9. Run Tests

```bash
# All tests
npx vitest run

# Type check
npx tsc --noEmit

# Build
npm run build
```

**Current status:** 327 tests, 22 files, 0 failures, 0 type errors, 0 build warnings.

## Using Env Vars Only (No Config File)

```bash
export OPENAI_API_KEY=sk-...
npx tsx src/cli/index.ts assess -t https://your-app.com -o ./output
```

Provider auto-detection order: `OPENAI_API_KEY` → `OPENROUTER_API_KEY` → `ANTHROPIC_API_KEY` → `AZURE_OPENAI_API_KEY` → `GROQ_API_KEY` → `GEMINI_API_KEY` → `AWS_ACCESS_KEY_ID`

## Quick Reference

| Command | Description |
|---------|-------------|
| `npx tsx src/cli/index.ts` | Gate check → REPL |
| `npx tsx src/cli/index.ts init` | Interactive setup wizard |
| `npx tsx src/cli/index.ts assess -t <url> -o ./out` | Full assessment (explore + attack) |
| `npx tsx src/cli/index.ts assess --skip-explore` | Skip pre-map phase |
| `npx tsx src/cli/index.ts assess --depth 3` | Set crawl depth (default 2) |
| `npx tsx src/cli/index.ts assess --dashboard` | Live WebSocket dashboard |
| `npx tsx src/cli/index.ts assess --with-openapi <path>` | Pre-populate from OpenAPI spec |
| `npx tsx src/cli/index.ts assess --with-har <path>` | Pre-populate from HAR file |
| `npx tsx src/cli/index.ts assess --with-postman <path>` | Pre-populate from Postman collection |
| `npx tsx src/cli/index.ts assess --with-src <dir>` | Pre-populate from source code scan |
| `npx tsx src/cli/index.ts scan -t <url>` | Autonomous pentest (legacy) |
| `npx tsx src/cli/index.ts verify -a <json> -t <url>` | Verify findings against new deployment |
| `npx tsx src/cli/index.ts interact -t <url>` | Live REPL chat loop |
| `npx tsx src/cli/index.ts demo` | Demo with mock findings |
| `npx tsx src/cli/index.ts tools` | List security tools |
| `npx tsx src/cli/index.ts providers` | List LLM providers |
| `npx tsx src/cli/index.ts agents` | List agent roles |
| `npx vitest run` | Run all 327 tests |
| `npx tsc --noEmit` | Type check |
| `npm run build` | Build dist/ with tsup |
