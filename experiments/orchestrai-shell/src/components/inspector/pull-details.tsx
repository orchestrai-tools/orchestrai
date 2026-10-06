import type { ReactNode } from "react"

import { findAgent } from "@/data/agents"
import { useAppId } from "@/lib/app-instance"
import type { ProjectId } from "@/lib/projects"
import { useGithubStore, usePulls } from "@/pages/github/github-store"

const REVIEW_LABEL = {
  approved: "Approved",
  "changes-requested": "Changes requested",
  "review-required": "Review required",
  none: "No review yet",
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[6.5rem_1fr] gap-2 py-(--row-py) text-xs">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 truncate">{children}</dd>
    </div>
  )
}

/** The pull request selected on the GitHub page, or a hint to pick one. */
export function PullDetails({ project }: { project: ProjectId }) {
  const app = useAppId()
  const selected = useGithubStore((store) => store.selectedPull[`${app}:${project}`])
  const pull = usePulls(project).find((entry) => entry.number === selected)

  if (!pull) return <p className="p-4 text-xs text-muted-foreground">Pick a pull request to see where it stands.</p>
  return (
    <dl className="px-4 py-2">
      <Row label="Pull request">#{pull.number} · {pull.title}</Row>
      <Row label="State">{pull.state}</Row>
      <Row label="Author">{pull.agent ? `${findAgent(pull.agent).name} for ${pull.author}` : pull.author}</Row>
      <Row label="Checks">{pull.checks}</Row>
      <Row label="Review">{REVIEW_LABEL[pull.review]}</Row>
      <Row label="Branch"><span className="font-mono">{pull.branch} → {pull.base}</span></Row>
      <Row label="Size">{pull.files} files · +{pull.additions} −{pull.deletions}</Row>
      <Row label="Comments">{pull.comments}{pull.unresolved ? ` · ${pull.unresolved} unresolved` : ""}</Row>
      {pull.task && <Row label="Task">{pull.task}</Row>}
      <Row label="Updated">{pull.updated}</Row>
    </dl>
  )
}
