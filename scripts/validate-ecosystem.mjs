#!/usr/bin/env node

import path from "node:path"
import fs from "node:fs/promises"
import { fileURLToPath } from "node:url"
import { loadManifest, validateManifest } from "./lib/manifest.mjs"
import { extractFrontmatter, validateAgentFrontmatter, validateSkillFrontmatter } from "./lib/frontmatter.mjs"
import { parseJsonc } from "./lib/jsonc.mjs"
import { pathExists, readTextIfExists, toAbsolutePath, normalizePosix } from "./lib/paths.mjs"

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")

await main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 2
})

async function main() {
  const issues = []
  const warnings = []

  const manifestPath = path.join(repoRoot, "ecosystem.manifest.json")
  const manifest = await loadManifest(manifestPath)
  issues.push(...validateManifest(manifest))

  issues.push(...await validateJsonFile(path.join(repoRoot, "opencode.jsonc"), "opencode.jsonc"))
  issues.push(...await validateJsonFile(path.join(repoRoot, ".opencode/policies/evidence-gates.json"), "evidence-gates.json"))
  issues.push(...await validateJsonFile(path.join(repoRoot, ".opencode/policies/mcp-trust-tiers.json"), "mcp-trust-tiers.json"))
  issues.push(...await validateJsonFile(path.join(repoRoot, ".opencode/policies/data-retention.json"), "data-retention.json"))
  issues.push(...await validateJsonFile(path.join(repoRoot, ".opencode/policies/write-protection.json"), "write-protection.json"))
  issues.push(...await validateJsonFile(path.join(repoRoot, ".opencode/policies/model-routing.json"), "model-routing.json"))

  issues.push(...await validateMarkdownDirs(path.join(repoRoot, ".opencode/skills"), "skill"))
  issues.push(...await validateMarkdownDirs(path.join(repoRoot, ".opencode/agents"), "agent"))

  issues.push(...await validateRequiredFiles([
    "BOOTSTRAP.md",
    "README.md",
    "AGENTS.md",
    "CONTRIBUTING.md",
    "SECURITY.md",
    "ecosystem.manifest.json",
    ".hermes.md",
    ".hermes/README.md",
    ".hermes/skills/README.md",
    ".hermes/bundles/project-bootstrap.json",
    ".hermes/mcp/opencode-gateway.md",
    "docs/reports/research-findings.md",
    "docs/plans/universal-bootstrap-plan.md",
    "docs/architecture/universal-bootstrap.md",
    "docs/architecture/universal-bootstrap.mmd",
    "docs/adr/ADR-universal-project-bootstrap.md",
    "docs/reports/security-review.md",
    "docs/reports/compliance-review.md",
  ]))

  issues.push(...await validateScriptSyntax([
    "scripts/bootstrap-project.mjs",
    "scripts/validate-ecosystem.mjs",
    "scripts/install-global.mjs",
    "scripts/apply-repository-overlay.mjs",
    "scripts/lib/discovery.mjs",
    "scripts/lib/frontmatter.mjs",
    "scripts/lib/backup.mjs",
    "scripts/lib/manifest.mjs",
    "scripts/lib/mcp.mjs",
    "scripts/lib/opencode.mjs",
    "scripts/lib/paths.mjs",
    "scripts/lib/report.mjs",
    "scripts/lib/jsonc.mjs",
    "scripts/lib/hermes.mjs",
    "scripts/lib/merge.mjs",
  ]))

  issues.push(...await validateNoAbsoluteUserPaths())
  issues.push(...await validateManifestCatalogNames(manifest))
  issues.push(...await validateSkillAndAgentNames())
  warnings.push(...await validateOptionalArtifacts())

  const status = issues.length > 0 ? "RED_BLOCK" : warnings.filter(Boolean).length > 0 ? "AMBER_REVIEW" : "GREEN_SAFE"
  console.log(status)
  for (const issue of issues) console.log(`- ${issue}`)
  for (const warning of warnings.filter(Boolean)) console.log(`- ${warning}`)
  process.exitCode = status === "GREEN_SAFE" ? 0 : status === "AMBER_REVIEW" ? 1 : 2
}

async function validateJsonFile(filePath, label) {
  if (!(await pathExists(filePath))) {
    return [`missing required JSON file: ${label}`]
  }
  try {
    const text = await fs.readFile(filePath, "utf8")
    parseJsonc(text)
    return []
  } catch (error) {
    return [`invalid JSON/JSONC in ${label}: ${error instanceof Error ? error.message : String(error)}`]
  }
}

async function validateMarkdownDirs(dirPath, kind) {
  const issues = []
  if (!(await pathExists(dirPath))) {
    issues.push(`missing required directory: ${normalizePosix(path.relative(repoRoot, dirPath))}`)
    return issues
  }
  const entries = await fs.readdir(dirPath, { withFileTypes: true })
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const filePath = path.join(dirPath, entry.name, "SKILL.md")
    const text = await readTextIfExists(filePath)
    if (!text) {
      issues.push(`missing ${kind} file: ${normalizePosix(path.relative(repoRoot, filePath))}`)
      continue
    }
    if (kind === "skill") {
      issues.push(...validateSkillFrontmatter(filePath, text, entry.name))
    } else {
      issues.push(...validateAgentFrontmatter(filePath, text, entry.name))
    }
  }
  if (kind === "agent") {
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith(".md")) continue
      const filePath = path.join(dirPath, entry.name)
      const text = await readTextIfExists(filePath)
      if (!text) continue
      issues.push(...validateAgentFrontmatter(filePath, text, entry.name.replace(/\.md$/, "")))
    }
  }
  return issues
}

async function validateRequiredFiles(files) {
  const issues = []
  for (const rel of files) {
    if (!(await pathExists(path.join(repoRoot, rel)))) {
      issues.push(`missing required file: ${rel}`)
    }
  }
  return issues
}

async function validateScriptSyntax(files) {
  const issues = []
  for (const rel of files) {
    const abs = path.join(repoRoot, rel)
    if (!(await pathExists(abs))) {
      issues.push(`missing script: ${rel}`)
    }
  }
  return issues
}

async function validateNoAbsoluteUserPaths() {
  const issues = []
  const files = await collectTextFiles(repoRoot)
  const patterns = [
    /\/home\/[A-Za-z0-9._-]+/g,
    /\/Users\/[A-Za-z0-9._-]+/g,
    /[A-Za-z]:\\Users\\[A-Za-z0-9._-]+/g,
  ]
  for (const [rel, text] of files) {
    for (const pattern of patterns) {
      if (pattern.test(text)) {
        issues.push(`absolute user path found in ${rel}`)
        break
      }
    }
  }
  return issues
}

async function validateManifestCatalogNames(manifest) {
  const issues = []
  const names = new Set()
  for (const section of ["agents", "skills", "policies", "mcp_servers"]) {
    for (const bucket of ["generic", "conditional", "domain_specific", "experimental", "deprecated"]) {
      for (const entry of manifest.catalogs?.[section]?.[bucket] ?? []) {
        const name = typeof entry === "string" ? entry : entry.name
        if (!name) continue
        if (names.has(`${section}:${name}`)) {
          issues.push(`duplicate catalog entry: ${section}:${name}`)
        }
        names.add(`${section}:${name}`)
      }
    }
  }
  return issues
}

async function validateSkillAndAgentNames() {
  const issues = []
  for (const [dir, kind] of [
    [path.join(repoRoot, ".opencode/skills"), "skill"],
    [path.join(repoRoot, ".opencode/agents"), "agent"],
  ]) {
    if (!(await pathExists(dir))) {
      issues.push(`missing directory: ${normalizePosix(path.relative(repoRoot, dir))}`)
      continue
    }
    const entries = await fs.readdir(dir, { withFileTypes: true })
    for (const entry of entries) {
      if (kind === "skill" && entry.isDirectory()) {
        const file = path.join(dir, entry.name, "SKILL.md")
        const text = await readTextIfExists(file)
        if (text) issues.push(...validateSkillFrontmatter(file, text, entry.name))
      }
      if (kind === "agent" && entry.isFile() && entry.name.endsWith(".md")) {
        const file = path.join(dir, entry.name)
        const text = await readTextIfExists(file)
        if (text) issues.push(...validateAgentFrontmatter(file, text, entry.name.replace(/\.md$/, "")))
      }
    }
  }
  return issues
}

async function validateOptionalArtifacts() {
  return []
}

async function collectTextFiles(root) {
  const files = []
  async function walk(current, depth = 0) {
    if (depth > 4) return
    const entries = await fs.readdir(current, { withFileTypes: true })
    for (const entry of entries) {
      const abs = path.join(current, entry.name)
      const rel = normalizePosix(path.relative(root, abs))
      if (rel.startsWith(".git/") || rel.startsWith("node_modules/") || rel.startsWith(".opencode/memory/")) continue
      if (entry.isDirectory()) {
        await walk(abs, depth + 1)
      } else if (/\.(md|json|jsonc|mjs|yml|yaml|toml|txt)$/i.test(entry.name)) {
        const text = await readTextIfExists(abs)
        if (text) files.push([rel, text])
      }
    }
  }
  await walk(root)
  return files
}
