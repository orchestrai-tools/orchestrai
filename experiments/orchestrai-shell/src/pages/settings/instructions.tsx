import { useState } from "react"

import { instructionsFor, SKILLS, type SkillScope } from "@/data/settings"
import type { Project } from "@/lib/projects"
import { cn } from "@/lib/utils"
import { Choice, Group, Row, SectionHeader, SwitchRow } from "@/pages/settings/primitives"
import { useProjectSetting } from "@/pages/settings/settings-store"

const DEFAULT_ENABLED: Record<string, boolean> = Object.fromEntries(SKILLS.map((skill) => [skill.name, skill.enabled]))

const SCOPES: readonly { value: "all" | SkillScope; label: string }[] = [
  { value: "all", label: "All" },
  { value: "project", label: "This project" },
  { value: "home", label: "Home" },
  { value: "bundled", label: "Bundled" },
]

export function InstructionsSection({ project }: { project: Project }) {
  const [folder, setFolder] = useState<"root" | "desktop">("root")
  const [scope, setScope] = useState<"all" | SkillScope>("all")
  const [enabled, setEnabled] = useProjectSetting(project.id, "skills.enabled", DEFAULT_ENABLED)
  const all = instructionsFor(project.id, project.path)
  const files = all.filter((file) => folder === "desktop" || file.scope !== "Folder")
  const hasFolders = all.some((file) => file.scope === "Folder")
  const skills = SKILLS.filter((skill) => scope === "all" || skill.scope === scope)
  const on = SKILLS.filter((skill) => enabled[skill.name]).length

  return (
    <>
      <SectionHeader
        title="Instructions & skills"
        scope="Read from the files themselves, never copied. Turning a skill off applies to this project on this Mac."
      />

      <Group
        title="Instruction files"
        note="WARP.md wins over AGENTS.md in the same folder, folders above the project apply too, and ~/.agents/AGENTS.md is the global file. A task's Context panel lists exactly what it received."
      >
        {hasFolders && (
          <Row
            title="Preview for a task working in"
            description="Folder rules join when a task works below that folder."
            control={
              <Choice
                label="Working folder"
                value={folder}
                onChange={setFolder}
                options={[
                  { value: "root", label: "Project root" },
                  { value: "desktop", label: "desktop/" },
                ]}
              />
            }
          />
        )}
        {files.map((file) => (
          <Row
            key={file.path}
            title={<span className={cn("font-mono text-xs", !file.used && "text-muted-foreground line-through")}>{file.path}</span>}
            description={file.note}
            control={
              <span className="text-xs text-muted-foreground tabular-nums">
                {file.scope} · {file.size}
              </span>
            }
          />
        ))}
      </Group>

      <Group
        title={`Skills · ${on} of ${SKILLS.length} on`}
        note="One catalog across Claude, Codex, Cursor, Gemini, and OrchestrAI's own: from your home folder, this project, and the ones that ship with the app."
      >
        <Row title="Show" control={<Choice label="Skill scope" value={scope} onChange={setScope} options={SCOPES} />} />
        {skills.map((skill) => (
          <SwitchRow
            key={skill.name}
            title={
              <span className="flex items-baseline gap-2">
                {skill.name}
                <span className="text-xs font-normal text-muted-foreground">
                  {skill.source} · {skill.scope}
                </span>
              </span>
            }
            description={
              <>
                {skill.description} <span className="font-mono">{skill.path}</span>
              </>
            }
            checked={enabled[skill.name] ?? skill.enabled}
            onChange={(next) => setEnabled({ ...enabled, [skill.name]: next })}
          />
        ))}
      </Group>
    </>
  )
}
