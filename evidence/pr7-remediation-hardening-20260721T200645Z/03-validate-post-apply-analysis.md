# validatePostApply Analysis
        
## Root Cause
validatePostApply used a hardcoded `requiredFiles` list (lines 648-655) that did NOT include
security/redaction.mjs. The authoritative `getRuntimeFileList()` (line 136) was the source of
truth for installation but validatePostApply maintained its own separate list.

## Fix
Replaced the hardcoded list with direct iteration over `getRuntimeFileList()`. Each dest file
is now checked for existence and non-zero size. This ensures:
1. No drift between installation list and validation list
2. security/redaction.mjs is explicitly checked
3. Empty/corrupt files are detected
4. Missing files produce RED_BLOCK classification

## Files Changed
- scripts/install-governance.mjs: validatePostApply overhaul (76 lines changed)
- scripts/install-governance.mjs: Added exportable validatePostApply for testing
- test/install/red-test-validate-post-apply-security.test.mjs: NEW (9 red tests)

