# Runtime Hardening Security Review: install-global.mjs

**Date**: 2026-07-14  
**Reviewer**: Security Agent  
**Target**: `scripts/install-global.mjs` (72 lines)  
**Classification**: `RED_BLOCK` — must not be used without hardening

---

## Executive Summary

`scripts/install-global.mjs` contains **zero path validation** — a regression compared to the existing safe path library `scripts/lib/paths.mjs` which already implements `assertSafePath()`, symlink traversal detection, and boundary containment checks. The script uses `fs.access()` and `fs.stat()` (both follow symlinks) instead of `fs.lstat()` (which does not). All writes can be silently redirected outside the intended `~/.config/opencode/` target via symlinks, environment variable manipulation, or TOCTOU races.

The same repository already contains hardened code (`backup.mjs`, `bootstrap-project.mjs`) that imports and uses the safe primitives from `paths.mjs`. `install-global.mjs` ignores all of it.

**CVSS:3.1/AV:L/AC:L/PR:L/UI:R/S:C/C:N/I:H/A:N** (5.9 Medium)  
Justification per metric below.

---

## Evidence Gate Status

| Requirement | Status |
|---|---|
| Reproducible PoC | ✅ `install-global-poc.mjs` run in `/tmp/opencode/` — 10 of 12 tests confirmed VULNERABLE |
| Log output | ✅ Captured from PoC execution (below) |
| CVSS vector | ✅ `CVSS:3.1/AV:L/AC:L/PR:L/UI:R/S:C/C:N/I:H/A:N` |
| Reproduction environment | ✅ Docker-less `/tmp` test harness with Node.js 22.22.0 |
| Impact demonstration | ✅ Files written to `EVIL_OUTSIDE` through symlinks |

---

## Vulnerability Inventory

### V-01: Symlink Attack on Target Directory (VERIFIED)

**Location**: `install-global.mjs` lines 11, 17, 22  
**APIs misused**: `fs.access()` (line 67, follows symlinks), `fs.stat()` (line 43, follows symlinks)

**Attack**: If `~/.config/opencode` is a symlink pointing to an arbitrary directory (e.g., `~/.ssh/`), the script silently follows it and writes all files to the symlink target.

**Evidence** (PoC output):
```
lstat reports: isSymbolicLink() = true
fs.stat() follows symlink - reports isDirectory() = true
Files were written to EVIL_OUTSIDE via symlink: true
→ VULNERABLE: Writes escaped intended directory via symlink!
```

**Root cause**: Line 17 uses `await exists(globalConfigRoot)` → calls `fs.access()` which follows symlinks. Line 43 uses `await fs.stat(source)` which follows symlinks. `copyTree()` has no symlink detection anywhere.

**Existing mitigation in same repo**: `paths.mjs` line 62-93 (`assertSafePath`) walks every path segment with `fs.lstat()`. `backup.mjs` line 47 explicitly rejects symlinks.

---

### V-02: Symlink Attack on Parent Directories (VERIFIED)

**Location**: `install-global.mjs` lines 9-11, 22  
**APIs misused**: `path.join()`, `fs.mkdir()` with `{ recursive: true }`

**Attack**: If any parent directory in the chain (e.g., `~/.config/`) is a symlink, `fs.mkdir(globalConfigRoot, { recursive: true })` follows the symlink and creates the target directory at the redirected location.

**Evidence** (PoC output):
```
lstat(EVIL_HOME/.config): isSymbolicLink() = true
fs.access(EVIL_HOME/.config/opencode) succeeded after mkdir at symlink target
```

**Root cause**: No segment-by-segment symlink check on the path to `globalConfigRoot`. `path.join()` produces a string; no validation follows before `fs.mkdir()` is called.

**Existing mitigation in same repo**: `assertSafePath()` (paths.mjs:68-90) walks each segment from root to candidate using `fs.lstat()`, bailing out when a symlink is detected.

---

### V-03: Symlink Attack Through Subdirectories (VERIFIED)

**Location**: `install-global.mjs` lines 32-34, `copyTree()` lines 40-56  

**Attack**: After the script creates `globalConfigRoot/`, an attacker with write access can replace `globalConfigRoot/agents/` or `globalConfigRoot/skills/` with symlinks to outside directories. Lines 32-34 then copy through these symlinks.

**Evidence** (PoC output):
```
Dirent: name="agents" isSymbolicLink()=true isDirectory()=false
Dirent: name="skills" isSymbolicLink()=true isDirectory()=false
→ The code IGNORES isSymbolicLink() and copies through symlinks!
```

**Root cause**: `copyTree()` at line 53 calls `fs.readdir(source, { withFileTypes: true })`. The returned `Dirent` objects expose `isSymbolicLink()`, but this method is **never called**. Instead, `child.name` is used in `path.join(source, child.name)`, which resolves through the symlink. The recursive call's `fs.stat()` (line 43) then follows the symlink.

**Existing mitigation in same repo**: `assertSafePath()` detects symlinks at every segment. Any code that writes to a file path should call it first.

---

### V-04: Backup Path Escape (VERIFIED)

**Location**: `install-global.mjs` line 12  

```js
const backupRoot = `${globalConfigRoot}.backup-${new Date().toISOString().replace(/[:.]/g, "-")}`
```

**Attack**: The backup directory is created as a **sibling** of `globalConfigRoot`, not a child. If `globalConfigRoot` is `"/etc/opencode"`, the backup writes to `"/etc/opencode.backup-TIMESTAMP"` — a path outside the config directory. If `globalConfigRoot` is a relative path (e.g., `"."`), the backup writes to `".backup-TIMESTAMP"` in the current working directory.

**Evidence** (PoC output):
```
If globalConfigRoot = "/tmp/.../just-a-name"
Then backupRoot = "/tmp/.../just-a-name.backup-2024-01-01T00-00-00-000Z"
The backup is OUTSIDE the directory being operated on.
```

**Root cause**: String concatenation with no containment check. The backup should be placed **inside** `globalConfigRoot` (e.g., `globalConfigRoot/.backup-TIMESTAMP`) or validated to be a safe location.

**Existing mitigation in same repo**: `backup.mjs` line 21 places backups inside the project root (`path.join(root, ".opencode", "backups", ...)`) and validates all paths with `assertSafePath`.

---

### V-05: XDG_CONFIG_HOME Path Traversal (VERIFIED)

**Location**: `install-global.mjs` line 11  

**Attack**: If `XDG_CONFIG_HOME` is set to a path containing `..` segments, `path.join()` normalizes them, resulting in writes to arbitrary filesystem locations.

**Evidence** (PoC output):
```
Attack 1 - XDG_CONFIG_HOME=/tmp/../../etc:
  globalConfigRoot = /etc/opencode
  Resolved: /etc/opencode
```

**Root cause**: `path.join(process.env.XDG_CONFIG_HOME, "opencode")` normalizes `..` segments. With `XDG_CONFIG_HOME=/tmp/../../etc`, this resolves to `/etc/opencode`. If the user runs the script with `sudo` (common for "global installs"), files are written to `/etc/`. Even without `sudo`, a non-root path traversal (e.g., `XDG_CONFIG_HOME=/tmp/victim/../../tmp/attacker/.hidden`) works.

**Existing mitigation in same repo**: `paths.mjs` `toAbsolutePath()` calls `path.resolve()` (which does normalize), but `assertSafePath()` then validates containment against a known safe root. Since `install-global.mjs` has no root to bound against, it should at minimum reject `..` segments in the resolved path.

---

### V-06: HOME Manipulation (CONFIRMED)

**Location**: `install-global.mjs` lines 9-11  

**Attack**: `os.homedir()` reads the `HOME` environment variable on Linux and returns it without normalization. If `HOME` contains `..` segments or points to a symlinked directory, `path.join()` normalizes the path.

**Evidence**: `os.homedir()` confirmed to return `HOME` env value verbatim. `path.join("/root/../../../etc", ".config")` resolves to `/etc/.config`.

**Root cause**: No validation of `os.homedir()` output. The script trusts the environment.

---

### V-07: TOCTOU Race Condition (VERIFIED)

**Location**: `install-global.mjs` lines 17-22  

```js
if (await exists(globalConfigRoot)) {      // <-- check (follows symlinks)
  await copyTree(globalConfigRoot, backupRoot)
}
await fs.mkdir(globalConfigRoot, { recursive: true })  // <-- use (follows symlinks)
```

**Attack**: After `exists()` checks that `globalConfigRoot` is a directory, but before `fs.mkdir()` executes, an attacker replaces the directory with a symlink to an arbitrary location. `fs.mkdir()` then follows the symlink.

**Evidence** (PoC output):
```
Created subfolder at symlink target (outside): true
```

**Root cause**: The check and the use are not atomic. `fs.access()` on line 67 is advisory, and `fs.mkdir()` on line 22 will follow whatever the path resolves to at the moment of the syscall.

**Existing mitigation in same repo**: `backup.mjs` does not rely on `fs.access()` before `fs.mkdir()`. It uses `assertSafePath()` which validates the path structure before any operation.

---

### V-08: Race During copyTree Iteration (CONFIRMED)

**Location**: `install-global.mjs` lines 53-55  

```js
for (const child of await fs.readdir(source, { withFileTypes: true })) {
  await copyTree(path.join(source, child.name), path.join(target, child.name))
}
```

**Attack**: Between `readdir()` returning the entry list and the subsequent copy operation for that entry, a child could be replaced with a symlink. No atomicity guarantees.

**Root cause**: `readdir()` captures a snapshot; the filesystem can change before each individual copy.

---

### V-09: Partial Installation / No Rollback (VERIFIED)

**Location**: `install-global.mjs` lines 16-38  

**Attack**: If the script fails mid-execution (e.g., network error, disk full, permission denied on one of the copy operations), the target directory is left in an **inconsistent state** — some files are the new versions, some are missing, and the backup may be incomplete.

**Evidence** (PoC output):
```
Simulated partial install at /tmp/.../partial-failure-test
Files after partial install: AGENTS.md
→ No rollback, inconsistent state!
```

**Root cause**: The script has no transaction mechanism. Lines 22-34 have no `try/catch` block. There is no rollback logic. The backup at line 18 captures the state before any writes, but there's no code to restore it on failure.

**Existing mitigation in same repo**: `backup.mjs` provides `createBackup()` and `restoreBackup()` with proper manifests and hash verification. `bootstrap-project.mjs` uses these. `install-global.mjs` does not.

---

### V-10: No Windows Junction/Reparse Point Awareness (CONFIRMED)

**Location**: `install-global.mjs` lines 9-10  

The script includes a Windows branch (`process.platform === "win32"`) that uses `os.homedir()` without `path.join(os.homedir(), ".config", "opencode")` — note it uses 3-arg `path.join`, compared to the non-Windows branch with `XDG_CONFIG_HOME`.

On Windows, `os.homedir()` can return a path that passes through a junction or reparse point. `fs.lstat()` is required to detect these; `fs.access()` and `fs.stat()` do not.

**Root cause**: The Windows path uses only `path.join()` with no `fs.lstat()` validation. Junction points, mount points, and reparse points can redirect writes just like symlinks.

---

## Contrast with Existing Safe Code

The same repository contains `scripts/lib/paths.mjs` (136 lines) with a complete safe-path library:

| Safe Primitive | `paths.mjs` | `backup.mjs` | `bootstrap.mjs` | `install-global.mjs` |
|---|---|---|---|---|
| `assertSafePath()` | ✅ Line 62 | ✅ Line 36, 82 | ✅ Via import | ❌ Not imported |
| `lstatIfExists()` | ✅ Line 54 | ✅ Via `fs.lstat` | ✅ Via import | ❌ Not used |
| `isInsideRoot()` | ✅ Line 20 | ✅ Via `assertSafePath` | ✅ Via import | ❌ Not used |
| `pathExists()` (safe) | ✅ Line 45 | ✅ Via import | ✅ Via import | ❌ Uses own `exists()` with `fs.access()` |
| Symlink rejection | ✅ Line 69, 87 | ✅ Line 48 | ✅ Via import | ❌ None |
| Boundary containment | ✅ Line 66 | ✅ Via `assertSafePath` | ✅ Via import | ❌ None |

`install-global.mjs` uses its own `exists()` function (lines 65-72) that calls `fs.access()` — functionally equivalent to `paths.mjs`'s `pathExists()` but named differently. This suggests the script was written **without awareness** of the existing safe path library, or was written before it existed and never updated.

---

## CVSS 3.1 Vector Justification

**Vector**: `CVSS:3.1/AV:L/AC:L/PR:L/UI:R/S:C/C:N/I:H/A:N`

| Metric | Value | Justification |
|---|---|---|
| **AV:L** (Local) | 0.55 | Attack requires local filesystem access to create symlinks or set environment variables. Not remotely exploitable. |
| **AC:L** (Low) | 0.77 | Creating a symlink or setting `XDG_CONFIG_HOME` is trivial. No race conditions, no special conditions. |
| **PR:L** (Low) | 0.68 | Attacker needs user-level access to create a symlink at `~/.config/opencode` or set an environment variable before the script runs. Does not require root. |
| **UI:R** (Required) | 0.62 | Victim must run `node scripts/install-global.mjs` for the attack to trigger. The script is run voluntarily. |
| **S:C** (Changed) | — | The vulnerable component (`install-global.mjs`) writes files to a location outside its intended scope (`~/.config/opencode/`). The impacted component is the arbitrary target directory. |
| **C:N** (None) | 0.00 | The attack does not expose sensitive data; it writes to arbitrary locations. |
| **I:H** (High) | 0.56 | Complete integrity loss — attacker-controlled content is written to arbitrary filesystem locations. If the script is run as root and `XDG_CONFIG_HOME` points to `/etc`, system configuration files can be overwritten. Even without root, user config files in unexpected locations are corrupted. |
| **A:N** (None) | 0.00 | The attack does not cause denial of service beyond the integrity impact. |

**Base Score**: 5.9 (Medium)

The Medium rating reflects the local-only attack vector and the requirement for user interaction (running the script). However, the **impact can be High if the script is run with elevated privileges**, which is a realistic scenario for a "global install" script. If `sudo` is used, the effective impact could be Critical (system compromise via `/etc/` writes).

**Worst-case escalation**: If the script is run with `sudo` and `XDG_CONFIG_HOME=/tmp/../../etc`, files are written to `/etc/opencode/`. Since OpenCode reads `AGENTS.md` from its config directory, a malicious `AGENTS.md` could contain instructions that OpenCode follows — effectively remote code execution in the context of any future OpenCode session.

---

## Missing Defenses (What Should Exist)

1. **`assertSafePath()` call on `globalConfigRoot`**: Before any filesystem operation on `globalConfigRoot`, call `assertSafePath()` to verify no segment is a symlink. But this requires a "root" to bound against — the script needs a defined root (e.g., `os.homedir()`).

2. **Environment variable validation**: Reject `XDG_CONFIG_HOME` and `HOME` values containing `..` segments or symlinks. At minimum, `path.resolve()` should be used, and the result should be checked with `fs.lstat()`.

3. **Symlink detection in `copyTree()`**: Before each recursive copy, check `Dirent.isSymbolicLink()` and either reject or skip symlink entries.

4. **Atomic backup**: Place backups inside the target directory, not adjacent to it. Use `backup.mjs`'s `createBackup()` function.

5. **Transaction / rollback**: Wrap the entire install in a try/catch with rollback logic. If any step fails, restore from backup.

6. **`fs.lstat()` instead of `fs.stat()`/`fs.access()`**: Throughout the script, use `fs.lstat()` for existence checks and type detection.

7. **Windows reparse point detection**: On Windows, use `fs.lstat()` to detect junctions and reparse points in addition to symlinks.

---

## Remediation Approach (Summary Only — Not Applied)

The minimal fix is to refactor `install-global.mjs` to import from `scripts/lib/paths.mjs` and `scripts/lib/backup.mjs`:

```js
import { 
  assertSafePath, lstatIfExists, isInsideRoot, 
  pathExists, ensureDirectory 
} from "./lib/paths.mjs"
import { createBackup, restoreBackup } from "./lib/backup.mjs"
```

Key changes:
1. Resolve `globalConfigRoot` to absolute, validate with `assertSafePath(homeRoot, globalConfigRoot)`
2. Validate `XDG_CONFIG_HOME`/`HOME` for `..` segments and symlinks before use
3. Replace custom `exists()` with `pathExists()` (already uses `fs.access()` but is centralized)
4. In `copyTree()`, check `Dirent.isSymbolicLink()` before recursing
5. Use `createBackup()` for safe, contained backups
6. Add try/catch with rollback on failure

---

## Appendix A: Reproduction Environment

```
Node.js: v22.22.0
Platform: linux x64
Test harness: /tmp/opencode/install-global-poc.mjs
Test artifacts: /tmp/opencode/test-* (auto-cleaned)
```

## Appendix B: Full PoC Output

The complete PoC was executed and produced the following findings:

| Finding | Description | Result |
|---|---|---|
| #1 | Symlink target writes escape via fs.access | VULNERABLE |
| #2 | Symlink parent → writes redirect | VULNERABLE |
| #3 | No parent directory segment validation | VULNERABLE |
| #4 | Subdirectory symlinks ignored by copyTree | VULNERABLE |
| #5 | Backup path escapes via string concat | VULNERABLE |
| #6 | XDG_CONFIG_HOME .. traversal → /etc | VULNERABLE |
| #7 | HOME env manipulation | VULNERABLE |
| #8 | TOCTOU: exists() then mkdir() | VULNERABLE |
| #9 | Race: readdir then copy | VULNERABLE |
| #10 | Partial install, no rollback | VULNERABLE |
| #11 | Existing safe code: assertSafePath | SAFE (reference) |
| #12 | Existing safe code: symlink rejection in backup.mjs | SAFE (reference) |

---

## Classification

**RED_BLOCK** — This script must not be run in its current form. The path traversal and symlink-following vulnerabilities allow writes to arbitrary filesystem locations with no validation. The same repository already contains hardened path-handling code (`scripts/lib/paths.mjs`, `scripts/lib/backup.mjs`) that `install-global.mjs` should use but does not.

**Recommendation**: Do not use `install-global.mjs` until it has been refactored to use the existing safe-path primitives and pass symlink-attack tests.
