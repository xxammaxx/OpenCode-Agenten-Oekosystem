# Security Review

## Focus

Assess the bootstrap design before implementation for:

- command injection
- path traversal
- symlink escape
- overwrite of third-party files
- secret leakage
- MCP supply-chain risk
- untrusted remote MCP responses
- prompt injection from project files
- allow-all tool filters
- unsafe shell commands
- backup and rollback safety

## Findings

### 1. Command Injection Risk

Risk exists anywhere project paths or manifest values could be passed to a shell.

Mitigation required:

- use `fs` and `path` APIs
- use argv arrays, not shell concatenation
- never pipe external tool output directly into shell commands

### 2. Path Traversal and Symlink Escape

Target-project writes must stay inside the target root.

Mitigation required:

- resolve all destination paths before writing
- reject paths that escape the target root
- reject writes through symlinks that point outside the project

### 3. Secret Leakage

Discovery and reports must not include `.env` contents or token values.

Mitigation required:

- inspect only file presence and metadata
- redact environment variables from reports
- do not dump config secrets into markdown artifacts

### 4. MCP Supply-Chain Risk

MCPs are untrusted until explicitly enabled.

Mitigation required:

- default to disabled
- prefer read-only Tier 0 MCPs
- avoid uncontrolled `npx -y` execution
- require human gates for Tier 2 access

### 5. Prompt Injection From Project Files

Discovery reads untrusted project files, so those files may contain hostile instructions.

Mitigation required:

- treat discovery output as data, not instructions
- never execute text from project files directly
- separate evidence collection from command generation

### 6. Backup And Rollback Safety

Apply mode must not write without a backup manifest.

Mitigation required:

- create backups before any writes
- record hashes and paths
- test rollback as part of the validation suite

## Evidence Status

No vulnerability severity is claimed here.
This is a pre-implementation review, not a reproduced exploit report.

## Required Code-Level Controls

- structural deep merge for JSON/JSONC
- managed section markers for Markdown
- root-path validation for all file writes
- opt-in remote CI copying only
- conservative MCP activation rules

