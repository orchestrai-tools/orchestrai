import { daemon } from "@warpforge/daemon";
import { Button } from "@warpforge/ui/components/button";
import { Checkbox } from "@warpforge/ui/components/checkbox";
import { Kbd } from "@warpforge/ui/components/kbd";
import { Textarea } from "@warpforge/ui/components/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@warpforge/ui/components/tooltip";
import { SparklesIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { useCommitAsk } from "../../lib/commit-ask";
import { reportGitFailure } from "../../lib/git-result";
import { useShell } from "../../lib/shell-store";
import type { RepoTarget } from "../../lib/repo-target";
import type { BundleMode } from "./use-changes";

/**
 * Commits exactly the checked files; Command-Return commits. Amend fills in
 * the message it rewrites, and takes back only a message it put there itself.
 */
export function CommitBox({
  target,
  taskId,
  agent,
  checked,
  onCommit,
  onBundle,
}: {
  target: RepoTarget;
  /** The open task, which drafting needs; empty on the project checkout. */
  taskId: string;
  agent: string;
  checked: string[];
  onCommit: (message: string, amend: boolean) => Promise<void>;
  onBundle: (mode: BundleMode, paths: string[], name: string) => void;
}) {
  const [message, setMessage] = useState("");
  const [amend, setAmend] = useState(false);
  const [busy, setBusy] = useState(false);
  const [drafting, setDrafting] = useState(false);
  const prefilled = useRef<string | null>(null);
  const count = checked.length;
  const canCommit = !busy && count > 0 && (message.trim().length > 0 || amend);

  async function toggleAmend(next: boolean) {
    setAmend(next);
    if (!next) {
      if (prefilled.current !== null && message === prefilled.current) setMessage("");
      prefilled.current = null;
      return;
    }
    if (message.trim()) return;
    try {
      const { message: last } = (await daemon.request("git.lastCommitMessage", target)) as {
        message?: string;
      };
      if (!last) return;
      prefilled.current = last;
      setMessage(last);
    } catch (error) {
      reportGitFailure("Could not read the last commit", error);
    }
  }

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
        "commit_message",
        useShell.getState().textGenModel || undefined,
      );
      if (!text.trim()) toast.info("The draft came back empty");
      else setMessage(text);
    } catch (error) {
      reportGitFailure("Could not draft a commit message", error);
    } finally {
      setDrafting(false);
    }
  }

  async function submit() {
    if (!canCommit) return;
    setBusy(true);
    try {
      await onCommit(message.trim(), amend);
      setMessage("");
      setAmend(false);
      prefilled.current = null;
    } catch (error) {
      reportGitFailure(amend ? "Could not amend the commit" : "Could not commit", error);
    } finally {
      setBusy(false);
    }
  }

  const asked = useCommitAsk((state) => state.pending);
  useEffect(() => {
    if (!asked) return;
    useCommitAsk.getState().clear();
    if (asked === "draft") void draft();
    else if (asked === "amend") void toggleAmend(true);
    else onBundle(asked, checked, message.trim().split("\n")[0] ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [asked]);

  return (
    <form
      className="flex flex-col gap-2 border-t p-3"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <Textarea
        id="commit-message"
        value={message}
        onChange={(event) => setMessage(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
            event.preventDefault();
            void submit();
          }
        }}
        placeholder={count ? "Commit message" : "Check files to commit them"}
        aria-label="Commit message"
        className="max-h-40 min-h-16 resize-none text-sm"
      />
      <div className="flex items-center gap-1">
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Checkbox checked={amend} onCheckedChange={(value) => void toggleAmend(value === true)} />
          Amend
        </label>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="xs"
              className="ml-1 text-muted-foreground"
              disabled={drafting || !taskId}
              onClick={() => void draft()}
            >
              <SparklesIcon />
              {drafting ? "Drafting…" : "Draft"}
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            {taskId
              ? "Draft a message from the changes with your text agent"
              : "Drafting works on a task's changes"}
          </TooltipContent>
        </Tooltip>
        <Button type="submit" size="sm" className="ml-auto" disabled={!canCommit}>
          {busy
            ? amend
              ? "Amending…"
              : "Committing…"
            : amend
              ? "Amend"
              : count > 0
                ? `Commit ${count}`
                : "Commit"}
          <Kbd className="border-primary-foreground/20 bg-primary-foreground/10 text-primary-foreground">
            ⌘↵
          </Kbd>
        </Button>
      </div>
    </form>
  );
}
