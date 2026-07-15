import fs from "node:fs/promises"
import path from "node:path"
import os from "node:os"
import crypto from "node:crypto"
import { fileURLToPath } from "node:url"
import { spawnSync } from "node:child_process"

export const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
export const fixturesRoot = path.join(repoRoot, "test", "fixtures", "bootstrap")

export function fixturePath(name, ...segments) {
  return path.join(fixturesRoot, name, ...segments)
}

export async function copyFixture(name) {
  const source = fixturePath(name)
  const destination = await fs.mkdtemp(path.join(os.tmpdir(), "opencode-bootstrap-"))
  await fs.cp(source, destination, { recursive: true })
  return destination
}

export function runNodeScript(scriptRelativePath, args = [], options = {}) {
  const scriptPath = path.join(repoRoot, scriptRelativePath)
  return spawnSync(process.execPath, [scriptPath, ...args], {
    cwd: options.cwd ?? repoRoot,
    env: { ...process.env, ...options.env },
    encoding: "utf8",
    stdio: "pipe",
    maxBuffer: 10 * 1024 * 1024,
  })
}

export async function snapshotTree(root, options = {}) {
  const ignorePrefixes = options.ignorePrefixes ?? [
    ".git/",
    ".opencode/backups/",
    ".opencode/reports/",
    "docs/reports/universal-bootstrap-run-report.md",
  ]
  const snapshot = {}

  async function walk(current) {
    const entries = await fs.readdir(current, { withFileTypes: true })
    for (const entry of entries) {
      const absolute = path.join(current, entry.name)
      const relative = path.relative(root, absolute).split(path.sep).join("/")
      if (ignorePrefixes.some((prefix) => relative === prefix.slice(0, -1) || relative.startsWith(prefix))) {
        continue
      }
      if (entry.isDirectory()) {
        await walk(absolute)
        continue
      }
      if (entry.isSymbolicLink()) {
        snapshot[relative] = `symlink:${await fs.readlink(absolute)}`
        continue
      }
      const hash = crypto.createHash("sha256").update(await fs.readFile(absolute)).digest("hex")
      snapshot[relative] = `file:${hash}`
    }
  }

  await walk(root)
  return snapshot
}

export async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, "utf8"))
}

export async function readText(filePath) {
  return fs.readFile(filePath, "utf8")
}
