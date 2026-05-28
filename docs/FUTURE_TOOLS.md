# Future Tool Integrations

Security tools planned for future integration into Ultimatrix. These will expand coverage across web, network, cloud, and API security testing.

---

## High Priority

### Web Application Security

| Tool | Description |
|------|-------------|
| `ssrf_test` | Test endpoints for Server-Side Request Forgery via callback URLs, webhook endpoints, and internal IP access (169.254.169.254, localhost, internal ranges) |
| `xxe_test` | Test XML parsers for XXE injection via external entity payloads, billion laughs attacks, and local file read through XML processing |
| `ssti_test` | Test for Server-Side Template Injection in template engines — Jinja2, Twig, EJS, Handlebars, Mustache via polyglot payloads |
| `cmd_inject` | Test parameters for OS command injection via time-based detection (`sleep 5`), output-based detection (`whoami`), and pipe/semicolon injection |
| `deser_test` | Test for insecure deserialization — Java (ysoserial payloads), Python pickle, PHP unserialize, Node.js prototype pollution chains |

### Network Security

| Tool | Description |
|------|-------------|
| `service_detect` | Identify service versions on open ports via banner grabbing and protocol fingerprinting — matches detected versions to known CVEs (Nmap-style) |
| `vuln_scan` | Lightweight vulnerability scanner that matches detected services, headers, and technologies to known CVE databases (Nikto-style) |
| `waf_detect` | Detect and fingerprint Web Application Firewalls — Cloudflare, AWS WAF, ModSecurity, Akamai, Imperva, Fastly via probe responses and headers |

### Cloud & Infrastructure

| Tool | Description |
|------|-------------|
| `dockerfile_audit` | Audit Dockerfiles for security anti-patterns — running as root, using `latest` tag, exposed secrets, missing HEALTHCHECK, unnecessary packages |
| `container_scan` | Scan container images for known vulnerabilities in base layers, installed packages, and misconfigurations (Trivy-style) |
| `s3_bucket_audit` | Test S3 bucket configurations for public access, missing encryption, permissive ACLs, and exposed bucket listings |

### API Security

| Tool | Description |
|------|-------------|
| `openapi_audit` | Parse OpenAPI/Swagger specifications to find undocumented endpoints, missing authentication requirements, overly permissive schemas, and deprecated endpoints |
| `bola_test` | Test REST API endpoints for Broken Object Level Authorization (BOLA/IDOR) by swapping resource IDs across user contexts and checking access control enforcement |

### Authentication & Authorization

| Tool | Description |
|------|-------------|
| `session_audit` | Analyze session cookies for missing security flags (Secure, HttpOnly, SameSite), predictable session ID patterns, and session fixation vulnerabilities |

---

## Medium Priority

### Web Application Security

| Tool | Description |
|------|-------------|
| `csrf_test` | Test forms and state-changing endpoints for missing or weak CSRF tokens, GET-based state changes, and token prediction |
| `file_upload_test` | Test file upload endpoints for unrestricted upload, MIME type bypass, extension filtering bypass, and malicious file execution |
| `password_policy_test` | Test password reset flows, account lockout enforcement, complexity requirements, and credential stuffing resistance |

### Network Security

| Tool | Description |
|------|-------------|
| `dns_enum` | Enumerate DNS records (A, AAAA, MX, TXT, SPF, DMARC, DKIM, CAA) for misconfigurations, email spoofing risks, and subdomain discovery |

### Authentication & Authorization

| Tool | Description |
|------|-------------|
| `saml_audit` | Audit SAML SSO configurations for signature bypass, assertion replay attacks, certificate validation issues, and XML signature wrapping |

### Reconnaissance

| Tool | Description |
|------|-------------|
| `screenshot_capture` | Capture screenshots of web targets via headless browser for visual recon, change detection, and phishing page identification |

---

## Low Priority

| Tool | Category | Description |
|------|----------|-------------|
| `license_scan` | Code | Scan dependencies for copyleft (GPL, AGPL) or commercial license compliance risks |
| `email_enum` | Recon | Enumerate valid email addresses via SMTP VRFY, web forms, and public sources for targeted testing |
| `header_inject` | Web | Test for HTTP response header injection and CRLF injection via user-controlled input |
| `nosql_inject` | Exploit | Test NoSQL databases (MongoDB, CouchDB, Redis) for injection via `$gt`, `$ne`, `$where` operators |
| `ldap_inject` | Exploit | Test LDAP query parameters for injection via special characters (`*`, `)`, `|`, `&`) |
| `xpath_inject` | Exploit | Test XPath query parameters for injection via boolean-based and string extraction payloads |
| `websocket_test` | API | Test WebSocket endpoints for authentication bypass, message injection, and cross-site WebSocket hijacking |
| `mobile_config_audit` | Cloud | Audit mobile app configuration files (Info.plist, AndroidManifest.xml) for insecure settings and exposed endpoints |

---

## Integration Approach

Each future tool will follow the existing pattern:

1. **Zod schema** for validated inputs
2. **LangChain `tool` factory** for AI agent compatibility
3. **Registry entry** with name, category, description, tags
4. **Agent mapping** — assigned to the most relevant security agent
5. **Safe defaults** — non-destructive payloads, timeout protection, error handling

Tools marked as **High Priority** are targeted for the next development sprint.
