# Project Sentinel — 3-Minute Demo Video Script
# Microsoft Build AI Hackathon 2026

## Setup (Before Recording)
- Have a terminal open in project-sentinal directory
- Have the generated HTML report ready to open in browser
- Have the sample HAR file at sample-data/shop.har

---

## Script (3:00 total)

### 0:00 - 0:20 | Introduction
*"Hi, I'm [Name] and this is Project Sentinel — an AI-powered security team-in-a-box. Instead of waiting months for a penetration test, Sentinel learns your application and tests it autonomously with a team of specialized AI agents."*

### 0:20 - 0:50 | The Problem & Solution
*"Traditional security scanners are blind to your app's actual workflows. They fuzz endpoints randomly and produce hundreds of false positives. Sentinel is different — it first learns how your app works by watching real user interactions, then it tests intelligently."*

### 0:50 - 1:30 | Learn Mode Demo
*"Let me show you. First, I'll run Sentinel's learn mode against a sample e-commerce app."*

[Run command in terminal]
```
npx tsx src/cli/index.ts demo
```

*"Sentinel just ran its full agent team in demo mode. It found 6 vulnerabilities including SQL injection, IDOR, XSS, and hardcoded API keys. Let me show you the report."*

### 1:30 - 2:10 | Report Walkthrough
[Open the generated HTML report in browser]

*"Here's the security report. You can see the risk dashboard — score of 72 out of 100, critical risk level. Each finding includes the severity, location, evidence, and specific remediation guidance. The SQL injection in the login form is critical — it allows complete authentication bypass."*

[Scroll through findings]

*"Notice that every finding has a proof-of-concept. Sentinel doesn't report theoretical vulnerabilities — it validates each one."*

### 2:10 - 2:40 | HAR Analysis & Test Generation
*"Now let me show you HAR analysis. This is a recorded session from a real application."*

[Run command]
```
npx tsx src/cli/index.ts har sample-data/shop.har
```

*"Sentinel found 7 endpoints, 4 with authentication, and 9 sensitive data exposures including SSNs, JWT tokens, and API keys. From this, it automatically generates Playwright tests — both functional tests for happy paths and security tests for attack scenarios."*

### 2:40 - 3:00 | Architecture & Close
*"Under the hood, Sentinel uses Azure OpenAI GPT-4o for agent reasoning, AutoGen-style multi-agent orchestration with 6 specialized agents, and Playwright for browser automation. It's extensible through MCP — teams can add their own security tools."*

*"Project Sentinel — your security team, automated. Thank you."*

---

## Recording Tips

1. **Resolution:** Record at 1080p minimum (720p required)
2. **Audio:** Use a good microphone, speak clearly
3. **Pacing:** Practice once before recording — aim for 2:50 to allow buffer
4. **Terminal:** Use a clean terminal with a readable font size (14pt+)
5. **Browser:** Use a clean browser profile with no personal tabs visible
6. **Editing:** Add text overlays for key points if needed
7. **Upload:** Upload to YouTube as "Unlisted" and include the link in submission

---

## Commands to Run During Demo

```bash
# 1. Demo mode (shows full agent team working)
npx tsx src/cli/index.ts demo

# 2. HAR analysis (shows deep traffic analysis)
npx tsx src/cli/index.ts har sample-data/shop.har

# 3. Open the generated report
# (Open sentinel-report-*.html in browser)
```
