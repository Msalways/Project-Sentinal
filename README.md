# Ultimatrix

**AI-Powered Autonomous Security Operator** — Single-agent strategist (createDeepAgent) orchestrates parallel worker threads. Each worker is a lightweight LLM loop that crafts payloads dynamically and uses deterministic detection. No canned payload lists, no sub-agents, no fixed pipeline.

> ⚠️ **Under active development.** Not yet published. API and behavior may change without notice.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.4+-blue.svg)](https://www.typescriptlang.org/)
[![233 Tests](https://img.shields.io/badge/Tests-233%20passing-success.svg)](#testing)

---

## Quick Start

```bash
# Install
npm install

# Interactive setup (writes ultimatrix.yaml)
npx tsx src/cli/index.ts init

# Full assessment — spider → strategist + workers → report
npx tsx src/cli/index.ts assess -t https://your-app.com -o ./output
```

---

## Usage

### `assess` — Unified assessment (primary command)

One command. No modes. Spider crawls depth=2 first, then the strategist reads the app model and spawns parallel workers to test hypotheses.

```bash
# Basic assessment
npx tsx src/cli/index.ts assess -t https://target.com -o ./output

# Control crawl depth (default 2)
npx tsx src/cli/index.ts assess -t https://target.com -o ./output --depth 3

# Pre-populate from existing artifacts
npx tsx src/cli/index.ts assess -t https://target.com -o ./output \
  --with-openapi ./api-spec.yaml \
  --with-har ./session.har \
  --with-postman ./collection.json \
  --with-src ./src

# Live WebSocket dashboard
npx tsx src/cli/index.ts assess -t https://target.com -o ./output --dashboard

# Limit tool calls (default 50)
npx tsx src/cli/index.ts assess -t https://target.com --max-calls 100

# Keep browser open after assessment
npx tsx src/cli/index.ts assess -t https://target.com --keep-browser

# Dry-run validation (checks browser + target + OAST)
npx tsx src/cli/index.ts assess -t https://target.com --dry-run
```

### `verify` — Re-run findings against new deployment

```bash
npx tsx src/cli/index.ts verify -a ./output/app-model.json -t https://new-deployment.com
```

### `init` — Interactive config wizard

```bash
npx tsx src/cli/index.ts init
```

---

## How It Works

```
assess → [Spider crawl depth=N] → [derive attack plan] → [strategist spawns workers] → [report]
                                  │                           │
                                  ▼                           ▼
                          app-model.json              worker 1 (sqli)
                          endpoints + forms           worker 2 (xss)
                          auth boundaries             worker 3 (ssrf)
                          tech stack                  worker 4 (xxe)
                                                      ... up to 4 concurrent
```

1. **Spider crawl** — Playwright BFS crawl to depth 2. Captures routes, forms, cookies, scripts, localStorage. Writes `app-model.json`.
2. **Derive attack plan** — `deriveHypotheses()` generates hypotheses from every endpoint/param/form. Each hypothesis = endpoint + param + technique.
3. **Strategist (createDeepAgent)** — LLM reads the attack plan, decides which hypotheses to execute, spawns worker threads.
4. **Workers (worker_threads)** — Each worker: receives a hypothesis → LLM crafts payload → fetches URL → deterministic detection module → returns DetectionResult. Budget 6 attempts, 60s timeout. Crash isolation — a crashed worker doesn't kill the strategist.
5. **Detection is deterministic TypeScript** — regex, timing, diff. LLM never reads raw HTML. Modules: sqli (43 DBMS patterns), xss (HTML context), ssrf (OAST), xxe (OAST+error+diffs), cmd-injection (OS patterns+timing), path-traversal (file content matching), ssti (math eval), open-redirect (302 location), waf (header fingerprinting), business-logic (IDOR/race/mass-assignment).
6. **Triage** — Rule-based evidence scoring (0-7), dedup, severity calibration. Runs after strategist finishes.
7. **OAST server** — Local HTTP callback server for blind payload detection (XSS, SSRF, SQLi, XXE). Auto-starts before agent, persists to `{outputDir}/oast-callbacks.json`.

---

## App Model (Knowledge Graph)

The agent's persistent memory is `app-model.json` with 18 sections:

| Section | Purpose |
|---------|---------|
| `target` | Target URL |
| `techStack` | Detected technologies |
| `auth` | Auth type, login endpoint, cookies, tokens, sessions |
| `workflow` | Nodes (pages/APIs) + Edges (transitions) |
| `endpoints` | Known API routes with params, methods |
| `forms` | Form inputs found on each page |
| `scripts` | External JS loaded on pages |
| `cookies` | Active cookies |
| `localStorage` | LocalStorage values |
| `findings` | Vulnerabilities found with structured evidence |
| `verifications` | Re-run results from `verify` command |
| `parameterClassifications` | What each parameter is FOR (id, email, price, etc.) |
| `authBoundaries` | Which URLs require auth |
| `recordedSessions` | Named macros (login flows) |
| `hypotheses` | Things to test next |
| `nextSteps` | Ordered action plan |
| `visitedUrls` | URLs already visited |
| `oastCallbacks` | OAST callback records |
| `coverage` | Endpoint/param/method coverage tracking |

---

## Detection-Backed Tools

All exploit tools return `DetectionResult` — the LLM never reads raw HTML.

| Tool | Detection |
|------|-----------|
| `sql_inject` | 43 DBMS error patterns, boolean diff, timing |
| `xss_inject` | HTML context analyzer, DOM sink scanner, CSP parser |
| `ssrf_inject` | OAST callback correlation |
| `xxe_inject` | OAST + error patterns + response diff |
| `cmd_inject` | OS-specific error patterns + timing |
| `path_traversal` | File content matching (`root:x:`, `[boot loader]`) |
| `ssti_inject` | Math eval (`${7*7}` → `49`) |
| `open_redirect` | 302 Location + cross-host redirect |

---

## Architecture

- **Strategist** = `createDeepAgent` on main thread. Reads app model, spawns workers, tracks progress.
- **Workers** = simple LLM loops in `worker_threads`. One per hypothesis. No nested deep agents.
- **Worker communication** = `postMessage` — real-time results, crash isolation.
- **11 LLM providers** via @langchain: OpenAI, Azure, Anthropic, Bedrock, Gemini, Groq, Together, Mistral, NIM, OpenRouter, Mock.
- **OAST persistence** survives process crashes — callbacks saved to `{outputDir}/oast-callbacks.json`.

---

## Project Structure

```
src/
├── cli/               — CLI commands (assess, verify, init) + REPL
├── core/              — AppModel, BrowserSessionManager, attack-plan
├── detect/            — 10 deterministic detection modules + types
├── payloads/          — 8 payload modules
├── providers/         — 11 LLM provider factories
├── tools/             — Tool registry (8 detection-backed exploit tools + browser, recon, etc.)
├── pipeline/          — AutonomousOrchestrator (thin orchestrator)
├── explorer/          — Spider crawler, js-analyzer, workflow builder
├── dashboard/         — WebSocket + HTML live dashboard
├── ingestion/         — OpenAPI/HAR/Postman/source-code parsers
├── verification/      — Re-run findings against new deployment
├── prompts/           — STRATEGIST_PROMPT
├── triage/            — Rule-based finding scoring and dedup
└── oast/              — OAST callback server with persistence
```

---

## Testing

```bash
npx vitest run          # 233 tests, 16 files, 0 failures
npx tsc --noEmit        # 0 type errors
```

---

## License

MIT
