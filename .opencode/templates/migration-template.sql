-- Migration: <DESCRIPTION>
-- Created: YYYY-MM-DD
-- Applies to: <database>
-- Rollback: <rollback_script.sql>

-- ============================================
-- PRE-MIGRATION CHECKS
-- ============================================
-- Verify current schema version
-- SELECT * FROM schema_migrations ORDER BY version DESC LIMIT 1;

-- Check row counts of affected tables
-- SELECT COUNT(*) FROM <table>;

-- Take backup checkpoint
-- [BACKUP COMMAND]

-- ============================================
-- MIGRATION
-- ============================================

BEGIN TRANSACTION;

-- [Migration statements here]

-- Record migration
INSERT INTO schema_migrations (version, description, applied_at)
VALUES ('<VERSION>', '<DESCRIPTION>', datetime('now'));

COMMIT;

-- ============================================
-- POST-MIGRATION VERIFICATION
-- ============================================
-- Verify schema change applied
-- PRAGMA table_info(<table>);
-- SELECT * FROM schema_migrations ORDER BY version DESC LIMIT 1;

-- Check data integrity
-- SELECT COUNT(*) FROM <table>;  -- Should match pre-migration count
-- Verify foreign keys are valid: PRAGMA foreign_key_check;

-- ============================================
-- ROLLBACK (if needed)
-- ============================================
-- BEGIN TRANSACTION;
-- [Rollback statements here]
-- DELETE FROM schema_migrations WHERE version = '<VERSION>';
-- COMMIT;
