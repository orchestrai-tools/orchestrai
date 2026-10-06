import { daemon } from "@warpforge/daemon";
import { Button } from "@warpforge/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@warpforge/ui/components/dialog";
import { Input } from "@warpforge/ui/components/input";
import { SparklesIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { reportGitFailure } from "../../lib/git-result";
import { targetTaskId, type RepoTarget } from "../../lib/repo-target";
import { useShell } from "../../lib/shell-store";
import { plural } from "./tree";
import type { BundleMode, BundleRequest } from "./use-changes";

/** Names a shelf entry or a stash message before the files leave the worktree. A blank name is filled in for you. */
export function BundleDialog({
  target,
  agent,
  request,
  onClose,
  onDone,
}: {
  target: RepoTarget;
  agent: string;
  request: BundleRequest | null;
  onClose: () => void;
  onDone: (mode: BundleMode) => void;
}) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [drafting, setDrafting] = useState(false);
  useEffect(() => setName(request?.name ?? ""), [request]);
  if (!request) return null;
  const { mode, paths } = request;
  const verb = mode === "shelf" ? "Shelve" : "Stash";
  const taskId = targetTaskId(target);

  async function draft() {
    const writer = useShell.getState().textGenAgentId || agent;
    if (!writer) {
      toast.error("Pick a text agent in Settings first");
      return;
    }
    setDrafting(true);
    try {
      const text = await daemon.generateText(
        taskId,
        writer,
        "shelf_name",
        useShell.getState().textGenModel || undefined,
        {
          input: paths.join("\n"),
        },
      );
      setName(text.split("\n")[0]?.trim() ?? "");
    } catch (err) {
      reportGitFailure(
        mode === "shelf" ? "Could not draft a shelf name" : "Could not draft a stash message",
        err,
      );
    } finally {
      setDrafting(false);
    }
  }

  async function submit() {
    if (busy || paths.length === 0) return;
    setBusy(true);
    try {
      if (mode === "shelf")
        await daemon.request("shelf.create", { ...target, name: name.trim(), paths });
      else await daemon.request("stash.push", { ...target, message: name.trim(), paths });
      toast.success(
        mode === "shelf"
          ? `Shelved ${plural(paths.length, "file")}`
          : `Stashed ${plural(paths.length, "file")}`,
      );
      onDone(mode);
      onClose();
    } catch (err) {
      reportGitFailure(`Could not ${verb.toLowerCase()} the changes`, err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && !busy && onClose()}>
      <DialogContent className="sm:max-w-md">
        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <DialogHeader>
            <DialogTitle>
              {verb} {plural(paths.length, "file")}
            </DialogTitle>
            <DialogDescription>
              {mode === "shelf"
                ? "The changes leave this worktree and wait on its shelf, outside the repository."
                : "The changes go into git's stash; every worktree of this repository sees it."}
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-2">
            <Input
              autoFocus
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder={
                mode === "shelf"
                  ? "Name (blank for an automatic one)"
                  : "Message (blank for git's default)"
              }
              aria-label={mode === "shelf" ? "Shelf name" : "Stash message"}
            />
            {taskId && (
              <Button
                type="button"
                variant="outline"
                disabled={drafting || busy}
                onClick={() => void draft()}
              >
                <SparklesIcon />
                {drafting ? "Drafting…" : "Draft"}
              </Button>
            )}
          </div>
          <ul className="max-h-32 overflow-y-auto font-mono text-xs text-muted-foreground">
            {paths.map((path) => (
              <li key={path} className="truncate">
                {path}
              </li>
            ))}
          </ul>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy || paths.length === 0}>
              {busy ? (mode === "shelf" ? "Shelving…" : "Stashing…") : verb}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
