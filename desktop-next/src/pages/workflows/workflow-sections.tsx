import type { TaskInfo } from "@warpforge/protocol";
import { SectionLabel } from "../../components/common/page-toolbar";
import { runStatus, StatusDot } from "../../components/common/status-mark";
import type { WorkflowNotes } from "../../lib/workflow-notes";
import { ago } from "../backlog/labels";

/** The `{{name}}` placeholders a task fills in when it runs the workflow. */
export function VariablesSection({ notes }: { notes: WorkflowNotes | null }) {
  if (!notes?.variables.length) return null;
  return (
    <section className="flex flex-col gap-2">
      <SectionLabel>Variables</SectionLabel>
      <ul className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
        {notes.variables.map((name) => (
          <li key={name} className="font-mono">{`{{${name}}}`}</li>
        ))}
      </ul>
    </section>
  );
}

/** How a run that ran this workflow ends. */
export function EndingSection() {
  return (
    <section className="flex flex-col gap-2">
      <SectionLabel>Ending</SectionLabel>
      <p className="text-xs text-muted-foreground">
        A Factory task that opens a pull request commits, pushes and opens a draft PR when the workflow succeeds. Without one
        nothing is committed, and the run ends in review for you.
      </p>
      <p className="text-xs text-muted-foreground">
        You can pause a run between stages; the running stage finishes first.
      </p>
    </section>
  );
}

/** The tasks in this project that ran the workflow, newest first. */
export function RecentRuns({ runs, onOpen }: { runs: TaskInfo[]; onOpen: (id: string) => void }) {
  const recent = [...runs].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 8);
  return (
    <section className="flex flex-col gap-1">
      <SectionLabel className="pb-1">Recent runs</SectionLabel>
      {recent.length === 0 && <p className="text-xs text-muted-foreground">No task in this project has run it yet.</p>}
      <ul className="-mx-2 flex flex-col">
        {recent.map((task) => (
          <li key={task.id}>
            <button
              type="button"
              onClick={() => onOpen(task.id)}
              className="flex w-full items-center gap-2 rounded-md px-2 py-(--row-py) text-left text-sm hover:bg-muted"
            >
              <StatusDot status={runStatus(task)} />
              <span className="min-w-0 flex-1 truncate">{task.title || task.prompt}</span>
              <span className="shrink-0 text-xs text-muted-foreground">
                {task.workflowRun?.stage} · {ago(task.updatedAt)}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
