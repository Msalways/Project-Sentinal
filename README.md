# 🛡️ Project Sentinel

**AI-Powered Security Team-in-a-Box** — A multi-agent security testing platform with 30+ built-in security tools, live browser control, skill-based expert guidance, and autonomous pentest pipelines.

> Built for **Microsoft Build AI Hackathon 2026** | Track: Security in the Agentic Future

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.4+-blue.svg)](https://www.typescriptlang.org/)
[![Azure AI](https://img.shields.io/badge/Azure%20AI-Integrated-0078D4.svg)](https://azure.microsoft.com/ai)
[![30+ Tools](https://img.shields.io/badge/Security%20Tools-30+-brightgreen.svg)](#arsenal)
[![7 Agents](https://img.shields.io/badge/AI%20Agents-7-purple.svg)](#agents)
[![11 Providers](https://img.shields.io/badge/LLM%20Providers-11-blueviolet.svg)](#configure-llm-provider)

---

## Why Sentinel?

Traditional security scanners are **blind** — they fuzz randomly, produce false positives, and don't understand your app. Sentinel **learns** your application first, then attacks it intelligently with a team of specialized AI agents, each equipped with purpose-built security tools.

| Traditional Scanner | Project Sentinel |
|---------------------|------------------|
| Blind fuzzing | Context-aware attacks based on learned workflows |
| Generic tests | 30+ specialized tools per vulnerability class |
| High false positives | PoC-validated findings by Exploit Agent |
| Single-threaded | 7 AI agents working in parallel |
| Static rules | AI-powered reasoning with swappable LLMs |

---

## Modes of Operation

Sentinel supports **three** interaction modes:

### 🤖 Toolbox Mode (Scan)
The classic mode — 7 specialized agents with predefined tools run in a pipeline against your application.

```bash
npx tsx src/cli/index.ts scan --project ./my-project
```

### 🧠 Autonomous Operator (`sentinel assault`)
A **goal-driven autonomous pentest** — a single super-agent drives a live browser, runs shell commands, reads/writes files, and loads expert skill files on-demand through 4 phases:

```bash
npx tsx src/cli/index.ts assault -t https://target.com -o ./output
```

**4 Phases:**
| Phase | Goal |
|-------|------|
| 🔍 Recon | Explore target, map surface, discover endpoints via browser |
| 💥 Vulnerability | Find XSS, SQLi, SSRF, command injection, etc. |
| ⚡ Exploit | Exploit confirmed vulnerabilities for maximum impact |
| 📋 Report | Write findings, evidence, and remediation to deliverable files |

### 💬 Interactive REPL (`sentinel interact`)
A **live chat loop** with the autonomous agent — you talk to it in real-time, it thinks, acts with browser/shell/file tools, and responds:

```bash
npx tsx src/cli/index.ts interact -t https://target.com
```

Commands inside REPL:
- `/skills` — list available skill files
- `/skill <name>` — load expert guidance for a technique
- `/help` — show help
- `/quit` — exit

---

## 🧠 Skill System

Sentinel agents can load **expert skill files** on-demand during pentesting — specialized markdown guides with MITRE ATT&CK mappings, technique guidance, and exact commands.

| Skill | Domain | MITRE |
|-------|--------|-------|
| `web-recon` | Web reconnaissance | T1595 |
| `sql-injection` | SQL injection testing | T1190 |
| `xss` | Cross-site scripting | T1189 |
| `sast` | Static analysis | T1082 |

```bash
# List available skills (in REPL or agent prompt)
list_skills

# Load expert guidance
load_skill(name="sql-injection")
```

---

## 🤖 The AI Security Team

Sentinel orchestrates **7 specialized agents**, each a domain expert with its own toolset, system prompt, and reasoning strategy.

| Agent | Role | Tools |
|-------|------|-------|
| 🔍 **Recon Agent** | Maps attack surface, discovers endpoints, enumerates subdomains | `http_request`, `tech_detect`, `har_analyze`, `subdomain_enum`, `dir_bruteforce`, `secrets_scan`, `browser_navigate`, `browser_click`, `browser_extract`, `exec_command` |
| 🌐 **Web Agent** | Browser-based testing for XSS, SQLi, CSRF, CORS, rate limiting | `http_request`, `sql_inject`, `xss_inject`, `cors_audit`, `rate_limit_test`, `api_fuzz`, `header_analyze` |
| 📝 **Code Agent** | Static analysis, pattern matching, data flow tracing, secrets detection | `pattern_match`, `secrets_scan`, `entry_point_detect`, `source_sink_scan`, `reachability_analyze`, `finding_verify` |
| 🖧 **Network Agent** | Port scanning, SSL/TLS, security headers, cloud infrastructure | `port_scan`, `header_analyze`, `ssl_check`, `iam_policy_audit`, `k8s_manifest_audit`, `tfstate_audit` |
| 🔐 **Auth Agent** | JWT analysis, OAuth audit, auth bypass, privilege escalation | `jwt_parse`, `jwt_forge`, `oauth_audit`, `exploit_auth_bypass`, `exploit_authz`, `http_request` |
| 🔌 **API Agent** | GraphQL introspection, API fuzzing, dependency CVE analysis | `graphql_introspect`, `api_fuzz`, `cors_audit`, `rate_limit_test`, `dependency_enrich`, `cve_lookup`, `http_request` |
| 💥 **Exploit Agent** | Validates findings with safe PoCs — eliminates false positives | `http_request`, `sql_inject`, `xss_inject`, `exploit_auth_bypass`, `exploit_authz`, `jwt_forge` |

---

## 🔧 Arsenal — 30+ Security Tools

### Browser Control (Autonomous Mode)

| Tool | What It Does |
|------|-------------|
| `browser_navigate` | Navigate browser to URL with session management |
| `browser_click` | Click elements on the page |
| `browser_fill` | Fill form fields with values |
| `browser_screenshot` | Capture page screenshot |
| `browser_extract` | Extract text, HTML, or links from the page |
| `browser_evaluate` | Execute JavaScript in the browser context |
| `browser_close` | Close a browser session |

### Shell & File System (Autonomous Mode)

| Tool | What It Does |
|------|-------------|
| `exec_command` | Run shell commands with timeout and working directory |
| `read_file` | Read files from the filesystem |
| `write_file` | Write content to files (creates directories automatically) |

### Network & Infrastructure

| Tool | What It Does |
|------|-------------|
| `http_request` | Send HTTP requests with custom method, headers, and body |
| `port_scan` | Scan hosts for open ports with service identification (FTP, SSH, HTTP, MySQL, Redis, MongoDB, etc.) |
| `header_analyze` | Analyze HTTP security headers — detects missing HSTS, CSP, X-Frame-Options, X-Content-Type-Options |
| `ssl_check` | Check SSL/TLS configuration, certificate validity, HSTS max-age, and protocol version |

### Reconnaissance

| Tool | What It Does |
|------|-------------|
| `tech_detect` | Detect technologies, frameworks, and servers — React, Angular, Vue, Laravel, Django, WordPress, Nginx, IIS |
| `har_analyze` | Analyze HAR files for security issues — extracts endpoints, auth flows, sensitive data exposures, and JWTs |
| `subdomain_enum` | Enumerate subdomains via passive sources (crt.sh certificate transparency, HackerTarget) |
| `dir_bruteforce` | Discover hidden directories — probes for `/admin`, `/debug`, `/.env`, `/.git`, `/swagger`, `/graphql`, etc. |

### Code Analysis (SAST)

| Tool | What It Does |
|------|-------------|
| `pattern_match` | Scan source code for vulnerability patterns — SQL injection, XSS, eval(), command injection, path traversal, weak crypto |
| `secrets_scan` | Detect hardcoded secrets — AWS keys, GitHub tokens, Slack tokens, private keys, passwords, connection strings, JWT secrets |
| `entry_point_detect` | Identify application entry points — Express/Fastify/Next.js routes, Flask/Django URLs, Go handlers, WebSocket, CLI, file readers |
| `source_sink_scan` | Map data flow sources (user input) to sinks (dangerous functions) — traces req.body → query(), eval(), innerHTML, fs.writeFile |
| `reachability_analyze` | BFS-based call graph analysis — determines if a vulnerable sink is actually reachable from user input (reduces false positives) |
| `finding_verify` | LLM-driven false positive elimination — re-tests findings with category-specific payloads against the real target |

### Authentication & Authorization

| Tool | What It Does |
|------|-------------|
| `jwt_parse` | Decode and analyze JWT tokens — detects alg=none, expired tokens, missing claims, non-HTTPS issuers, admin privileges |
| `jwt_forge` | Forge JWT tokens with arbitrary claims and algorithms (none, HS256) for security testing |
| `oauth_audit` | Audit OAuth/OIDC flows — detects missing state/nonce/PKCE, implicit flow, insecure redirect URIs |

### API Security

| Tool | What It Does |
|------|-------------|
| `graphql_introspect` | Query GraphQL introspection — enumerates types, queries, mutations, and identifies IDOR candidates |
| `cors_audit` | Test CORS configuration — detects wildcard origins, credential reflection, permissive methods/headers |
| `rate_limit_test` | Test API rate limiting — sends rapid requests, detects 429 responses, analyzes rate limit headers |
| `api_fuzz` | Fuzz API parameters — tests mass assignment (`isAdmin: true`), type confusion, negative quantities, SQL/XSS payloads |

### Vulnerability Testing Payloads

| Category | Payloads | Techniques Covered |
|----------|----------|-------------------|
| **XSS** | 22 payloads | Script variants, event handlers, attribute breaks, JS URIs, Unicode/encoding bypass, template literals, polyglot, MathML/iframe DOMPurify bypass |
| **SQLi** | 25 payloads | Boolean differential (1=1 vs 1=2), UNION enumeration (1-3 cols), time-based with baselines, error-based, ORDER BY column enum, stacked queries |
| **SSRF** | 25 payloads | Localhost, private IPs, AWS metadata, IPv6, scheme manipulation (file://, gopher://, dict://), open redirect evasions |
| **CSRF** | Form CSRF token detection, SameSite cookie analysis, CORS+credentials check, direct state-changing endpoint probes |
| **NoSQLi** | 13 payloads | `$ne`, `$gt`, `$regex`, `$where`, `$exists`, `$in`, `$nin`, `$type` both URL-encoded and JSON |
| **XXE** | 9 payloads | File read (Linux/Windows), SSRF, blind XXE, XInclude, SVG XXE, DTD external entity, OOB exfiltration |
| **SSTI** | 19 payloads | Jinja2, Freemarker, Velocity, Thymeleaf, Jade/Pug, ERB, Smarty, universal payload |
| **Command Injection** | 24 payloads | Semicolon, pipe, backtick, subshell, newline, time-based (sleep/ping/timeout), output capture (echo/whoami/id) |

### Cloud & Infrastructure

| Tool | What It Does |
|------|-------------|
| `iam_policy_audit` | Audit AWS IAM policies — detects wildcard actions/resources, privilege escalation (iam:Create, sts:AssumeRole) |
| `k8s_manifest_audit` | Audit Kubernetes manifests — detects privileged containers, root users, dangerous capabilities, hostNetwork, wildcard RBAC |
| `tfstate_audit` | Audit Terraform state files — finds plaintext passwords, API keys, tokens, private keys, connection strings |

### Vulnerability Intelligence

| Tool | What It Does |
|------|-------------|
| `cve_lookup` | Look up CVE details from NVD with CVSS scoring and EPSS exploitability probability |
| `dependency_enrich` | Parse lockfiles (package-lock.json, requirements.txt, go.sum) — extracts all dependencies for CVE analysis |

### Expert Knowledge

| Tool | What It Does |
|------|-------------|
| `load_skill` | Load a skill file by name — injects expert guidance into agent context |
| `search_skills` | Search skill catalog by keyword — finds relevant techniques |
| `list_skills` | List all available skills with descriptions and MITRE mappings |

### Exploit Testing

| Tool | What It Does |
|------|-------------|
| `sql_inject` | Test for SQL injection — boolean-based blind, UNION-based, time-based blind (MSSQL WAITFOR, MySQL SLEEP), ORDER BY enumeration |
| `xss_inject` | Test for XSS — reflected, event handler, attribute break, JavaScript URI, SVG-based payloads with reflection detection |
| `exploit_auth_bypass` | Test authentication bypass — JWT alg=none, HS256→none attack, header injection (X-Original-URL, X-Forwarded-For), method override |
| `exploit_authz` | Test authorization bypass — IDOR, horizontal escalation, vertical escalation, mass assignment (__proto__, constructor, prototype) |

---

## How It Works

### Phase 1: Learn

User interacts with a Sentinel-controlled browser. Every click, navigation, and API call is captured into a HAR file. Sentinel builds a complete understanding of your app's architecture, roles, and data flows.

### Phase 2: Understand

The LLM analyzes captured data to produce a scenario manifest with dependency graphs, access matrices, input point inventories, and auto-generated Playwright tests.

### Phase 3: Attack

7 AI agents work in parallel, each using their specialized toolset:

```
Recon Agent ────────→ Maps attack surface, finds 47 endpoints, 3 unauthenticated APIs
       ↓
Web Agent ──────────→ Tests 12 input points, finds SQLi in login, XSS in search
       ↓
Code Agent ─────────→ Scans 2,340 files, finds hardcoded AWS key, unsafe eval()
       ↓
Network Agent ──────→ Scans ports, finds missing HSTS, outdated TLS
       ↓
Auth Agent ─────────→ Forges JWT with alg=none, bypasses auth on /admin
       ↓
API Agent ──────────→ Fuzzes 8 endpoints, finds mass assignment on /api/users
       ↓
Exploit Agent ──────→ Validates all findings with PoCs, eliminates 3 false positives
```

### Phase 4: Report

Correlated findings with risk scoring (0-100), severity classification, proof-of-concept evidence, and remediation guidance in HTML, JSON, or Markdown.

---

## Quick Start

### Demo (No API Key Needed)

```bash
npx tsx src/cli/index.ts demo
```

### Learn Your Application

```bash
# Opens a browser — navigate through your app's workflows
npx tsx src/cli/index.ts learn https://your-app.com --output ./my-project

# Generates:
#   ./my-project/session.har          — Recorded network traffic
#   ./my-project/sentinel.yaml        — Auto-generated scenario manifest
#   ./my-project/tests/*.spec.ts      — Playwright tests (happy + security)
```

### Run Security Scan

```bash
# Full assessment
npx tsx src/cli/index.ts scan --project ./my-project

# From HAR file
npx tsx src/cli/index.ts scan --har session.har --target https://your-app.com

# CI/CD mode (exit code 1 on critical vulns)
npx tsx src/cli/index.ts scan --project ./my-project --ci --fail-on critical
```

### Autonomous Pentest (New!)

```bash
# Goal-driven 4-phase pentest with live browser, shell, and file tools
npx tsx src/cli/index.ts assault -t https://target.com -o ./output
```

### Interactive REPL (New!)

```bash
# Live chat with the autonomous agent
npx tsx src/cli/index.ts interact -t https://target.com

# Specify provider and model
npx tsx src/cli/index.ts interact -t https://target.com --provider openai --model gpt-4o
```

### Explore Tools & Agents

```bash
# List all 30+ security tools
npx tsx src/cli/index.ts tools

# List all 7 AI agents
npx tsx src/cli/index.ts agents

# Analyze a HAR file
npx tsx src/cli/index.ts har session.har

# Generate a report
npx tsx src/cli/index.ts report --project ./my-project
```

### Configure LLM Provider

```bash
# 11 supported providers
npx tsx src/cli/index.ts init --provider azure-openai --endpoint https://your-resource.openai.azure.com
npx tsx src/cli/index.ts init --provider openai
npx tsx src/cli/index.ts init --provider openrouter
npx tsx src/cli/index.ts init --provider anthropic
npx tsx src/cli/index.ts init --provider bedrock
npx tsx src/cli/index.ts init --provider gemini
npx tsx src/cli/index.ts init --provider groq
npx tsx src/cli/index.ts init --provider together
npx tsx src/cli/index.ts init --provider mistral
npx tsx src/cli/index.ts init --provider nvidia-nim
npx tsx src/cli/index.ts init --provider mock
```

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  SENTINEL SDK                                                   │
│                                                                 │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐   │
│  │ LEARN MODE   │  │ SCAN MODE    │  │ CI/CD MODE           │   │
│  │              │  │              │  │                      │   │
│  │ • Opens      │  │ • AutoGen    │  │ • Headless scan      │   │
│  │   browser    │  │   team of    │  │ • Regression         │   │
│  │ • Records    │  │   7 agents   │  │ • Gate on vulns      │   │
│  │   HAR + DOM  │  │ • 30+ tools  │  │ • JSON output        │   │
│  │ • Generates  │  │ • Exploit    │  │                      │   │
│  │   Playwright │  │   validation │  │                      │   │
│  │   tests      │  │ • Report     │  │                      │   │
│  └──────────────┘  └──────────────┘  └──────────────────────┘   │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │ NEW: Autonomous Mode (assault)                           │   │
│  │                                                          │   │
│  │  Recon → Vuln → Exploit → Report                        │   │
│  │  • Live browser control (navigate/click/fill/extract)    │   │
│  │  • Shell commands (exec_command)                         │   │
│  │  • File system (read_file, write_file)                   │   │
│  │  • Skill files (load/search/list)                        │   │
│  │  • Persistent sessions across tool calls                 │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │ NEW: Interactive REPL (interact)                         │   │
│  │  • Multi-turn chat loop with autonomous agent             │   │
│  │  • Real-time thinking + tool call streaming               │   │
│  │  • /skills /skill /help /quit commands                    │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  REGISTRY PATTERN                                        │   │
│  │                                                          │   │
│  │  ToolRegistry     → 30+ security tools by category       │   │
│  │  AgentRegistry    → 7 specialized AI agents              │   │
│  │  ProviderRegistry → All 11 LLM providers                 │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  LLM PROVIDERS (11 swappable)                            │   │
│  │  Azure OpenAI │ OpenAI (inc. Together) │ OpenRouter      │   │
│  │  Anthropic │ AWS Bedrock │ Google Gemini │ Groq          │   │
│  │  Mistral AI │ NVIDIA NIM │ Mock                          │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

---

## Tech Stack

| Component | Technology |
|-----------|-----------|
| Language | TypeScript (ESM, strict mode) |
| AI Orchestration | LangChain + Deep Agents (AutoGen-style) |
| LLM Providers | 11 providers — Azure OpenAI, OpenAI, OpenRouter, Anthropic, AWS Bedrock, Google Gemini, Groq, Together AI, Mistral AI, NVIDIA NIM, Mock |
| Browser Automation | Playwright (headed + headless) |
| Validation | Zod schemas for all tool inputs |
| CLI | Command-based with help, demos, and interactive REPL |
| Extensibility | Registry pattern for tools, agents, providers |
| Skill System | YAML-frontmatter markdown files with MITRE ATT&CK |

---

## Project Structure

```
project-sentinal/
├── src/
│   ├── core/              — Types, config, Result monad, BrowserSession, SkillLoader, LLM interface
│   ├── providers/         — 11 LLM provider factories (Azure, OpenAI, Bedrock, Gemini, etc.)
│   ├── agents/            — 7 specialized security agents + autonomous deep agent
│   ├── tools/             — 30+ security tools, HAR parser, scenario parser, scoring, test generator
│   ├── browser/           — Playwright viewport, command executor, agent loop
│   ├── pipeline/          — Scan pipeline, autonomous orchestrator, report generator, thinking handler
│   ├── engine/            — Security engine types and orchestration
│   └── cli/               — CLI commands (init, learn, scan, demo, test, har, report, assault, interact)
├── tests/
│   ├── core/              — Config, types, result, context, browser-session, skill-loader tests
│   ├── tools/             — HAR parser, scoring, OWASP mapper, confidence, scenario-parser, test-generator tests
│   ├── agents/            — Agent registry, deep agent tests
│   ├── cli/               — Logger tests
│   ├── pipeline/          — Autonomous, filter, headless-timing tests
│   └── browser/           — Viewport navigation tests
├── skills/
│   ├── recon/web-recon/   — Web reconnaissance skill (MITRE T1595)
│   ├── exploit/sqli/      — SQL injection skill (MITRE T1190)
│   ├── exploit/xss/       — XSS skill (MITRE T1189)
│   └── code/sast/         — Static analysis skill (MITRE T1082)
├── README.md
└── vitest.config.ts
```

---

## Testing

```bash
# Run all 307 tests
npx vitest run

# Watch mode
npx vitest

# Run specific test suite
npx vitest run tests/core/config.test.ts
```

All tests live in `tests/` mirroring `src/` structure. **307 tests across 19 test files — 0 failures.**

---

## License

MIT
