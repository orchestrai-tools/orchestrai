import { useState } from "react"
import { TriangleAlertIcon, XIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { RANGE_SOURCE_HINT, RANGE_SOURCE_LABEL } from "@/data/services"
import { useAppActions } from "@/lib/app-instance"
import type { Project } from "@/lib/projects"
import { RangeForm } from "@/pages/services/port-range"
import { useRuntime, useRuntimeStore } from "@/pages/services/runtime-store"
import { Notice, RuntimeDot } from "@/pages/services/status"
import { workspaceYaml } from "@/pages/services/yaml"
import { Advanced, CodeBlock, Group, Row, SectionHeader, SwitchRow } from "@/pages/settings/primitives"
import { useProjectSetting } from "@/pages/settings/settings-store"

/** `worktree.copy` rules from the daemon: relative, inside the project, never empty. */
function globError(pattern: string): string | null {
  if (!pattern.trim()) return "worktree.copy contains an empty pattern"
  if (/^[/\\]/.test(pattern) || pattern.includes(":")) return `worktree.copy pattern \`${pattern}\` must be relative to the project`
  if (pattern.split(/[/\\]/).includes("..")) return `worktree.copy pattern \`${pattern}\` must not contain \`..\``
  return null
}

function GlobList({ value, onChange }: { value: string[]; onChange: (value: string[]) => void }) {
  const [draft, setDraft] = useState("")
  const [error, setError] = useState<string | null>(null)
  const add = () => {
    const problem = globError(draft)
    if (problem) return setError(problem)
    onChange([...value, draft.trim()])
    setDraft("")
  }
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-1">
        {value.map((pattern) => (
          <span key={pattern} className="inline-flex h-6 items-center gap-1 rounded-sm border pl-2 font-mono text-xs">
            {pattern}
            <Button variant="ghost" size="icon-xs" className="size-5" aria-label={`Remove ${pattern}`} onClick={() => onChange(value.filter((entry) => entry !== pattern))}>
              <XIcon />
            </Button>
          </span>
        ))}
        {value.length === 0 && <span className="text-xs text-muted-foreground">Nothing is copied.</span>}
      </div>
      <form
        className="flex items-center gap-2"
        onSubmit={(event) => {
          event.preventDefault()
          add()
        }}
      >
        <Input
          value={draft}
          onChange={(event) => {
            setDraft(event.target.value)
            setError(null)
          }}
          placeholder=".env*"
          aria-label="Add a pattern to copy"
          aria-invalid={error !== null}
          className="h-7 w-48 font-mono text-xs md:text-xs"
        />
        <Button type="submit" variant="outline" size="sm" className="text-xs" disabled={!draft.trim()}>
          Add
        </Button>
      </form>
      {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
    </div>
  )
}

export function WorkspaceSection({ project }: { project: Project }) {
  const runtime = useRuntime(project.id)
  const { setPage } = useAppActions()
  const store = useRuntimeStore.getState()
  const [newTask, setNewTask] = useProjectSetting(project.id, "worktree.newTask", false)
  const [continued, setContinued] = useProjectSetting(project.id, "worktree.continue", true)
  const [copy, setCopy] = useProjectSetting(project.id, "worktree.copy", runtime.worktree?.copy ?? [])
  const [setup, setSetup] = useProjectSetting(project.id, "worktree.setup", runtime.worktree?.setup ?? "")
  const { start, end, source, conflictWith } = runtime.range
  const pinned = runtime.services.filter((svc) => svc.pinned).length

  return (
    <>
      <SectionHeader
        title="Workspace"
        scope={
          <>
            Saved in <span className="font-mono">{runtime.configFile}</span>, committed with the code, so the whole team shares it.
          </>
        }
      >
        <Button variant="outline" size="sm" className="text-xs" onClick={() => setPage("services")}>
          Open Services
        </Button>
      </SectionHeader>

      <Group title="Services">
        {runtime.services.map((svc) => (
          <Row
            key={svc.name}
            title={
              <span className="flex items-center gap-2">
                <RuntimeDot status={svc.status} />
                {svc.name}
              </span>
            }
            description={<span className="font-mono">{svc.command}</span>}
            control={<span className="font-mono text-xs text-muted-foreground">{svc.port ? `:${svc.port}` : "no port"}</span>}
          />
        ))}
        <SwitchRow
          title="Start when the project opens"
          description="Starts every service in dependency order as soon as you open the project."
          checked={runtime.autoStart}
          onChange={(on) => store.setAutoStart(project.id, on)}
        />
      </Group>

      <Group title="Ports">
        <Row title={`Range ${start}–${end}`} description={`${RANGE_SOURCE_LABEL[source]}. ${RANGE_SOURCE_HINT[source]}`}>
          {conflictWith && (
            <div className="pb-2">
              <Notice tone="danger">
                <TriangleAlertIcon className="mt-px size-3.5 shrink-0" />
                <span>Conflicts with {conflictWith}, which declares the same block. Services here will not start until this machine uses another range.</span>
              </Notice>
            </div>
          )}
          <div className="flex flex-wrap items-start gap-2">
            <RangeForm project={project.id} />
            {source === "local-override" && (
              <Button variant="ghost" size="sm" className="text-xs" onClick={() => store.setLocalRange(project.id, null)}>
                Clear override
              </Button>
            )}
          </div>
        </Row>
        <Row
          title="Pinned ports"
          description="In a team range, a declared port is exact: if it is taken the service fails rather than moving. portFallback: auto lets one shift."
          control={<span className="text-xs text-muted-foreground tabular-nums">{pinned} pinned</span>}
        />
        <Row
          title="Port references"
          description={
            <>
              Any command, env value, or healthcheck can use <code className="font-mono">{"${name.port}"}</code>; <code className="font-mono">$PORT</code> is always the
              service's own.
            </>
          }
        />
      </Group>

      <Group title="Task worktrees" note="Worktrees live in .warpforge/worktrees/<task>, so they never collide with your own checkouts.">
        <SwitchRow
          title="New tasks get their own worktree"
          description="Off by default: most tasks run in the checkout you are already in."
          checked={newTask}
          onChange={setNewTask}
        />
        <SwitchRow
          title="Continuing in a new task gets a worktree"
          description="On by default, because a fork usually explores an alternative."
          checked={continued}
          onChange={setContinued}
        />
        <Row title="Copy into each new worktree" description="Untracked files a task needs, such as .env, as globs relative to the project.">
          <GlobList value={copy} onChange={setCopy} />
        </Row>
        <Row
          title="Setup command"
          description="Runs in the new worktree once the files are copied."
          control={<Input value={setup} onChange={(event) => setSetup(event.target.value)} placeholder="bun install" aria-label="Setup command" className="h-7 w-64 font-mono text-xs md:text-xs" />}
        />
      </Group>

      <Advanced label="Agent templates, local overrides, and the raw file">
        <Group title="Agent templates" note="Shortcuts for starting an agent with a fixed command, offered when you open a terminal agent.">
          {runtime.agentTemplates?.length ? (
            runtime.agentTemplates.map((template) => (
              <Row key={template.name} title={template.name} description={template.description} control={<code className="font-mono text-xs">{template.command}</code>} />
            ))
          ) : (
            <p className="py-[calc(var(--row-py)+0.25rem)] text-xs text-muted-foreground">None. Add agentTemplates: to the workspace file.</p>
          )}
        </Group>
        <Group
          title="Local overrides"
          note="Deep-merged over the shared file. A service or port-forward it changes is marked local; null removes a key; remove: true drops a port-forward."
        >
          {runtime.localError && (
            <div className="py-2">
              <Notice tone="warn">
                <TriangleAlertIcon className="mt-px size-3.5 shrink-0" />
                <span>Ignored because it does not parse: {runtime.localError}</span>
              </Notice>
            </div>
          )}
          {runtime.localYaml ? (
            <div className="py-2">
              <p className="pb-1 font-mono text-xs text-muted-foreground">{runtime.localFile}</p>
              <CodeBlock>{runtime.localYaml}</CodeBlock>
            </div>
          ) : (
            <p className="py-[calc(var(--row-py)+0.25rem)] text-xs text-muted-foreground">No local file. Create .warpforge/workspace.local.yaml to change things for this Mac only.</p>
          )}
        </Group>
        <Group title="The shared file" note="Without any file, OrchestrAI picks up a package.json dev script or the services in docker-compose.yaml.">
          <div className="py-2">
            <CodeBlock>{workspaceYaml(project.id, project.name, runtime)}</CodeBlock>
          </div>
        </Group>
      </Advanced>
    </>
  )
}
