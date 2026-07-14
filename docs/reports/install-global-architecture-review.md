# Architecture Review: `scripts/install-global.mjs` — Path Safety, Trust Boundaries, and Code Sharing

**Status:** Architecture Review (Proposed / No File Changes)

**Date:** 2026-07-14

**Author:** Architecture Agent

**Reviewed Files:**
- `scripts/install-global.mjs` (72 lines) — the subject of this review
- `scripts/lib/paths.mjs` (136 lines) — existing shared path-safety library
- `scripts/bootstrap-project.mjs` (441 lines) — the project-local bootstrap (comparison baseline)
- `scripts/lib/backup.mjs` (99 lines) — backup/restore module (pattern reference)
- `docs/adr/ADR-universal-project-bootstrap.md` (81 lines) — existing ADR
- `ecosystem.manifest.json` (405 lines) — manifest with `install_targets` and `os_constraints`
- `BOOTSTRAP.md` (170 lines) — user-facing bootstrap docs
- `CONTRIBUTING.md` (26 lines) — contribution guidance referencing the global installer

---

## Executive Summary

`scripts/install-global.mjs` is a legitimate, distinct tool with a purpose not covered by `bootstrap-project.mjs`. However, it currently operates with **zero path-safety validation** despite the repository already shipping a mature, tested path-safety library at `scripts/lib/paths.mjs`. The script duplicates utility functions that already exist in the shared library, violates the manifest's `symlink_escape_blocked` constraint, writes backups outside the config boundary, and has an incorrect Windows config-path detection. Each of these issues is individually fixable, and the shared library already provides the correct primitives. The recommended course is **not removal** but **hardening** through library reuse, with a new ADR to document the global-install architecture explicitly.

---

## 1. Does `install-global.mjs` Need to Exist?

### Current State

`install-global.mjs` copies the ecosystem's canonical configuration files from the repository root into the user's **global** OpenCode config directory:

- `AGENTS.md`, `CONTRIBUTING.md`, `SECURITY.md` → `~/.config/opencode/`
- `opencode.jsonc` → `~/.config/opencode/opencode.json`
- `.opencode/` tree → `~/.config/opencode/.opencode/`
- `.opencode/agents/` → `~/.config/opencode/agents/`
- `.opencode/skills/` → `~/.config/opencode/skills/`

### Distinct From `bootstrap-project.mjs`

| Dimension | `bootstrap-project.mjs` | `install-global.mjs` |
|---|---|---|
| **Target** | A specific project directory | User's global `~/.config/opencode/` |
| **Scope** | Project-local agents, skills, MCPs, policies | User-wide OpenCode rules mirror |
| **Discovery** | Yes — analyzes target project signals | No — unconditional full copy |
| **Manifest-driven** | Yes — selects from catalog conditionally | No — hardcoded file list |
| **Conditional selection** | Only relevant agents/skills per project | All generic+conditional agents and skills |
| **Dry-run** | Yes (default) | No (immediate execution) |
| **Backup** | Yes — `.opencode/backups/` inside target | Yes — but outside config boundary |
| **Rollback** | Yes — `--rollback` flag | No |
| **Path validation** | Yes — `assertSafePath` everywhere | **None** |

### Analysis

The global installer serves a **fundamentally different purpose** from the project-local bootstrap:

- **Project-local bootstrap**: "Give _this specific project_ the relevant subset of ecosystem configuration." It's conditional, context-aware, and targets a project directory where discovery signals drive selection.

- **Global install**: "Place the ecosystem's full set of rules, agents, and skills into the _user's global OpenCode config_ so that _every_ OpenCode session inherits the ecosystem baseline." It's unconditional and targets the user's personal config directory.

Could `bootstrap-project.mjs` with `--target ~/.config/opencode` replace this? Only partially. The bootstrap would run project discovery against `~/.config/opencode`, detect signals, and conditionally select agents/skills — which would miss the point of a global baseline. The global installer intentionally installs **all generic agents and skills** (and conditional ones) as a complete mirror.

The `ecosystem.manifest.json` `install_targets` section also explicitly distinguishes OpenCode targets from Hermes targets, acknowledging that a global mirror is a valid distribution mode separate from project-local bootstrapping.

**CONTRIBUTING.md** line 18 confirms the relationship:
> Use `node scripts/install-global.mjs` only for the user-wide OpenCode mirror, not for target-project bootstrapping.

### Recommendation

**Keep `install-global.mjs`** but harden it. It serves a distinct purpose. The alternative of subsuming it into `bootstrap-project.mjs` with a "self" target would conflate two different semantics (conditional selection vs. unconditional mirror) and reduce transparency.

---

## 2. Trust Boundaries

The global installer crosses **three distinct trust boundaries**:

### Boundary A: Source (Repository Root) — Read-Only

| Property | Value |
|---|---|
| **Location** | `scripts/../` resolved via `fileURLToPath(import.meta.url)` |
| **Trust tier** | Tier 0 (Readonly) |
| **Risk** | Symlink traversal in the repo could redirect reads to arbitrary paths |
| **Current validation** | **None** |
| **Required validation** | `assertSafePath(repoRoot, sourcePath)` before every `fs.readFile()`, `fs.copyFile()`, `fs.readdir()` |

The repository itself is trusted for _content_, but not for _filesystem integrity_. A malicious or compromised repo checkout could contain symlinks pointing outside the repo root. Every source path must be validated via `assertSafePath()` which walks each path segment with `fs.lstat()` (non-following) and rejects symlinks.

### Boundary B: Target (Global Config Directory) — Write

| Property | Value |
|---|---|
| **Location** | `~/.config/opencode/` (Linux) |
| **Trust tier** | Tier 2 (Trusted — human gate required) |
| **Risk** | Symlinks in the config tree could redirect writes to `/etc/`, `/usr/`, or home directory |
| **Current validation** | **None** |
| **Required validation** | `assertSafePath(globalConfigRoot, targetPath)` before every `mkdir()`, `copyFile()`, `writeFile()` |

Writing to `~/.config/` is a significant operation. If the user's config directory contains a symlink (e.g., `~/.config/opencode/.opencode` → `~/some-other-project/.opencode`), the current installer would blindly write through it. This violates the manifest's `os_constraints.symlink_escape_blocked: true`.

### Boundary C: Backup Directory

| Property | Value |
|---|---|
| **Current location** | `${globalConfigRoot}.backup-${timestamp}` (sibling to config root) |
| **Risk** | Pollutes `~/.config/` with a sibling directory; no containment |
| **Current validation** | **None** |
| **Required validation** | Should be inside the config boundary or a well-defined safe location |

This is analyzed in detail in Section 4.

### Boundary Diagram

```
Repository                  User's Home Directory
┌─────────────────┐         ┌──────────────────────────────┐
│  repoRoot/      │  READ   │  ~/.config/                  │
│  ├── AGENTS.md  │────────>│  ├── opencode/               │
│  ├── .opencode/ │         │  │   ├── AGENTS.md           │
│  │   ├── agents/│  WRITE  │  │   ├── .opencode/          │
│  │   ├── skills/│<────────│  │   │   ├── agents/          │
│  │   └── ...    │         │  │   │   ├── skills/          │
│  └── ...        │         │  │   │   └── ...             │
└─────────────────┘         │  │   └── .backups/ ← SAFE    │
                            │  └── opencode.backup-* ← BAD │
                            └──────────────────────────────┘
```

---

## 3. How Should Path Validation Be Structured?

### Current Validation Gap

`install-global.mjs` contains **zero calls** to any path-safety function. Every file operation is unprotected:

```javascript
// Line 30: Blind recursive copy of entire .opencode/ tree
await copyTree(path.join(repoRoot, ".opencode"), path.join(globalConfigRoot, ".opencode"))

// Lines 32-34: Blind copy of individual sub-trees
for (const folderName of ["agents", "skills"]) {
  await copyTree(path.join(repoRoot, ".opencode", folderName), path.join(globalConfigRoot, folderName))
}
```

The `copyTree()` function (lines 40-56) uses `fs.stat()` (following) and `fs.copyFile()` (following) — both will follow symlinks. This is the most dangerous pattern in the codebase.

### What `scripts/lib/paths.mjs` Already Provides

| Function | What it validates |
|---|---|
| `assertSafePath(root, candidate, label)` | Walks every path segment with `fs.lstat()` (non-following); rejects any symlink; verifies boundary containment |
| `isInsideRoot(root, candidate)` | Pure boundary check — does the resolved path stay inside root? |
| `toAbsolutePath(input, base)` | Resolves relative paths safely |
| `lstatIfExists(filePath)` | Non-following stat; returns `null` if missing |
| `pathExists(filePath)` | Simple existence check (no symlink check) |
| `ensureDirectory(dirPath)` | Safe `mkdir -p` |
| `copyFile(filePath, targetPath)` | Copies with parent-directory creation |
| `writeText(filePath, text)` | Writes with parent-directory creation |

### Required Validation Points

**Must validate on the source side** (repo root as boundary):
1. `repoRoot` itself — verify it is not a symlink via `lstatIfExists`
2. Every source file before reading — `assertSafePath(repoRoot, sourcePath)`
3. Every source directory before listing — `assertSafePath(repoRoot, sourceDir)`
4. Reject symlinked entries discovered during `readdir()` — `entry.isSymbolicLink()` check (as `bootstrap-project.mjs` already does at lines 345 and 405)

**Must validate on the destination side** (global config root as boundary):
1. `globalConfigRoot` itself — verify it is not a symlink
2. Every destination path before writing — `assertSafePath(globalConfigRoot, targetPath)`
3. Every destination directory before `mkdir` — `assertSafePath(globalConfigRoot, targetDir)`
4. The backup directory — `assertSafePath(backupBoundary, backupPath)`

**Must validate on the backup side**:
1. The backup root must be inside a well-defined boundary (see Section 4)
2. All file operations within the backup must pass `assertSafePath(backupRoot, ...)`

### Reuse vs. Duplication

**Do not duplicate.** `install-global.mjs` must import from `scripts/lib/paths.mjs`. The library already exists, is tested, and is used by `bootstrap-project.mjs` and `backup.mjs`. Duplicating path-safety code creates two attack surfaces where one suffices.

### Concrete Implementation Pattern

The `copyTree()` function must be rewritten to use the safety primitives:

```javascript
import { assertSafePath, ensureDirectory, copyFile, pathExists, lstatIfExists } from "./lib/paths.mjs"

async function copyTreeSafe(source, target, sourceRoot, targetRoot) {
  await assertSafePath(sourceRoot, source, "copy source")
  await assertSafePath(targetRoot, target, "copy target")

  const stat = await lstatIfExists(source)
  if (!stat) return
  if (stat.isSymbolicLink()) {
    throw new Error(`Refusing to copy symlinked source: ${source}`)
  }

  if (!stat.isDirectory()) {
    await copyFile(source, target)
    return
  }

  await ensureDirectory(target)
  const entries = await fs.readdir(source, { withFileTypes: true })
  for (const entry of entries) {
    if (entry.isSymbolicLink()) {
      throw new Error(`Refusing to copy symlinked entry: ${path.join(source, entry.name)}`)
    }
    await copyTreeSafe(
      path.join(source, entry.name),
      path.join(target, entry.name),
      sourceRoot,
      targetRoot
    )
  }
}
```

Note that `copyTree()` itself could be promoted to `paths.mjs` as a generic utility (see Section 5).

---

## 4. Backup Location Design

### Current Behavior (Line 12)

```javascript
const backupRoot = `${globalConfigRoot}.backup-${new Date().toISOString().replace(/[:.]/g, "-")}`
```

If `globalConfigRoot` is `~/.config/opencode`, the backup goes to:
```
${HOME}/.config/opencode.backup-2026-07-14T12-00-00-000Z
```

### Problems

1. **Escapes the config boundary.** The backup writes to a sibling of the config directory, polluting `~/.config/` with a directory the user didn't create. If the config root is `~/.config/opencode`, the backup is at `~/.config/opencode.backup-...` — one level UP from the config directory, in `~/.config/` itself.

2. **No `.gitignore` protection.** If `~/.config/` is a git repository (common for dotfiles), the backup directory could be accidentally committed. Contrast with `bootstrap-project.mjs` which writes `.gitignore` with `*\n!.gitignore\n` via `ensureBackupGitignore()`.

3. **Timestamp in directory name.** ISO timestamps contain `:` and `.` which are annoying in directory names (the code correctly replaces them, but this is fragile).

4. **No rollback command.** Unlike `bootstrap-project.mjs` which prints the exact rollback command, `install-global.mjs` just logs the backup path with no way to restore.

### Pattern From `backup.mjs` (The Correct Reference)

The `backup.mjs` module places backups **inside** the target boundary:

```javascript
// backup.mjs line 21:
const backupDir = backupRoot
  ? toAbsolutePath(backupRoot, root)
  : path.join(root, ".opencode", "backups", `bootstrap-${timestampSlug()}`)
```

This is the correct pattern: backups live at `{targetRoot}/.opencode/backups/` — inside the target, with a `.gitignore` preventing accidental commits, and a `backup-manifest.json` enabling rollback.

### Recommendation

**Place backups inside the config boundary:**

```
~/.config/opencode/.backups/global-install-2026-07-14T12-00-00-000Z/
├── .gitignore          (content: "*\n!.gitignore\n")
├── backup-manifest.json
├── AGENTS.md           (backed-up version)
├── opencode.json       (backed-up version)
└── ...
```

Rationale:
- Stays within the `~/.config/opencode/` boundary — no pollution of parent directories
- `.gitignore` prevents accidental git commits
- `backup-manifest.json` enables programmatic restore
- Consistent with the `bootstrap-project.mjs` pattern (backups at `{target}/.opencode/backups/`)

**Alternative:** Make the backup location user-configurable via a `--backup-dir` flag, matching `backup.mjs`'s optional `backupRoot` parameter. This allows power users to place backups on a separate volume or in `/tmp/` if they prefer.

**Rollback:** Add a `--rollback <backup-dir>` flag to `install-global.mjs` or provide a separate `scripts/rollback-global.mjs` that consumes the backup manifest.

---

## 5. Shared vs. Duplicated Code

### Current Duplications

| Function | `install-global.mjs` (inline) | `paths.mjs` (library) | Status |
|---|---|---|---|
| `exists(target)` | Lines 65-71: `fs.access()` try/catch | `pathExists(filePath)` line 45-52 | **Duplicate** — identical semantics |
| `copyFileIfExists(source, target)` | Lines 58-63 | `pathExists()` + `copyFile()` composition | **Unnecessary** — trivially composed from library |
| `copyTree(source, target)` | Lines 40-56 | **Not in library** | **Should be in library** |
| `ensureDirectory(dir)` | Uses raw `fs.mkdir({recursive:true})` | `ensureDirectory(dirPath)` line 95-97 | **Duplicate** — raw Node call instead of library |
| Path resolution | Manual `path.join(path.dirname(fileURLToPath(...)), "..")` | `toAbsolutePath(input, base)` line 13-18 | **Inconsistent** — manual vs. library |

### Analysis

`scripts/lib/paths.mjs` is already a **shared library** — it is imported by:
- `scripts/bootstrap-project.mjs` (line 11)
- `scripts/lib/backup.mjs` (line 3)

`install-global.mjs` should be the third consumer. The library was designed for exactly this purpose.

### `copyTree()` — Library Candidate

The recursive directory copy is a generic operation. It belongs in `paths.mjs` (or a new `scripts/lib/files.mjs`) with the same safety guarantees as the rest of the library. Once there, both `bootstrap-project.mjs`'s `syncTree()` and `install-global.mjs`'s `copyTree()` could use it, with the safety layer applied uniformly.

**Recommendation:**

1. `install-global.mjs` imports from `scripts/lib/paths.mjs` — remove all three inline helpers (`exists`, `copyFileIfExists`, `copyTree`)
2. Promote a safe `copyTree(sourceRoot, source, targetRoot, target)` to `paths.mjs` that validates both boundaries
3. Replace `install-global.mjs` line 22 (`fs.mkdir(globalConfigRoot, { recursive: true })`) with `ensureDirectory(globalConfigRoot)`
4. Replace line 8 (`path.resolve(path.dirname(fileURLToPath(...)), "..")`) with a helper like `repoRoot()` that is defined once

---

## 6. Windows Considerations

### Current Windows Path Handling (Lines 9-11)

```javascript
const globalConfigRoot = process.platform === "win32"
  ? path.join(os.homedir(), ".config", "opencode")
  : path.join(process.env.XDG_CONFIG_HOME ?? path.join(os.homedir(), ".config"), "opencode")
```

### Issues

1. **Incorrect Windows config path.** OpenCode on Windows typically uses `%APPDATA%\opencode` (expanding to `C:\Users\<user>\AppData\Roaming\opencode`) or `%LOCALAPPDATA%\opencode`. The code currently hardcodes `~\.config\opencode` even for Windows, which is not the platform convention. This is likely wrong.

2. **Path separator handling.** `path.join()` on Windows produces backslash-separated paths (e.g., `~\AppData\Roaming\opencode`). The manifest's `os_constraints.path_mode` is `native-separator-aware`, meaning the code should handle both separators correctly. The `paths.mjs` `normalizePosix()` function (line 41-43) can help with this.

3. **`os.homedir()` returns user profile.** On Windows, this is typically `C:\Users\<username>`. The code correctly uses this as a base, but the target directory is wrong for the platform.

4. **XDG_CONFIG_HOME doesn't exist on Windows.** The `process.platform === "win32"` guard correctly skips it, but the fallback to `~\.config\opencode` is still incorrect.

### What `paths.mjs` Already Has

- `isWindows()` — platform detection
- `homeDir()` — cross-platform home directory
- `toAbsolutePath(input, base)` — safe path resolution
- `normalizePosix(filePath)` — path separator normalization

### Recommendation

1. **Centralize the config directory lookup in `paths.mjs`** as `openCodeGlobalConfigDir()`:
   ```javascript
   export function openCodeGlobalConfigDir() {
     if (isWindows()) {
       // Use %APPDATA% or %LOCALAPPDATA% as per OpenCode's Windows convention
       const appData = process.env.APPDATA || process.env.LOCALAPPDATA
       if (appData) return path.join(appData, "opencode")
       return path.join(homeDir(), "AppData", "Roaming", "opencode")
     }
     const base = process.env.XDG_CONFIG_HOME ?? path.join(homeDir(), ".config")
     return path.join(base, "opencode")
   }
   ```
   This needs to be validated against the actual OpenCode documentation for the correct Windows config path.

2. **Use `toAbsolutePath()`** for all path construction rather than raw `path.join()`.

3. **The manifest already acknowledges Windows** (line 32-34 lists `windows-powershell`, `windows-git-bash`, `wsl`). The installer must honor the `path_mode: "native-separator-aware"` constraint and the `absolute_user_paths_forbidden: true` constraint.

---

## 7. Is a New ADR Needed?

### Current ADR Coverage

`docs/adr/ADR-universal-project-bootstrap.md` (ADR-0001) covers:

- Decision to build a manifest-driven, project-local bootstrap pipeline
- Why the project-local approach was chosen over a global-only installer
- The global installer is mentioned only in the **Neutral Consequences** section: "global installer remains available but is no longer the main path"

### Gap

ADR-0001 explicitly chose to _keep_ the global installer but did not **design** it. It deferred the architectural decisions about:

- Global installer's trust boundaries
- Path validation for writing to `~/.config/`
- Backup strategy for the global config
- Relationship between the two modes (project-local vs. global)
- Windows config-path conventions

### Recommendation: **YES, create ADR-0002**

A new ADR should cover:

1. **Title:** "ADR-0002: Global OpenCode Config Installer with Path-Safety Enforcement"
2. **Context:** The project-local bootstrap (ADR-0001) handles per-project setup. The ecosystem also needs a mechanism to install its global rules, agents, and skills into the user's global OpenCode config directory so that all sessions benefit from the ecosystem baseline. The existing `install-global.mjs` does this but with no path validation, raising security and reliability concerns.
3. **Decision:** Harden `install-global.mjs` by:
   - Importing from `scripts/lib/paths.mjs` for all path operations
   - Applying `assertSafePath()` at every source-read and target-write boundary
   - Moving backups inside the config boundary (`~/.config/opencode/.backups/`)
   - Centralizing config-directory detection in `paths.mjs`
   - Adding dry-run mode and rollback
4. **Alternatives:** (a) Remove the global installer entirely and rely only on project-local bootstrap; (b) Keep the global installer as-is; (c) Subsuming the global installer into `bootstrap-project.mjs` with a "self" target.
5. **Consequences:** Higher security, consistent path validation across all scripts, slightly more code in the installer.

---

## Risk Matrix

| Risk | Severity | Likelihood | Current Exposure | Mitigation |
|---|---|---|---|---|
| Symlink traversal during source read | **HIGH** | Low | `copyTree()` uses following `fs.stat()` / `fs.copyFile()` | `assertSafePath()` on every source path |
| Symlink traversal during target write | **CRITICAL** | Low | No boundary check; could write to `/etc/` via symlink | `assertSafePath()` on every destination path |
| Backup outside config boundary | **MEDIUM** | Medium | Sibling directory pollutes `~/.config/` | Move inside `.opencode/.backups/` |
| Incorrect Windows config path | **MEDIUM** | Medium (if run on Windows) | Hardcoded `~\.config\opencode` instead of `%APPDATA%\opencode` | Centralize in `paths.mjs`, verify against OpenCode docs |
| Duplicated safety code drifts | **MEDIUM** | Medium | Inline `exists()`, `copyTree()` without validation | Import from `paths.mjs` |
| No dry-run before global write | **HIGH** | High | Immediate execution — no review gate | Add `--dry-run` (default) and `--apply` (explicit) |
| No rollback available | **MEDIUM** | High | User must manually restore | Generate `backup-manifest.json`; add `--rollback` |

---

## Decision Summary

### Gelesen / Reviewed

- **Projektdateien:**
  - `scripts/install-global.mjs` — 72-line script with zero path validation
  - `scripts/lib/paths.mjs` — 136-line shared safety library (13 exported functions)
  - `scripts/bootstrap-project.mjs` — 441-line project-local bootstrap (comparison baseline)
  - `scripts/lib/backup.mjs` — 99-line backup/restore module with manifest and rollback
  - `docs/adr/ADR-universal-project-bootstrap.md` — existing ADR (delegates global installer to "neutral")
  - `ecosystem.manifest.json` — manifest with `install_targets`, `os_constraints`, and `symlink_escape_blocked`
  - `BOOTSTRAP.md` — user-facing docs
  - `CONTRIBUTING.md` — line 18 confirms global installer's distinct role

- **Externe Quellen:**
  - Not required for this review (all relevant facts are in-repo)

### Validierte Fakten

1. `install-global.mjs` has a distinct purpose from `bootstrap-project.mjs` — it mirrors the full ecosystem to the user's global OpenCode config (unconditional), while the bootstrap does conditional project-local setup.
2. The global installer currently has **zero path validation** — no symlink checks, no boundary containment, no `assertSafePath()` calls.
3. `scripts/lib/paths.mjs` already provides every primitive needed: `assertSafePath`, `lstatIfExists`, `isInsideRoot`, `toAbsolutePath`, `ensureDirectory`, `copyFile`.
4. The manifest explicitly requires `symlink_escape_blocked: true` — the installer currently violates this.
5. The backup writes to a sibling directory outside the config boundary (`~/.config/opencode.backup-*`), unlike `bootstrap-project.mjs` which backs up inside the target root.
6. The Windows config path (`~\.config\opencode`) is likely incorrect for the platform.
7. Code duplication exists: `exists()` = `pathExists()`, `copyFileIfExists()` = trivial composition, `copyTree()` = should be in the library.

### Entscheidung

**Keep, harden, and document:**
1. **Keep** `install-global.mjs` as a distinct tool — it serves a purpose not covered by the project-local bootstrap.
2. **Harden** by importing from `scripts/lib/paths.mjs` and applying `assertSafePath()` at every source and destination boundary.
3. **Fix the backup location** to `~/.config/opencode/.backups/global-install-<timestamp>/` with `.gitignore` and manifest.
4. **Add dry-run mode** (default) and `--apply` to match the bootstrap's safety model.
5. **Centralize config-directory detection** in `paths.mjs` as `openCodeGlobalConfigDir()`.
6. **Create ADR-0002** to document the global installer architecture, trust boundaries, and relationship to ADR-0001.
7. **Promote `copyTree()`** (with safety) to `paths.mjs` so both the bootstrap and the global installer benefit.

### Annahmen / Unsicherheiten

- The correct Windows OpenCode config path needs verification against OpenCode's actual documentation. The current `~\.config\opencode` assumption may need to become `%APPDATA%\opencode` or `%LOCALAPPDATA%\opencode`.
- Whether the global installer should also support a `--manifest` override (like `bootstrap-project.mjs` does) is an open question.
- Whether Hermes global assets should be part of the global install (currently not implemented — only OpenCode assets are copied).

### Nächste Aktion

1. **Create ADR-0002** at `docs/adr/ADR-global-config-installer.md` documenting the decisions above.
2. **Harden `install-global.mjs`** as described in Section 3 (path validation) and Section 4 (backup location).
3. **Promote `copyTree()`** to `scripts/lib/paths.mjs` (or `scripts/lib/files.mjs`).
4. **Add `--dry-run`/`--apply`/`--rollback` flags** to match the bootstrap safety model.
5. **Verify Windows OpenCode config path** against official OpenCode documentation.

---

## Abschlussbericht

### Status
**Abgeschlossen** — Architecture review complete. No files modified. Recommendations documented above.

### Risiken
- **CRITICAL:** Symlink traversal during writes to `~/.config/opencode/` — no validation currently exists.
- **HIGH:** Source-side symlink traversal during reads from the repository.
- **MEDIUM:** Backup pollution of `~/.config/` parent directory.
- **MEDIUM:** Incorrect Windows config path.

### Quellen
All sources are repository-internal files (listed under Gelesen/Reviewed). External OpenCode documentation was not needed for this analysis, though the Windows config path should be verified against it during implementation.

### Nächste Schritte
See "Nächste Aktion" in the Decision Summary above.
