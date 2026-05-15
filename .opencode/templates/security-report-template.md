# Security Report: <TITLE>

**Report ID:** SEC-YYYY-XXXX
**Date:** YYYY-MM-DD
**Severity:** CRITICAL | HIGH | MEDIUM | LOW | UNVERIFIED
**CVSS 3.1 Vector:** AV:X/AC:X/PR:X/UI:X/S:X/C:X/I:X/A:X
**Status:** VERIFIED | UNVERIFIED | FALSE_POSITIVE
**Researcher:** AI Agent (security-agent) + Human Review

---

## Summary

[One-paragraph summary of the finding]

## Affected Components

- Component: [name]
- Version: [version]
- File(s): [paths]
- Dependency: [if applicable]

## Reproduction

### Environment

[Description of reproduction environment: Docker image, OS, config]

### Steps to Reproduce

1. [Step 1]
2. [Step 2]
3. [Step 3]
4. [Observed result]

### PoC Code

```
[poc code or script]
```

### Evidence

- **Log Output:** [attached or inline]
- **Screenshot:** [path or URL]
- **Environment:** [docker-compose.yml or description]

## Impact

[What can an attacker achieve? Data breach? RCE? Privilege escalation?]

## CVSS Justification

| Metric | Value | Justification |
|--------|-------|---------------|
| AV (Attack Vector) | N/A/L/P | [Justification] |
| AC (Attack Complexity) | L/H | [Justification] |
| PR (Privileges Required) | N/L/H | [Justification] |
| UI (User Interaction) | N/R | [Justification] |
| S (Scope) | U/C | [Justification] |
| C (Confidentiality) | N/L/H | [Justification] |
| I (Integrity) | N/L/H | [Justification] |
| A (Availability) | N/L/H | [Justification] |

## Remediation

[Recommended fix, with testing instructions]

## References

- CVE: [if applicable]
- NVD: [URL]
- OWASP: [relevant category]
- Related Issues: #[numbers]
