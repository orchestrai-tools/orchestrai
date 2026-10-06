import { daemon } from "@warpforge/daemon";
import type { ExternalSession } from "@warpforge/protocol";
import { Button } from "@warpforge/ui/components/button";
import { ToggleGroup, ToggleGroupItem } from "@warpforge/ui/components/toggle-group";
import { MessageSquarePlusIcon } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { PageToolbar } from "../components/common/page-toolbar";
import {
  hiddenSessionIds,
  hideSession,
  unhideSession,
  useHiddenSessions,
} from "../lib/hidden-sessions";
import { taskIsPinned } from "../lib/pin-group";
import { plural } from "../lib/plural";
import { newChat } from "../lib/quick-chat";
import { useShell } from "../lib/shell-store";
import { useDaemon } from "../lib/use-daemon";
import { LoadError } from "./github/list-controls";
import { ContinueSessionDialog } from "./sessions/continue-dialog";
import { SessionGrid } from "./sessions/session-grid";
import { SessionList, type SessionActions } from "./sessions/session-list";
import { sessionRows, type SessionRow } from "./sessions/session-rows";
import { useSessionsLayout, type GridLayout, type SessionsView } from "./sessions/sessions-store";
import { UsageLine } from "./sessions/usage-line";

const LAYOUTS: readonly { id: GridLayout; label: string; name: string }[] = [
  { id: "1", label: "1", name: "One panel" },
  { id: "2", label: "2", name: "Two columns" },
  { id: "4", label: "2×2", name: "Two by two" },
];

function failure(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback;
}

function SessionsRoom({ project }: { project: string }) {
  const state = useDaemon();
  const openTask = useShell((shell) => shell.openTask);
  const togglePin = useShell((shell) => shell.togglePin);
  const pins = useShell((shell) => shell.pinned);
  const { view, layout, setView, setLayout } = useSessionsLayout();
  const hiddenTick = useHiddenSessions((store) => store.tick);
  const tasks = state.snapshot.tasks.filter((task) => task.project === project);
  const [external, setExternal] = useState<ExternalSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hidden, setHidden] = useState<string[]>(() => hiddenSessionIds(project));
  const [selectedId, setSelectedId] = useState<string>();
  const [maximized, setMaximized] = useState<string | null>(null);
  const [continuing, setContinuing] = useState<SessionRow | null>(null);
  const [notice, setNotice] = useState<string>();

  const load = useCallback(() => {
    setLoading(true);
    void daemon
      .listSessions(project)
      .then((rows) => {
        setExternal(rows);
        setError(null);
      })
      .catch((err: unknown) => setError(failure(err, "Could not list sessions")))
      .finally(() => setLoading(false));
  }, [project]);

  useEffect(load, [load]);
  useEffect(() => setHidden(hiddenSessionIds(project)), [project, hiddenTick]);

  const rows = sessionRows(tasks, external, state.sessionUpdates);

  async function resume(row: SessionRow) {
    if (!row.external) return;
    try {
      const taskId = await daemon.resumeTask(project, row.agent, row.external.sessionId, row.title);
      if (!taskId) throw new Error("The agent could not load that session");
      setNotice(`${row.title}: loaded and running here.`);
      openTask(taskId, project);
    } catch (err) {
      setNotice(failure(err, "Could not continue that session"));
    }
  }

  const actions: SessionActions = {
    onOpen: (row) => {
      setSelectedId(row.id);
      if (row.task) openTask(row.task.id, project);
      else setContinuing(row);
    },
    onContinue: setContinuing,
    onFork: (row) => {
      if (!row.task) return;
      void (
        daemon.request("session.fork", { task_id: row.task.id }) as Promise<{ taskId?: string }>
      )
        .then((result) => {
          if (!result.taskId) return;
          setSelectedId(result.taskId);
          setNotice(`Forked “${row.title}”. Its later turns leave the original as it was.`);
        })
        .catch((err: unknown) => setNotice(failure(err, "Could not fork")));
    },
    onStop: (row) => {
      if (!row.task) return;
      void daemon
        .request("task.cancel", { task_id: row.task.id })
        .then(() => setNotice(`Stopped “${row.title}”.`))
        .catch((err: unknown) => setNotice(failure(err, "Could not stop")));
    },
    onTogglePin: (row) => row.task && togglePin(row.task.id, tasks),
    onCopyId: (row) => {
      const id = row.external?.sessionId ?? row.id;
      void navigator.clipboard
        .writeText(id)
        .then(() => setNotice("Copied the session id"))
        .catch(() => setNotice(id));
    },
    onHide: (row, hide) =>
      setHidden(hide ? hideSession(project, row.id) : unhideSession(project, row.id)),
    isPinned: (row) => taskIsPinned(tasks, pins, row.id),
  };

  const visible = rows.filter((row) => !hidden.includes(row.id));
  const live = visible.filter((row) => row.live).length;
  const outside = visible.filter((row) => row.outside).length;

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 p-4">
      <PageToolbar
        title="Sessions"
        meta={`${plural(visible.length, "session")} · ${live} live · ${outside} from outside the app`}
      >
        {view === "grid" && (
          <ToggleGroup
            type="single"
            variant="outline"
            size="sm"
            spacing={0}
            value={layout}
            onValueChange={(next) => {
              if (!next) return;
              setLayout(next as GridLayout);
              setMaximized(null);
            }}
            aria-label="Layout"
          >
            {LAYOUTS.map((entry) => (
              <ToggleGroupItem
                key={entry.id}
                value={entry.id}
                aria-label={entry.name}
                title={entry.name}
                className="px-2.5 text-xs"
              >
                {entry.label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        )}
        <ToggleGroup
          type="single"
          variant="outline"
          size="sm"
          spacing={0}
          value={view}
          onValueChange={(next) => next && setView(next as SessionsView)}
          aria-label="View"
        >
          <ToggleGroupItem value="list" className="px-3 text-xs">
            List
          </ToggleGroupItem>
          <ToggleGroupItem value="grid" className="px-3 text-xs">
            Grid
          </ToggleGroupItem>
        </ToggleGroup>
        <Button size="sm" className="text-xs" onClick={() => void newChat()} title="New chat (⇧⌘N)">
          <MessageSquarePlusIcon />
          New chat
        </Button>
      </PageToolbar>

      {error && <LoadError message={error} onRetry={load} />}

      {view === "list" ? (
        <SessionList
          rows={rows}
          hidden={hidden}
          loading={loading}
          selectedId={selectedId}
          notice={notice}
          actions={actions}
        />
      ) : (
        <SessionGrid
          rows={rows}
          notice={notice}
          maximized={maximized}
          onMaximize={setMaximized}
          onOpen={actions.onOpen}
          onFork={actions.onFork}
        />
      )}

      <UsageLine />
      <ContinueSessionDialog
        row={continuing}
        onOpenChange={(open) => !open && setContinuing(null)}
        onConfirm={resume}
      />
    </div>
  );
}

/**
 * Mission Control for this project: every task's session and every session
 * the agents saved on their own, with continue and fork, plus the pinned
 * tasks as a panel grid.
 */
export function Sessions() {
  const project = useShell((shell) => shell.project);
  if (!project) {
    return (
      <div className="flex h-full min-h-0 flex-col gap-3 p-4">
        <PageToolbar title="Sessions" />
        <p className="py-10 text-center text-sm text-muted-foreground">
          Open a project to see its sessions.
        </p>
      </div>
    );
  }
  return <SessionsRoom key={project} project={project} />;
}
