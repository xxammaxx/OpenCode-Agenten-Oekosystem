import fs from "node:fs/promises"

export function stripJsonc(text) {
  let output = ""
  let inString = false
  let stringQuote = ""
  let escaped = false
  let inLineComment = false
  let inBlockComment = false

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i]
    const next = text[i + 1]

    if (inLineComment) {
      if (ch === "\n") {
        inLineComment = false
        output += ch
      }
      continue
    }

    if (inBlockComment) {
      if (ch === "*" && next === "/") {
        inBlockComment = false
        i += 1
      }
      continue
    }

    if (inString) {
      output += ch
      if (escaped) {
        escaped = false
      } else if (ch === "\\") {
        escaped = true
      } else if (ch === stringQuote) {
        inString = false
        stringQuote = ""
      }
      continue
    }

    if (ch === "/" && next === "/") {
      inLineComment = true
      i += 1
      continue
    }

    if (ch === "/" && next === "*") {
      inBlockComment = true
      i += 1
      continue
    }

    if (ch === "\"" || ch === "'") {
      inString = true
      stringQuote = ch
      output += ch
      continue
    }

    output += ch
  }

  return output
}

export function removeTrailingCommas(text) {
  let result = text
  for (;;) {
    const next = result.replace(/,\s*([}\]])/g, "$1")
    if (next === result) return result
    result = next
  }
}

export function parseJsonc(text) {
  return JSON.parse(removeTrailingCommas(stripJsonc(text)))
}

export async function readJsoncFile(filePath) {
  return parseJsonc(await fs.readFile(filePath, "utf8"))
}

export async function writeJsonFile(filePath, value) {
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8")
}
