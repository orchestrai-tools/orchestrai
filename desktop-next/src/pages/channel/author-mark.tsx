import { Avatar, AvatarFallback } from "@warpforge/ui/components/avatar";
import { cn } from "@warpforge/ui/lib/utils";

export interface ChannelMessage {
  id: string;
  author: string;
  role: string;
  body: string;
  at?: number;
}

export function isAgentRole(role: string): boolean {
  return role === "agent";
}

function initials(name: string): string {
  const words = name.split(/[\s_-]+/).filter(Boolean);
  const letters = words.length > 1 ? words[0][0] + words[1][0] : name.slice(0, 2);
  return letters.toUpperCase();
}

/** People are round; agents are square, so who is a person reads at a glance without colour. */
export function AuthorMark({
  name,
  agent,
  className,
}: {
  name: string;
  agent: boolean;
  className?: string;
}) {
  if (agent) {
    return (
      <span
        aria-hidden
        title={name}
        className={cn(
          "grid size-7 shrink-0 place-items-center rounded-sm border text-xs font-medium text-muted-foreground",
          className,
        )}
      >
        {initials(name)}
      </span>
    );
  }
  return (
    <Avatar size="sm" className={cn("size-7", className)}>
      <AvatarFallback className="text-xs">{initials(name)}</AvatarFallback>
    </Avatar>
  );
}
