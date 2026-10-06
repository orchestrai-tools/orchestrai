import { AGENTS } from "@/data/agents"
import { Group, Row, SectionHeader, SelectMenu, SwitchRow } from "@/pages/settings/primitives"
import { useAppSetting } from "@/pages/settings/settings-store"

const KEEP = [
  { value: "15", label: "15 days" },
  { value: "30", label: "30 days" },
  { value: "60", label: "60 days" },
  { value: "0", label: "Forever" },
]
const SETTLE = [
  { value: "7", label: "7 days" },
  { value: "14", label: "14 days" },
  { value: "30", label: "30 days" },
  { value: "0", label: "Off" },
]
const REMOVE = [
  { value: "60", label: "60 days" },
  { value: "90", label: "90 days" },
  { value: "180", label: "180 days" },
  { value: "0", label: "Forever" },
]

/** The three windows as one sentence, so the chain they form reads without holding three rows in mind. */
function lifecycle(settle: number, keep: number, remove: number) {
  const parts = [
    settle ? `settles after ${settle} days` : "never settles by itself",
    keep ? `loses its chat after ${keep} days` : "keeps its chat forever",
    remove ? `is deleted after ${remove} days` : "is never deleted",
  ]
  return `Left alone, a finished task ${parts[0]}, ${parts[1]}, and ${parts[2]}.`
}

export function HistorySection() {
  const ready = AGENTS.filter((agent) => agent.status === "ready")
  const agentOptions = [{ value: "none", label: "None" }, ...ready.map((agent) => ({ value: agent.id, label: agent.name }))]
  const [autoName, setAutoName] = useAppSetting("text.autoName", true)
  const [gitAgent, setGitAgent] = useAppSetting("text.gitAgent", "claude")
  const [gitModel, setGitModel] = useAppSetting("text.gitModel", "default")
  const [prAgent, setPrAgent] = useAppSetting("text.prAgent", "codex")
  const [keep, setKeep] = useAppSetting("history.keep", "30")
  const [settle, setSettle] = useAppSetting("history.settle", "14")
  const [remove, setRemove] = useAppSetting("history.remove", "90")
  const model = AGENTS.find((agent) => agent.id === gitAgent)?.model

  return (
    <>
      <SectionHeader title="Tasks & history" scope="For every project. Saved in ~/.warpforge/config.yaml; pruning runs at start, once a day, and right after a change." />

      <Group title="Text the agents write for you">
        <SwitchRow title="Name new tasks" description="Gives a new task a short title, once, right after it is created." checked={autoName} onChange={setAutoName} />
        <Row
          title="Commit messages and PR descriptions"
          description="Drafted from the diff when you ask. Never automatically."
          control={<SelectMenu label="Agent for git text" value={gitAgent} onChange={setGitAgent} options={agentOptions} />}
        />
        {gitAgent !== "none" && (
          <Row
            title="Model"
            description="Which of that agent's models writes it."
            control={
              <SelectMenu
                label="Model for git text"
                value={gitModel}
                onChange={setGitModel}
                options={[
                  { value: "default", label: "Agent default" },
                  { value: model ?? "model", label: model ?? "model" },
                ]}
              />
            }
          />
        )}
        <Row
          title="Pull request assistant"
          description="Answers questions about a pull request and drafts replies to review comments."
          control={<SelectMenu label="Pull request assistant" value={prAgent} onChange={setPrAgent} options={agentOptions} />}
        />
      </Group>

      <Group title="Task history" note={lifecycle(Number(settle), Number(keep), Number(remove))}>
        <Row
          title="Keep transcripts for"
          description="Afterwards a closed task still shows its title, prompt, and diff; only the chat is gone."
          control={<SelectMenu label="Keep transcripts for" value={keep} onChange={setKeep} options={KEEP} />}
        />
        <Row
          title="Settle untouched tasks after"
          description="Closes a finished turn nobody looked at. A task with changes never settles by itself."
          control={<SelectMenu label="Settle after" value={settle} onChange={setSettle} options={SETTLE} />}
        />
        <Row
          title="Delete closed tasks after"
          description="Removes the task, its chat, and its worktree. Commits stay in git; a task with unmerged work is kept."
          control={<SelectMenu label="Delete closed tasks after" value={remove} onChange={setRemove} options={REMOVE} />}
        />
      </Group>
    </>
  )
}
