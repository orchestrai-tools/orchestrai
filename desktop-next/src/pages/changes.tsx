import { loadTask, setTaskDiff } from "@warpforge/core/sessionStore";
import { daemon } from "@warpforge/daemon";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@warpforge/ui/components/resizable";
import { Tabs, TabsList, TabsTrigger } from "@warpforge/ui/components/tabs";
import { FileDiffIcon } from "lucide-react";
import { useEffect, useState } from "react";

import { ConfirmRequestDialog, type ConfirmRequest } from "../components/common/confirm-dialog";
import { useBranchAsk } from "../lib/branch-ask";
import { useCommitAsk } from "../lib/commit-ask";
import { trackGit } from "../lib/git-activity";
import { repoTarget, targetKey } from "../lib/repo-target";
import { useShelfAsk } from "../lib/shelf-entry";
import { useChangesPane, useChangesRefresh, useCheckoutChanged } from "../lib/shelf-palette";
import { fileTaskId, useShell } from "../lib/shell-store";
import { useDaemon } from "../lib/use-daemon";
import { useWorktreeRows } from "../shell/worktree-switcher";
import { BranchBar } from "./changes/branch-bar";
import { BranchActionDialog, type BranchRequest } from "./changes/branch-dialogs";
import { BundleDialog } from "./changes/bundle-dialog";
import { ChangesToolbar, openPush, type ChangesView } from "./changes/changes-toolbar";
import { CommitBox } from "./changes/commit-box";
import { DiffPane } from "./changes/diff-pane";
import { discardRequest } from "./changes/file-ops";
import { gitOp } from "./changes/git-op";
import { RowSkeletons } from "./changes/row-skeletons";
import { ShelfPanel, StashPanel } from "./changes/shelf-stash";
import { StagingTree } from "./changes/staging-tree";
import { useBranchInfo } from "./changes/use-branch-info";
import { useBundles } from "./changes/use-bundles";
import { useChanges } from "./changes/use-changes";
import { WorktreesView } from "./changes/worktrees-view";

type RailTab = "commit" | "shelf" | "stash";

/**
 * Git for one worktree: what changed, what the next commit takes, and the
 * diff of the file in hand. With no task open it is the project checkout. The Worktrees view lists every checkout of the
 * project. Anything that loses work asks first and names what it loses.
 */
export function Changes() {
  const shell = useShell();
  const daemonState = useDaemon();
  const tasks = daemonState.snapshot.tasks;
  const taskId = fileTaskId(shell, tasks) || "";
  const project = shell.project ?? "";
  const target = project ? repoTarget(taskId, project) : null;
  const task = tasks.find((item) => item.id === taskId);
  const worktree = task?.worktree || undefined;
  const pull = taskId ? daemonState.taskPullRequests?.[taskId] : undefined;
  const view: ChangesView =
    project && shell.changesPane[project] === "worktrees" ? "worktrees" : "changes";
  const [railTab, setRailTab] = useState<RailTab>("commit");
  const [confirm, setConfirm] = useState<ConfirmRequest | null>(null);
  const [branchAsk, setBranchAsk] = useState<BranchRequest | null>(null);
  const [selected, setSelected] = useState<string>();
  const [localTick, setTick] = useState(0);
  const tick = localTick + useChangesRefresh((state) => state.tick);

  const changes = useChanges(taskId, project || null, worktree);
  const info = useBranchInfo(target, tick);
  const shelf = useBundles(target, "shelf", tick);
  const stash = useBundles(target, "stash", tick);
  const worktrees = useWorktreeRows(project || null);
  const branch = changes.diff?.branch ?? info.branches?.current ?? "";
  const refresh = () => {
    changes.reload();
    setTick((count) => count + 1);
    useCheckoutChanged.getState().bump();
  };

  function setView(next: ChangesView) {
    if (!project) return;
    useShell.setState((state) => {
      const changesPane = { ...state.changesPane };
      if (next === "worktrees") changesPane[project] = "worktrees";
      else delete changesPane[project];
      return { changesPane };
    });
  }

  useEffect(() => {
    setSelected(undefined);
    if (!taskId || !project) return;
    let cancel = false;
    void loadTask(taskId, project, worktree).then((session) => {
      if (!cancel) setSelected(session.diff.selectedFile ?? undefined);
    });
    return () => {
      cancel = true;
    };
  }, [taskId, project, worktree]);

  const select = (path: string) => {
    setSelected(path);
    if (taskId && project)
      setTaskDiff(taskId, project, { selectedFile: path, scrollTop: 0 }, worktree);
  };

  const askedPane = useChangesPane((state) => state.pane);
  useEffect(() => {
    if (!askedPane) return;
    useChangesPane.getState().clear();
    setView(askedPane === "worktrees" ? "worktrees" : "changes");
    if (askedPane !== "worktrees") setRailTab(askedPane === "diff" ? "commit" : askedPane);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [askedPane]);

  const askedCommit = useCommitAsk((state) => state.pending);
  const askedShelf = useShelfAsk((state) => state.pending);
  const askedBranch = useBranchAsk((state) => state.kind);
  useEffect(() => {
    if (askedCommit || askedShelf) setView("changes");
    if (askedCommit) setRailTab("commit");
    if (askedShelf) setRailTab(askedShelf.kind);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [askedCommit, askedShelf]);
  useEffect(() => {
    if (!askedBranch) return;
    useBranchAsk.getState().clear();
    if (branch) setBranchAsk({ kind: askedBranch, subject: branch });
  }, [askedBranch, branch]);

  useEffect(() => {
    if (!changes.rollbackAsked) return;
    changes.clearRollback();
    const entries = changes.files.filter((entry) => changes.checked.includes(entry.path));
    if (target && entries.length) setConfirm(discardRequest(target, entries, refresh));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [changes.rollbackAsked]);

  const checkout = target ? targetKey(target) : "";
  useEffect(() => {
    if (!checkout) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey && event.shiftKey && event.key.toLowerCase() === "k") {
        event.preventDefault();
        openPush("push");
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [checkout]);

  const forcePush = () =>
    setConfirm({
      title: `Force push ${branch}?`,
      description: `Replaces ${info.push?.upstream || "the upstream"} with your local branch. Git refuses if anyone pushed to it since your last fetch, so their commits are never overwritten unseen.`,
      items: (info.push?.commits ?? []).map((commit) => `${commit.shortHash} ${commit.subject}`),
      confirmLabel: "Force push",
      destructive: true,
      onConfirm: () =>
        void gitOp(
          "Force pushed",
          "Could not push",
          () =>
            trackGit(checkout, "push", () => daemon.request("git.push", { ...target, force: true })),
          `Force pushing ${branch}`,
        ).then(refresh),
    });

  const file = changes.files.find((entry) => entry.path === selected) ?? changes.files[0];
  const busyBranches = worktrees.rows
    .filter((row) => (row.taskId ?? "") !== taskId && row.branch)
    .map((row) => row.branch!);
  const meta =
    view === "worktrees"
      ? `${worktrees.rows.length} ${worktrees.rows.length === 1 ? "worktree" : "worktrees"}`
      : changes.files.length
        ? `${changes.files.length} changed`
        : changes.loading
          ? undefined
          : "Clean";

  return (
    <div className="relative flex h-full min-h-0 flex-col">
      <ChangesToolbar
        view={view}
        setView={setView}
        meta={meta ?? ""}
        target={target}
        hasTask={Boolean(taskId)}
        push={info.push}
        pull={pull}
        onForcePush={forcePush}
        onSynced={refresh}
      />

      {view === "worktrees" ? (
        <WorktreesView
          project={project}
          rows={worktrees.rows}
          error={worktrees.error}
          retry={worktrees.retry}
          currentTaskId={taskId || null}
          onOpen={(id) => {
            shell.setFileContext(id);
            setView("changes");
          }}
          onConfirm={setConfirm}
        />
      ) : !target ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center">
          <FileDiffIcon className="size-5 text-muted-foreground" />
          <p className="text-sm font-medium">No project open</p>
          <p className="max-w-sm text-xs text-muted-foreground">
            Open a project to see what changed in it.
          </p>
        </div>
      ) : (
        <>
          <BranchBar
            target={target}
            task={task}
            branch={branch}
            info={info}
            pull={pull}
            busyBranches={busyBranches}
            onAsk={setBranchAsk}
            onConfirm={setConfirm}
            onDone={refresh}
          />
          {changes.error && (
            <p className="border-b px-4 py-1.5 text-xs text-red-600 dark:text-red-400">
              {changes.error}{" "}
              <button type="button" className="underline" onClick={changes.reload}>
                Retry
              </button>
            </p>
          )}
          {changes.diff?.untrackedAvailable === false && (
            <p className="border-b px-4 py-1.5 text-xs text-muted-foreground">
              Untracked files could not be listed.
            </p>
          )}
          <ResizablePanelGroup orientation="horizontal" className="min-h-0 flex-1">
            <ResizablePanel id="changes-rail" defaultSize="32%" minSize="22%" maxSize="50%">
              <div className="flex h-full min-h-0 flex-col bg-sidebar/40">
                <Tabs
                  value={railTab}
                  onValueChange={(next) => setRailTab(next as RailTab)}
                  className="gap-0"
                >
                  <TabsList className="w-full justify-start px-3">
                    <TabsTrigger value="commit">Commit</TabsTrigger>
                    <TabsTrigger value="shelf">
                      Shelf
                      {shelf.entries.length > 0 && (
                        <span className="text-xs text-muted-foreground tabular-nums">
                          {shelf.entries.length}
                        </span>
                      )}
                    </TabsTrigger>
                    <TabsTrigger value="stash">
                      Stash
                      {stash.entries.length > 0 && (
                        <span className="text-xs text-muted-foreground tabular-nums">
                          {stash.entries.length}
                        </span>
                      )}
                    </TabsTrigger>
                  </TabsList>
                </Tabs>
                {railTab === "commit" && (
                  <>
                    <StagingTree
                      target={target}
                      files={changes.files}
                      roots={changes.roots}
                      checked={changes.checked}
                      flat={changes.flat}
                      setFlat={changes.setFlat}
                      selected={file?.path}
                      onSelect={select}
                      onCheck={changes.check}
                      onBundle={(mode, paths) => changes.askBundle(mode, paths)}
                      onConfirm={setConfirm}
                      onRefresh={refresh}
                    />
                    <CommitBox
                      key={checkout}
                      target={target}
                      taskId={taskId}
                      agent={task?.agent ?? ""}
                      checked={changes.checked}
                      onCommit={async (message, amend) => {
                        await changes.commit(message, amend);
                        setTick((count) => count + 1);
                        useCheckoutChanged.getState().bump();
                      }}
                      onBundle={changes.askBundle}
                    />
                  </>
                )}
                {railTab === "shelf" && (
                  <ShelfPanel
                    target={target}
                    bundles={shelf}
                    onConfirm={setConfirm}
                    onChanged={changes.reload}
                  />
                )}
                {railTab === "stash" && (
                  <StashPanel
                    target={target}
                    bundles={stash}
                    onConfirm={setConfirm}
                    onChanged={changes.reload}
                  />
                )}
              </div>
            </ResizablePanel>
            <ResizableHandle />
            <ResizablePanel id="changes-diff" minSize="40%">
              <div className="flex h-full min-h-0 flex-col">
                {changes.loading && !changes.diff ? (
                  <RowSkeletons label="Loading changes" className="p-4" />
                ) : (
                  <DiffPane
                    target={target}
                    taskId={taskId}
                    project={project}
                    worktree={worktree}
                    file={file}
                    branch={branch}
                    mode={changes.mode}
                    setMode={changes.setMode}
                    onConfirm={setConfirm}
                    onBundle={(mode, paths) => changes.askBundle(mode, paths)}
                    onRefresh={refresh}
                  />
                )}
              </div>
            </ResizablePanel>
          </ResizablePanelGroup>
        </>
      )}

      <ConfirmRequestDialog request={confirm} onClose={() => setConfirm(null)} />
      {target && (
        <>
          <BranchActionDialog
            repo={target}
            request={branchAsk}
            branches={info.branches?.branches ?? []}
            remotes={info.branches?.remotes ?? []}
            current={branch}
            onClose={() => setBranchAsk(null)}
            onDone={refresh}
          />
          <BundleDialog
            target={target}
            agent={task?.agent ?? ""}
            request={changes.bundle}
            onClose={changes.closeBundle}
            onDone={(mode) => {
              setRailTab(mode);
              refresh();
            }}
          />
        </>
      )}
    </div>
  );
}
