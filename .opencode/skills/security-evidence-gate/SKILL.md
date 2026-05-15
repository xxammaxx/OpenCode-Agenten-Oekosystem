---
name: security-evidence-gate
description: Enforces mandatory evidence requirements for any security finding. Requires PoC reproduction, CVSS vector justification, log evidence, and impact demonstration before severity can be claimed. Blocks hallucinated vulnerabilities.
license: MIT
compatibility: opencode
metadata:
  audience: security-agent
  workflow: bug-bounty
---
## Core Principle

NO SECURITY FINDING WITHOUT EVIDENCE. Every claimed vulnerability requires proof that can be independently verified.

## Mandatory Evidence Requirements

### Before ANY severity can be claimed:
1. **Reproduction Environment:** Docker Compose or exact system state description
2. **PoC Code/Script:** Runnable, deterministic, documented
3. **Log Evidence:** Actual captured error/log output (NOT fabricated or simulated)
4. **CVSS 3.1 Vector:** Complete vector string (AV/AC/PR/UI/S/C/I/A) with justification for each metric
5. **Impact Demonstration:** Screenshot or captured output showing successful exploit

### Evidence Quality Standards
- PoC must produce the same result on every run (deterministic)
- Logs must be verbatim captured output, not recreated from memory
- CVSS metrics must reference the CVSS 3.1 specification
- Screenshots must show the actual exploit result, not a mockup

## Finding Classification

### VERIFIED
All 5 evidence items present and valid. Can claim severity.

### UNVERIFIED
Missing evidence. Theoretical or suspected. MUST be clearly labeled. Example:
```
:warning: UNVERIFIED — REQUIRES HUMAN REVIEW
This finding has not been reproduced. Evidence is incomplete.
Do NOT treat as confirmed. Manual investigation needed.
```

### FALSE_POSITIVE
Initial hypothesis disproven by PoC. Document why it failed.

## Severity Tiers (when VERIFIED)

### CRITICAL
CVSS ≥ 9.0. Remote code execution, authentication bypass, data breach.
Requires: full PoC, impact demo, remediation recommendation.

### HIGH
CVSS 7.0-8.9. Privilege escalation, SQL injection, sensitive data exposure.
Requires: PoC, logs, CVSS justification.

### MEDIUM
CVSS 4.0-6.9. XSS, CSRF, information disclosure.
Requires: PoC or strong theoretical justification with code analysis.

### LOW
CVSS 0.1-3.9. Minor issues, defense-in-depth improvements.
Requires: Code analysis documentation.

## Prohibited Without Evidence
- Claiming "CRITICAL" or "HIGH" severity (must be VERIFIED)
- Referencing CVEs not verified against NVD
- Asserting exploitability without running PoC
- Recommending remediation without testing it
- Extrapolating from one confirmed vuln to claim others exist

## NVD Verification Protocol
1. Delegate CVE lookup to research-agent
2. Verify CVE ID exists in NVD (api.nvd.nist.gov)
3. Check CVE status: "Analyzed" vs "Modified" vs "Rejected"
4. Verify affected version range matches project dependencies
5. Cache results in `.opencode/memory/nvd-cache.json` (24h TTL)
