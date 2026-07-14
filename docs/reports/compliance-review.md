# Compliance Review

## Focus

Assess the bootstrap design for:

- data minimization
- local versus external processing
- telemetry
- secret handling
- audit logging
- GDPR/DSGVO signals
- conditional domain-specific policy activation

## Findings

### Data Minimization

The bootstrap should only record the minimum required metadata:

- file paths
- detected project type
- selected skills and MCPs
- backup location
- validation status

It must not read or publish secret values.

### Local Versus External Processing

The bootstrap should prefer local file analysis and only use external documentation when explicitly requested.

### Telemetry

No telemetry should be added beyond local evidence artifacts and local reports.

### Secret Handling

Discovery reports and run reports must not include secret material.

### Audit Logging

The implementation should leave an evidence trail for:

- dry-run
- apply
- rollback
- validation

### Conditional Policy Activation

Domain-specific rules such as tierheim/CiviPet or civic-tech retention rules must only be activated when discovery signals justify them.

Generic repositories must not inherit those policies by default.

## Compliance Status

No compliance claim is made yet.
This is a design review that defines the constraints the implementation must satisfy.

