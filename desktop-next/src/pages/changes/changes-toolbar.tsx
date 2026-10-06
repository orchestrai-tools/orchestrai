import type { GitPushInfo, TaskPullRequest } from "@warpforge/protocol";
import { Button } from "@warpforge/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@warpforge/ui/components/dropdown-menu";
import { ToggleGroup, ToggleGroupItem } from "@warpforge/ui/components/toggle-group";
import { Tooltip, TooltipContent, TooltipTrigger } from "@warpforge/ui/components/tooltip";
import { ChevronDownIcon } from "lucide-react";
import { useRef, useState } from "react";

import { PageToolbar } from "../../components/common/page-toolbar";
import { usePushView } from "../../components/push-dialog";
import { openExternalLink } from "../../lib/external-link";
import { runExclusive, syncTask } from "../../lib/git-actions";
import type { RepoTarget } from "../../lib/repo-target";
import { useShell } from "../../lib/shell-store";

export type ChangesView = "changes" | "worktrees";

export function openPush(view: "push" | "pr") {
  usePushView.getState().show(view);
  if (!useShell.getState().push) useShell.getState().toggle("push");
}

/** Title, the Changes/Worktrees switch, and Pull and Push for the open checkout. */
export function ChangesToolbar({
  view,
  setView,
  meta,
  target,
  hasTask,
  push,
  pull,
  onForcePush,
  onSynced,
}: {
  view: ChangesView;
  setView: (view: ChangesView) => void;
  meta: string;
  target: RepoTarget | null;
  /** Pull requests open from a task; the project checkout only pushes. */
  hasTask: boolean;
  push: GitPushInfo | null;
  pull?: TaskPullRequest;
  onForcePush: () => void;
  onSynced: () => void;
}) {
  const gate = useRef(false);
  const [pulling, setPulling] = useState(false);
  const outgoing = push?.commits.length ?? 0;
  const openPull = pull && (pull.state === "open" || pull.state === "draft") ? pull : undefined;

  const sync = () =>
    void runExclusive(gate, async () => {
      if (!target) return;
      setPulling(true);
      try {
        await syncTask(target);
        onSynced();
      } finally {
        setPulling(false);
      }
    });

  return (
    <PageToolbar title="Changes" meta={meta} className="px-4 pt-4 pb-3">
      <ToggleGroup
        type="single"
        variant="outline"
        size="sm"
        spacing={0}
        value={view}
        onValueChange={(next) => next && setView(next as ChangesView)}
        aria-label="View"
      >
        <ToggleGroupItem value="changes" className="px-3 text-xs">
          Changes
        </ToggleGroupItem>
        <ToggleGroupItem value="worktrees" className="px-3 text-xs">
          Worktrees
        </ToggleGroupItem>
      </ToggleGroup>
      {view === "changes" && target && (
        <>
          <Tooltip>
            <TooltipTrigger asChild>
              <span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={pulling || push?.hasUpstream === false}
                  onClick={sync}
                >
                  {pulling ? "Pulling…" : "Pull"}
                </Button>
              </span>
            </TooltipTrigger>
            <TooltipContent>
              {push?.hasUpstream === false
                ? "Nothing to pull from until the first push creates an upstream."
                : `Fetch and update from ${push?.upstream || "the upstream"}.`}
            </TooltipContent>
          </Tooltip>
          <div className="flex">
            <Button
              variant="outline"
              size="sm"
              className="rounded-r-none"
              onClick={() => openPush("push")}
            >
              Push
              {outgoing ? (
                <span className="text-muted-foreground tabular-nums">{outgoing}</span>
              ) : null}
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="rounded-l-none border-l-0 px-1.5"
                  aria-label="Push options"
                >
                  <ChevronDownIcon />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-60">
                <DropdownMenuItem onSelect={() => openPush("push")}>
                  Push… <DropdownMenuShortcut>⇧⌘K</DropdownMenuShortcut>
                </DropdownMenuItem>
                {hasTask && (
                  <DropdownMenuItem
                    onSelect={() =>
                      openPull ? void openExternalLink(openPull.url) : openPush("pr")
                    }
                  >
                    {openPull ? `Open pull request #${openPull.number}` : "Create pull request…"}
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  variant="destructive"
                  disabled={!push?.hasUpstream}
                  onSelect={onForcePush}
                >
                  Force push with lease…
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </>
      )}
    </PageToolbar>
  );
}
