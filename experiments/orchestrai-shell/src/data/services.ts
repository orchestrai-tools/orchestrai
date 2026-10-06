import { LOGS, type LogLine } from "@/data/service-logs"
import type { ProjectId } from "@/lib/projects"

export type { LogLine }

export type ServiceStatus = "starting" | "running" | "stopped" | "failed"
export type ForwardStatus = "starting" | "active" | "restarting" | "failed" | "stopped"
/** Where a project's port block came from (`PortRangeSource`). */
export type RangeSource = "auto" | "sticky" | "declared" | "local-override"

export interface EnvVar {
  key: string
  /** As written; `${name.port}` becomes that service's allocated port at spawn. */
  value: string
  /** Set by the personal `workspace.local.yaml`, not the shared file. */
  local?: boolean
}

export interface Service {
  name: string
  /** Run as `sh -c` from the project root, in its own process group. */
  command: string
  /** `port:` in the config. 0 means the service gets no port at all. */
  declaredPort: number
  /** Handed out from the project's range and injected as `$PORT`. */
  port: number
  /** A declared port inside an explicit range is a hard pin: taken means failed, never moved. */
  pinned: boolean
  env: EnvVar[]
  /** `healthcheck`: when set, the only authority on readiness. */
  healthcheck?: { url: string; interval: string }
  /** `readyPattern`: a log line that also counts as ready. */
  readyPattern?: string
  /** `readyTimeout`: after it the run is marked failed but left running. */
  readyTimeout: string
  /** Services or port-forwards that must be ready first. */
  dependsOn: string[]
  status: ServiceStatus
  uptime?: string
  exit?: number
  /** Why it failed or is held, in the daemon's words. */
  reason?: string
  /** Up, but nothing answers on its allocated port (`PortWarning`). */
  portWarning?: { expected: number; listening: number[] }
  /** Fields the personal `workspace.local.yaml` set on it. */
  localFields?: string[]
  /** What a fresh start prints, and the exit code when it crashes on boot. */
  boot: string[]
  crashes?: number
  /** The drawer terminal "Open in terminal" selects. */
  terminal: string
  logs: LogLine[]
}

export interface PortForward {
  name: string
  namespace: string
  /** Pod name or prefix: exact, then prefix, then substring match. */
  pod: string
  localPort: number
  remotePort: number
  status: ForwardStatus
  /** Why it gave up after 15 consecutive failures. */
  reason?: string
  localFields?: string[]
  logs: LogLine[]
}

/** One project's `.warpforge/workspace.yaml` plus what the daemon made of it. */
export interface ProjectRuntime {
  configFile: string
  /** Personal overrides beside the shared file, kept out of git automatically. */
  localFile?: string
  localYaml?: string
  /** The local file is broken and ignored, so everything shown is the shared config. */
  localError?: string
  range: { start: number; end: number; source: RangeSource; conflictWith?: string }
  autoStart: boolean
  services: Service[]
  forwards: PortForward[]
  worktree?: { copy: string[]; setup?: string }
  agentTemplates?: { name: string; command: string; description: string }[]
}

type ServiceInput = Partial<Service> & Pick<Service, "name" | "command" | "status" | "terminal">

function service(entry: ServiceInput): Service {
  return { declaredPort: 0, port: 0, pinned: false, env: [], readyTimeout: "5m", dependsOn: [], boot: [], logs: [], ...entry }
}

export const RUNTIMES: Record<ProjectId, ProjectRuntime> = {
  orchestrai: {
    configFile: ".warpforge/workspace.yaml",
    localFile: ".warpforge/workspace.local.yaml",
    localYaml: "services:\n  desktop:\n    env:\n      VITE_LOG_LEVEL: debug\n",
    range: { start: 4000, end: 4099, source: "declared" },
    autoStart: true,
    services: [
      service({
        name: "daemon",
        command: "WARPFORGE_HOME=$PWD/.dev cargo run --bin warpforge -- daemon --listen 127.0.0.1:$PORT",
        declaredPort: 4000,
        port: 4000,
        pinned: true,
        env: [{ key: "RUST_LOG", value: "warpforge=debug,acp=info" }],
        healthcheck: { url: "http://127.0.0.1:${daemon.port}/healthz", interval: "5s" },
        readyTimeout: "10m",
        status: "running",
        uptime: "2h 14m",
        boot: ["[err]     Finished `dev` profile [unoptimized + debuginfo] target(s) in 3.02s", "daemon: listening on ws://127.0.0.1:4000"],
        terminal: "shell",
        logs: LOGS.daemon,
      }),
      service({
        name: "desktop",
        command: "cd desktop && bun run dev",
        declaredPort: 4001,
        port: 4001,
        pinned: true,
        env: [
          { key: "VITE_DAEMON_URL", value: "ws://127.0.0.1:${daemon.port}" },
          { key: "VITE_LOG_LEVEL", value: "debug", local: true },
        ],
        dependsOn: ["daemon"],
        status: "running",
        uptime: "2h 13m",
        portWarning: { expected: 4001, listening: [1420] },
        localFields: ["env"],
        boot: ["$ vite", "  VITE v8.3.0  ready in 236 ms", "  ➜  Local:   http://localhost:1420/"],
        terminal: "dev",
        logs: LOGS.desktop,
      }),
      service({
        name: "relay",
        command: "node remote/relay.mjs --port $PORT",
        declaredPort: 4002,
        port: 4002,
        pinned: true,
        readyPattern: "relay listening",
        status: "failed",
        exit: 1,
        reason: "exited with code 1: Cannot find package 'ws' imported from remote/relay.mjs",
        boot: ["[err] Error [ERR_MODULE_NOT_FOUND]: Cannot find package 'ws' imported from /Users/dev/projects/orchestrai/remote/relay.mjs", "[err] Node.js v24.9.0"],
        crashes: 1,
        terminal: "shell",
        logs: LOGS.relay,
      }),
      service({
        name: "web",
        command: "cd www && bun run dev -- --force --port $PORT",
        declaredPort: 4003,
        port: 4003,
        pinned: true,
        status: "stopped",
        boot: ["$ astro dev --force --port 4003", " astro  v6.1.4 ready in 1240 ms", "┃ Local    http://localhost:4003/"],
        terminal: "shell",
        logs: LOGS.www,
      }),
    ],
    forwards: [],
    worktree: { copy: [".env*", "desktop/.env.local"], setup: "bun install --frozen-lockfile" },
    agentTemplates: [
      { name: "review", command: "claude --print", description: "Quick code review" },
      { name: "dev", command: "npx @agentclientprotocol/claude-agent-acp@latest --acp", description: "Interactive development session" },
    ],
  },
  warpforge: {
    configFile: ".workspace.yaml",
    range: { start: 4000, end: 4099, source: "declared", conflictWith: "orchestrai" },
    autoStart: false,
    services: [
      service({
        name: "web",
        command: "cd www && bun run dev -- --force --port $PORT",
        declaredPort: 4321,
        status: "stopped",
        boot: ["$ astro dev --force --port $PORT", " astro  v6.1.4 ready in 1302 ms"],
        terminal: "dev",
      }),
    ],
    forwards: [],
  },
  "acme-web": {
    configFile: ".warpforge/workspace.yaml",
    localFile: ".warpforge/workspace.local.yaml",
    localYaml: "services:\n  web:\n    env:\n      - STRIPE_SECRET_KEY=sk_test_51QyR8hLx0aCme\n",
    localError: "parsing .warpforge/workspace.local.yaml: services.web.env: invalid type: sequence, expected a map at line 4 column 7",
    range: { start: 4100, end: 4199, source: "declared" },
    autoStart: true,
    services: [
      service({
        name: "web",
        command: "pnpm dev --port $PORT",
        declaredPort: 4100,
        port: 4100,
        pinned: true,
        env: [
          { key: "NEXT_PUBLIC_API_URL", value: "http://localhost:${api-mock.port}" },
          { key: "STAGING_API_URL", value: "http://localhost:18080" },
          { key: "NEXT_PUBLIC_STRIPE_KEY", value: "pk_test_51QyR8hLx0aCme" },
        ],
        healthcheck: { url: "http://localhost:${web.port}/api/health", interval: "5s" },
        dependsOn: ["api-mock"],
        status: "running",
        uptime: "47m",
        boot: ["   ▲ Next.js 16.1.0 (Turbopack)", "   - Local:        http://localhost:4100", " ✓ Ready in 1.1s"],
        terminal: "dev",
        logs: LOGS.acmeWeb,
      }),
      service({
        name: "api-mock",
        command: "pnpm exec prism mock openapi/staging.yaml --port $PORT --dynamic",
        declaredPort: 4101,
        port: 4101,
        pinned: true,
        status: "running",
        uptime: "47m",
        boot: ["[HTTP SERVER] ℹ  info      Prism is listening on http://127.0.0.1:4101"],
        terminal: "dev",
        logs: LOGS.apiMock,
      }),
      service({
        name: "storybook",
        command: "pnpm storybook -p $PORT --ci",
        declaredPort: 4106,
        port: 4106,
        pinned: true,
        status: "stopped",
        boot: ["Storybook 10.2 for nextjs started", "Local: http://localhost:4106/"],
        terminal: "dev",
        logs: LOGS.storybook,
      }),
    ],
    forwards: [
      { name: "staging-api", namespace: "web-staging", pod: "api-gateway", localPort: 18080, remotePort: 8080, status: "active", logs: LOGS.stagingApi },
    ],
    worktree: { copy: [".env.local", ".vercel/project.json"], setup: "pnpm install --prefer-offline" },
  },
  handbook: {
    configFile: ".warpforge/workspace.yaml",
    range: { start: 4300, end: 4399, source: "sticky" },
    autoStart: false,
    services: [
      service({
        name: "site",
        command: "mkdocs serve --dev-addr 127.0.0.1:$PORT",
        declaredPort: 8000,
        port: 4300,
        readyPattern: "Serving on",
        status: "stopped",
        boot: ["INFO    -  Building documentation...", "INFO    -  Serving on http://127.0.0.1:4300/"],
        terminal: "dev",
        logs: LOGS.handbook,
      }),
    ],
    forwards: [],
  },
  payments: {
    configFile: ".warpforge/workspace.yaml",
    range: { start: 4200, end: 4299, source: "declared" },
    autoStart: true,
    services: [
      service({
        name: "api",
        command: "cargo run --bin api",
        declaredPort: 4200,
        port: 4200,
        pinned: true,
        env: [
          { key: "DATABASE_URL", value: "postgres://payments:payments@localhost:15432/payments_dev" },
          { key: "RUST_LOG", value: "api=debug,sqlx=warn" },
        ],
        healthcheck: { url: "http://localhost:${api.port}/healthz", interval: "5s" },
        dependsOn: ["postgres"],
        status: "running",
        uptime: "36m",
        boot: ["INFO api: listening on 0.0.0.0:4200"],
        terminal: "dev",
        logs: LOGS.paymentsApi,
      }),
      service({
        name: "worker",
        command: "cargo run --bin worker",
        env: [{ key: "REDIS_URL", value: "redis://localhost:16379/0" }],
        readyPattern: "worker ready",
        dependsOn: ["redis"],
        status: "failed",
        reason: "did not start: dependency redis failed: no pod matching 'redis-master' in namespace 'payments-dev'",
        terminal: "dev",
        logs: LOGS.worker,
      }),
      service({
        name: "webhooks",
        command: "stripe listen --forward-to localhost:${api.port}/v1/webhooks/stripe",
        readyPattern: "Ready! You are using Stripe API Version",
        dependsOn: ["api"],
        status: "starting",
        uptime: "12s",
        boot: ["Ready! You are using Stripe API Version [2026-08-27.acacia]. Your webhook signing secret is whsec_••••••••3f9a"],
        terminal: "dev",
        logs: LOGS.webhooks,
      }),
    ],
    forwards: [
      { name: "postgres", namespace: "payments-dev", pod: "postgres-0", localPort: 15432, remotePort: 5432, status: "active", logs: LOGS.postgres },
      {
        name: "redis",
        namespace: "payments-dev",
        pod: "redis-master",
        localPort: 16379,
        remotePort: 6379,
        status: "failed",
        reason: "no pod matching 'redis-master' in namespace 'payments-dev'",
        logs: LOGS.redis,
      },
    ],
    worktree: { copy: [".env", "config/local.toml"], setup: "cargo fetch" },
  },
}

export const RANGE_SOURCE_LABEL: Record<RangeSource, string> = {
  auto: "auto-assigned",
  sticky: "auto-assigned (kept)",
  declared: "from team config",
  "local-override": "local override",
}

export const RANGE_SOURCE_HINT: Record<RangeSource, string> = {
  auto: "Chosen automatically from free ports on this machine.",
  sticky: "Kept from an earlier automatic assignment on this machine.",
  declared: "Declared in the project's shared config, so every machine on the team uses this range.",
  "local-override": "Overridden on this machine only. The team's shared config is unchanged.",
}

/** `${name.port}` placeholders replaced by allocated ports; an unknown name stays literal, as the daemon leaves it. */
export function interpolate(value: string, ports: Record<string, number>): string {
  return value.replace(/\$\{([\w-]+)\.port\}/g, (match, name: string) => (ports[name] ? String(ports[name]) : match))
}
