import fs from "node:fs/promises"
import path from "node:path"
import os from "node:os"

export function isWindows() {
  return process.platform === "win32"
}

export function homeDir() {
  return os.homedir()
}

export function toAbsolutePath(input, base = process.cwd()) {
  if (!input) {
    throw new Error("Missing path")
  }
  return path.resolve(base, input)
}

export function isInsideRoot(root, candidate) {
  const rootPath = path.resolve(root)
  const candidatePath = path.resolve(candidate)
  const rel = path.relative(rootPath, candidatePath)
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel))
}

export function assertInsideRoot(root, candidate, label = "path") {
  if (!isInsideRoot(root, candidate)) {
    throw new Error(`${label} escapes the target root: ${candidate}`)
  }
}

export function relativePath(root, candidate) {
  const rootPath = path.resolve(root)
  const candidatePath = path.resolve(candidate)
  assertInsideRoot(rootPath, candidatePath, "candidate")
  const rel = path.relative(rootPath, candidatePath)
  return rel === "" ? "." : rel
}

export function normalizePosix(filePath) {
  return filePath.split(path.sep).join("/")
}

export async function pathExists(filePath) {
  try {
    await fs.access(filePath)
    return true
  } catch {
    return false
  }
}

export async function lstatIfExists(filePath) {
  try {
    return await fs.lstat(filePath)
  } catch {
    return null
  }
}

export async function assertSafePath(root, candidate, label = "path") {
  const rootPath = path.resolve(root)
  const candidatePath = path.resolve(candidate)

  assertInsideRoot(rootPath, candidatePath, label)

  const rootStat = await lstatIfExists(rootPath)
  if (rootStat?.isSymbolicLink()) {
    throw new Error(`${label} root is a symlink and is not allowed: ${rootPath}`)
  }

  const relative = path.relative(rootPath, candidatePath)
  if (!relative) {
    const candidateStat = await lstatIfExists(candidatePath)
    if (candidateStat?.isSymbolicLink()) {
      throw new Error(`${label} is a symlink and is not allowed: ${candidatePath}`)
    }
    return candidatePath
  }

  let current = rootPath
  for (const segment of relative.split(path.sep)) {
    current = path.join(current, segment)
    const stat = await lstatIfExists(current)
    if (!stat) break
    if (stat.isSymbolicLink()) {
      throw new Error(`${label} traverses a symlink and is not allowed: ${current}`)
    }
  }

  return candidatePath
}

export async function ensureDirectory(dirPath) {
  await fs.mkdir(dirPath, { recursive: true })
}

export async function ensureParentDirectory(filePath) {
  await ensureDirectory(path.dirname(filePath))
}

export async function readTextIfExists(filePath) {
  if (!(await pathExists(filePath))) return null
  return fs.readFile(filePath, "utf8")
}

export async function writeText(filePath, text) {
  await ensureParentDirectory(filePath)
  await fs.writeFile(filePath, text, "utf8")
}

export async function copyFile(filePath, targetPath) {
  await ensureParentDirectory(targetPath)
  await fs.copyFile(filePath, targetPath)
}

export async function removeIfExists(filePath) {
  if (await pathExists(filePath)) {
    await fs.rm(filePath, { recursive: true, force: true })
  }
}

export async function readDirEntries(dirPath) {
  return fs.readdir(dirPath, { withFileTypes: true })
}

export async function fileHash(filePath) {
  const crypto = await import("node:crypto")
  const buffer = await fs.readFile(filePath)
  return crypto.createHash("sha256").update(buffer).digest("hex")
}

export function uniqueStrings(values) {
  return [...new Set(values.filter(Boolean))]
}
