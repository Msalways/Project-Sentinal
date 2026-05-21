# 🛡️ Project Sentinel

**AI-Powered Security Team-in-a-Box** — A multi-agent security testing platform with 30+ built-in security tools orchestrated by 7 specialized AI agents.

> Built for **Microsoft Build AI Hackathon 2026** | Track: Security in the Agentic Future

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.4+-blue.svg)](https://www.typescriptlang.org/)
[![Azure AI](https://img.shields.io/badge/Azure%20AI-Integrated-0078D4.svg)](https://azure.microsoft.com/ai)
[![30+ Tools](https://img.shields.io/badge/Security%20Tools-30+-brightgreen.svg)](#arsenal)
[![7 Agents](https://img.shields.io/badge/AI%20Agents-7-purple.svg)](#agents)

---

## Why Sentinel?

Traditional security scanners are **blind** — they fuzz randomly, produce false positives, and don't understand your app. Sentinel **learns** your application first, then attacks it intelligently with a team of specialized AI agents, each equipped with purpose-built security tools.

| Traditional Scanner | Project Sentinel |
|---------------------|------------------|
| Blind fuzzing | Context-aware attacks based on learned workflows |
| Generic tests | 30+ specialized tools per vulnerability class |
| High false positives | PoC-validated findings by Exploit Agent |
| Single-threaded | 7 AI agents working in parallel |
| Static rules | AI-powered reasoning with Azure OpenAI |

---

## 🤖 The AI Security Team

Sentinel orchestrates **7 specialized agents**, each a domain expert with its own toolset, system prompt, and reasoning strategy.

| Agent | Role | Tools |
|-------|------|-------|
| 🔍 **Recon Agent** | Maps attack surface, discovers endpoints, enumerates subdomains | `http_request`, `tech_detect`, `har_analyze`, `subdomain_enum`, `dir_bruteforce`, `secrets_scan` |
| 🌐 **Web Agent** | Browser-based testing for XSS, SQLi, CSRF, CORS, rate limiting | `http_request`, `sql_inject`, `xss_inject`, `cors_audit`, `rate_limit_test`, `api_fuzz`, `header_analyze` |
| 📝 **Code Agent** | Static analysis, pattern matching, data flow tracing, secrets detection | `pattern_match`, `secrets_scan`, `entry_point_detect`, `source_sink_scan`, `reachability_analyze`, `finding_verify` |
| 🖧 **Network Agent** | Port scanning, SSL/TLS, security headers, cloud infrastructure | `port_scan`, `header_analyze`, `ssl_check`, `iam_policy_audit`, `k8s_manifest_audit`, `tfstate_audit` |
| 🔐 **Auth Agent** | JWT analysis, OAuth audit, auth bypass, privilege escalation | `jwt_parse`, `jwt_forge`, `oauth_audit`, `exploit_auth_bypass`, `exploit_authz`, `http_request` |
| 🔌 **API Agent** | GraphQL introspection, API fuzzing, dependency CVE analysis | `graphql_introspect`, `api_fuzz`, `cors_audit`, `rate_limit_test`, `dependency_enrich`, `cve_lookup`, `http_request` |
| 💥 **Exploit Agent** | Validates findings with safe PoCs — eliminates false positives | `http_request`, `sql_inject`, `xss_inject`, `exploit_auth_bypass`, `exploit_authz`, `jwt_forge` |

---

## 🔧 Arsenal — 30+ Security Tools

Every tool is a LangChain-compatible function with Zod-validated inputs, built for AI agent consumption.

### Network & Infrastructure

| Tool | What It Does |
|------|-------------|
| `http_request` | Send HTTP requests with custom method, headers, and body — the foundation for all web testing |
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
| `finding_verify` | LLM-driven false positive elimination — evaluates reported vulnerabilities against code context and sanitization checks |

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
# Azure OpenAI (recommended)
npx tsx src/cli/index.ts init --provider azure-openai --endpoint https://your-resource.openai.azure.com

# OpenAI, OpenRouter, or Anthropic
npx tsx src/cli/index.ts init --provider openai
npx tsx src/cli/index.ts init --provider openrouter
npx tsx src/cli/index.ts init --provider anthropic
```

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  SENTINEL SDK                                               │
│                                                             │
│  ┌─────────────┐  ┌──────────────┐  ┌──────────────────┐   │
│  │ LEARN MODE  │  │ SCAN MODE    │  │ CI/CD MODE       │   │
│  │             │  │              │  │                  │   │
│  │ • Opens      │  │ • AutoGen    │  │ • Headless scan  │   │
│  │   browser    │  │   team of    │  │ • Regression     │   │
│  │ • Records    │  │   7 agents   │  │ • Gate on vulns  │   │
│  │   HAR + DOM  │  │ • 30+ tools  │  │ • JSON output    │   │
│  │ • Generates  │  │ • Exploit    │  │                  │   │
│  │   Playwright │  │   validation │  │                  │   │
│  │   tests      │  │ • Report     │  │                  │   │
│  └─────────────┘  └──────────────┘  └──────────────────┘   │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  REGISTRY PATTERN                                    │   │
│  │                                                      │   │
│  │  ToolRegistry    → 30+ security tools by category    │   │
│  │  AgentRegistry   → 7 specialized AI agents           │   │
│  │  ProviderRegistry → Azure, OpenAI, OpenRouter, etc.  │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  LLM PROVIDERS (swappable)                           │   │
│  │  Azure OpenAI │ OpenAI │ OpenRouter │ Anthropic       │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

---

## Tech Stack

| Component | Technology |
|-----------|-----------|
| Language | TypeScript (ESM, strict mode) |
| AI Orchestration | LangChain + Deep Agents (AutoGen-style) |
| LLM Providers | Azure OpenAI, OpenAI, OpenRouter, Anthropic |
| Browser Automation | Playwright |
| Validation | Zod schemas for all tool inputs |
| CLI | Command-based with help and demos |
| Extensibility | Registry pattern for tools, agents, providers |

---

## Project Structure

```
project-sentinal/
├── src/
│   ├── core/              — Types, config, Result monad, LLM interface
│   ├── providers/         — Azure OpenAI, OpenAI, OpenRouter, Anthropic factories
│   ├── agents/            — 7 specialized security agents with system prompts
│   ├── tools/             — 30+ security tools, HAR parser, scoring, test generator
│   ├── browser/           — Playwright viewport, command executor, agent loop
│   ├── pipeline/          — Full scan pipeline, report generator
│   ├── cli/               — CLI commands (init, learn, scan, demo, test, har, report)
│   └── index.ts           — SDK entry point
├── docs/                  — Getting started, LLM integration, usage guides
├── hackathon/             — Deck content, demo script
├── sample-data/           — Sample HAR file and scenario manifest
└── scripts/               — Build and utility scripts
```

---

## License

MIT
