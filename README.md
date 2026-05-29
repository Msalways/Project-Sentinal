# Ultimatrix

**AI-Powered Autonomous Security Operator** — Single-agent loop that explores, maps, analyses, and attacks web applications. The LLM crafts every payload dynamically based on response analysis. No canned payload lists, no fixed pipeline.

> ⚠️ **Under active development.** Not yet published. API and behavior may change without notice.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.4+-blue.svg)](https://www.typescriptlang.org/)
[![45 Tools](https://img.shields.io/badge/Tools-45-brightgreen.svg)](#tools)
[![11 Providers](https://img.shields.io/badge/LLM%20Providers-11-blueviolet.svg)](#configure-llm-provider)
[![327 Tests](https://img.shields.io/badge/Tests-327%20passing-success.svg)](#testing)

---

## Quick Start

```bash
# Install
npm install

# Interactive setup (writes ultimatrix.yaml)
npx tsx src/cli/index.ts init

# Full assessment — auto-explore then attack
npx tsx src/cli/index.ts assess -t https://your-app.com -o ./output
```

---

## Modes

### `assess` — Full assessment (primary entry point)

Two-phase operation:

**Phase 1 — Automated Exploration (pre-map):** BFS crawl with Playwright. Intercepts all HTTP traffic via `page.route()`. Captures DOM before/after every click and form submit. Correlates network requests with DOM transitions to build the workflow graph automatically.

**Phase 2 — LLM Attack:** The agent starts with a pre-mapped workflow graph (nodes, edges, endpoints, forms, auth boundaries, classified parameters). It reads the map and attacks known endpoints with crafted payloads — no blind re-exploration needed.

```bash
# Basic
ultimatrix assess -t https://target.com -o ./output

# With automated exploration (default depth=2)
ultimatrix assess -t https://target.com -o ./output --depth 3

# Skip exploration for fast re-scans
ultimatrix assess -t https://target.com -o ./output --skip-explore

# Pre-populate from existing artifacts
ultimatrix assess -t https://target.com -o ./output \
  --with-openapi ./api-spec.yaml \
  --with-har ./session.har \
  --with-postman ./collection.json \
  --with-src ./src

# Live dashboard
ultimatrix assess -t https://target.com -o ./output --dashboard
```

### `scan` — Autonomous pentest

Legacy entry point, checks for existing `app-model.json` in output dir and passes it to the agent.

```bash
ultimatrix scan -t https://target.com -o ./output
```

### `verify` — Re-run findings against new deployment

Replays exact same payloads against a fresh target, classifies each finding as fixed/regressed/unchanged.

```bash
ultimatrix verify -a ./output/app-model.json -t https://new-deployment.com
```

### `interact` — Live REPL chat loop with manual recording

Start a chat session with the LLM agent. Use `/record start` to toggle manual browser interaction — the visible Playwright window opens so you can click, type, and navigate directly. Type `/record stop` when done to save captured steps to the app model for later replay.

```bash
ultimatrix interact -t https://target.com
```

### `init` — Interactive config wizard

```bash
ultimatrix init
```

---

## Automated Exploration (Pre-Map Phase)

When `--depth N` (default 2) is specified during `assess`, Ultimatrix performs a fully automated crawl before the LLM gets involved:

1. **Network interception:** Every request/response is captured via Playwright `page.route()` — method, URL, status, headers, bodies, timing.
2. **DOM snapshots:** Before and after every interaction (click, form fill, submit), the full page state is captured: URL, title, forms, interactive elements, text content.
3. **Hash-based diffing:** DOM hashes are compared to detect real state changes. If the DOM didn't change, the interaction is skipped.
4. **Context-aware form filling:** Fields are auto-filled with realistic test data based on field name, type, and placeholder (e.g., `email` → `test@example.com`, `price` → `100`).
5. **BFS queue:** New URLs discovered during crawl are added to a breadth-first queue with depth tracking.

The result is a complete workflow graph (nodes + edges) + discovered endpoints + forms + auth boundaries + parameter classifications — all pre-populated in `app-model.json` before the LLM sees it.

---

## App Model (Knowledge Graph)

The agent's persistent memory is a structured JSON file (`app-model.json`) with 18 sections:

| Section | Purpose |
|---------|---------|
| `target` | Target URL |
| `techStack` | Detected technologies |
| `auth` | Auth type, login endpoint, cookies, tokens, sessions |
| `workflow` | Nodes (pages/APIs) + Edges (transitions) — the state machine |
| `endpoints` | Known API routes with params, methods, response patterns |
| `forms` | Form inputs found on each page |
| `scripts` | External JS loaded on pages |
| `cookies` | Active cookies |
| `localStorage` | LocalStorage values |
| `findings` | Vulnerabilities found with structured evidence |
| `verifications` | Re-run results from `verify` command |
| `parameterClassifications` | What each parameter is FOR (id, email, price, etc.) |
| `authBoundaries` | Which URLs require auth, proven by request comparison |
| `recordedSessions` | Named macros (login flows, multi-step workflows) |
| `hypotheses` | Things to test next |
| `nextSteps` | Ordered action plan |
| `visitedUrls` | URLs already visited |

---

## Tools (45 total)

All tools are payload-in, response-out — the LLM crafts every payload dynamically.

### Browser Tools (21)

| Tool | Purpose |
|------|---------|
| `navigate` | Navigate browser to URL |
| `click` | Click element on page |
| `fill` | Fill form field |
| `press_key` | Send keyboard events |
| `screenshot` | Capture page screenshot |
| `extract` | Extract text, HTML, or links |
| `evaluate` | Execute JS in browser |
| `get_forms` | Get all forms with fields |
| `get_cookies` | Get active cookies |
| `get_scripts` | Get external scripts |
| `get_storage` | Get localStorage |
| `close` | Close browser session |
| `get_page_info` | Get URL, title, readyState, text length, link/form count |
| `inject_cookie` | Set cookies in browser context |
| `macro_record_start` | Start recording browser actions (LLM-driven) |
| `macro_record_stop` | Stop recording, get steps |
| `browser_get_recording` | View recording without stopping |
| `browser_replay_macro` | Replay saved macro steps |
| `macro_list` | List saved macros |
| `manual_record_start` | Start recording DIRECT human browser interactions (visible window) |
| `manual_record_stop` | Stop manual recording, return captured steps |

### Session Recording & Trace (8)

| Tool | Purpose |
|------|---------|
| `browser_start_trace` | Start network trace |
| `browser_stop_trace` | Stop trace, get entries |
| `browser_get_trace` | View trace entries |
| `create_browser_session` | Create isolated browser context (multi-role) |
| `list_browser_sessions` | List all sessions |
| `save_storage_state` | Save cookies + localStorage to JSON file |
| `load_storage_state` | Restore cookies + localStorage from JSON file |

### Network (3)

| Tool | Purpose |
|------|---------|
| `http_request` | Send arbitrary HTTP request |
| `port_scan` | Scan for open ports |
| `header_analyze` | Analyze HTTP security headers |

### Exploit (2)

| Tool | Purpose |
|------|---------|
| `sql_inject` | Send SQL injection payload (LLM-crafted) |
| `xss_inject` | Send XSS payload (LLM-crafted) |

### Recon (5)

| Tool | Purpose |
|------|---------|
| `auth_probe` | Compare response with/without cookies |
| `subdomain_enum` | Passive subdomain enumeration |
| `dir_bruteforce` | Discover hidden directories |
| `jwt_parse` | Decode JWT tokens |
| `graphql_introspect` | Query GraphQL introspection |

### Knowledge (3)

| Tool | Purpose |
|------|---------|
| `calculate_risk` | Get risk score from findings |
| `render_workflow_graph` | See workflow graph as Mermaid diagram |
| `classify_parameter` | Save parameter purpose classification |

### App Model (2)

| Tool | Purpose |
|------|---------|
| `read_app_model` | Read a section of the app model |
| `update_app_model` | Write findings/hypotheses/nodes to the app model |

---

## Architecture

```
assess → [Pre-map Phase] → [Agent Phase] → [Report]
                        │                 │
                        ▼                 ▼
            BFS crawler            LLM single-agent loop
            Network interception    explore→analyze→attack
            DOM diffing            50 tool-call budget
            Auto form filling      Dashboard events
            Workflow graph build   Auto-report compilation
```

- **Single-agent loop:** THREAT_MODEL_PROMPT drives explore→analyze→attack→re-analyze. No sub-agents. Agent reads/writes `app-model.json` via `read_app_model`/`update_app_model` tools.
- **47 tools** total: browser (21), session/recording/trace (8), network (3), exploit (2), recon (5), knowledge (3), app-model (2), utility (3).
- **11 LLM providers** via @langchain: OpenAI, Azure, Anthropic, Bedrock, Gemini, Groq, Together, Mistral, NIM, OpenRouter, Mock.
- **BrowserSession:** Persistent Playwright sessions with `fill()` contenteditable/JS fallback, `pressKey()`, extraction, `addCookie()`, `hasSession()`, `saveStorageState()`/`loadStorageState()`, recording + replay + manual recording, network trace.
- **AppModel type** (18 sections): workflow graph, recorded sessions, parameter classifications, auth boundaries, structured evidence, risk scoring, report compilation.
- **Auto-report:** `compileReport()` generates HTML, JSON, or Markdown from app model findings — even if the LLM never calls `write_file`. Always written after agent completes.
- **Dashboard:** Optional WebSocket + HTML server (`--dashboard` flag). Streams real-time tool calls, risk changes, status, and errors.
- **Verification:** `verify` command re-runs findings against a fresh deployment, classifies each as fixed/regressed/unchanged/unknown.

---

## Project Structure

```
src/
├── cli/               — CLI commands (assess, scan, verify, interact, init)
├── core/              — AppModel types, BrowserSessionManager, fix-todos middleware
├── providers/         — 11 LLM provider factories
├── tools/             — 47 tools + tool-registry
├── pipeline/          — AutonomousOrchestrator + THREAT_MODEL_PROMPT
├── explorer/          — Pre-map phase (network-recorder, dom-observer, crawler, workflow-builder)
├── dashboard/         — WebSocket + HTML live dashboard
├── ingestion/         — OpenAPI/HAR/Postman/source-code parsers
├── verification/      — Re-run findings against new deployment
├── flow/              — Trace-to-HAR converter
└── agents/            — Agent registry
```

---

## Testing

```bash
npx vitest run
# 327 tests, 22 files, 0 failures
npx tsc --noEmit       # 0 type errors
npm run build           # 0 warnings
```

---

## License

MIT
