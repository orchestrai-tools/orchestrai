import {
  buildHandoffSeed,
  canContinueHere,
  defaultCarryMode,
  type CarryMode,
  type Destination,
} from "@warpforge/core/continueSession";
import {
  buildConversationBranchPrompt,
  renderTranscript,
} from "@warpforge/core/conversationBranch";
import { estimateTokens, formatTokenRange } from "@warpforge/core/tokenEstimate";
import { daemon } from "@warpforge/daemon";
import type { SessionUpdate, TaskInfo } from "@warpforge/protocol";
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
import { Label } from "@warpforge/ui/components/label";
import { ToggleGroup, ToggleGroupItem } from "@warpforge/ui/components/toggle-group";
import { useId, useMemo, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { SelectMenu } from "../../components/common/select-menu";
import { useShell } from "../../lib/shell-store";
import { useDaemon } from "../../lib/use-daemon";

function nameTask(taskId: string, agent: string) {
  if (!useShell.getState().autoNameTasks) return;
  void (async () => {
    try {
      const generated = await daemon.generateText(taskId, agent, "task_title");
      if (generated?.trim()) await daemon.setTaskTitle(taskId, generated.trim().slice(0, 80));
    } catch {
      // A missing title does not undo the new task.
    }
  })();
}

function Choice({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      {children}
    </div>
  );
}

/**
 * Continue a conversation, up to one message, in a fresh session: here or
 * as a new task, carrying the full transcript or a handoff summary.
 */
export function ContinueDialog({
  task,
  updates,
  throughIndex,
  targetAgent,
  onClose,
}: {
  task: TaskInfo;
  updates: SessionUpdate[];
  throughIndex: number;
  targetAgent: string;
  onClose: () => void;
}) {
  const state = useDaemon();
  const worktreeId = useId();
  const agents = (state.snapshot.agents ?? []).filter((agent) => agent.enabled);
  const transcript = useMemo(
    () => renderTranscript(updates, throughIndex),
    [updates, throughIndex],
  );
  const estimate = useMemo(() => estimateTokens(transcript), [transcript]);
  const here = canContinueHere(task, targetAgent);
  const [carry, setCarry] = useState<CarryMode>(() => defaultCarryMode(estimate));
  const [destination, setDestination] = useState<Destination>(here ? "here" : "new");
  const [writer, setWriter] = useState(targetAgent);
  const [accountId, setAccountId] = useState("");
  const [worktree, setWorktree] = useState(true);
  const [busy, setBusy] = useState(false);
  const running = useRef(false);
  const handoff = useRef<string | null>(null);
  const accounts = (state.snapshot.accounts ?? []).filter((account) => account.agentId === writer);
  const targetName = agents.find((agent) => agent.id === targetAgent)?.displayName ?? targetAgent;
  const openTask = (id: string) => useShell.getState().openTask(id, task.project);

  async function seed(): Promise<string> {
    if (carry === "summary") {
      const document =
        handoff.current ??
        (await daemon.generateText(task.id, writer, "handoff", undefined, {
          accountId: accountId || undefined,
          input: transcript,
        }));
      if (!document.trim()) throw new Error("The handoff came back empty");
      handoff.current = document;
      return buildHandoffSeed(task, document);
    }
    const full = buildConversationBranchPrompt(task, updates, throughIndex);
    if (!full) throw new Error("There is nothing to carry over");
    return full;
  }

  async function run() {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    try {
      const text = await seed();
      if (destination === "here") {
        await daemon.request("session.prompt", { attachments: [], task_id: task.id, text });
        openTask(task.id);
      } else {
        const result = (await daemon.request("task.create", {
          agent: targetAgent,
          attachments: [],
          config_overrides: {},
          include_runtime_context: true,
          project: task.project,
          prompt: text,
          tags: ["conversation-branch", `branched-from:${task.id}`],
          worktree,
        })) as { taskId?: string } | null;
        const created = result?.taskId;
        if (!created) throw new Error("The new task was not created");
        nameTask(created, targetAgent);
        openTask(created);
      }
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not continue this session");
    } finally {
      running.current = false;
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
            void run();
          }}
        >
          <DialogHeader>
            <DialogTitle>Continue in a new session</DialogTitle>
            <DialogDescription>
              {targetName} starts fresh. The earlier conversation has to travel with it.
            </DialogDescription>
          </DialogHeader>
          <Choice label="What the new session reads">
            <ToggleGroup
              type="single"
              variant="outline"
              size="sm"
              spacing={0}
              value={carry}
              onValueChange={(next) => next && setCarry(next as CarryMode)}
              aria-label="What the new session reads"
            >
              <ToggleGroupItem value="full" className="px-3 text-xs">
                Full transcript · {formatTokenRange(estimate)}
              </ToggleGroupItem>
              <ToggleGroupItem value="summary" className="px-3 text-xs">
                Handoff summary
              </ToggleGroupItem>
            </ToggleGroup>
          </Choice>
          {carry === "summary" && (
            <Choice label="Handoff written by">
              <SelectMenu
                label="Handoff written by"
                value={writer}
                options={agents.map((agent) => ({ value: agent.id, label: agent.displayName }))}
                onChange={(next) => {
                  setWriter(next);
                  setAccountId("");
                  handoff.current = null;
                }}
              />
              <p className="text-xs text-muted-foreground">
                Writes the handoff only. {targetName} still continues the work.
              </p>
            </Choice>
          )}
          {carry === "summary" && accounts.length > 1 && (
            <Choice label="Account">
              <SelectMenu
                label="Account"
                value={accountId}
                options={[
                  { value: "", label: "Active account" },
                  ...accounts.map((account) => ({
                    value: account.id,
                    label: `${account.label}${account.active ? " (active)" : ""}`,
                  })),
                ]}
                onChange={(next) => {
                  setAccountId(next);
                  handoff.current = null;
                }}
              />
            </Choice>
          )}
          {here ? (
            <Choice label="Where the work continues">
              <ToggleGroup
                type="single"
                variant="outline"
                size="sm"
                spacing={0}
                value={destination}
                onValueChange={(next) => next && setDestination(next as Destination)}
                aria-label="Where the work continues"
              >
                <ToggleGroupItem value="here" className="px-3 text-xs">
                  In this task
                </ToggleGroupItem>
                <ToggleGroupItem value="new" className="px-3 text-xs">
                  As a new task
                </ToggleGroupItem>
              </ToggleGroup>
            </Choice>
          ) : (
            <p className="text-sm text-muted-foreground">
              Opens a new task. This one stays as it is.
            </p>
          )}
          {destination === "new" && (
            <div className="flex items-center gap-2">
              <Checkbox
                id={worktreeId}
                checked={worktree}
                onCheckedChange={(checked) => setWorktree(checked === true)}
              />
              <Label htmlFor={worktreeId} className="text-sm font-normal">
                Run it in a new worktree
              </Label>
            </div>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" disabled={busy} onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? "Continuing…" : "Continue"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
