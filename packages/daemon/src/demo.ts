import type {
  DaemonEvent,
  FileDoc,
  SessionUpdate,
  Snapshot,
  TaskDiff,
} from "@warpforge/protocol";
import { PROJECT_DIR } from "@warpforge/protocol";
import { bytesToBase64 } from "./base64";
import { demoBacklogItems, demoBacklogReply } from "./demo-backlog";
import {
  demoAccountLimits,
  demoAccountReply,
  demoAgentSpend,
  demoDetectedAgents,
} from "./demo-accounts";
import { demoEmbedding, demoHistorySettings } from "./demo-memory";
import { demoLanguageServers } from "./demo-lsp";
import { demoDocText, demoDocsList, demoDocsSeed, demoDocsWrite } from "./demo-docs";
import { demoExternalSessions, demoForkTask, demoResumeTask, demoShellCwd } from "./demo-shell";
import { demoPullWrite, mergeDemoThread } from "./demo-pulls";
import { applyDemoHunkResolutions, rememberDemoHunk } from "./demo-diff";
import { demoDeleteSettled, demoFixture } from "./demo-fixtures";
import { demoCreateTask, demoStartChat } from "./demo-tasks";
import { demoRunCommands } from "./demo-commands";
import { DaemonEvents } from "./events";

const nowSecs = () => Math.floor(Date.now() / 1000);

export class DaemonDemo extends DaemonEvents {
  // ── demo mode (no daemon; used for UI review and `?demo` dev runs) ──
  protected demoDiff: ((taskId: string) => TaskDiff) | null = null;
  private demoFileDoc: ((path: string) => FileDoc) | null = null;
  private demoChannel: Array<Record<string, unknown>> = [];
  private demoBacklog: Array<Record<string, unknown>> = demoBacklogItems();
  private demoDocs = demoDocsSeed();
  private installedLsp = new Set<string>();
  private hunkResolutions = new Map<string, "accept" | "reject">();
  private demoLogReads = 0;

  enableDemoMode(seed: {
    snapshot: Snapshot;
    sessionUpdates: Record<string, SessionUpdate[]>;
    diffFor: (taskId: string) => TaskDiff;
    fileDocFor: (path: string) => FileDoc;
  }) {
    this.demoDiff = seed.diffFor;
    this.demoFileDoc = seed.fileDocFor;
    const sessionUpdates = this.stampSessionHistories(
      Object.fromEntries(
        Object.entries(seed.sessionUpdates).map(([taskId, updates]) => [
          taskId,
          updates.some((update) => update.kind === "prompt_capabilities")
            ? updates
            : [
                { embedded_context: true, image: true, kind: "prompt_capabilities" as const },
                ...updates,
              ],
        ]),
      ),
    );
    this.setState({
      connection: "connected",
      connectionError: null,
      sessionUpdates,
      snapshot: seed.snapshot,
    });
  }

  /** Inject a daemon event locally (demo mode only). */
  demoEvent(ev: DaemonEvent) {
    if (this.demoDiff) {
      this.applyEvent(ev);
    }
  }

  protected demoRequest(method: string, params?: unknown): Promise<unknown> {
    const p = (params ?? {}) as Record<string, unknown>;
    const written = demoPullWrite(method, p);
    if (written) return Promise.resolve(written);
    const fixture = demoFixture(method, params);
    if (fixture && method === "task.pullRequests") {
      return fixture.then((result) => {
        const body = (result ?? {}) as { pullRequests?: Record<string, unknown> };
        return {
          ...body,
          pullRequests: {
            ...body.pullRequests,
            "demo-merged": {
              number: 6,
              state: "merged",
              title: "Ship the column",
              url: "https://github.com/orchestrai/demo/pull/6",
            },
          },
        };
      });
    }
    if (fixture && method === "tracker.pulls.thread") {
      return fixture.then((thread) =>
        mergeDemoThread(
          Number(p.number),
          thread as { comments: Array<{ threadId?: string; replies: unknown[] }> },
        ),
      );
    }
    if (fixture) return fixture;
    const history = demoHistorySettings(method, p);
    if (history) return Promise.resolve(history);
    const accounts = demoAccountReply(this.state.snapshot.accounts ?? [], method, p);
    if (accounts) {
      this.setState({ snapshot: { ...this.state.snapshot, accounts } });
      return Promise.resolve({ accounts });
    }
    const backlog = demoBacklogReply(this.demoBacklog, method, p);
    if (backlog) {
      this.demoBacklog = backlog.items;
      return Promise.resolve(backlog.reply);
    }
    switch (method) {
      case "diff.get":
        if (!p.task_id)
          return Promise.resolve({
            taskId: "",
            files: [],
            untrackedPaths: [],
            untrackedAvailable: true,
            ignored: [],
            ignoredTruncated: false,
            ignoredAvailable: true,
            branch: "main",
          });
        return Promise.resolve(
          applyDemoHunkResolutions(
            this.demoDiff!(String(p.task_id)),
            String(p.task_id),
            this.hunkResolutions,
          ),
        );
      case "diff.resolveHunk":
        rememberDemoHunk(this.hunkResolutions, p);
        return Promise.resolve({});
      case "file.contents": {
        const path = String(p.path);
        const written = demoDocText(this.demoDocs, path);
        if (written != null) {
          return Promise.resolve({ newText: written, oldText: written, path, status: "modified" });
        }
        return Promise.resolve(this.demoFileDoc!(path));
      }
      case "file.list": {
        const diff = this.demoDiff!(String(p.task_id));
        const files = diff.files.map((f) => ({ changed: true, path: f.path }));
        if (!files.some((file) => file.path === "README.md"))
          files.unshift({ changed: false, path: "README.md" });
        return Promise.resolve(files);
      }
      case "file.search": {
        if (String(p.query ?? "") === "shell") {
          return Promise.resolve([
            { column: 3, line: 1, path: "README.md", text: "# shell" },
            { column: 7, line: 4, path: "src/board.tsx", text: "const shell = columns" },
            { column: 17, line: 1, path: "src/app.tsx", text: "export function shell() {" },
            { column: 8, line: 8, path: "src/app.tsx", text: "return shell.render()" },
          ]);
        }
        return Promise.resolve([]);
      }
      case "file.save":
        return Promise.resolve({});
      case "listAgentLimits":
        return Promise.resolve({ accounts: demoAccountLimits() });
      case "listAgentSpend":
        return Promise.resolve({ agents: demoAgentSpend() });
      case "lsp.detect":
        return Promise.resolve(demoLanguageServers(this.installedLsp));
      case "lsp.start": {
        const language = String(p.language ?? "");
        if (!this.installedLsp.has(language)) {
          return Promise.resolve({ available: false, rootPath: "", serverId: "" });
        }
        return Promise.resolve({ available: true, rootPath: "/demo", serverId: "demo-lsp" });
      }
      case "lsp.install": {
        const id = String(p.id ?? "");
        this.installedLsp.add(id);
        return Promise.resolve({ ok: true, command: id, output: "Installed." });
      }
      case "git.pushInfo": {
        const taskId = String(p.task_id);
        const task = this.state.snapshot.tasks.find((item) => item.id === taskId);
        return Promise.resolve({
          branch: "feature/demo-push",
          commits: [
            {
              hash: "7bc91e2d36d05a89f86e58d27060edeb36cf91c2",
              shortHash: "7bc91e2",
              subject: task?.prompt || "Improve workspace flow",
              author: "Warpforge Developer",
              files: this.demoDiff!(taskId).files.map((file) => ({
                path: file.path,
                status: file.status === "added" ? "A" : file.status === "deleted" ? "D" : "M",
              })),
            },
          ],
          hasUpstream: true,
          remote: "origin",
          remoteBranch: "feature/demo-push",
          upstream: "origin/feature/demo-push",
        });
      }
      case "git.branchCreate":
        return Promise.resolve({
          message: `Created ${String(p.name)} from ${String(p.from || "HEAD")}`,
          status: "ok",
        });
      case "git.switchBranch":
        return Promise.resolve({
          message: `Switched to ${String(p.branch)}`,
          status: "ok",
        });
      case "git.push":
        return Promise.resolve({
          branch: "feature/demo-push",
          conflicts: [],
          message: p.force ? "pushed with force-with-lease" : "pushed to origin",
          status: "ok",
        });
      case "service.logs": {
        this.demoLogReads += 1;
        const service = String(p.service);
        const lines = [
          `[${service}] starting process`,
          `[${service}] loading workspace config`,
          `[${service}] listening on allocated port`,
        ];
        if (this.demoLogReads > 1) lines.push(`[${service}] refreshed`);
        return Promise.resolve(lines);
      }
      case "portforward.logs":
        return Promise.resolve([
          `[${String(p.name)}] resolving pod`,
          `[${String(p.name)}] starting kubectl port-forward`,
          `[${String(p.name)}] forwarding :${String(p.localPort ?? 8080)}`,
        ]);
      case "runtime.stopAll":
        return Promise.resolve({});
      case "session.permission": {
        const taskId = String(p.task_id);
        this.appendUpdate(taskId, {
          kind: "agent_text",
          text: `(permission ${String(p.outcome)} — continuing)`,
        });
        // Reflect the answer on the task so it leaves the attention rail.
        this.patchTask(taskId, (t) => ({ ...t, status: "running", updatedAt: nowSecs() }));
        return Promise.resolve({});
      }
      case "session.prompt": {
        const taskId = String(p.task_id);
        const attachments = Array.isArray(p.attachments)
          ? p.attachments.map((attachment: any) =>
              attachment.type === "file"
                ? { path: String(attachment.path), type: "file" as const }
                : attachment.type === "document"
                  ? { name: String(attachment.name), type: "document" as const }
                  : { name: String(attachment.name), type: "image" as const },
            )
          : [];
        const chat = this.state.snapshot.tasks.find((task) => task.id === taskId);
        const started = chat && demoStartChat(chat, String(p.text));
        if (started) this.patchTask(taskId, () => started);
        this.appendUpdate(taskId, { attachments, kind: "user_message", text: String(p.text) });
        // Fake an agent acknowledgement shortly after.
        setTimeout(
          () =>
            this.appendUpdate(taskId, {
              kind: "agent_text",
              text: "Got it — adjusting course.",
            }),
          700,
        );
        return Promise.resolve({});
      }
      case "task.create": {
        const { task, updates } = demoCreateTask(p);
        this.applyEvent({ data: task, event: "task.created" });
        for (const update of updates) this.appendUpdate(task.id, update);
        return Promise.resolve({ taskId: task.id });
      }
      case "task.setTitle":
        this.patchTask(String(p.task_id), (t) => ({ ...t, title: String(p.title) }));
        return Promise.resolve({});
      case "task.setOrigin":
        this.patchTask(String(p.task_id), (t) => ({
          ...t,
          origin: p.origin ? String(p.origin) : null,
        }));
        return Promise.resolve({});
      case "task.cancel": {
        this.patchTask(String(p.task_id), (t) => ({
          ...t,
          status: "done",
          updatedAt: nowSecs(),
        }));
        return Promise.resolve({});
      }
      case "task.archive": {
        const remove = Boolean(p.remove_worktree);
        this.patchTask(String(p.task_id), (t) => ({
          ...t,
          status: "done",
          updatedAt: nowSecs(),
          ...(remove ? { worktree: null } : {}),
        }));
        return Promise.resolve({});
      }
      case "task.delete": {
        this.applyEvent({ data: { id: String(p.task_id) }, event: "task.removed" });
        return Promise.resolve({});
      }
      case "task.resume": {
        const resumed = demoResumeTask(p);
        this.applyEvent({ data: resumed.task, event: "task.created" });
        return Promise.resolve({ taskId: resumed.taskId });
      }
      case "sessions.list":
        return Promise.resolve({ sessions: demoExternalSessions(nowSecs()) });
      case "docs.list":
        return Promise.resolve({ docs: demoDocsList(this.demoDocs) });
      case "docs.write":
        return Promise.resolve(
          demoDocsWrite(this.demoDocs, String(p.path ?? ""), String(p.content ?? "")),
        );
      case "session.fork": {
        const forked = demoForkTask(this.state.snapshot.tasks, p);
        this.applyEvent({ data: forked.task, event: "task.created" });
        return Promise.resolve({ taskId: forked.taskId });
      }
      case "channel.list":
        return Promise.resolve({ messages: this.demoChannel });
      case "channel.post": {
        const message = {
          at: nowSecs(),
          author: String(p.author ?? "you"),
          body: String(p.body ?? ""),
          id: `m${nowSecs()}`,
          role: p.role === "agent" ? "agent" : "human",
        };
        this.demoChannel = [...this.demoChannel, message];
        return Promise.resolve(message);
      }
      case "shell.commands":
        return Promise.resolve(demoRunCommands());
      case "shell.run":
        return Promise.resolve({
          code: 0,
          cwd: demoShellCwd(this.state.snapshot.tasks, p.task_id),
          stderr: "",
          stdout: `(demo) ${String(p.command ?? "")}`,
        });
      case "orchestrate.start": {
        const graphId = `g${Math.random().toString(36).slice(2, 7)}`;
        const taskId = `t${Math.random().toString(36).slice(2, 7)}`;
        const goal = String(p.goal ?? "");
        // Create a parent task with orchestration graph
        const graph = {
          goal,
          id: graphId,
          nodes: [
            {
              id: `${graphId}_plan`,
              kind: "plan" as const,
              agent: "claude",
              status: "running" as const,
              taskId,
            },
          ],
        };
        const task = {
          agent: "claude",
          blockedReason: null,
          createdAt: nowSecs(),
          filesChanged: 0,
          id: taskId,
          orchestrationGraph: graph,
          project: String(p.project),
          prompt: goal,
          status: "running" as const,
          tags: ["orchestrator"],
          title: goal.trim().split("\n")[0]?.trim().slice(0, 80) ?? "",
          updatedAt: nowSecs(),
        };
        this.applyEvent({ data: task, event: "task.created" });
        return Promise.resolve({ graphId, taskId });
      }
      case "orchestrate.list": {
        const graphs: { goal: string; id: string; project: string; totalNodes: number }[] = [];
        for (const t of this.state.snapshot.tasks) {
          if (t.orchestrationGraph) {
            graphs.push({
              goal: t.orchestrationGraph.goal,
              id: t.orchestrationGraph.id,
              project: t.project,
              totalNodes: t.orchestrationGraph.nodes.length,
            });
          }
        }
        return Promise.resolve({ graphs });
      }
      case "terminal.spawn": {
        const id = `t${Math.random().toString(36).slice(2, 10)}`;
        // Synthesize a TerminalInfo entry so the workspace sees it.
        this.applyEvent({
          event: "state.snapshot",
          data: {
            ...this.state.snapshot,
            terminals: [
              ...this.state.snapshot.terminals,
              {
                cols: Number(p.cols) || 80,
                command: String(p.command ?? 'exec "${SHELL:-/bin/sh}" -l'),
                id,
                project: String(p.project),
                rows: Number(p.rows) || 24,
                startedAt: nowSecs(),
              },
            ],
          },
        });
        // Emit a fake prompt via terminal.data.
        setTimeout(() => {
          const prompt = "$ ";
          const b64 = bytesToBase64(new TextEncoder().encode(prompt));
          this.applyEvent({
            event: "terminal.data",
            data: { data_b64: b64, terminal_id: id },
          });
        }, 50);
        return Promise.resolve({ terminalId: id });
      }
      case "project.remove":
        this.applyEvent({ event: "project.removed", data: { name: String(p.name ?? "") } });
        return Promise.resolve({});
      case "task.deleteSettled": {
        const next = demoDeleteSettled(this.state.snapshot.tasks, String(p.project ?? ""));
        this.applyEvent({
          event: "state.snapshot",
          data: { ...this.state.snapshot, tasks: next.tasks },
        });
        return Promise.resolve({ deleted: next.deleted, kept: next.kept });
      }
      case "terminal.input":
      case "terminal.resize":
      case "terminal.kill":
        return Promise.resolve({});
      case "git.branchRename":
      case "git.branchDelete":
      case "git.update":
      case "git.rebase":
      case "git.merge":
        return Promise.resolve({ conflicts: [], message: "Done", status: "ok" });
      case "workflow.eject":
        return Promise.resolve({ path: `${PROJECT_DIR}/workflows/review-loop.yaml` });
      case "tracker.pulls.review":
        return Promise.resolve({
          url: `https://github.com/orchestrai/demo/pull/${String(p.number ?? "")}#review`,
        });
      case "memory.dream":
        return Promise.resolve({ inserted: 2, pending: 1, proposals: [] });
      case "memory.setEmbedding":
        return Promise.resolve(demoEmbedding(p.mode));
      case "agents.detect":
        return Promise.resolve(demoDetectedAgents());
      default:
        return Promise.resolve({});
    }
  }
}
