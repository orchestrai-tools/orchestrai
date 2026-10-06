import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { taskDetail } from "@/data/task-detail"
import { useAppActions, useAppSession } from "@/lib/app-instance"
import { selectSelection } from "@/lib/window-store"
import { AttentionCard } from "@/pages/task/attention-card"
import { Composer } from "@/pages/task/composer"
import { MarkdownEditor } from "@/pages/task/plan-pane"
import { TaskHeader } from "@/pages/task/task-header"
import { StepLog, Transcript } from "@/pages/task/transcript"

/**
 * One task and only that task's history. The reading surface comes first;
 * details, changes, checks, context, and receipts sit in the inspector.
 */
export function TaskPage() {
  const taskId = useAppSession((session) => selectSelection(session, "task"))
  const project = useAppSession((session) => session.project)
  const { setPage } = useAppActions()
  const detail = taskDetail(taskId)

  if (!detail || detail.task.project !== project) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-sm text-muted-foreground">
        <p>Pick a task on the board to see its plan and conversation.</p>
        <Button variant="outline" size="sm" onClick={() => setPage("board")}>
          Open the board
        </Button>
      </div>
    )
  }

  const { task } = detail
  const planFirst = task.stage === "requirements" || task.stage === "plan"

  return (
    <div className="flex h-full flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex max-w-3xl flex-col gap-5 px-6 py-5">
          <TaskHeader task={task} />
          <AttentionCard key={`attention-${task.id}`} task={task} detail={detail} />
          <Tabs key={`tabs-${task.id}`} defaultValue={planFirst ? "plan" : "conversation"}>
            <TabsList>
              <TabsTrigger value="conversation">Conversation</TabsTrigger>
              <TabsTrigger value="plan">Plan</TabsTrigger>
              <TabsTrigger value="steps">
                Steps
                <span className="text-xs text-muted-foreground tabular-nums">
                  {detail.steps.filter((step) => step.state === "done").length}/{detail.steps.length}
                </span>
              </TabsTrigger>
            </TabsList>
            <TabsContent value="conversation" className="pt-3">
              <Transcript detail={detail} />
            </TabsContent>
            <TabsContent value="plan" className="pt-3">
              <MarkdownEditor initial={detail.plan} label={`plans/${task.branch}.md`} />
            </TabsContent>
            <TabsContent value="steps" className="pt-3">
              <StepLog detail={detail} />
            </TabsContent>
          </Tabs>
        </div>
      </div>
      {task.status !== "done" && (
        <div className="shrink-0 px-6 pb-4">
          <div className="mx-auto max-w-3xl">
            <Composer task={task} />
          </div>
        </div>
      )}
    </div>
  )
}
