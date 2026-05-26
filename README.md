# 🛡️ Ultimatrix

**AI-Powered Security Team-in-a-Box** — A multi-agent security testing platform with 60+ built-in security tools, live browser control, skill-based expert guidance, automatic app flow mapping via network tracing, and a dynamic sub-agent orchestrator that creates specialized agents on-the-fly.

> Built for **Microsoft Build AI Hackathon 2026** | Track: Security in the Agentic Future

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.4+-blue.svg)](https://www.typescriptlang.org/)
[![60+ Tools](https://img.shields.io/badge/Security%20Tools-60+-brightgreen.svg)](#arsenal)
[![11 Providers](https://img.shields.io/badge/LLM%20Providers-11-blueviolet.svg)](#configure-llm-provider)
[![307 Tests](https://img.shields.io/badge/Tests-307%20passing-success.svg)](#testing)

---

## Quick Start

```bash
# 1. Install
npm install

# 2. Interactive setup (writes ultimatrix.yaml)
npx tsx src/cli/index.ts init

# 3. Run security scan
npx tsx src/cli/index.ts scan -t https://your-app.com

# Or with no config — auto-REPL
npx tsx src/cli/index.ts
```

---

## Modes of Operation

### 🧠 Autonomous Scan (`ultimatrix scan`)
A **goal-driven autonomous pentest** — a lead agent dynamically spawns specialized sub-agents with only the tools they need:

```bash
npx tsx src/cli/index.ts scan -t https://target.com -o ./output
```

The lead agent analyzes the target, then spawns sub-agents on-the-fly (`recon-scanner`, `sql-injector`, `xss-checker`, etc.) — each with a precise tool subset. No fixed pipeline; the agent decides what to run, when, and with which tools.

### 💬 Interactive REPL (`ultimatrix` with no args)
A **live chat loop** with the autonomous agent:

```bash
npx tsx src/cli/index.ts
```

Commands: `/quit` to exit. All other input goes to the agent.

### 🗺️ App Flow Mapping (`ultimatrix map`)
**Automatic application flow discovery** — explores the app via live browser, silently captures every network request, and generates a complete flow model:

```bash
npx tsx src/cli/index.ts map -t https://target.com -o ./flow-output
```

How it works:
1. Agent starts `browser_start_trace` → Playwright intercepts all requests/responses silently
2. Agent naturally navigates, clicks, fills forms — the trace captures URLs, methods, request bodies, auth headers (Bearer/Cookie/Basic), response statuses
3. Agent calls `build_flow_from_trace` → automatically generates:
   - `flow.yaml` / `flow.json` — pages, forms, API endpoints, auth model
   - `session.har` — full HAR file of all captured traffic
   - `tests/*.spec.ts` — Playwright test files from recorded actions

```bash
# With git registry for diff-based scanning across releases
npx tsx src/cli/index.ts map -t https://target.com --flow-repo https://github.com/team/app-flow.git
```

### 🎯 Ultimatrix Init (`ultimatrix init`)
Interactive wizard that writes `ultimatrix.yaml`:

```bash
npx tsx src/cli/index.ts init
```

---

## 🧠 Skill System

Agents can load **expert skill files** on-demand during pentesting — specialized markdown guides with MITRE ATT&CK mappings:

| Skill | Domain | MITRE |
|-------|--------|-------|
| `web-recon` | Web reconnaissance | T1595 |
| `sql-injection` | SQL injection testing | T1190 |
| `xss` | Cross-site scripting | T1189 |
| `sast` | Static analysis | T1082 |

```bash
# In REPL or agent context
list_skills
load_skill(name="sql-injection")
```

---

## 🔧 Arsenal — 60+ Security Tools

### Browser Control

| Tool | What It Does |
|------|-------------|
| `browser_navigate` | Navigate browser to URL with session management |
| `browser_click` | Click elements on the page |
| `browser_fill` | Fill form fields with values |
| `browser_screenshot` | Capture page screenshot (base64) |
| `browser_extract` | Extract text, HTML, or links |
| `browser_evaluate` | Execute JavaScript in the browser context |
| `browser_close` | Close a browser session |
| `browser_record_login` | Record and replay a login macro |

### Network Tracing & App Flow Mapping

| Tool | What It Does |
|------|-------------|
| `browser_start_trace` | Start automatic network request interception — captures URLs, methods, headers, payloads, auth |
| `browser_stop_trace` | Stop tracing and return entry summary |
| `browser_get_trace` | View captured trace entries filtered by type |
| `build_flow_from_trace` | Auto-generate flow model, HAR, Playwright tests from trace data |

### Action Recording & Test Generation

| Tool | What It Does |
|------|-------------|
| `browser_start_recording` | Start recording browser actions (navigate, click, fill) |
| `browser_stop_recording` | Stop recording and return recorded steps |
| `browser_get_recording` | View recorded steps without stopping |
| `generate_playwright_test` | Generate Playwright `.spec.ts` files from recorded session |

### Dynamic Sub-Agent Orchestration

| Tool | What It Does |
|------|-------------|
| `spawn_subagent` | Dynamically create a sub-agent with specific tools and task goal — requires `targetUrl` |

### HTTP Fuzzing & Template Scanning

| Tool | What It Does |
|------|-------------|
| `http_fuzz` | Fuzz HTTP endpoints with FUZZ keyword placement |
| `template_scan` | Execute Nuclei-compatible YAML templates |
| `trivy_scan` | Scan containers, filesystems, K8s for CVEs |
| `semgrep_scan` | Scan source code with Semgrep SAST rules |

### Network & Infrastructure

| Tool | What It Does |
|------|-------------|
| `http_request` | Send HTTP requests with custom method, headers, body |
| `port_scan` | Scan hosts for open ports with service identification |
| `header_analyze` | Analyze HTTP security headers |
| `ssl_check` | Check SSL/TLS configuration |

### Reconnaissance

| Tool | What It Does |
|------|-------------|
| `tech_detect` | Detect technologies, frameworks, servers |
| `har_analyze` | Analyze HAR files for security issues |
| `subdomain_enum` | Enumerate subdomains via passive sources |
| `dir_bruteforce` | Discover hidden directories |

### Code Analysis (SAST)

| Tool | What It Does |
|------|-------------|
| `pattern_match` | Scan source code for vulnerability patterns |
| `secrets_scan` | Detect hardcoded secrets |
| `entry_point_detect` | Identify application entry points |
| `source_sink_scan` | Map data flow sources to sinks |
| `finding_verify` | LLM-driven false positive elimination |

### Authentication & Authorization

| Tool | What It Does |
|------|-------------|
| `jwt_parse` | Decode and analyze JWT tokens |
| `jwt_forge` | Forge JWT tokens (alg=none, HS256) |
| `oauth_audit` | Audit OAuth/OIDC flows |
| `check_auth_session` | Check if auth session is valid |
| `exploit_auth_bypass` | Test auth bypass techniques |
| `exploit_authz` | Test authorization bypass |

### API Security

| Tool | What It Does |
|------|-------------|
| `graphql_introspect` | Query GraphQL introspection |
| `cors_audit` | Test CORS configuration |
| `rate_limit_test` | Test API rate limiting |
| `api_fuzz` | Fuzz API parameters |

### Exploit Testing

| Tool | What It Does |
|------|-------------|
| `sql_inject` | Test for SQL injection (boolean, UNION, time-based) |
| `xss_inject` | Test for XSS (reflected, DOM, event handlers) |

### Post-Exploitation

| Tool | What It Does |
|------|-------------|
| `exfiltrate_file` | File exfiltration technique suggestions |
| `reverse_shell` | Reverse shell technique suggestions |
| `dump_credentials` | Credential dumping command suggestions |

### OOB (Out-of-Band) Detection

| Tool | What It Does |
|------|-------------|
| `oob_trigger` | Generate OOB payloads for blind SSRF, XXE, SQLi |
| `oob_find` | Check OOB server for incoming callbacks |

### Vulnerability Intelligence

| Tool | What It Does |
|------|-------------|
| `cve_lookup` | Look up CVE details from NVD |
| `dependency_enrich` | Parse lockfiles for CVE analysis |

### Cloud & Infrastructure

| Tool | What It Does |
|------|-------------|
| `iam_policy_audit` | Audit AWS IAM policies |
| `k8s_manifest_audit` | Audit Kubernetes manifests |
| `tfstate_audit` | Audit Terraform state files |

### Expert Knowledge

| Tool | What It Does |
|------|-------------|
| `load_skill` | Load a skill file by name |
| `search_skills` | Search skill catalog |
| `list_skills` | List all available skills |

---

## Architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│  CLI ENTRY POINTS                                                    │
│  ultimatrix (no args) → gate check → REPL                            │
│  ultimatrix init      → interactive wizard → writes ultimatrix.yaml   │
│  ultimatrix scan -t   → AutonomousOrchestrator → live streaming       │
│  ultimatrix map  -t   → Flow mapping → flow.yaml + HAR + Playwright  │
│  ultimatrix test -s   → Generate Playwright tests from recording      │
│  ultimatrix demo      → mock assessment (no API key needed)           │
│  ultimatrix providers → list LLM providers                            │
│  ultimatrix tools     → list security tools                           │
│  ultimatrix agents    → list agent roles                              │
└──────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────────────────┐
│  CONFIG LAYERING                                                     │
│  ~/.config$1ultimatrix$1providers.yaml  (secrets, API keys)               │
│    >  ~/.config$1ultimatrix$1config.yaml (global defaults)                │
│      >  ./ultimatrix.yaml / ./ultimatrix.json (project config)            │
│        >  env vars (SENTINEL_PROVIDER, OPENAI_API_KEY, ...)           │
│          >  CLI flags (-t, --provider, --model)                       │
└──────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────────────────┐
│  AUTONOMOUS ORCHESTRATOR (scan mode)                                 │
│                                                                      │
│  Lead Agent ← model + 50+ tools + spawn_subagent                    │
│     │                                                                 │
│     │  spawn_subagent({name, goal, toolNames, targetUrl})             │
│     ├──► sub-agent 1 (recon)     ── http, tech, dir_bf, browser      │
│     ├──► sub-agent 2 (sqli)      ── http, sql_inject                 │
│     ├──► sub-agent 3 (xss)       ── http, xss, browser               │
│     ├──► sub-agent 4 (api)       ── api_fuzz, graphql, cors          │
│     ├──► sub-agent 5 (auth)      ── jwt_parse, jwt_forge, oauth      │
│     └──► sub-agent 6 (report)    ── read_file, write_file            │
│                                                                      │
│  • Sub-agents run in parallel when independent                       │
│  • Each sub-agent gets only relevant tools                           │
│  • targetUrl is required — no more example.com fallback              │
│  • Streaming via agent.stream() with streamMode: 'messages'           │
└──────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────────────────┐
│  LLM PROVIDERS (11 swappable)                                        │
│  openai │ azure-openai │ openrouter │ anthropic                      │
│  bedrock │ gemini │ groq │ together │ mistral │ nvidia │ mock        │
└──────────────────────────────────────────────────────────────────────┘
```

---

## Project Structure

```
project-sentinal/
├── src/
│   ├── cli/               — CLI (index, repl, logger, sarif)
│   ├── core/              — Types, config, BrowserSession, OOBServer, template engine
│   ├── providers/         — 11 LLM provider factories
│   ├── tools/             — 60+ tools + tool-registry + spawn-agent
│   ├── pipeline/          — AutonomousOrchestrator
│   └── engine/            — Security engine types
├── tests/                 — 307 tests mirroring src/
├── templates/             — Sample Nuclei YAML templates
├── skills/                — 4 skill files with MITRE mappings
├── Dockerfile
├── .github/workflows/     — CI pipeline
├── README.md
└── USAGE.md
```

---

## Configure LLM Provider

```bash
# Interactive
ultimatrix init

# Or set env vars
export SENTINEL_PROVIDER=openai
export OPENAI_API_KEY=sk-...

# 11 providers available:
# openai, azure-openai, openrouter, anthropic, bedrock,
# gemini, groq, together, mistral, nvidia-nim, mock
```

---

## Testing

```bash
npx vitest run
# 307 tests, 19 files, 0 failures
```

---

## License

MIT
