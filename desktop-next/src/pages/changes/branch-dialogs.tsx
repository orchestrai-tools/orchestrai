import { daemon } from "@warpforge/daemon";
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

import { SelectMenu } from "../../components/common/select-menu";
import {
  checkoutAndUpdate,
  deleteBranch,
  gitOp,
  mergeIn,
  rebase,
  renameBranch,
  useGitOpPending,
} from "./git-op";
import type { RepoTarget } from "../../lib/repo-target";

export type BranchKind = "rename" | "delete" | "rebase" | "merge" | "checkout-update" | "create";

/** What the branch dialog acts on: `subject` is the branch it is about, `target` a preselected other branch. */
export interface BranchRequest {
  kind: BranchKind;
  subject: string;
  target?: string;
  /** Prefilled name for `create`, such as the local name of a remote branch. */
  name?: string;
}

const COPY: Record<
  BranchKind,
  { title: (subject: string) => string; body: (subject: string) => string; confirm: string }
> = {
  rename: {
    title: () => "Rename branch",
    body: (subject) => `Renames ${subject}. Its upstream keeps the old name until the next push.`,
    confirm: "Rename",
  },
  delete: {
    title: () => "Delete a branch",
    body: () =>
      "The local branch is deleted with git branch -D. Commits that no other branch or remote holds are lost.",
    confirm: "Delete branch",
  },
  rebase: {
    title: (subject) => `Rebase ${subject} onto…`,
    body: (subject) => `Replays the commits of ${subject} on top of another branch.`,
    confirm: "Rebase",
  },
  merge: {
    title: () => "Merge into the current branch",
    body: (subject) => `Merges another branch into ${subject}.`,
    confirm: "Merge",
  },
  "checkout-update": {
    title: () => "Check out and update",
    body: () => "Checks out another branch and pulls it from its upstream.",
    confirm: "Check out and update",
  },
  create: {
    title: () => "New branch",
    body: (subject) => `Starts from ${subject}, uncommitted changes included.`,
    confirm: "Create branch",
  },
};

const VALID_NAME = /^[\w./-]+$/;

/** Rename, delete, rebase, merge, check out, or branch off, with git's answer reported as a toast. */
export function BranchActionDialog({
  repo,
  request,
  branches,
  remotes = [],
  current,
  onClose,
  onDone,
}: {
  repo: RepoTarget;
  request: BranchRequest | null;
  branches: string[];
  remotes?: string[];
  current: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const [name, setName] = useState("");
  const [target, setTarget] = useState("");
  const [checkout, setCheckout] = useState(true);
  const [overwrite, setOverwrite] = useState(false);
  const [busy, setBusy] = useState(false);
  const elsewhere = useGitOpPending((state) => state.label);
  useEffect(() => {
    setName(request?.name ?? "");
    setCheckout(true);
    setOverwrite(false);
    setTarget(request?.target ?? "");
  }, [request]);
  if (!request) return null;

  const { kind, subject } = request;
  const naming = kind === "rename" || kind === "create";
  const others = branches.filter((branch) =>
    kind === "delete" ? branch !== current && branch !== "main" : branch !== subject,
  );
  const options = [
    ...(target ? [] : [{ value: "", label: "Choose a branch", disabled: true }]),
    ...(target && !others.includes(target) ? [target, ...others] : others).map((branch) => ({
      value: branch,
      label: branch,
    })),
  ];
  const trimmed = name.trim();
  const remoteClash =
    kind === "create" && remotes.some((ref) => ref.split("/").slice(1).join("/") === trimmed);
  const ready = naming
    ? VALID_NAME.test(trimmed) && trimmed !== subject && (!remoteClash || overwrite)
    : Boolean(target);

  async function run() {
    if (!ready || busy || !request) return;
    setBusy(true);
    const work: () => Promise<unknown> =
      kind === "rename"
        ? () => renameBranch(repo, subject, trimmed)
        : kind === "create"
          ? () =>
              daemon.request("git.branchCreate", {
                ...repo,
                name: trimmed,
                from: subject,
                checkout,
                overwrite,
              })
          : kind === "delete"
            ? () => deleteBranch(repo, target)
            : kind === "rebase"
              ? () => rebase(repo, subject, target)
              : kind === "merge"
                ? () => mergeIn(repo, target)
                : () => checkoutAndUpdate(repo, target);
    const ok = await gitOp(
      COPY[kind].confirm,
      "Could not change the branch",
      work,
      COPY[kind].title(subject),
    );
    setBusy(false);
    onDone();
    if (ok) onClose();
  }

  return (
    <Dialog open onOpenChange={(open) => !open && !busy && onClose()}>
      <DialogContent className="sm:max-w-md">
        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            void run();
          }}
        >
          <DialogHeader>
            <DialogTitle>{COPY[kind].title(subject)}</DialogTitle>
            <DialogDescription>{COPY[kind].body(subject)}</DialogDescription>
          </DialogHeader>
          {naming ? (
            <Input
              autoFocus
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder={kind === "rename" ? subject : `${subject}-2`}
              className="font-mono"
              aria-label="New branch name"
            />
          ) : others.length > 0 || target ? (
            <SelectMenu
              label={kind === "delete" ? "Branch to delete" : "Target branch"}
              value={target}
              options={options}
              onChange={setTarget}
              className="w-full font-mono"
            />
          ) : (
            <p className="text-sm text-muted-foreground">No other local branches.</p>
          )}
          {kind === "create" && (
            <div className="flex flex-col gap-2 text-sm">
              <label className="flex items-center gap-2">
                <Checkbox
                  checked={checkout}
                  onCheckedChange={(value) => setCheckout(value === true)}
                />
                Check out the new branch
              </label>
              <label className="flex items-center gap-2">
                <Checkbox
                  checked={overwrite}
                  onCheckedChange={(value) => setOverwrite(value === true)}
                />
                Replace a branch with this name
              </label>
              {remoteClash && !overwrite && (
                <p className="text-xs text-amber-600 dark:text-amber-400">
                  A remote branch already has this name. Tick Replace to continue.
                </p>
              )}
            </div>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" disabled={busy} onClick={onClose}>
              Cancel
            </Button>
            <Button
              type="submit"
              variant={kind === "delete" ? "destructive" : "default"}
              disabled={!ready || busy || Boolean(elsewhere)}
              title={!busy && elsewhere ? `Waiting for ${elsewhere}` : undefined}
            >
              {busy ? "Working…" : COPY[kind].confirm}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
