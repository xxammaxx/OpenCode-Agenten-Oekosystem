import { uniqueStrings } from "./paths.mjs"

export function selectMcpCandidates(discovery, options = {}) {
  const candidates = []
  const notes = []
  const hasGithubToken = Boolean(process.env.GITHUB_TOKEN)
  const hasBrave = Boolean(process.env.BRAVE_API_KEY)
  const includeRemoteCI = Boolean(options.includeRemoteCI)

  candidates.push(
    {
      name: "github",
      tier: "0_readonly",
      type: "remote",
      enabled: false,
      reason: hasGithubToken ? "GitHub remote detected and token is available." : "Optional read-only GitHub integration.",
      requires: hasGithubToken ? ["GITHUB_TOKEN"] : [],
      config: {
        type: "remote",
        url: "https://api.githubcopilot.com/mcp/",
        headers: { Authorization: "Bearer {env:GITHUB_TOKEN}" },
        enabled: false,
      },
    },
    {
      name: "context7",
      tier: "0_readonly",
      type: "remote",
      enabled: false,
      reason: "Documentation lookup is useful for non-trivial framework bootstrap.",
      requires: [],
      config: {
        type: "remote",
        url: "https://mcp.context7.com/mcp",
        enabled: false,
      },
    },
  )

  if (hasBrave) {
    candidates.push({
      name: "brave-search",
      tier: "0_readonly",
      type: "remote",
      enabled: false,
      reason: "External research is available and the Brave API key is present.",
      requires: ["BRAVE_API_KEY"],
      config: {
        type: "remote",
        url: "https://mcp.search.brave.com/mcp",
        headers: { "X-Subscription-Token": "{env:BRAVE_API_KEY}" },
        enabled: false,
      },
    })
  } else {
    notes.push("Brave Search MCP is available as an optional research source when BRAVE_API_KEY is set.")
  }

  const hasFrontend = discovery.frameworks.includes("playwright") || discovery.frameworks.includes("vite") || discovery.files.some((file) => /playwright\.config\./i.test(file))
  const hasDocker = discovery.files.some((file) => /Dockerfile|docker-compose/i.test(file))
  const hasSqlite = discovery.databases.includes("sqlite")

  if (hasFrontend) {
    candidates.push({
      name: "playwright",
      tier: "1_sandboxed",
      type: "local",
      enabled: false,
      reason: "Frontend or Playwright signals were detected, but local package installation must remain explicit.",
      install_method: "manual",
    })
  }

  if (hasDocker) {
    candidates.push({
      name: "docker",
      tier: "1_sandboxed",
      type: "local",
      enabled: false,
      reason: "Docker signals were detected, but local MCP installation remains manual.",
      install_method: "manual",
    })
  }

  if (hasSqlite) {
    candidates.push({
      name: "sqlite",
      tier: "1_sandboxed",
      type: "local",
      enabled: false,
      reason: "SQLite signals were detected, but local MCP installation remains manual.",
      install_method: "manual",
    })
  }

  if (includeRemoteCI) {
    notes.push("Remote CI opt-in is active; workflow files may be proposed, not auto-enabled.")
  }

  return {
    candidates,
    notes,
    remote_ci_requested: includeRemoteCI,
  }
}

export function buildToolFilter() {
  return {
    default: "deny",
    rules: {
      "github_*": false,
      "playwright_*": false,
      "docker_*": false,
      "sqlite_*": false,
      "brave-search_*": false,
      "context7_*": false,
    },
  }
}

export function disabledMcpConfigEntries(candidates) {
  const entries = {}
  for (const candidate of candidates) {
    if (candidate.config) {
      entries[candidate.name] = candidate.config
    }
  }
  return entries
}

export function mcpSummary(candidates) {
  return uniqueStrings(candidates.map((candidate) => `${candidate.name}:${candidate.tier}:${candidate.enabled ? "enabled" : "disabled"}`))
}
