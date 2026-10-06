import { daemon } from "@warpforge/daemon";
import type { GitOpResult, GitPushInfo, TaskInfo, TaskPullRequest } from "@warpforge/protocol";
import { Button } from "@warpforge/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@warpforge/ui/components/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@warpforge/ui/components/dropdown-menu";
import { Field, FieldGroup, FieldLabel } from "@warpforge/ui/components/field";
import { Input } from "@warpforge/ui/components/input";
import { Textarea } from "@warpforge/ui/components/textarea";
import { cn } from "@warpforge/ui/lib/utils";
import { ChevronDownIcon, SparklesIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { create } from "zustand";

import { openExternalLink } from "../lib/external-link";
import { trackGit } from "../lib/git-activity";
import { describeGitResult, reportGitFailure } from "../lib/git-result";
import { targetKey, type RepoTarget } from "../lib/repo-target";
import { useChangesRefresh } from "../lib/shelf-palette";
import { fileRepoTarget, fileTaskId, useShell } from "../lib/shell-store";
import { useDaemon } from "../lib/use-daemon";
import { STATUS_TONE, statusLetter } from "../pages/changes/tree";
import { ConfirmDialog } from "./common/confirm-dialog";

/** Which side the push dialog opens on; set it before `toggle("push")`. */
export const usePushView = create<{ view: "push" | "pr"; show: (view: "push" | "pr") => void }>(
  (set) => ({
    view: "push",
    show: (view) => set({ view }),
  }),
);

/**
 * Push previews exactly what leaves: the outgoing commits and their files, before anything goes
 * over the network. Pull requests are opened from a task, so the project checkout only pushes.
 */
export function PushDialog() {
  const shell = useShell();
  const state = useDaemon();
  const target = fileRepoTarget(shell, state.snapshot.tasks);
  const taskId = fileTaskId(shell, state.snapshot.tasks);
  const task = state.snapshot.tasks.find((item) => item.id === taskId);
  const pull = task ? state.taskPullRequests?.[task.id] : undefined;
  const existing = pull && (pull.state === "open" || pull.state === "draft") ? pull : undefined;
  const close = () => {
    shell.toggle("push");
    usePushView.getState().show("push");
  };
  return (
    <Dialog open={shell.push && Boolean(target)} onOpenChange={(open) => !open && close()}>
      <DialogContent className="gap-0 p-0 sm:max-w-3xl">
        {target && (
          <PushForm
            key={targetKey(target)}
            target={target}
            task={task}
            existing={existing}
            onClose={close}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function PushForm({
  target,
  task,
  existing,
  onClose,
}: {
  target: RepoTarget;
  task?: TaskInfo;
  existing?: TaskPullRequest;
  onClose: () => void;
}) {
  const [info, setInfo] = useState<GitPushInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hash, setHash] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [forcing, setForcing] = useState(false);
  const asked = usePushView((store) => store.view);
  const view = task ? asked : "push";
  const setView = usePushView((store) => store.show);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [base, setBase] = useState(task?.baseBranch ?? "");

  useEffect(() => {
    let cancelled = false;
    void daemon
      .request("git.pushInfo", target)
      .then((result) => {
        if (cancelled) return;
        const next = result as GitPushInfo;
        setInfo(next);
        setHash(next.commits[0]?.hash ?? null);
        setTitle(
          next.commits.length === 1
            ? (next.commits[0]?.subject ?? next.branch)
            : task?.title || next.branch,
        );
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not preview the push");
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetKey(target), task?.title]);

  const commits = info?.commits ?? [];
  const selected = commits.find((commit) => commit.hash === hash) ?? commits[0];
  const branch = info?.branch ?? "";
  const upstream = info?.upstream || `${info?.remote ?? "origin"}/${branch}`;
  const needsPush = !info?.hasUpstream || commits.length > 0;

  async function push(force: boolean) {
    if (busy) return false;
    setBusy(true);
    try {
      const result = (await trackGit(targetKey(target), "push", () =>
        daemon.request("git.push", { ...target, force }),
      )) as GitOpResult;
      const described = describeGitResult(result);
      if (described.level === "error") {
        toast.error(described.message, { description: described.detail });
        return false;
      }
      if (described.level === "info") toast.info(described.message);
      else toast.success(described.message || "Pushed");
      useChangesRefresh.getState().refresh();
      return true;
    } catch (err) {
      reportGitFailure("Could not push", err);
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function createPr() {
    if (busy || !title.trim() || !task) return;
    if (needsPush && !(await push(false))) return;
    setBusy(true);
    try {
      const created = (await daemon.request("git.createPr", {
        task_id: task.id,
        title: title.trim(),
        body,
        base: base.trim() || undefined,
      })) as { url?: string };
      toast.success("Pull request created");
      if (created.url) void openExternalLink(created.url);
      onClose();
    } catch (err) {
      reportGitFailure("Could not create the pull request", err);
    } finally {
      setBusy(false);
    }
  }

  async function writeDescription() {
    if (busy || !task) return;
    setBusy(true);
    try {
      const writer = useShell.getState().textGenAgentId || task.agent;
      const text = await daemon.generateText(
        task.id,
        writer,
        "pr_description",
        useShell.getState().textGenModel || undefined,
      );
      const [first = "", ...rest] = text.split("\n");
      setTitle(first.replace(/^#+\s*/, "").trim());
      setBody(rest.join("\n").trim());
    } catch (err) {
      reportGitFailure("Could not write the pull request", err);
    } finally {
      setBusy(false);
    }
  }

  const openExisting = () => {
    if (!existing) return;
    void openExternalLink(existing.url);
    onClose();
  };

  return (
    <>
      <DialogHeader className="border-b px-5 py-4">
        <DialogTitle>
          {view === "push" ? `Push ${branch || "branch"}` : "Open a pull request"}
        </DialogTitle>
        <DialogDescription className="font-mono text-xs">
          {branch} → {view === "push" ? upstream : base || "the default branch"}
          {info && !info.hasUpstream && view === "push" && (
            <span className="font-sans"> · created by this push</span>
          )}
        </DialogDescription>
      </DialogHeader>

      {error && <p className="px-5 py-3 text-sm text-red-600 dark:text-red-400">{error}</p>}

      {view === "push" ? (
        <div className="grid h-80 grid-cols-2">
          <div className="min-h-0 overflow-y-auto border-r p-2">
            {!info && !error && (
              <p className="p-3 text-sm text-muted-foreground">Reading the outgoing commits…</p>
            )}
            {info && commits.length === 0 && (
              <p className="p-3 text-sm text-muted-foreground">
                Nothing to push. {branch} is up to date with {upstream}.
              </p>
            )}
            {commits.map((commit) => (
              <button
                key={commit.hash}
                type="button"
                onClick={() => setHash(commit.hash)}
                className={cn(
                  "flex w-full flex-col rounded-md px-3 py-(--row-py) text-left",
                  commit === selected ? "bg-muted" : "hover:bg-muted/50",
                )}
              >
                <span className="truncate text-sm">{commit.subject}</span>
                <span className="text-xs text-muted-foreground">
                  <span className="font-mono">{commit.shortHash}</span> · {commit.author} ·{" "}
                  {commit.files.length} {commit.files.length === 1 ? "file" : "files"}
                </span>
              </button>
            ))}
          </div>
          <ul className="min-h-0 overflow-y-auto p-3">
            {selected?.files.map((entry) => {
              const letter = statusLetter(entry.status);
              return (
                <li key={entry.path} className="flex items-center gap-2 py-0.5 text-xs">
                  <span className={cn("w-3 font-mono", STATUS_TONE[letter])}>{letter}</span>
                  <span className="truncate font-mono">{entry.path}</span>
                </li>
              );
            })}
          </ul>
        </div>
      ) : (
        <FieldGroup className="gap-4 px-5 py-4">
          {existing ? (
            <p className="text-sm text-muted-foreground">
              Pull request #{existing.number} is already open for {branch}. Pushing updates it; a
              second one is never created.
            </p>
          ) : (
            <>
              <Field>
                <FieldLabel htmlFor="pr-title">Title</FieldLabel>
                <Input
                  id="pr-title"
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                />
              </Field>
              <Field>
                <div className="flex items-center">
                  <FieldLabel htmlFor="pr-body">Description</FieldLabel>
                  <Button
                    variant="ghost"
                    size="xs"
                    className="ml-auto text-muted-foreground"
                    disabled={busy}
                    onClick={() => void writeDescription()}
                  >
                    <SparklesIcon />
                    Write with your text agent
                  </Button>
                </div>
                <Textarea
                  id="pr-body"
                  value={body}
                  onChange={(event) => setBody(event.target.value)}
                  placeholder="Markdown. Closes #N links an issue."
                  className="h-36 font-mono text-xs"
                />
              </Field>
              <Field className="max-w-48">
                <FieldLabel htmlFor="pr-base">Base branch</FieldLabel>
                <Input
                  id="pr-base"
                  value={base}
                  placeholder="Default branch"
                  onChange={(event) => setBase(event.target.value)}
                  className="font-mono"
                />
              </Field>
            </>
          )}
        </FieldGroup>
      )}

      <DialogFooter className="items-center border-t px-5 py-3 sm:justify-start">
        {view === "push" ? (
          <>
            <p className="text-xs text-muted-foreground">
              {info && !info.hasUpstream && commits.length
                ? `The first push creates ${upstream}.`
                : commits.length
                  ? `${commits.length} outgoing ${commits.length === 1 ? "commit" : "commits"}`
                  : ""}
            </p>
            <div className="ml-auto flex gap-2">
              <Button variant="outline" onClick={onClose}>
                Cancel
              </Button>
              {task && (
                <Button
                  variant="secondary"
                  onClick={() => (existing ? openExisting() : setView("pr"))}
                >
                  {existing ? `Open #${existing.number}` : "Create pull request…"}
                </Button>
              )}
              <div className="flex">
                <Button
                  className="rounded-r-none"
                  disabled={busy || !info || (info.hasUpstream && commits.length === 0)}
                  onClick={() => void push(false).then((ok) => ok && onClose())}
                >
                  {busy ? "Pushing…" : "Push"}
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      className="rounded-l-none border-l border-primary-foreground/20 px-1.5"
                      aria-label="Push options"
                      disabled={busy || !info?.hasUpstream}
                    >
                      <ChevronDownIcon />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-60">
                    <DropdownMenuItem
                      onSelect={() => setForcing(true)}
                      className="flex-col items-start gap-0"
                    >
                      Force push…
                      <span className="text-xs text-muted-foreground">
                        Replaces the upstream with your local branch
                      </span>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          </>
        ) : (
          <>
            <Button variant="ghost" onClick={() => setView("push")}>
              Back
            </Button>
            <div className="ml-auto flex gap-2">
              <Button variant="outline" onClick={onClose}>
                Cancel
              </Button>
              {existing ? (
                <Button onClick={openExisting}>Open #{existing.number}</Button>
              ) : (
                <Button disabled={busy || !title.trim()} onClick={() => void createPr()}>
                  {needsPush ? "Push and open pull request" : "Open pull request"}
                </Button>
              )}
            </div>
          </>
        )}
      </DialogFooter>
      <ConfirmDialog
        open={forcing}
        onOpenChange={setForcing}
        title={`Force push ${branch}?`}
        description={`Replaces ${upstream} with your local branch. Git refuses if someone pushed to it since your last fetch, so their commits are not overwritten unseen.`}
        items={commits.map((commit) => `${commit.shortHash} ${commit.subject}`)}
        confirmLabel="Force push"
        onConfirm={() => void push(true).then((ok) => ok && onClose())}
      />
    </>
  );
}
