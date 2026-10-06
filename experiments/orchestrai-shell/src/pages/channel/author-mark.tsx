import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { findAgent, type AgentId } from "@/data/agents"
import { findPerson, type Author } from "@/data/channel"
import { cn } from "@/lib/utils"

const AGENT_INITIALS: Record<AgentId, string> = { claude: "CC", codex: "CX", gemini: "GE", goose: "GO", opencode: "OC" }

/** People are round; agents are square, so who is a person reads at a glance without colour. */
export function AuthorMark({ author, className }: { author: Author; className?: string }) {
  if (author.kind === "agent") {
    return (
      <span
        aria-hidden
        title={findAgent(author.id).name}
        className={cn("grid size-7 shrink-0 place-items-center rounded-sm border text-xs font-medium text-muted-foreground", className)}
      >
        {AGENT_INITIALS[author.id]}
      </span>
    )
  }
  return (
    <Avatar size="sm" className={cn("size-7", className)}>
      <AvatarFallback className="text-xs">{findPerson(author.id).initials}</AvatarFallback>
    </Avatar>
  )
}
