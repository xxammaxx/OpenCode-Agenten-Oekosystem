import fs from "node:fs/promises"
import path from "node:path"
import { mergeDeep, mergeManagedSections } from "./merge.mjs"
import { parseJsonc, readJsoncFile, writeJsonFile } from "./jsonc.mjs"
import { ensureParentDirectory, pathExists, readTextIfExists, writeText } from "./paths.mjs"

const DEFAULT_INSTRUCTIONS = [
  "BOOTSTRAP.md",
  "README.md",
  "AGENTS.md",
  "CONTRIBUTING.md",
  "SECURITY.md",
  ".opencode/policies/evidence-gates.json",
  ".opencode/policies/mcp-trust-tiers.json",
  ".opencode/policies/write-protection.json",
  ".opencode/policies/data-retention.json",
  ".opencode/policies/model-routing.json",
  "ecosystem.manifest.json",
]

export function buildOpenCodeOverlay({ includeRemoteCI = false } = {}) {
  const mcp = {
    github: {
      type: "remote",
      url: "https://api.githubcopilot.com/mcp/",
      headers: { Authorization: "Bearer {env:GITHUB_TOKEN}" },
      enabled: false,
    },
    context7: {
      type: "remote",
      url: "https://mcp.context7.com/mcp",
      enabled: false,
    },
    "brave-search": {
      type: "remote",
      url: "https://mcp.search.brave.com/mcp",
      headers: { "X-Subscription-Token": "{env:BRAVE_API_KEY}" },
      enabled: false,
    },
  }

  return {
    share: "disabled",
    autoupdate: false,
    snapshot: true,
    compaction: {
      auto: true,
      prune: true,
      reserved: 8000,
    },
    formatter: {
      prettier: { disabled: false },
    },
    instructions: DEFAULT_INSTRUCTIONS,
    mcp,
    tools: {
      "github_*": false,
      "playwright_*": false,
      "docker_*": false,
      "sqlite_*": false,
      "brave-search_*": false,
      "context7_*": false,
    },
    permission: {
      edit: "ask",
      bash: {
        "*": "ask",
        "git status *": "allow",
        "git diff *": "allow",
        "git log *": "allow",
        "git fetch *": "allow",
        "node scripts/bootstrap-project.mjs *": "allow",
        "node scripts/apply-repository-overlay.mjs *": "allow",
        "node --check *": "allow",
        "node scripts/validate-ecosystem.mjs *": "allow",
        "npm test *": "allow",
        "npm run typecheck *": "allow",
        "npm run lint *": "allow",
        "rm -rf *": "deny",
        "git push *": "deny",
        "git commit *": "ask",
      },
      webfetch: "ask",
      task: {
        "*": "ask",
        "review-agent": "allow",
        "explore": "allow",
      },
      skill: {
        "*": "allow",
        "audit-trail-enforcer": "allow",
      },
      external_directory: "ask",
      doom_loop: "ask",
    },
    agent: {
      "issue-orchestrator": {
        description: "Primary orchestrator for OpenCode and Hermes bootstrap work. Delegates and never implements directly.",
        mode: "primary",
        temperature: 0.1,
        color: "#2563eb",
        permission: {
          bash: {
            "*": "ask",
            "git status *": "allow",
            "git diff *": "allow",
            "git log *": "allow",
            "git fetch --all --prune": "allow",
            "gh issue view *": "allow",
            "gh issue comment *": "ask",
            "node scripts/bootstrap-project.mjs *": "allow",
            "node scripts/apply-repository-overlay.mjs *": "allow",
            "npm test *": "allow",
            "node scripts/validate-ecosystem.mjs *": "allow",
          },
          edit: "ask",
          task: {
            "*": "allow",
            "general": "deny",
          },
          skill: {
            "github-source-of-truth": "allow",
            "spec-driven-development": "allow",
            "audit-trail-enforcer": "allow",
            "test-enforcement": "allow",
            "*": "allow",
          },
        },
        tools: {
          "github_*": true,
        },
      },
      plan: {
        mode: "primary",
        temperature: 0.0,
        permission: {
          edit: "deny",
          bash: {
            "*": "deny",
            "git status *": "allow",
            "git diff *": "allow",
            "git log *": "allow",
            "git fetch *": "allow",
          },
          webfetch: "ask",
          skill: { "*": "allow" },
        },
      },
      build: {
        mode: "primary",
        temperature: 0.2,
        permission: {
          edit: "ask",
          bash: {
            "*": "ask",
            "git status *": "allow",
            "git diff *": "allow",
            "git log *": "allow",
            "git fetch *": "allow",
            "git commit *": "ask",
            "git push *": "deny",
            "node scripts/bootstrap-project.mjs *": "allow",
            "node scripts/apply-repository-overlay.mjs *": "allow",
            "npm test *": "allow",
            "node --check *": "allow",
            "node scripts/validate-ecosystem.mjs *": "allow",
            "rm -rf *": "deny",
          },
        },
      },
      "review-agent": {
        description: "Reviews code for quality, security, and spec compliance. Read-only.",
        mode: "subagent",
        temperature: 0.0,
        permission: {
          edit: "deny",
          bash: {
            "*": "deny",
            "git diff *": "allow",
            "git log *": "allow",
            "grep *": "allow",
            "rg *": "allow",
          },
          task: { "*": "deny" },
          skill: {
            "architecture-review": "allow",
            "test-enforcement": "allow",
            "audit-trail-enforcer": "allow",
            "*": "deny",
          },
        },
      },
      "research-agent": {
        description: "Researches external documentation and dependency facts. Read-only.",
        mode: "subagent",
        temperature: 0.2,
        permission: {
          edit: "deny",
          bash: {
            "*": "deny",
            "grep *": "allow",
            "rg *": "allow",
          },
          webfetch: "allow",
          skill: {
            "security-evidence-gate": "allow",
            "*": "deny",
          },
          task: { "*": "deny" },
        },
      },
      "compliance-agent": {
        description: "Audits DSGVO compliance, local-only boundaries, and data minimization. Read-only.",
        mode: "subagent",
        temperature: 0.0,
        permission: {
          edit: "deny",
          bash: {
            "*": "deny",
            "grep *": "allow",
            "rg *": "allow",
            "git diff *": "allow",
          },
          skill: {
            "tierheim-compliance": "allow",
            "audit-trail-enforcer": "allow",
            "*": "deny",
          },
          task: { "*": "deny" },
        },
      },
      "migration-agent": {
        description: "Validates database migrations for rollback safety and data integrity.",
        mode: "subagent",
        temperature: 0.0,
        permission: {
          edit: {
            "*": "deny",
            "migrations/**": "ask",
            "data/migrations/**": "ask",
          },
          bash: {
            "*": "deny",
            "sqlite3 *": "allow",
            "psql *": "ask",
            "git diff *": "allow",
            "docker compose *": "ask",
          },
          skill: {
            "migration-review": "allow",
            "test-enforcement": "allow",
            "*": "deny",
          },
        },
      },
      "playwright-agent": {
        description: "Runs visual QA and accessibility checks.",
        mode: "subagent",
        temperature: 0.1,
        permission: {
          edit: {
            "*": "deny",
            "e2e-screenshots/**": "allow",
            ".opencode/reports/visual-qa/**": "allow",
          },
          bash: {
            "*": "deny",
            "npx playwright *": "allow",
            "git diff *": "allow",
          },
          skill: {
            "playwright-visual-review": "allow",
            "*": "deny",
          },
        },
      },
      "architecture-agent": {
        description: "Documents architecture decisions and ADRs.",
        mode: "subagent",
        temperature: 0.1,
        permission: {
          edit: {
            "*": "deny",
            "docs/adr/**": "ask",
            ".opencode/reports/architecture/**": "allow",
          },
          bash: {
            "*": "deny",
            "grep *": "allow",
            "rg *": "allow",
            "git diff *": "allow",
          },
          skill: {
            "architecture-review": "allow",
            "spec-driven-development": "allow",
            "*": "deny",
          },
        },
      },
      "security-agent": {
        description: "Performs evidence-gated security research.",
        mode: "subagent",
        temperature: 0.0,
        permission: {
          edit: {
            "*": "deny",
            "test/security/**": "allow",
            ".opencode/reports/security/**": "allow",
          },
          bash: {
            "*": "deny",
            "docker *": "allow",
            "docker compose *": "ask",
            "git diff *": "allow",
            "npm audit *": "allow",
          },
          task: {
            "*": "deny",
            "research-agent": "allow",
          },
          skill: {
            "security-evidence-gate": "allow",
            "github-source-of-truth": "allow",
            "audit-trail-enforcer": "allow",
            "*": "deny",
          },
        },
        tools: {
          "docker_*": true,
          "brave-search_*": true,
        },
      },
      "documentation-agent": {
        description: "Maintains documentation and release notes.",
        mode: "subagent",
        temperature: 0.2,
        permission: {
          edit: {
            "*": "deny",
            "docs/**": "allow",
            "README.md": "ask",
            "CHANGELOG.md": "ask",
          },
          bash: "deny",
          skill: {
            "audit-trail-enforcer": "allow",
            "funding-document-generator": "allow",
            "*": "deny",
          },
          task: { "*": "deny" },
        },
      },
      "ux-review-agent": {
        description: "Analyzes UX flows, UI consistency, and user journeys. Read-only — produces structured, evidence-based findings. Never modifies product files.",
        mode: "subagent",
        temperature: 0.0,
        permission: {
          edit: "deny",
          bash: {
            "*": "deny",
            "git diff *": "allow",
            "git log *": "allow",
            "grep *": "allow",
            "rg *": "allow",
          },
          task: { "*": "deny" },
          skill: {
            "ux-flow-review": "allow",
            "ui-design-system-review": "allow",
            "audit-trail-enforcer": "allow",
            "*": "deny",
          },
        },
      },
    },
  }
}

export async function readOpenCodeConfig(configPath) {
  if (!(await pathExists(configPath))) {
    return {}
  }
  return readJsoncFile(configPath)
}

export async function mergeOpenCodeConfig(configPath, overlay) {
  const existing = await readOpenCodeConfig(configPath)
  return mergeDeep(existing, overlay)
}

export async function writeOpenCodeConfig(configPath, overlay) {
  const merged = await mergeOpenCodeConfig(configPath, overlay)
  await ensureParentDirectory(configPath)
  await fs.writeFile(configPath, `${JSON.stringify(merged, null, 2)}\n`, "utf8")
  return merged
}

export async function mergeOpenCodeMarkdown(existingText, section) {
  return mergeManagedSections(existingText, [section])
}
