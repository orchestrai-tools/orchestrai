import { daemon } from "@warpforge/daemon";
import type { GitBranchList, GitOpResult } from "@warpforge/protocol";
import { Button } from "@warpforge/ui/components/button";
import { Checkbox } from "@warpforge/ui/components/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@warpforge/ui/components/dialog";
import { Input } from "@warpforge/ui/components/input";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { describeGitResult, remoteNameTaken, reportGitFailure } from "../lib/git-result";
import { targetKey } from "../lib/repo-target";
import { useChangesRefresh } from "../lib/shelf-palette";
import { fileRepoTarget, useShell } from "../lib/shell-store";
import { useDaemon } from "../lib/use-daemon";

/** Name a branch and create it on the checkout Changes and Files are using. */
export function BranchDialog() {
  const shell = useShell();
  const tasks = useDaemon().snapshot.tasks;
  const target = fileRepoTarget(shell, tasks);
  const key = target ? targetKey(target) : "";
  const open = shell.newBranch;
  const [name, setName] = useState("");
  const [checkout, setCheckout] = useState(true);
  const [overwrite, setOverwrite] = useState(false);
  const [list, setList] = useState<GitBranchList | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName("");
    setCheckout(true);
    setOverwrite(false);
  }, [open]);

  useEffect(() => {
    if (!open || !target) return;
    void daemon
      .request("git.branches", target)
      .then((result) => {
        setList(result as GitBranchList);
        setListError(null);
      })
      .catch((err: unknown) => setListError(err instanceof Error ? err.message : "Could not list remotes"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, key, reload]);

  const branch = name.trim();
  const taken = remoteNameTaken(list?.remotes ?? [], name);
  const from = list?.current;
  const ready = Boolean(target) && /^[\w./-]+$/.test(branch) && !busy && (!taken || overwrite);
  const close = () => !busy && shell.toggle("newBranch");

  async function create() {
    if (!ready || !target) return;
    setBusy(true);
    try {
      const result = (await daemon.request("git.branchCreate", {
        ...target,
        name: branch,
        checkout,
        overwrite,
      })) as GitOpResult;
      const described = describeGitResult(result);
      if (described.level === "error") toast.error(described.message, { description: described.detail });
      else if (described.level === "info") toast.info(described.message);
      else toast.success(described.message || `Created ${branch}`);
      if (described.level !== "error") {
        useChangesRefresh.getState().refresh();
        shell.toggle("newBranch");
      }
    } catch (error) {
      reportGitFailure("Could not create the branch", error);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && close()}>
      <DialogContent className="sm:max-w-md">
        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            void create();
          }}
        >
          <DialogHeader>
            <DialogTitle>New branch</DialogTitle>
            <DialogDescription>
              {target ? (
                <>
                  Starts from {from ? <span className="font-mono">{from}</span> : "the current branch"}, uncommitted changes
                  included.
                </>
              ) : (
                "Open a project first."
              )}
            </DialogDescription>
          </DialogHeader>
          <Input
            autoFocus
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder={from ? `${from}-2` : "Branch name"}
            className="font-mono"
            aria-label="Branch name"
          />
          <div className="flex flex-col gap-2">
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={checkout} onCheckedChange={(value) => setCheckout(value === true)} />
              Check out the new branch
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={overwrite} onCheckedChange={(value) => setOverwrite(value === true)} />
              Replace a branch that already has this name
            </label>
          </div>
          {listError && (
            <p className="flex items-center gap-2 text-sm text-red-600 dark:text-red-400">
              {listError}
              <Button type="button" variant="link" size="xs" onClick={() => setReload((count) => count + 1)}>
                Retry
              </Button>
            </p>
          )}
          {taken && !overwrite && (
            <p className="text-sm text-red-600 dark:text-red-400">
              A remote branch with this name already exists. Turn on replace to continue.
            </p>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" disabled={busy} onClick={close}>
              Cancel
            </Button>
            <Button type="submit" disabled={!ready}>
              {busy ? "Creating…" : "Create branch"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
