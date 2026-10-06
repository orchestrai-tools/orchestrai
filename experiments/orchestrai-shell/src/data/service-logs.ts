/** A retained log line. `seq` is monotonic per service and survives restarts (`service::LogLine`). */
export interface LogLine {
  seq: number
  /** Local wall-clock time it was captured. */
  at: string
  text: string
}

/** One line per log entry: `HH:MM:SS text`. stderr lines carry `[err] `, as the daemon writes them. */
function lines(firstSeq: number, block: string): LogLine[] {
  return block
    .trim()
    .split("\n")
    .map((row, index) => {
      const space = row.indexOf(" ")
      return { seq: firstSeq + index, at: row.slice(0, space), text: row.slice(space + 1) }
    })
}

export const LOGS = {
  daemon: lines(1184, `
13:43:02 [service starting]
13:43:02 [err]    Compiling warpforge-protocol v0.21.1 (/Users/dev/projects/orchestrai/crates/warpforge-protocol)
13:43:39 [err]    Compiling warpforge v0.21.1 (/Users/dev/projects/orchestrai)
13:44:51 [err]     Finished \`dev\` profile [unoptimized + debuginfo] target(s) in 1m 49s
13:44:51 [err]      Running \`target/debug/warpforge daemon --listen 127.0.0.1:4000\`
13:44:52 daemon: store at /Users/dev/projects/orchestrai/.dev/warpforge.db (WAL)
13:44:52 daemon: listening on ws://127.0.0.1:4000
13:44:53 [service running]
14:02:17 acp claude-code-acp: session/load t_orc03 replayed 412 updates (0 duplicates)
14:31:40 acp codex: session/new t_orc05 cwd=.warpforge/worktrees/orc-05-session-board
15:12:08 [err] warn: acp gemini: initialize failed: not signed in (run \`gemini\` once to sign in)
15:48:55 persist: batch of 512 writes committed in 41 ms
15:56:31 policy blast_radius: ask "git push origin orc-05-session-board" (task t_orc05)
`),
  desktop: lines(902, `
13:44:53 [service waiting for daemon]
13:44:54 [service starting]
13:44:54 $ vite
13:44:55   VITE v8.3.0  ready in 241 ms
13:44:55   ➜  Local:   http://localhost:1420/
13:44:55   ➜  Network: use --host to expose
13:44:55 [service running]
14:19:03 [vite] hmr update /src/views/MissionControl.tsx
14:52:47 [vite] hmr update /src/components/runtime/RuntimeSidebar.tsx, /src/index.css
15:21:10 [err] [vite] warning: src/daemon/client.ts:88 reads daemon.json on every reconnect
15:55:02 [vite] page reload src/App.tsx
`),
  relay: lines(57, `
15:31:12 [service starting]
15:31:12 [err] node:internal/modules/esm/resolve:873
15:31:12 [err]   throw new ERR_MODULE_NOT_FOUND(packageName, fileURLToPath(base), null);
15:31:12 [err] Error [ERR_MODULE_NOT_FOUND]: Cannot find package 'ws' imported from /Users/dev/projects/orchestrai/remote/relay.mjs
15:31:12 [err]     at packageResolve (node:internal/modules/esm/resolve:873:9)
15:31:12 [err]     at moduleResolve (node:internal/modules/esm/resolve:946:18) {
15:31:12 [err]   code: 'ERR_MODULE_NOT_FOUND'
15:31:12 [err] }
15:31:12 [err] Node.js v24.9.0
15:31:12 [service failed: exit code=1]
`),
  www: lines(311, `
11:20:41 [service starting]
11:20:41 $ astro dev --force --port 4003
11:20:43  astro  v6.1.4 ready in 1288 ms
11:20:43 ┃ Local    http://localhost:4003/
11:20:43 [service running]
12:05:19 [200] /docs/remote 14ms
12:40:02 [service stopped]
`),
  acmeWeb: lines(2210, `
15:10:12 [service starting]
15:10:12 > acme-web@3.18.0 dev /Users/dev/projects/acme-web
15:10:12 > next dev --turbopack --port 4100
15:10:13    ▲ Next.js 16.1.0 (Turbopack)
15:10:13    - Local:        http://localhost:4100
15:10:14  ✓ Ready in 1.2s
15:10:15 [service running]
15:22:48  ○ Compiling /checkout ...
15:22:49  ✓ Compiled /checkout in 812ms
15:22:50  GET /checkout 200 in 1043ms
15:41:07 [err]  ⚠ Fast Refresh had to perform a full reload because components/PayButton.tsx exports a non-component
15:55:31  GET /api/health 200 in 4ms
`),
  apiMock: lines(640, `
15:10:12 [service starting]
15:10:13 > prism mock openapi/staging.yaml --port 4101 --dynamic
15:10:14 [CLI] …  awaiting  Starting Prism…
15:10:15 [HTTP SERVER] ℹ  info      Prism is listening on http://127.0.0.1:4101
15:10:15 [service running]
15:22:50 [HTTP SERVER] get /v2/cart ℹ  info      Request received
15:22:50 [NEGOTIATOR] ✔  success   Created a 200 from a default example
`),
  storybook: lines(88, `
09:14:02 [service starting]
09:14:09 Storybook 10.2 for nextjs started
09:14:09 4.6 s for manager and 3.9 s for preview
09:14:09 Local: http://localhost:4106/
09:14:09 [service running]
11:30:44 [service stopped]
`),
  paymentsApi: lines(5120, `
15:21:30 [service waiting for postgres]
15:21:33 [service starting]
15:21:33 [err]     Finished \`dev\` profile [unoptimized + debuginfo] target(s) in 2.84s
15:21:33 [err]      Running \`target/debug/api\`
15:21:34 INFO sqlx::migrate: applied 20260930_refund_idempotency_keys (3.1ms)
15:21:34 INFO api: listening on 0.0.0.0:4200
15:21:35 [service running]
15:44:12 INFO http: POST /v1/refunds 201 34ms idempotency_key=rf_8c1f2a
15:44:13 INFO http: POST /v1/refunds 200 3ms idempotency_key=rf_8c1f2a replay=true
15:52:40 [err] WARN http: POST /v1/webhooks/stripe 400 2ms error="signature mismatch"
`),
  worker: lines(1877, `
15:21:30 [service waiting for redis]
15:22:16 [service failed] did not start: dependency redis failed: no pod matching 'redis-master' in namespace 'payments-dev'
`),
  webhooks: lines(403, `
15:57:09 [service starting]
15:57:09 Checking for new versions...
15:57:10 Getting ready...
`),
  handbook: lines(12, `
Yesterday [service starting]
Yesterday INFO    -  Building documentation...
Yesterday INFO    -  Documentation built in 2.41 seconds
Yesterday INFO    -  [17:02:44] Serving on http://127.0.0.1:4300/
Yesterday [service running]
Yesterday [service stopped]
`),
  postgres: lines(96, `
15:21:28 Starting port-forward payments-dev:postgres-0 → 15432:5432 ...
15:21:28 kubectl port-forward pod/postgres-0 15432:5432
15:21:29 Forwarding from 127.0.0.1:15432 -> 5432
15:21:29 Forwarding from [::1]:15432 -> 5432
15:21:29 localhost:15432 → pod/postgres-0:5432
15:21:29 ✓ Forwarding :15432
15:44:12 Handling connection for 15432
`),
  redis: lines(31, `
15:21:28 Starting port-forward payments-dev:redis-master → 16379:6379 ...
15:21:29 [warn] No pod matching 'redis-master' — available: ledger-6d9f7c5b8-q2xkm, postgres-0, redis-primary-0
15:21:29 No pod matching 'redis-master' in namespace 'payments-dev' (failure 1/15), retry in 3s
15:22:13 No pod matching 'redis-master' in namespace 'payments-dev' (failure 14/15), retry in 3s
15:22:16 ✗ Port-forward :16379 gave up after max retries: no pod matching 'redis-master' in namespace 'payments-dev'
`),
  stagingApi: lines(412, `
15:10:11 Starting port-forward web-staging:api-gateway → 18080:8080 ...
15:10:12 kubectl port-forward pod/api-gateway-7c9d5b8f6-x2kqp 18080:8080
15:10:12 Forwarding from 127.0.0.1:18080 -> 8080
15:10:12 localhost:18080 → pod/api-gateway-7c9d5b8f6-x2kqp:8080
15:10:12 ✓ Forwarding :18080
15:38:51 Connection lost, reconnecting
15:38:53 kubectl port-forward pod/api-gateway-7c9d5b8f6-m9rtw 18080:8080
15:38:54 ⟳ Restarted port-forward :18080
`),
} satisfies Record<string, LogLine[]>
