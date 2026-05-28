# Sentinel Security Tools Reference

Complete reference for all 30+ security tools in Ultimatrix. Each tool is a LangChain-compatible function with Zod-validated inputs, designed for AI agent consumption.

---

## Network & Infrastructure

### `http_request`
Send HTTP requests with custom method, headers, and body. This is the foundational tool all other web testing tools build on.

```
Example: GET https://api.example.com/users with Authorization header
→ Returns status code, response headers, and body (truncated to 3000 chars)
```

### `port_scan`
Scan a host for open ports and identify running services. Supports custom port lists or ranges, with built-in service detection for common ports (FTP, SSH, HTTP, MySQL, Redis, MongoDB).

```
Example: Scan 192.168.1.1 on ports [22, 80, 443, 3306, 8080]
→ Returns: Port 22: open (SSH), Port 80: open (HTTP), Port 3306: closed
```

### `header_analyze`
Analyze HTTP response headers for security misconfigurations. Checks for missing critical headers like HSTS, CSP, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, and Permissions-Policy.

```
Example: Analyze https://example.com
→ Returns: Missing HSTS (downgrade attack risk), Missing CSP (XSS risk), Server: nginx/1.24
```

### `ssl_check`
Check SSL/TLS certificate validity, expiration, and configuration. Verifies HTTPS usage, HSTS max-age (warns if < 1 year), and detects protocol version.

```
Example: Check https://expired-cert.example.com
→ Returns: HTTPS: Yes, HSTS: Missing, Issues: Certificate expired 2024-01-15
```

---

## Reconnaissance

### `tech_detect`
Detect technologies, frameworks, and server software used by a website. Identifies React/Next.js, Angular, Vue, Laravel, Django, Rails, WordPress, Nginx, Apache, IIS, and Cloudflare from headers and HTML signatures.

```
Example: Detect technologies on https://shop.example.com
→ Returns: React/Next.js, Nginx, Cloudflare, x-powered-by: Express
```

### `har_analyze`
Analyze HAR (HTTP Archive) files captured from browser sessions. Extracts unique URLs, identifies authenticated vs unauthenticated endpoints, and detects sensitive data exposures (JWTs, API keys, PII) in responses.

```
Example: Analyze session.har from a login workflow recording
→ Returns: 47 unique URLs, 12 authenticated endpoints, 3 JWT tokens found in responses
```

### `subdomain_enum`
Enumerate subdomains via passive sources — queries crt.sh (certificate transparency logs) and HackerTarget API. No active scanning, so it's stealthy and fast.

```
Example: Enumerate subdomains for example.com
→ Returns: api.example.com, admin.example.com, staging.example.com, dev.example.com
```

### `dir_bruteforce`
Discover hidden directories and files by probing common paths. Tests for `/admin`, `/login`, `/debug`, `/.env`, `/.git`, `/swagger`, `/graphql`, `/phpmyadmin`, `/backup`, and 15+ other common paths.

```
Example: Bruteforce https://target.com with default wordlist
→ Returns: [200] /admin (2.4KB), [301] /.git, [200] /swagger (15KB), [200] /.env (340B)
```

---

## Code Analysis (SAST)

### `pattern_match`
Scan source code files for security vulnerability patterns using regex. Detects SQL injection (`query("..."+var)`), reflected XSS (`res.write(req.params)`), hardcoded secrets, `eval()` usage, command injection, path traversal, and weak crypto (MD5, SHA1, DES).

```
Example: Scan ./src for vulnerability patterns across 2,340 files
→ Returns: [critical] auth/login.ts:45 - sql_injection: query("SELECT * FROM users WHERE id=" + req.body.id)
```

### `secrets_scan`
Detect hardcoded secrets, API keys, tokens, and credentials in source code. Identifies AWS Access Keys (AKIA...), AWS Secret Keys, GitHub tokens (ghp_...), Slack tokens (xoxb-...), private keys, passwords, connection strings, and JWT secrets.

```
Example: Scan ./backend for hardcoded secrets
→ Returns: [critical] config/aws.ts:12 - AWS Access Key: AKIAIOSFODNN7EXAMPLE
           [high] .env.production:3 - Password assignment: password = "super_secret_123"
```

### `entry_point_detect`
Identify all application entry points where user input enters the system. Detects HTTP route handlers (Express, Fastify, Next.js, Flask, Django, Go), WebSocket handlers, CLI argument parsers, and file/stdin readers.

```
Example: Detect entry points in ./api
→ Returns: HTTP: 34 routes, WebSocket: 2 handlers, CLI: 3 entry points, File readers: 8
           [http] routes/user.ts:12 - Express route: app.get('/users/:id', ...)
```

### `source_sink_scan`
Map data flow from sources (user input: req.body, req.query, req.headers, env vars, file input) to sinks (dangerous functions: SQL execution, command execution, eval, HTML output, file write, redirect, deserialization). Helps trace how untrusted data flows through the application.

```
Example: Scan ./src for sources and sinks
→ Returns: Sources: 142 (87 req.body, 34 req.query, 21 req.headers)
           Sinks: 67 (23 SQL execution, 12 eval/exec, 18 HTML output, 14 deserialization)
           ⚠️ Check if any source flows to a sink without sanitization
```

### `reachability_analyze`
BFS-based call graph analysis to determine if a vulnerable sink is actually reachable from a user-controlled entry point. Significantly reduces false positives by proving whether an exploit path exists.

```
Example: Check if 'getUserById' entry point reaches 'SQL execution' sink
→ Returns: ✅ REACHABLE: getUserById() → buildQuery() → db.query() → SQL execution
           The sink IS reachable through 3 function calls — likely exploitable
```

### `finding_verify`
LLM-driven false positive elimination. Takes a reported vulnerability and its code snippet, then analyzes whether input is sanitized, middleware/WAF protections exist, the sink is reachable from user input, and type constraints prevent exploitation.

```
Example: Verify "SQL injection in getUserById" with code snippet
→ Returns: Analysis: Input is parameterized via prepared statement → NOT exploitable (false positive)
```

---

## Authentication & Authorization

### `jwt_parse`
Decode and analyze JWT tokens for security issues. Detects `alg=none` (unsigned tokens), expired tokens, missing expiration claims, non-HTTPS issuers, and admin privilege claims. Shows full header and payload decoded.

```
Example: Parse eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0.eyJzdWIiOiIxMjM0NTY3ODkwIiwicm9sZSI6ImFkbWluIn0.
→ Returns: ⚠️ CRITICAL: alg=none — token can be forged without signature
           ℹ️ Token has admin privileges, ⚠️ No expiration (exp) claim
```

### `jwt_forge`
Forge JWT tokens with arbitrary claims and algorithms (`none` or `HS256`) for security testing. Useful for testing if the server properly validates signatures and rejects unsigned tokens.

```
Example: Forge token with payload {"sub": "admin", "role": "superadmin", "iat": 1700000000} using alg=none
→ Returns: eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0.eyJzdWIiOiJhZG1pbiIsInJvbGUiOiJzdXBlcmFkbWluIn0.
           Use this token in Authorization header to test for JWT validation bypass
```

### `oauth_audit`
Audit OAuth/OIDC callback URLs and authentication flows for security misconfigurations. Detects missing `state` parameter (CSRF risk), missing `nonce` (OIDC replay risk), implicit flow usage (token in URL), and missing PKCE `code_challenge`.

```
Example: Audit https://app.example.com/auth/callback
→ Returns: ⚠️ Missing state parameter — CSRF attack possible
           ⚠️ Missing PKCE code_challenge — authorization code interception risk
           ⚠️ Implicit flow detected (response_type=token) — token exposed in URL
```

---

## API Security

### `graphql_introspect`
Query a GraphQL endpoint's introspection API to enumerate the full schema. Lists all queries, mutations, types, and their arguments. Automatically identifies potential IDOR candidates (queries containing "id", "user", "get", "find" in their names).

```
Example: Introspect https://api.example.com/graphql
→ Returns: Queries: 24 (getUser(id), findUserByEmail, getOrders(userId), ...)
           Mutations: 12 (createUser, updateUser, deleteOrder, ...)
           IDOR candidates: getUser, findUserByEmail, getOrders, findPostById
```

### `cors_audit`
Test CORS (Cross-Origin Resource Sharing) configuration by sending requests with `Origin: https://evil.com`. Detects wildcard origins (`*`), origin reflection, credentials with permissive origins, and overly permissive methods/headers.

```
Example: Audit CORS on https://api.example.com/data
→ Returns: ⚠️ CRITICAL: CORS reflects arbitrary Origin — allows https://evil.com
           ⚠️ HIGH: CORS allows credentials with origin — session hijacking risk
           Headers: ACAO: https://evil.com, ACAC: true, ACAM: GET,POST,PUT,DELETE
```

### `rate_limit_test`
Test API endpoints for rate limiting by sending rapid sequential requests. Tracks response status codes (429 = rate limited), measures response times, and checks for rate limit headers (`X-RateLimit-Remaining`, `Retry-After`).

```
Example: Test rate limiting on POST https://api.example.com/login with 20 requests
→ Returns: 18/20 rate limited (429), Rate limit headers: Present (Retry-After: 60)
           ✅ Rate limiting active after ~2 requests, Avg response time: 45ms
```

### `api_fuzz`
Fuzz API parameters with dangerous payloads to discover mass assignment, type confusion, and unexpected behavior. Tests `isAdmin: true`, `role: "admin"`, negative quantities (`price: 0.01, quantity: -999`), SQL injection, and XSS payloads in request bodies.

```
Example: Fuzz POST https://api.example.com/users with params ["name", "email", "role"]
→ Returns: Payload {"isAdmin":true} → 200 OK (response contains "admin": true)
           ⚠️ Interesting responses: 1 — mass assignment vulnerability detected
```

---

## Cloud & Infrastructure

### `iam_policy_audit`
Audit AWS IAM policy JSON documents for privilege escalation primitives and dangerous permissions. Detects wildcard actions (`"Action": "*"`), wildcard resources, privilege escalation paths (`iam:CreateUser`, `iam:AttachRolePolicy`), and role assumption (`sts:AssumeRole`).

```
Example: Audit IAM policy with "Action": ["iam:*", "s3:*"], "Resource": "*"
→ Returns: ⚠️ CRITICAL: Wildcard (*) action — full account access
           ⚠️ Privilege escalation risk: iam:CreateUser
           ⚠️ CRITICAL: Wildcard (*) resource — applies to all resources
```

### `k8s_manifest_audit`
Audit Kubernetes manifests for security misconfigurations. Detects privileged containers, containers running as root (UID 0), dangerous capabilities (SYS_ADMIN, ALL), hostNetwork/hostPID sharing, and wildcard RBAC rules.

```
Example: Audit deployment.yaml with privileged container and hostNetwork
→ Returns: ⚠️ CRITICAL: Privileged container: nginx-proxy
           ⚠️ hostNetwork enabled — container shares host network namespace
           ⚠️ Wildcard RBAC: ["*"] ["*"] — full cluster access
```

### `tfstate_audit`
Audit Terraform state files (`terraform.tfstate`) for plaintext secrets and sensitive data. Scans for passwords, API keys, tokens, private keys, and connection strings stored in resource attributes.

```
Example: Audit terraform.tfstate for exposed secrets
→ Returns: ⚠️ Found sensitive data matching: password
           ⚠️ Plaintext secret in aws_db_instance.main: password
           ⚠️ Found sensitive data matching: connection_string
```

---

## Vulnerability Intelligence

### `cve_lookup`
Look up CVE details from the NVD (National Vulnerability Database) with EPSS (Exploit Prediction Scoring System) probability scores. Returns CVSS base score, severity, vector string, exploit probability, and references.

```
Example: Look up CVE-2024-21762 (Fortinet firewall bypass)
→ Returns: CVSS: 9.8 (CRITICAL) - AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H
           EPSS: 87.34% exploit probability (percentile: 99.2%)
           Description: Out-of-bounds write in FortiOS allows unauthenticated attacker...
```

### `dependency_enrich`
Parse dependency lockfiles and extract all packages for vulnerability analysis. Supports `package-lock.json` (Node.js), `requirements.txt` (Python), and `go.sum` (Go). Lists all dependencies with versions for follow-up CVE lookups.

```
Example: Parse ./package-lock.json
→ Returns: Found 847 dependencies
           - express@4.18.2, - lodash@4.17.21, - axios@1.6.0, - jsonwebtoken@9.0.2
           Use cve_lookup to check specific packages for known vulnerabilities
```

---

## Exploit Testing

### `sql_inject`
Test parameters for SQL injection using safe, non-destructive payloads. Tests boolean-based blind (`' OR 1=1--`), UNION-based (`' UNION SELECT NULL--`), time-based blind for MSSQL (`WAITFOR DELAY`) and MySQL (`SLEEP(5)`), and ORDER BY enumeration. Detects SQL error messages and response time delays.

```
Example: Test GET https://app.example.com/search?q= for SQLi on "q" parameter
→ Returns: [Boolean-based] ' OR 1=1-- → Status 200, Time 45ms — No indicator
           [Time-based] ' AND SLEEP(5)-- → Status 200, Time 5234ms
           ⚠️ Time delay detected — possible blind SQLi
```

### `xss_inject`
Test parameters for Cross-Site Scripting (XSS) using safe payloads. Tests basic reflected (`<script>alert(1)</script>`), event handler (`<img onerror=alert(1)>`), attribute break (`"><script>`), JavaScript URI, and SVG-based payloads. Detects whether payloads are reflected without encoding.

```
Example: Test GET https://app.example.com/search?q= for XSS on "q" parameter
→ Returns: [Basic reflected] Reflected: true, Encoded: false, Status 200
           [Event handler] Reflected: true, Encoded: false, Status 200
           ⚠️ VULNERABLE: 2 payloads reflected without encoding
```

### `exploit_auth_bypass`
Test authentication bypass techniques. Analyzes JWT tokens for HS256→none algorithm confusion attacks, generates forged tokens with `alg=none`, and suggests header injection techniques (`X-Original-URL`, `X-Forwarded-For`, `X-HTTP-Method-Override`) for bypassing access controls.

```
Example: Test auth bypass on https://app.example.com/admin with JWT token
→ Returns: Token uses HS256 — try changing alg to none and removing signature
           alg=none forgery: eyJhbGciOiJub25lIn0.eyJzdWIiOiIxIn0.
           Header injection: Try X-Original-URL: /admin, X-Forwarded-For: 127.0.0.1
```

### `exploit_authz`
Test authorization bypass vulnerabilities including IDOR (Insecure Direct Object Reference), horizontal privilege escalation, vertical privilege escalation, and mass assignment. Provides specific test instructions for each technique.

```
Example: Test authz on https://api.example.com/users/42 with admin token
→ Returns: IDOR test: GET /users/42 with your token — if you get data, it's vulnerable
           Horizontal escalation: Change user ID to another user's ID
           Vertical escalation: Add role: "admin" or isAdmin: true to request body
           Mass assignment: Add __proto__, constructor, prototype to request body
```
