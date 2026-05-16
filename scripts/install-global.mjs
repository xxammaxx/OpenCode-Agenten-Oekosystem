#!/usr/bin/env node

import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const globalConfigRoot = process.platform === "win32"
  ? path.join(os.homedir(), ".config", "opencode")
  : path.join(process.env.XDG_CONFIG_HOME ?? path.join(os.homedir(), ".config"), "opencode")
const backupRoot = `${globalConfigRoot}.backup-${new Date().toISOString().replace(/[:.]/g, "-")}`

await install()

async function install() {
  if (await exists(globalConfigRoot)) {
    await copyTree(globalConfigRoot, backupRoot)
    console.log(`Backed up existing OpenCode config to ${backupRoot}`)
  }

  await fs.mkdir(globalConfigRoot, { recursive: true })

  for (const fileName of ["AGENTS.md", "CONTRIBUTING.md", "SECURITY.md"]) {
    await copyFileIfExists(path.join(repoRoot, fileName), path.join(globalConfigRoot, fileName))
  }

  await copyFileIfExists(path.join(repoRoot, "opencode.jsonc"), path.join(globalConfigRoot, "opencode.json"))

  await copyTree(path.join(repoRoot, ".opencode"), path.join(globalConfigRoot, ".opencode"))

  for (const folderName of ["agents", "skills"]) {
    await copyTree(path.join(repoRoot, ".opencode", folderName), path.join(globalConfigRoot, folderName))
  }

  console.log(`Installed OpenCode config into ${globalConfigRoot}`)
  console.log("Restart OpenCode so it reloads the updated configuration.")
}

async function copyTree(source, target) {
  if (!(await exists(source))) return

  const stat = await fs.stat(source)

  if (!stat.isDirectory()) {
    await fs.mkdir(path.dirname(target), { recursive: true })
    await fs.copyFile(source, target)
    return
  }

  await fs.mkdir(target, { recursive: true })

  for (const child of await fs.readdir(source, { withFileTypes: true })) {
    await copyTree(path.join(source, child.name), path.join(target, child.name))
  }
}

async function copyFileIfExists(source, target) {
  if (!(await exists(source))) return

  await fs.mkdir(path.dirname(target), { recursive: true })
  await fs.copyFile(source, target)
}

async function exists(target) {
  try {
    await fs.access(target)
    return true
  } catch {
    return false
  }
}
