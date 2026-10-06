import { useState } from "react"

import { Button } from "@/components/ui/button"
import { AGENTS, type AgentId } from "@/data/agents"
import { AGENT_PROFILES, MODES, PROFILES, type Mode, type PermissionProfile } from "@/data/settings"
import { useAppActions } from "@/lib/app-instance"
import type { Project } from "@/lib/projects"
import { cn } from "@/lib/utils"
import { Choice, ConfirmDialog, Group, Row, SectionHeader, SelectMenu } from "@/pages/settings/primitives"
import { ProfileEditor } from "@/pages/settings/profile-editor"
import { useProjectSetting } from "@/pages/settings/settings-store"

const NO_EDITS: Record<string, Partial<PermissionProfile>> = {}
const NO_EXTRA: PermissionProfile[] = []
const NO_REMOVED: string[] = []

export function AgentsSection({ project }: { project: Project }) {
  const { setPage } = useAppActions()
  const [mode, setMode] = useProjectSetting<Mode>(project.id, "agents.mode", "approve")
  const [defaultId, setDefaultId] = useProjectSetting(project.id, "agents.defaultProfile", "ask-writes")
  const [assigned, setAssigned] = useProjectSetting<Record<AgentId, string>>(project.id, "agents.assigned", AGENT_PROFILES)
  const [advisor, setAdvisor] = useProjectSetting(project.id, "agents.advisor", "none")
  const [extra, setExtra] = useProjectSetting(project.id, "agents.extraProfiles", NO_EXTRA)
  const [edits, setEdits] = useProjectSetting(project.id, "agents.edits", NO_EDITS)
  const [removed, setRemoved] = useProjectSetting(project.id, "agents.removed", NO_REMOVED)
  const [selectedId, setSelectedId] = useState(defaultId)
  const [deleting, setDeleting] = useState(false)

  const profiles = [...PROFILES, ...extra].filter((profile) => !removed.includes(profile.id)).map((profile) => ({ ...profile, ...edits[profile.id] }))
  const selected = profiles.find((profile) => profile.id === selectedId) ?? profiles[0]
  const profileOptions = profiles.map((profile) => ({ value: profile.id, label: profile.name }))
  const ready = AGENTS.filter((agent) => agent.status !== "missing")

  const duplicate = (profile: PermissionProfile) => {
    const copy = { ...profile, id: `${profile.id}-copy-${extra.length + 1}`, name: `${profile.name} (copy)`, builtIn: false, neverDefault: false }
    setExtra([...extra, copy])
    setSelectedId(copy.id)
  }

  return (
    <>
      <SectionHeader title="Agents & permissions" scope="Defaults for tasks in this project. A task can change its mode or profile at any time; the next tool call uses it.">
        <Button variant="outline" size="sm" className="text-xs" onClick={() => setPage("agents")}>
          Open Agents
        </Button>
      </SectionHeader>

      <Group title="Mode for new tasks">
        <Row
          title={MODES.find((entry) => entry.id === mode)?.label}
          description={MODES.find((entry) => entry.id === mode)?.description}
          control={<Choice label="Mode for new tasks" value={mode} onChange={setMode} options={MODES.map((entry) => ({ value: entry.id, label: entry.label }))} />}
        />
      </Group>

      <Group title="Permission profiles" note="A profile decides each kind of tool call. Pick one to see or change it below.">
        {profiles.map((profile) => {
          const isDefault = profile.id === defaultId
          return (
            <div key={profile.id} className={cn("-mx-2 flex items-center gap-3 rounded-md px-2", profile.id === selected.id && "bg-muted")}>
              <button type="button" onClick={() => setSelectedId(profile.id)} aria-pressed={profile.id === selected.id} className="min-w-0 flex-1 py-(--row-py) text-left">
                <span className="flex items-baseline gap-2">
                  <span className="text-sm font-medium">{profile.name}</span>
                  <span className="text-xs text-muted-foreground">{profile.builtIn ? "built-in" : "custom"}</span>
                </span>
                <span className="block text-xs text-muted-foreground">{profile.description}</span>
              </button>
              {isDefault ? (
                <span className="text-xs font-medium">Default</span>
              ) : (
                <Button
                  variant="ghost"
                  size="xs"
                  className="text-xs"
                  disabled={profile.neverDefault}
                  title={profile.neverDefault ? "Always allow is never a default. Assign it to a task on purpose." : undefined}
                  onClick={() => setDefaultId(profile.id)}
                >
                  Make default
                </Button>
              )}
            </div>
          )
        })}
      </Group>

      <ProfileEditor profile={selected} onChange={(patch) => setEdits({ ...edits, [selected.id]: { ...edits[selected.id], ...patch } })} />
      <div className="flex gap-2 pb-8">
        <Button variant="outline" size="sm" className="text-xs" onClick={() => duplicate(selected)}>
          Duplicate {selected.name}
        </Button>
        {!selected.builtIn && (
          <Button variant="ghost" size="sm" className="text-xs text-red-600 dark:text-red-400" onClick={() => setDeleting(true)} disabled={selected.id === defaultId}>
            Delete profile…
          </Button>
        )}
      </div>

      <Group title="Profile per agent" note="Overrides each agent's own default from the Agents page, in this project only.">
        {ready.map((agent) => (
          <Row
            key={agent.id}
            title={agent.name}
            description={agent.status === "sign-in" ? "Not signed in, so it cannot start yet." : `${agent.model} over ${agent.command}`}
            control={
              <SelectMenu
                label={`Profile for ${agent.name}`}
                value={assigned[agent.id] ?? defaultId}
                onChange={(id) => setAssigned({ ...assigned, [agent.id]: id })}
                options={profileOptions}
              />
            }
          />
        ))}
      </Group>

      <Group title="Second opinion">
        <Row
          title="Advisor"
          description="An agent the working agent can consult with ask_advisor. It only gets read-only tools."
          control={
            <SelectMenu
              label="Advisor"
              value={advisor}
              onChange={setAdvisor}
              options={[{ value: "none", label: "None" }, ...ready.map((agent) => ({ value: agent.id, label: agent.name }))]}
            />
          }
        />
      </Group>

      <ConfirmDialog
        open={deleting}
        onOpenChange={setDeleting}
        title={`Delete ${selected.name}?`}
        description="Tasks and agents using it fall back to this project's default profile on their next tool call."
        confirmLabel="Delete profile"
        onConfirm={() => {
          setRemoved([...removed, selected.id])
          setAssigned(Object.fromEntries(Object.entries(assigned).map(([agent, id]) => [agent, id === selected.id ? defaultId : id])) as Record<AgentId, string>)
          setSelectedId(defaultId)
        }}
      />
    </>
  )
}
