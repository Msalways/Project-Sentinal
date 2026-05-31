# Ultimatrix — Usage Guide

## Prerequisites

```bash
node >= 20
npm install
# Plus Playwright browser:
npx playwright install chromium
```

## Quick Start

```bash
# Set your API key
export OPENAI_API_KEY=sk-...

# Full assessment — one command
npx tsx src/cli/index.ts assess -t https://your-app.com -o ./output
```

## `assess` — Full Assessment

Primary command. Spider crawls the target, then the strategist fires parallel worker threads to test every parameterized endpoint.

```bash
# Basic
npx tsx src/cli/index.ts assess -t https://target.com -o ./output

# Fast scan (depth 1, no crawl of sub-pages)
npx tsx src/cli/index.ts assess -t https://target.com -o ./output --depth 1

# Re-scan existing app model (skip spider crawl)
npx tsx src/cli/index.ts assess -t https://target.com -o ./output --skip-explore

# Fresh start (delete previous output)
npx tsx src/cli/index.ts assess -t https://target.com -o ./output --fresh

# Live WebSocket dashboard
npx tsx src/cli/index.ts assess -t https://target.com -o ./output --dashboard

# Pre-populate from external artifacts
npx tsx src/cli/index.ts assess -t https://target.com -o ./output \
  --with-openapi ./api-spec.yaml \
  --with-har ./session.har \
  --with-postman ./collection.json \
  --with-src ./src

# Validate setup without running the agent
npx tsx src/cli/index.ts assess -t https://target.com --dry-run

# Limit tool calls per turn (prevents runaway loops)
npx tsx src/cli/index.ts assess -t https://target.com --max-calls 100

# Keep browser open after assessment (for debugging)
npx tsx src/cli/index.ts assess -t https://target.com --keep-browser
```

### What happens during `assess`

1. **OAST server starts** — Local HTTP callback server for blind SSRF/XXE/open-redirect detection. Runs on a random port, persists callbacks to `output/oast-callbacks.json`.

2. **Spider crawl** — Playwright browser navigates the target, discovers routes via BFS, extracts forms/cookies/scripts/storage per page. Explores forms (fills & submits with contextual values), clicks interactive elements (buttons, toggles, tabs), dismisses overlays (cookie banners, modals), discovers SPA hash routes (`<a href="#/path">`), and attempts auth flows (detects login forms, fills if credentials configured).

3. **Strategist loop** — Single LLM reads the app model and fires fire-and-forget workers in batches (3-5 per turn). Workers run in background and write findings to `app-model.json` asynchronously. The strategist periodically checks for new findings and stops when all parameterized endpoints are covered.

4. **Worker detection** — Each worker is a lightweight LLM agent that:
   - Generates a payload via LLM (no canned lists)
   - Sends the HTTP request
   - Analyzes the raw response for 8 evidence types: SQL errors, stack traces, file contents, template output, command output, reflection, status anomalies, redirect anomalies
   - For SSRF/XXE/open-redirect: auto-embeds OAST UUID and checks for callbacks
   - For stored XSS: follows up POST with GET to the action URL
   - For blind SQLi: compares timing against a baseline request

5. **Report generation** — Every 3 turns, a partial Playwright test is generated. After the strategist finishes, the final report with Mermaid graphs is compiled. The Playwright test contains two parts: User Flow (narrative replay with password masking, form grouping) and Assessment Flow (Route Discovery tests + Attack Replay regression suite + Clean Endpoint tests).

### Output

```
output/
├── app-model.json              — Complete assessment state (findings, hypotheses, etc.)
├── final-security-report.md    — Markdown report with risk score and Mermaid graphs
├── playwright/
│   └── assess-flow.spec.ts     — Auto-generated Playwright test suite (regenerates every 3 turns)
├── session-trace.har           — Browser trace for replay
└── oast-callbacks.json         — OAST callback records
```

## `verify` — Re-run Findings

Check if previously found vulnerabilities are fixed in a new deployment:

```bash
npx tsx src/cli/index.ts verify \
  -a ./output/app-model.json \
  -t https://new-deployment.com \
  -o ./verify-output
```

Each finding is classified as `fixed`, `regressed`, `unchanged`, or `unknown`. Exit code 1 if any regressions.

## `interact` — REPL Chat Loop

Live chat with the autonomous agent. All 45 tools available + browser:

```bash
npx tsx src/cli/index.ts interact -t https://target.com
```

REPL commands:
- `/close` or `/exit` — End session and generate Playwright test
- `/help` — Show available commands
- `/record start` — Begin manual browser recording
- `/record stop` — Save recorded steps to app model

## `init` — Setup Wizard

```bash
npx tsx src/cli/index.ts init
```

Prompts for provider, API key, model, default target. Writes `ultimatrix.yaml` and `~/.config/ultimatrix/providers.yaml`.

## Configuration

### Environment Variables

```bash
export OPENAI_API_KEY=sk-...
# Or any supported provider:
export ANTHROPIC_API_KEY=sk-...
export OPENROUTER_API_KEY=...
export GROQ_API_KEY=...
export GEMINI_API_KEY=...
export AZURE_OPENAI_API_KEY=...
```

Provider auto-detection: `OPENAI_API_KEY` → `OPENROUTER_API_KEY` → `ANTHROPIC_API_KEY` → `AZURE_OPENAI_API_KEY` → `GROQ_API_KEY` → `GEMINI_API_KEY` → `AWS_ACCESS_KEY_ID`

### Provider Config File

`~/.config/ultimatrix/providers.yaml`:
```yaml
provider: openai
apiKey: sk-...
model: gpt-4o
```

## Testing

```bash
# Run all tests
npx vitest run

# Type check only
npx tsc --noEmit

# Build distribution
npm run build
```

## Project Structure

```
src/
├── cli/               — CLI commands + REPL
├── core/              — AppModel, BrowserSession, worker-agent (LLM worker threads)
├── providers/         — 11 LLM provider factories
├── tools/             — 45 tools (browser, network, exploit, recon, knowledge, etc.)
├── pipeline/          — AutonomousOrchestrator (strategist loop with parallel dispatch)
├── explorer/          — Spider crawler + form explorer + SPA route discovery
├── dashboard/         — WebSocket live dashboard
├── ingestion/         — OpenAPI/HAR/Postman/source-code parsers
├── prompts/           — STRATEGIST_PROMPT (concise, auto-stop)
├── triage/            — Rule-based finding scoring and dedup
├── oast/              — OAST callback server with /api/check endpoint
├── browser/           — Playwright session management
├── engine/            — Report compilation, Mermaid rendering
└── verification/      — Re-run findings against new deployment
```

## Notes

- The agent **cannot use browser navigation** during assessment — spider already crawled everything. It only reads the app model and spawns workers.
- Workers are **crash-isolated** — a worker thread failure doesn't affect the strategist or other workers.
- The strategist prompt is **concise by design** — no tables, no repetition. Fire workers, check findings, stop when done.
