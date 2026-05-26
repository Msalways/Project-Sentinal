# Ultimatrix — Usage Guide

## Prerequisites

```bash
node >= 20
npm
```

```bash
cd project-sentinal
npm install
```

## 1. Interactive Setup

```bash
npx tsx src/cli/index.ts init
```

Prompts for:
- LLM provider (openai, anthropic, bedrock, gemini, groq, etc.)
- API key
- Default target URL (optional)
- Output directory

Writes `ultimatrix.yaml` in the current directory and `~/.config$1ultimatrix$1providers.yaml` for secrets.

## 2. Run Security Scan

```bash
# With setup already done
npx tsx src/cli/index.ts scan -t https://your-app.com

# Specify output directory
npx tsx src/cli/index.ts -t https://your-app.com -o ./results

# Using env vars only (no ultimatrix.yaml)
SENTINEL_PROVIDER=openai OPENAI_API_KEY=sk-... npx tsx src/cli/index.ts scan -t https://your-app.com
```

### What to Expect

1. CLI checks for provider config — if missing, runs `init` wizard
2. `Lead agent starting...` is printed
3. Lead agent spawns sub-agents via `spawn_subagent` with the target URL baked in
4. Sub-agents run with browser, HTTP, and security tools
5. Findings stream live as tokens arrive
6. Final report written to output directory

### With Mock Provider (No API Key)

```bash
npx tsx src/cli/index.ts scan -t http://localhost:8089 --provider mock
```

The mock provider returns canned responses — useful for testing the pipeline boots correctly.

## 3. Map Application Flow

Automatically explores and documents the application via live browser:

```bash
npx tsx src/cli/index.ts map -t https://your-app.com -o ./flow-output
```

### What it does:
1. Opens a browser and starts **silent network tracing** — captures every request, response, auth header, and payload
2. Agent navigates, clicks, fills, and submits forms to explore the app
3. Agent calls `build_flow_from_trace` which generates:
   - `flow.yaml` — structured app model (pages, forms, API endpoints, auth)
   - `flow.json` — same as YAML in JSON format
   - `session.har` — full HAR file of all captured traffic
   - `tests/*.spec.ts` — Playwright test files from recorded interactions

### Change Detection (automatic):

Each `map` run auto-saves to `~/.ultimatrix/registry/<app>/`. On subsequent runs, it diffs against the previous model and reports:

```
+ new page: /api/v2/orders
- removed: /legacy/checkout
~ /checkout: auth changed: none → required
+ new API: POST /api/v2/orders
↳ impacted: /cart → /api/v2/orders
```

No flags needed — the registry is automatic and local.

## 4. Interactive REPL

```bash
# Auto-REPL (if no config exists, drops into wizard, then REPL)
npx tsx src/cli/index.ts

# With specific provider
npx tsx src/cli/index.ts --provider openai --model gpt-4o
```

Commands:
- Type anything — agent responds with tools + thinking
- `/quit` — exit

## 5. Demo Mode

```bash
npx tsx src/cli/index.ts demo
```

Runs a canned assessment with fake findings — no API key needed.

## 6. Explore Tools

```bash
# List all registered tools
npx tsx src/cli/index.ts tools

# List available providers
npx tsx src/cli/index.ts providers
```

## 7. Build for Production

```bash
npm run build
# Output: dist/index.cjs, dist/cli/index.js
```

## 8. All Tests

```bash
npx vitest run
# 307 tests, 19 files, 0 failures
```

## Quick Reference

| Command | Description |
|---------|-------------|
| `npx tsx src/cli/index.ts` | Gate check → REPL |
| `npx tsx src/cli/index.ts init` | Interactive setup wizard |
| `npx tsx src/cli/index.ts scan -t <url>` | Autonomous security scan |
| `npx tsx src/cli/index.ts map -t <url>` | App flow mapping with network trace |
| `npx tsx src/cli/index.ts map -t <url>` | Map + auto-save to local registry |
| `npx tsx src/cli/index.ts test -s <session>` | Generate Playwright tests from recording |
| `npx tsx src/cli/index.ts demo` | Demo with mock findings |
| `npx tsx src/cli/index.ts tools` | List all security tools |
| `npx tsx src/cli/index.ts providers` | List LLM providers |
| `npx tsx src/cli/index.ts agents` | List agent roles |
| `npx vitest run` | Run all 307 tests |
| `npm run build` | Build dist/ with tsup |
