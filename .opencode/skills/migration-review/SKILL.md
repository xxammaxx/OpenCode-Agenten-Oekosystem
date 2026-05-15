---
name: migration-review
description: Validates database migrations for safety, reversibility, and data integrity. Requires rollback testing, dry-run verification, and backup confirmation before migrations can be approved.
license: MIT
compatibility: opencode
metadata:
  audience: migration-agent
  workflow: database
---
## Core Principle

Every database migration must be safely reversible and data-preserving. No migration is approved without a tested rollback path.

## Migration Safety Gates

### Gate 1: Pre-Migration Validation
- [ ] Migration script is syntactically valid SQL
- [ ] Rollback script exists AND is tested
- [ ] Schema diff documented and reviewed
- [ ] Affected tables identified with row counts
- [ ] Index changes will not cause excessive locking
- [ ] Foreign key constraints preserved

### Gate 2: Dry-Run Required
- [ ] Migration applied to test/staging database
- [ ] Rollback applied and verified
- [ ] Application queries tested against migrated schema
- [ ] Performance impact measured (EXPLAIN ANALYZE)
- [ ] No orphan records detected

### Gate 3: Production Safety
- [ ] Backup confirmed and verified
- [ ] Maintenance window scheduled (if blocking)
- [ ] Monitoring alerts configured
- [ ] Rollback procedure documented in runbook

## Dangerous Operations (require extra scrutiny)

| Operation | Risk | Mitigation |
|-----------|------|------------|
| DROP TABLE | Data loss | Verify no foreign keys, check row count |
| DROP COLUMN | Data loss | Confirm column unused, check dependencies |
| ALTER COLUMN TYPE | Data loss/corruption | Test with production-like data volume |
| RENAME COLUMN | Application break | Check all code references |
| REMOVE INDEX | Performance degradation | Verify query plans without index |
| ADD NOT NULL | Migration failure | Ensure default value, backfill nulls first |

## Rollback Patterns

### Safe Rollback (preferred)
- Expand: add new schema, migrate data, remove old
- Contract: the reverse — add old back, migrate data, remove new

### Unsafe (require explicit approval)
- Destructive DROP without backup
- Irreversible type changes
- Data truncation

## Output
Generate migration report in `.opencode/reports/migration/`:
```json
{
  "migration_file": "path/to/migration.sql",
  "timestamp": "ISO8601",
  "dry_run_passed": true,
  "rollback_tested": true,
  "backup_verified": true,
  "data_integrity": "PASSED",
  "warnings": [],
  "approval": "PENDING_HUMAN"
}
```

## Prohibited
- Running migrations on production without human gate
- Approving migrations without rollback test
- Skipping dry-run on staging
- Changing data without backup
