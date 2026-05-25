---
name: sast
description: "Static analysis — source-to-sink taint tracking, secret scanning, entry point detection"
mitre_attack: T1595
---

## Static Analysis

### Taint Analysis
Use the `taint_analyze` tool to scan source code for source-to-sink data flow vulnerabilities.

### Secret Scanning
Use `exec_command` with `grep -r` patterns for:
- API keys, tokens, passwords in source code
- Hardcoded credentials
- `.env` files or exposed configuration

### Entry Point Detection
Examine source code for:
- Route handlers, controllers, API endpoints
- Database queries, shell exec calls
- File read/write operations
- Authentication/authorization logic

Document all findings with `write_file`.
