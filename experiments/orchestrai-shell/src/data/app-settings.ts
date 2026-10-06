export const CONNECTIONS: readonly { id: string; name: string; account?: string; via?: string; detail: string }[] = [
  { id: "github", name: "GitHub", account: "@fgusmao", via: "Uses your gh CLI login, with repo, read:org, and workflow scopes", detail: "Pull requests, checks, and issues." },
  { id: "gitlab", name: "GitLab", detail: "Merge requests and pipelines for projects hosted on GitLab." },
  { id: "linear", name: "Linear", account: "felipe@orchestrai.tools", via: "A personal API key, kept in the keychain", detail: "Mirrors issues into the backlog." },
]

export interface BrowserProfile {
  name: string
  source: string
  sites: number
  cookies: number
  isDefault: boolean
  updated: string
}

export const BROWSER_PROFILES: readonly BrowserProfile[] = [
  { name: "Default", source: "Imported from Chrome (Work)", sites: 212, cookies: 1284, isDefault: true, updated: "Sep 28" },
  { name: "Staging QA", source: "Fresh profile", sites: 4, cookies: 37, isDefault: false, updated: "Yesterday" },
]

export interface LanguageServer {
  id: string
  language: string
  status: "current" | "behind" | "missing"
  version?: string
  latest?: string
  install: string
}

export const LANGUAGE_SERVERS: readonly LanguageServer[] = [
  { id: "typescript", language: "TypeScript / JavaScript", status: "current", version: "4.3.3", install: "npm install -g typescript-language-server" },
  { id: "rust", language: "Rust", status: "current", version: "2026-09-22", install: "brew install rust-analyzer" },
  { id: "python", language: "Python", status: "behind", version: "1.1.405", latest: "1.1.409", install: "npm install -g pyright" },
  { id: "yaml", language: "YAML", status: "current", version: "1.19.2", install: "npm install -g yaml-language-server" },
  { id: "json", language: "JSON, CSS, HTML", status: "current", version: "4.10.0", install: "npm install -g vscode-langservers-extracted" },
  { id: "go", language: "Go", status: "missing", install: "brew install gopls" },
  { id: "elixir", language: "Elixir", status: "missing", install: "brew install elixir-ls" },
]

export const DEFAULT_RELAY = "wss://remote.sinew-ide.com/ws"

export interface PairedDevice {
  name: string
  client: string
  paired: string
  lastSeen: string
}

export const PAIRED_DEVICES: readonly PairedDevice[] = [
  { name: "Felipe's iPhone 17 Pro", client: "Home-screen app, Safari", paired: "Sep 29", lastSeen: "3 min ago over cellular" },
  { name: "iPad Air", client: "Safari", paired: "Sep 14", lastSeen: "Yesterday" },
]

export type Capability = "Read files" | "Write files" | "Network" | "Secret"

export interface Plugin {
  id: string
  name: string
  file: string
  version: string
  author: string
  tools: string[]
  grants: { kind: Capability; target: string }[]
  enabled: boolean
  /** The host refused something outside the grant. */
  refused?: string
}

export const PLUGINS: readonly Plugin[] = [
  {
    id: "jira",
    name: "Jira tools",
    file: "jira-tools.wasm",
    version: "0.4.1",
    author: "acme-platform",
    tools: ["jira_search", "jira_create_issue", "jira_transition"],
    grants: [
      { kind: "Network", target: "acme.atlassian.net" },
      { kind: "Secret", target: "JIRA_TOKEN" },
    ],
    enabled: true,
  },
  {
    id: "sqlite",
    name: "SQLite inspector",
    file: "sqlite-inspect.wasm",
    version: "1.2.0",
    author: "orchestrai",
    tools: ["sqlite_tables", "sqlite_query"],
    grants: [{ kind: "Read files", target: "~/.warpforge/*.db" }],
    enabled: true,
    refused: "Today 14:12, read ~/.ssh/config: outside its grant, refused by the host.",
  },
  {
    id: "openapi",
    name: "OpenAPI lint",
    file: "openapi-lint.wasm",
    version: "0.9.3",
    author: "spectral-wasm",
    tools: ["lint_openapi"],
    grants: [{ kind: "Read files", target: "<project>/openapi/**" }],
    enabled: true,
  },
  {
    id: "datadog",
    name: "Datadog logs",
    file: "datadog-logs.wasm",
    version: "0.2.0",
    author: "community",
    tools: ["dd_logs_search"],
    grants: [
      { kind: "Network", target: "api.datadoghq.com" },
      { kind: "Secret", target: "DD_API_KEY" },
    ],
    enabled: false,
  },
]

/** The tools the loopback MCP serves, grouped as the bridge registers them. */
export const MCP_TOOLS: readonly { group: string; note?: string; tools: string[] }[] = [
  { group: "Runtime", tools: ["list_runtime", "read_service_logs", "read_portforward_logs", "service_start", "service_stop", "service_restart", "portforward_start", "portforward_stop"] },
  { group: "App actions", note: "Same list as the command palette", tools: ["open_page", "open_terminal", "launch_agent", "switch_worktree", "start_task"] },
  { group: "Backlog", tools: ["create_backlog_task", "create_task", "list_backlog_tasks", "get_backlog_task", "update_backlog_task", "close_backlog_task"] },
  { group: "Factory", tools: ["runner_enqueue", "runner_status"] },
  { group: "Memory", tools: ["memory_store", "memory_search", "memory_list", "memory_update", "memory_delete", "memory_stats", "memory_dream", "memory_list_compaction", "memory_resolve_compaction", "memory_edges"] },
  { group: "Automations", tools: ["automation_create", "automation_list", "automation_get", "automation_update", "automation_delete", "automation_run_now", "automation_runs"] },
  { group: "Browser", note: "Sessions bound to a project", tools: ["browser_snapshot", "browser_click", "browser_type", "browser_navigate", "browser_screenshot", "browser_console"] },
  {
    group: "Orchestrator sessions",
    tools: ["spawn_agent", "list_agent_models", "read_inbox", "message_agent", "list_agents", "stop_agent", "cleanup_agents", "spawn_workflow", "pause_workflow", "resume_workflow", "answer_workflow", "decide_workflow"],
  },
  { group: "Advised sessions", tools: ["ask_advisor"] },
]

/** Keys that are not palette actions; everything else is read from the action list itself. */
export const EXTRA_SHORTCUTS: readonly { keys: string; label: string }[] = [
  { keys: "⌘K", label: "Command palette, with every action and its shortcut" },
  { keys: "⌃⇥ / ⌃⇧⇥", label: "Next or previous project" },
  { keys: "⌃1–9", label: "Jump to a project" },
  { keys: "J / K", label: "Next or previous item in the Inbox" },
  { keys: "Shift-click", label: "Extend a selection of log lines" },
]

export const VERSIONS = { app: "0.21.1", build: "2026.09.30", daemon: "0.21.1", endpoint: "ws://127.0.0.1:61814", acp: "Agent Client Protocol v1" }
