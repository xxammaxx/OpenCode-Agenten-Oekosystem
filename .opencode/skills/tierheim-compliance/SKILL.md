---
name: tierheim-compliance
description: DSGVO compliance validation for animal shelter management software (CiviPet OS). Enforces data minimization, consent tracking, retention policies, and auditability. AI MUST NEVER autonomously modify canonical animal, adopter, or donor data.
license: MIT
compatibility: opencode
metadata:
  audience: compliance-agent
  regulation: DSGVO
  jurisdiction: DE
  domain: tierheim
---
## Core Principle

AI agents MUST NEVER autonomously modify canonical personal data (animal records, adopter information, donor details, medical data). All changes require human confirmation with immutable audit trail.

## Mandatory Compliance Checks

### Data Minimization (Art. 5(1)(c) DSGVO)
- Every stored field MUST have documented purpose (Zweckbindung)
- `SELECT *` on animal/adopter/donor tables FORBIDDEN in agent context
- PII fields must be explicitly justified:
  - `first_name`, `last_name` → Identification
  - `email` → Communication
  - `phone` → Emergency contact
  - `address` → Home check / contract
  - `birth_date` → Age verification
  - `tax_id` → Donation receipt (required by § 50 EStDV)

### Consent Validation (Art. 7 DSGVO)
- All adopter contacts MUST have consent record
- Consent MUST be granular:
  - `marketing` — Newsletter, events
  - `medical` — Vet appointment reminders
  - `adoption` — Adoption process communication
- Withdrawal mechanism MUST be tested
- Consent timestamp and source MUST be recorded

### Retention Periods (Art. 5(1)(e))
| Entity | Retention | Legal Basis |
|--------|-----------|-------------|
| Veterinary records | 10 years | § 22 TierSchG |
| Adoption records | 3 years after end | Vertragsende + 3 Jahre |
| Donor records | 10 years | § 147 AO (tax law) |
| Inquiry contacts | 1 year | Berechtigtes Interesse |
| Volunteer data | Duration + 3 years | Vertragsende |

### Right to Deletion (Art. 17 DSGVO)
- Test: Can a data subject request complete deletion?
- Soft-delete mechanism required (flag_date + retention_countdown)
- Hard-delete ONLY after retention period expires
- Cascade: delete animal → check adopters → check donors

### Data Processing Agreement (Art. 28 DSGVO)
- If AI model processes personal data (even locally): AVV required
- Document: model provider, model version, processing purpose
- Log ALL AI recommendations that touch personal data

### Offline / Local Rules
- No animal data transferred to external cloud services
- Local inference strongly preferred
- Replication ONLY within DSGVO jurisdiction (DE/EU)
- Encryption at rest for all PII databases

## Audit Trail Format
Every AI interaction with production data must be logged in `.opencode/logs/audit/audit-YYYY-MM-DD.jsonl`:
```json
{"timestamp":"ISO8601","agent":"compliance-agent","action":"read_animal_record","record_id":"hashed","purpose":"compliance_check","session_id":"uuid","human_approved":null}
```

## Prohibited Agent Actions
- CREATE, UPDATE, DELETE on animal/adopter/donor/medical records
- SEND emails to adopters or donors
- EXPORT personal data to external services
- TRAIN on production data
- ACCESS production database with write credentials
- GENERATE legal advice (only flag compliance issues)
