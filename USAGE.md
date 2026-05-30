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

### Dry-run validation

Checks browser launch, target reachability, and OAST server without running the agent:

```bash
npx tsx src/cli/index.ts assess -t https://your-app.com --dry-run
```

### Interactive learning mode

Crawl all routes, then record user workflows interactively. Generates site-map, HAR, and Playwright tests:

```bash
npx tsx src/cli/index.ts assess --learn -t https://your-app.com -o ./output
```

Phase 1 auto-crawls all routes. Phase 2 opens a REPL where you can:
- Type actions like "go to /login" or "click Sign Up"
- Use `/record start` for manual browser recording
- Use `/record stop` to save captured steps
- Use `/close` to finish and generate a Playwright test file

### Advanced flags

```bash
# Limit tool calls (prevents runaway agents)
--max-calls 100

# Keep browser open after assessment
--keep-browser
```

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

## 3. Verify Findings (`verify`)

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

## 4. Interactive REPL (`interact`)

Live chat loop with the autonomous agent. Browser + all tools available:

```bash
npx tsx src/cli/index.ts interact -t https://your-app.com
```

### Manual Recording in REPL

When the agent encounters complex workflows (MFA, CAPTCHA, custom JS forms), use the `/record` command:

```bash
# Start manual recording — opens visible Playwright browser
/record start

# Interact directly with the browser — clicks, fills, navigations are captured

# Check recording status
/record

# Stop recording — steps are saved to app model
/record stop
```

The captured steps are saved to the app model's `recordedSessions` section and can be replayed later with `browser_replay_macro`.

### Other REPL commands

```bash
/quit    # Exit the REPL
/help    # Show available commands
/status  # Show recording status
/save    # Save state explicitly
```

## 5. Build for Production

```bash
npm run build
# Output: dist/index.mjs, dist/cli/index.mjs (ESM)
#         dist/index.js, dist/cli/index.js (CJS)
```

## 6. Run Tests

```bash
# All tests
npx vitest run

# Type check
npx tsc --noEmit

# Build
npm run build
```

**Current status:** 297 tests, 20 files, 0 failures, 0 type errors, 0 build warnings.

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
| `npx tsx src/cli/index.ts assess --dry-run` | Validate config without running agent |
| `npx tsx src/cli/index.ts assess --learn` | Interactive learning mode (crawl + record) |
| `npx tsx src/cli/index.ts assess --max-calls 100` | Limit agent tool calls |
| `npx tsx src/cli/index.ts assess --keep-browser` | Keep browser open after assessment |
| `npx tsx src/cli/index.ts assess --with-openapi <path>` | Pre-populate from OpenAPI spec |
| `npx tsx src/cli/index.ts assess --with-har <path>` | Pre-populate from HAR file |
| `npx tsx src/cli/index.ts assess --with-postman <path>` | Pre-populate from Postman collection |
| `npx tsx src/cli/index.ts assess --with-src <dir>` | Pre-populate from source code scan |
| `npx tsx src/cli/index.ts verify -a <json> -t <url>` | Verify findings against new deployment |
| `npx tsx src/cli/index.ts interact -t <url>` | Live REPL chat loop |
| `npx vitest run` | Run all 297 tests |
| `npx tsc --noEmit` | Type check |
| `npm run build` | Build dist/ with tsup |
