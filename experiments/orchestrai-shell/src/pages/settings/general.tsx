import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import type { Project } from "@/lib/projects"
import { useRuntime } from "@/pages/services/runtime-store"
import { Group, Row, SectionHeader, SelectMenu } from "@/pages/settings/primitives"
import { useProjectSetting } from "@/pages/settings/settings-store"
import { useFlash } from "@/pages/settings/use-flash"

const BRANCHES: Record<string, string[]> = {
  main: ["main", "release/0.21", "upstream/main"],
  develop: ["develop", "main", "release/2026-10"],
}

export function GeneralSection({ project }: { project: Project }) {
  const runtime = useRuntime(project.id)
  const [name, setName] = useProjectSetting(project.id, "general.name", project.name)
  const [branch, setBranch] = useProjectSetting(project.id, "general.branch", project.branch)
  const [flash, show] = useFlash()
  const legacy = runtime.configFile !== ".warpforge/workspace.yaml"
  const branches = BRANCHES[project.branch] ?? [project.branch]

  return (
    <>
      <SectionHeader title="General" scope="Kept in OrchestrAI's project list on this Mac (~/.warpforge/projects.json)." />

      <Group>
        <Row
          title="Name"
          description="How the project is shown in tabs, the palette, and agent prompts."
          control={<Input value={name} onChange={(event) => setName(event.target.value)} aria-label="Project name" className="h-7 w-56 text-xs md:text-xs" />}
        />
        <Row
          title="Folder"
          description="The repository on disk. Services and the main checkout run here."
          control={
            <>
              <code className="font-mono text-xs">{project.path}</code>
              <Button
                variant="ghost"
                size="xs"
                className="text-xs"
                onClick={() => {
                  void navigator.clipboard?.writeText(project.path)
                  show("Copied")
                }}
              >
                {flash ?? "Copy"}
              </Button>
            </>
          }
        />
        <Row title="Repository" description="Where pull requests, checks, and issues come from." control={<code className="font-mono text-xs">{project.repo}</code>} />
        <Row
          title="Default branch"
          description="New tasks branch from it, and their pull requests target it."
          control={<SelectMenu label="Default branch" value={branch} onChange={setBranch} options={branches.map((entry) => ({ value: entry, label: entry }))} />}
        />
      </Group>

      <Group title="Configuration files">
        <Row
          title="Shared config"
          description={legacy ? "An older file name that still loads. New projects use .warpforge/workspace.yaml." : "Committed with the code, so everyone on the team runs the same services."}
          control={
            <>
              <code className="font-mono text-xs">{runtime.configFile}</code>
              {legacy && (
                <Button variant="outline" size="sm" className="text-xs">
                  Move to .warpforge/
                </Button>
              )}
            </>
          }
        />
        <Row
          title="Personal overrides"
          description="Merged over the shared file on this Mac only, and kept out of git automatically."
          control={<code className="font-mono text-xs">{runtime.localFile ?? ".warpforge/workspace.local.yaml (none yet)"}</code>}
        />
        <Row
          title="Workflow templates"
          description="Reusable pipelines. A file here replaces the built-in template with the same name."
          control={<code className="font-mono text-xs">.warpforge/workflows/</code>}
        />
      </Group>

      <Group title="Version control">
        <Row title="Git" description="Branches, task worktrees, checkpoints, and commits." control={<span className="text-xs text-muted-foreground">git 2.51.0</span>} />
        <Row
          title="Jujutsu"
          description="Being looked into as an option beside Git. Not a working driver yet."
          control={<Switch disabled checked={false} aria-label="Use Jujutsu" />}
        />
      </Group>
    </>
  )
}
