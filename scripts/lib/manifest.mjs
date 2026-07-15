import fs from "node:fs/promises"
import path from "node:path"
import { parseJsonc, readJsoncFile } from "./jsonc.mjs"
import { normalizePosix, pathExists } from "./paths.mjs"

const NAME_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/

export async function loadManifest(manifestPath) {
  const absolute = path.resolve(manifestPath)
  const text = await fs.readFile(absolute, "utf8")
  const manifest = manifestPath.endsWith(".jsonc") ? parseJsonc(text) : JSON.parse(text)
  return manifest
}

function ensureArray(value, label, issues) {
  if (!Array.isArray(value)) {
    issues.push(`${label} must be an array`)
  }
}

function ensureCatalogSection(catalogs, section, issues) {
  const value = catalogs?.[section]
  if (!value) {
    issues.push(`catalogs.${section} is required`)
    return
  }
  for (const bucket of ["generic", "conditional", "domain_specific", "experimental", "deprecated"]) {
    if (!Array.isArray(value[bucket])) {
      issues.push(`catalogs.${section}.${bucket} must be an array`)
    }
  }
}

export function validateManifest(manifest) {
  const issues = []

  if (!manifest || typeof manifest !== "object") {
    return ["manifest must be an object"]
  }

  for (const key of ["version", "schema_version", "name", "catalogs", "detectors"]) {
    if (!(key in manifest)) issues.push(`missing manifest field: ${key}`)
  }

  if (manifest.name && !NAME_RE.test(manifest.name)) {
    issues.push(`manifest.name must be lowercase kebab-case`)
  }

  if (manifest.detectors) ensureArray(manifest.detectors, "detectors", issues)
  if (manifest.environment_variables) ensureArray(manifest.environment_variables, "environment_variables", issues)
  if (manifest.supported_os) ensureArray(manifest.supported_os, "supported_os", issues)

  if (manifest.catalogs) {
    for (const section of ["agents", "skills", "policies", "mcp_servers"]) {
      ensureCatalogSection(manifest.catalogs, section, issues)
    }
  }

  return issues
}

export function manifestSignals(manifest) {
  return manifest.detectors ?? []
}

function detectorMatches(detector, discovery) {
  const allFiles = discovery.files.map(normalizePosix)
  const terms = new Set()
  const haystack = [
    discovery.language,
    discovery.package_manager,
    ...discovery.frameworks,
    ...discovery.test_frameworks,
    ...discovery.databases,
    ...discovery.notes,
    ...discovery.signals.flatMap((signal) => [...signal.paths, ...signal.notes]),
    ...allFiles,
  ]
    .filter(Boolean)
    .join("\n")
    .toLowerCase()

  for (const signal of detector.signals ?? []) {
    const needle = signal.toLowerCase()
    if (needle.includes("*")) {
      const regex = new RegExp(`^${needle.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\\\*/g, ".*").replace(/\\\?/g, ".")}$`)
      if (allFiles.some((file) => regex.test(file))) {
        terms.add(signal)
      }
      continue
    }
    if (haystack.includes(needle)) {
      terms.add(signal)
    }
  }

  return terms.size > 0
}

export function selectManifestRecommendations(manifest, discovery, options = {}) {
  const recommendations = {
    agents: [],
    skills: [],
    mcp: [],
    policies: [],
    notes: [],
  }

  const includeRemoteCI = Boolean(options.includeRemoteCI)
  const files = discovery.analysis_files ?? discovery.files ?? []
  const hasGenericPii = discovery.signals.some((signal) => signal.id === "pii-signals")
  const hasTierheim = discovery.signals.some((signal) => signal.id === "tierheim-signals")
  const hasFrontend = discovery.frameworks.includes("playwright") || discovery.frameworks.includes("vite") || files.some((file) => /playwright\.config\./i.test(file))
  const hasDatabase = discovery.databases.length > 0 || files.some((file) => /migrations?|schema/i.test(file))
  const hasGithub = discovery.existing.github_remote

  recommendations.skills.push(
    "project-reality-refresh",
    "context-engineering",
    "run-card",
    "risk-tier-routing",
    "verification-contract",
    "anti-fake-execution",
    "worktree-safety",
    "checkpoint-and-rollback",
    "owner-approval-gate",
    "privacy-data-minimization",
    "living-truth-mirror",
    "provider-neutral-config",
    "project-bootstrap",
    "mcp-selection",
    "hermes-handoff",
  )

  if (hasFrontend) {
    recommendations.skills.push("playwright-visual-review")
    recommendations.agents.push("playwright-agent")
    recommendations.mcp.push({ name: "playwright", tier: "1_sandboxed", enabled: false, install_method: "manual" })
    recommendations.notes.push("Frontend or Playwright signals detected; Playwright skill and agent are relevant.")
  }

  if (hasDatabase) {
    recommendations.skills.push("migration-review")
    recommendations.agents.push("migration-agent")
    recommendations.mcp.push({ name: "sqlite", tier: "1_sandboxed", enabled: false, install_method: "manual" })
    recommendations.notes.push("Database or migration signals detected; migration skill is relevant.")
  }

  if (hasGenericPii) {
    recommendations.agents.push("compliance-agent")
    recommendations.notes.push("PII signals detected; compliance-agent is recommended for data-minimization audits.")
  }

  if (hasTierheim) {
    recommendations.skills.push("tierheim-compliance")
    recommendations.agents.push("compliance-agent")
    recommendations.notes.push("Tierheim/CiviPet signals detected; tierheim-compliance skill is conditional.")
  }

  if (hasGithub) {
    recommendations.mcp.push({ name: "github", tier: "0_readonly", enabled: false, install_method: "remote", requires: ["GITHUB_TOKEN"] })
  } else {
    recommendations.notes.push("GitHub MCP is available as an optional read-only integration when a GitHub remote is detected.")
  }

  recommendations.mcp.push(
    { name: "context7", tier: "0_readonly", enabled: false, install_method: "remote", requires: [] },
    { name: "brave-search", tier: "0_readonly", enabled: false, install_method: "remote", requires: ["BRAVE_API_KEY"] },
  )

  if (includeRemoteCI) {
    recommendations.policies.push("remote-ci-proposal")
    recommendations.notes.push("Remote CI opt-in flag present; workflow files may be proposed.")
  }

  recommendations.skills = [...new Set(recommendations.skills)]
  recommendations.agents = [...new Set(recommendations.agents)]

  return recommendations
}

export async function manifestHasFile(manifestPath) {
  return pathExists(manifestPath)
}
