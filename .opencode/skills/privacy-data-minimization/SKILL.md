---
name: privacy-data-minimization
description: Generic privacy and data minimization rules for all projects. Enforces data minimization, purpose limitation, local-first processing, secret/PII redaction, and project-specific retention. Domain-specific rules (tierheim/CiviPet) are separate and loaded conditionally only when matching signals are detected.
compatibility: opencode
metadata:
  hermes: compatible
  risk_tier: all
  domain: generic
---

## When To Use

Use this skill for any task involving personal data, authentication, secrets, logging, or data persistence. It is loaded by default as a generic safety layer across all projects.

Concrete triggers:

- User registration, login, or session management
- Logging, monitoring, or observability configuration
- File or database operations that store user-supplied content
- Any transmission of data to external APIs or services
- CI/CD pipelines that process environment variables, tokens, or credentials
- Reporting or evidence generation that could contain PII or secrets
- Data migration, export, or backup tasks
- Code review touching authentication, secrets management, or data storage

## Core Principles

### Data Minimization
Only collect and process data that is strictly necessary for the declared purpose. Every field, parameter, or log entry must be justifiable. If data can be omitted, anonymized, or aggregated without compromising the purpose, it must be.

### Purpose Limitation (Zweckbindung)
Data may only be used for the specific purpose for which it was collected. Any change of purpose requires a new legal basis and, where applicable, renewed consent. Purpose must be documented at the time of collection and verifiable throughout the processing chain.

### Local Processing Preference
Process data locally whenever possible. External transmission increases attack surface, introduces third-party trust dependencies, and may trigger additional regulatory requirements (e.g., Data Processing Agreements). Prefer local inference, local storage, and local computation over cloud or third-party services unless a documented project requirement explicitly justifies external processing.

### Secret and PII Redaction
Never log, commit, or report secrets or personal data. This includes:

- API keys, tokens, passwords, private keys, certificates
- Email addresses, phone numbers, physical addresses
- Government IDs, tax IDs, social security numbers
- Health information, biometric data
- IP addresses (when linked to identifiable persons)
- Any combination of fields that could re-identify a person

Redaction must be applied to all output channels: stdout, log files, error messages, reports, commit messages, and CI output. Use structured redaction (e.g., `***REDACTED***`) rather than omission to make redaction verifiable.

### Project-Specific Retention
Retention periods must be defined by the project's own legal basis and documented in the project's data retention policy. Never apply generic default retention periods. If the project has no defined retention policy, flag this as a gap rather than assuming a default. Retention requirements vary by jurisdiction, data category, and processing purpose.

## Workflow

### Step 1: Identify All Data Being Processed
Audit the task scope for every data item that will be collected, stored, transmitted, or logged. Include implicit data such as metadata, timestamps, IP addresses, user-agent strings, and correlation IDs. Document each item with its data category (personal, sensitive, secret, technical).

### Step 2: Verify Each Data Item Has a Declared Purpose
For every data item identified in Step 1, confirm there is a documented purpose. The purpose must be specific enough to evaluate proportionality. If a data item lacks a declared purpose, flag it for removal or documentation. Acceptable purposes include: authentication, authorization, audit logging, debugging (with expiry), service delivery, legal obligation, or explicit user consent.

### Step 3: Ensure No Unnecessary Data Is Collected or Transmitted
Compare the identified data set against the declared purposes. Remove or minimize any data that exceeds what is necessary. For external transmission, verify that:

- The same purpose cannot be achieved with local processing
- The external processor has adequate data protection safeguards
- The data set transmitted is the minimum required for the external service to function
- Transmission occurs over an encrypted channel

### Step 4: Redact Secrets and PII from All Outputs
Apply redaction to every output artifact produced during the task:

- Console output and log statements
- Written reports and evidence files
- Commit messages and diffs
- Error messages and stack traces
- CI/CD pipeline logs
- Diagnostic dumps and debug output

Use project-configured redaction patterns where available. If none exist, apply regex-based redaction for common patterns (e.g., `[A-Za-z0-9+_.-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}` for email, `sk-[A-Za-z0-9]{20,}` for API keys).

### Step 5: Verify Retention Rules Are Project-Specific
Check whether the project has a documented data retention policy. If it does, confirm that the task respects those retention periods. If it does not, file a documentation gap rather than applying a generic default. Never hardcode retention periods from other projects or jurisdictions.

## What This Skill Does NOT Cover

This skill is deliberately generic. The following areas are handled by separate, conditionally-loaded skills and agents:

- **Tierheim-specific retention rules** — Handled by the `tierheim-compliance` skill, loaded only when matching detector signals (e.g., animal, adopter, donor, vet records) are found.
- **CiviPet animal/adopter/donor data rules** — Handled by the `tierheim-compliance` skill, which includes German-specific legal bases (§ 22 TierSchG, § 147 AO, § 195 BGB).
- **German DSGVO jurisdiction specifics** — Handled by the `compliance-agent` with appropriate jurisdiction signals. This skill does not assume German law or any other specific jurisdiction.
- **Legal advice or compliance certification** — No skill or agent in this ecosystem provides legal advice or certification. Compliance findings must be reviewed by a qualified human.

## Inputs

- **Task description**: The work item or user request being executed
- **Data fields involved**: Structured or unstructured list of data items the task touches
- **Processing locations**: Where data will be collected, stored, processed, and transmitted (e.g., local filesystem, in-memory, external API, cloud service, CI runner)
- **Retention requirements**: Any retention constraints already defined by the project, regulation, or contract

## Outputs

- **Data minimization report**: A structured assessment listing every data item, its declared purpose, processing location, retention period, and minimization status (kept, minimized, removed, redacted)
- **Redaction log**: A record of all redaction actions taken during the task, including the pattern or rule used, the output channel affected, and confirmation that no unredacted data leaked
- **Processing boundary assessment**: A summary of what data stayed local vs. what was transmitted externally, with justification for each external transmission

## Security Boundaries

The following boundaries must never be crossed:

- **Never expose PII in evidence**: Evidence files, run reports, and audit logs must have all personal data redacted before writing. Use hashed or pseudonymized identifiers where traceability is required.
- **Never claim compliance without compliance-agent review**: This skill performs data minimization and redaction checks. It does not certify compliance with any regulation. Compliance claims require review by the `compliance-agent` with appropriate jurisdiction and domain signals.
- **Never assume retention periods without project-specific legal basis**: Generic or borrowed retention periods are not acceptable. If the project lacks a defined retention policy, flag the gap. Do not invent retention periods.
- **Never transmit data externally without purpose verification**: Every external transmission must have a documented purpose and, where required, a Data Processing Agreement with the recipient.

## Completion Criteria

This skill is considered complete when all of the following are satisfied:

- [ ] All processed data has a declared purpose (Zweckbindung)
- [ ] No unnecessary data is collected, stored, or transmitted
- [ ] Local processing was preferred; each external transmission is justified
- [ ] Secrets and PII are redacted from all logs, reports, and output artifacts
- [ ] Retention periods are project-specific and documented
- [ ] Compliance claims are deferred to the compliance-agent
- [ ] Domain-specific rules (tierheim) are loaded only when matching signals are detected

## Privacy & Data Minimization Checklist

- [ ] All processed data has a declared purpose (Zweckbindung)
- [ ] No unnecessary data is collected or stored
- [ ] Local processing is preferred over external transmission
- [ ] Secrets and PII are redacted from all logs and reports
- [ ] Retention periods are project-specific, not generic defaults
- [ ] Compliance claims are deferred to compliance-agent
- [ ] Domain-specific rules (tierheim) are loaded only when signals match
