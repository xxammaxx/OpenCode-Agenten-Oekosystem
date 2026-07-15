const MANAGED_MARKER = "OPENCODE-AGENT-ECOSYSTEM"

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

export function mergeDeep(base, overlay, options = {}) {
  const { arrayKeys = new Set(["instructions"]) } = options

  if (overlay === undefined) return structuredClone(base)
  if (base === undefined) return structuredClone(overlay)

  if (Array.isArray(base) && Array.isArray(overlay)) {
    if (options.currentKey && arrayKeys.has(options.currentKey)) {
      return [...new Set([...base, ...overlay])]
    }
    return structuredClone(overlay)
  }

  if (isPlainObject(base) && isPlainObject(overlay)) {
    const result = structuredClone(base)
    for (const [key, value] of Object.entries(overlay)) {
      result[key] = mergeDeep(base[key], value, { ...options, currentKey: key })
    }
    return result
  }

  return structuredClone(overlay)
}

export function mergeArrayUnique(base = [], overlay = []) {
  return [...new Set([...base, ...overlay])]
}

export function wrapManagedSection(content) {
  return [
    `<!-- BEGIN ${MANAGED_MARKER} -->`,
    content.trimEnd(),
    `<!-- END ${MANAGED_MARKER} -->`,
    "",
  ].join("\n")
}

export function mergeManagedSection(existingText, managedContent) {
  const begin = `<!-- BEGIN ${MANAGED_MARKER} -->`
  const end = `<!-- END ${MANAGED_MARKER} -->`
  const section = wrapManagedSection(managedContent).trimEnd()
  const normalizedExisting = existingText.replace(/\r\n/g, "\n")
  const beginIndex = normalizedExisting.indexOf(begin)
  const endIndex = normalizedExisting.lastIndexOf(end)
  const hasManagedSection = beginIndex !== -1 && endIndex !== -1 && endIndex > beginIndex
  const before = hasManagedSection ? normalizedExisting.slice(0, beginIndex).trimEnd() : normalizedExisting.trimEnd()
  const after = hasManagedSection ? normalizedExisting.slice(endIndex + end.length).trimStart() : ""
  const parts = []

  if (before) parts.push(before)
  parts.push(section)
  if (after) parts.push(after)

  return `${parts.join("\n\n")}\n`
}

export function mergeManagedSections(existingText, sections) {
  let merged = existingText
  for (const section of sections) {
    merged = mergeManagedSection(merged, section)
  }
  return merged
}
