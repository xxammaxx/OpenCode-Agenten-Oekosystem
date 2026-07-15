export function extractFrontmatter(text) {
  const normalized = text.replace(/\r\n/g, "\n")
  if (!normalized.startsWith("---\n")) {
    return null
  }

  const lines = normalized.split("\n")
  let endIndex = -1
  for (let index = 1; index < lines.length; index += 1) {
    if (lines[index] === "---") {
      endIndex = index
      break
    }
  }

  if (endIndex === -1) {
    return null
  }

  return {
    frontmatter: lines.slice(1, endIndex).join("\n"),
    body: lines.slice(endIndex + 1).join("\n"),
  }
}

export function frontmatterKeys(frontmatter) {
  const keys = new Map()
  for (const line of frontmatter.split("\n")) {
    if (!line || /^\s/.test(line)) continue
    const match = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(line)
    if (match) {
      keys.set(match[1], match[2].trim())
    }
  }
  return keys
}

export function validateSkillFrontmatter(filePath, text, expectedName) {
  const issues = []
  const block = extractFrontmatter(text)

  if (!block) {
    issues.push(`${filePath}: missing YAML frontmatter`)
    return issues
  }

  const keys = frontmatterKeys(block.frontmatter)
  if (!keys.has("name")) {
    issues.push(`${filePath}: missing required frontmatter field "name"`)
  }
  if (!keys.has("description")) {
    issues.push(`${filePath}: missing required frontmatter field "description"`)
  }

  const name = keys.get("name")
  if (expectedName && name && name !== expectedName) {
    issues.push(`${filePath}: skill name "${name}" does not match directory name "${expectedName}"`)
  }

  if (name && !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(name)) {
    issues.push(`${filePath}: invalid skill name "${name}"`)
  }

  if (typeof keys.get("description") === "string" && keys.get("description").length > 1024) {
    issues.push(`${filePath}: description is too long`)
  }

  return issues
}

export function validateAgentFrontmatter(filePath, text, expectedName) {
  const issues = []
  const block = extractFrontmatter(text)

  if (!block) {
    issues.push(`${filePath}: missing YAML frontmatter`)
    return issues
  }

  const keys = frontmatterKeys(block.frontmatter)
  if (!keys.has("description")) {
    issues.push(`${filePath}: missing required frontmatter field "description"`)
  }
  if (!keys.has("mode")) {
    issues.push(`${filePath}: missing required frontmatter field "mode"`)
  }

  const mode = keys.get("mode")
  if (mode && mode !== "primary" && mode !== "subagent") {
    issues.push(`${filePath}: invalid agent mode "${mode}"`)
  }

  if (expectedName && /[\\/]/.test(expectedName)) {
    issues.push(`${filePath}: invalid expected name "${expectedName}"`)
  }

  return issues
}
