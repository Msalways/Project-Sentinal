---
name: web-recon
description: "Web application reconnaissance — technology detection, endpoint discovery, form/param enumeration"
mitre_attack: T1595, T1595.002, T1595.003
---

## Web Reconnaissance

### Technology Detection
Use `tech_detect` tool on the target URL to identify framework, server, and libraries.

### Endpoint Discovery
- Navigate the target with `browser_navigate` and explore all pages via `browser_extract` with `kind=links`
- Look for `/api/`, `/graphql`, `/rest/`, `/v1/`, `/v2/` patterns in links
- Submit forms with `browser_fill` + `browser_click` to discover AJAX endpoints

### Input Vector Mapping
For each page, identify:
- Form fields (name, type)
- URL parameters
- Cookie values
- API endpoint parameters

Document all findings with `write_file`.
