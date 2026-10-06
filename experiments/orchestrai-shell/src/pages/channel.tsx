import { useState } from "react"

import { PageToolbar } from "@/components/common/page-toolbar"
import { Button } from "@/components/ui/button"
import { useAppSession } from "@/lib/app-instance"
import { findProject, type ProjectId } from "@/lib/projects"
import { useChannelStore } from "@/pages/channel/channel-store"
import { Composer } from "@/pages/channel/composer"
import { MembersPanel } from "@/pages/channel/members"
import { Thread } from "@/pages/channel/thread"

const NOBODY_TYPING: never[] = []

function ChannelRoom({ project }: { project: ProjectId }) {
  const channel = useChannelStore((state) => state.channels[project])
  const typing = useChannelStore((state) => state.typing[project]) ?? NOBODY_TYPING
  const send = useChannelStore((state) => state.send)
  const [draft, setDraft] = useState("")
  const [showMembers, setShowMembers] = useState(true)
  const name = `#${findProject(project).name}`
  const { people, agents } = channel.members

  const mention = (handle: string) =>
    setDraft((current) => `${current}${current && !current.endsWith(" ") ? " " : ""}@${handle} `)

  return (
    <div className="flex h-full min-h-0">
      <div className="flex min-w-0 flex-1 flex-col gap-3 p-4">
        <PageToolbar title={name} meta={`${people.length} people · ${agents.length} agents`}>
          <Button
            variant="ghost"
            size="sm"
            aria-pressed={showMembers}
            onClick={() => setShowMembers((open) => !open)}
            className="text-xs"
          >
            {showMembers ? "Hide members" : `Members · ${people.length + agents.length}`}
          </Button>
        </PageToolbar>
        <Thread topic={channel.topic} messages={channel.messages} typing={typing} />
        <Composer
          project={project}
          channelName={name}
          value={draft}
          onChange={setDraft}
          onSend={(text) => {
            send(project, text)
            setDraft("")
          }}
        />
      </div>
      {showMembers && <MembersPanel project={project} onMention={mention} />}
    </div>
  )
}

/**
 * Buzz's channel: one room per project where people and agents are members
 * and read the same thread. An @mention steers one agent, or a whole team.
 */
export function ChannelPage() {
  const project = useAppSession((session) => session.project)
  return <ChannelRoom key={project} project={project} />
}
