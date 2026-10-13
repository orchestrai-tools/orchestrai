import { LoaderIcon } from "lucide-react";
import { lazy, Suspense } from "react";

import { fileTaskId, currentPage, useShell } from "../lib/shell-store";
import { useDaemon } from "../lib/use-daemon";
import { ErrorBoundary } from "./error-boundary";

const pages = {
  home: lazy(() => import("../pages/home").then((m) => ({ default: m.Home }))),
  board: lazy(() => import("../pages/board").then((m) => ({ default: m.Board }))),
  inbox: lazy(() => import("../pages/inbox").then((m) => ({ default: m.Inbox }))),
  task: lazy(() => import("../pages/task-page").then((m) => ({ default: m.TaskPage }))),
  changes: lazy(() => import("../pages/changes").then((m) => ({ default: m.Changes }))),
  files: lazy(() => import("../pages/files").then((m) => ({ default: m.Files }))),
  github: lazy(() => import("../pages/github").then((m) => ({ default: m.GitHub }))),
  backlog: lazy(() => import("../pages/backlog").then((m) => ({ default: m.Backlog }))),
  workflows: lazy(() => import("../pages/workflows").then((m) => ({ default: m.Workflows }))),
  automations: lazy(() => import("../pages/automations").then((m) => ({ default: m.Automations }))),
  memory: lazy(() => import("../pages/memory").then((m) => ({ default: m.MemoryPage }))),
  docs: lazy(() => import("../pages/docs").then((m) => ({ default: m.Docs }))),
  sessions: lazy(() => import("../pages/sessions").then((m) => ({ default: m.Sessions }))),
  channel: lazy(() => import("../pages/channel").then((m) => ({ default: m.Channel }))),
  services: lazy(() => import("../pages/services").then((m) => ({ default: m.ServicesPage }))),
  agents: lazy(() => import("../pages/agents").then((m) => ({ default: m.AgentsPage }))),
  settings: lazy(() => import("../pages/settings").then((m) => ({ default: m.Settings }))),
};

/** State belongs to the page's project, task and actual checkout, never its predecessor. */
export function pageScope(input: {
  page: string;
  project: string | null;
  taskId: string | null;
  checkoutId: string;
  worktree?: string | null;
}) {
  return JSON.stringify([
    input.page,
    input.project,
    input.page === "task" ? input.taskId : null,
    input.page === "files" || input.page === "changes" ? input.checkoutId : null,
    input.page === "files" || input.page === "changes" ? (input.worktree ?? "") : null,
  ]);
}

/** Keep the shell usable while a page loads or fails. Editors load on demand. */
export function PageContent() {
  const shell = useShell();
  const tasks = useDaemon().snapshot.tasks;
  const page = shell.home
    ? shell.homePage === "settings"
      ? "settings"
      : "home"
    : currentPage(shell);
  const checkoutId = fileTaskId(shell, tasks);
  const worktree = tasks.find((task) => task.id === checkoutId)?.worktree;
  const scope = pageScope({
    page,
    project: shell.project,
    taskId: shell.taskId,
    checkoutId,
    worktree,
  });
  const Page = pages[page];
  return (
    <ErrorBoundary key={scope} contained>
      <Suspense
        fallback={
          <div
            role="status"
            className="flex h-full items-center justify-center gap-2 p-8 text-sm text-muted-foreground"
          >
            <LoaderIcon aria-hidden className="size-4 animate-spin" /> Loading {page}…
          </div>
        }
      >
        <Page />
      </Suspense>
    </ErrorBoundary>
  );
}
