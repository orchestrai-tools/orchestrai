import { Button } from "@warpforge/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@warpforge/ui/components/dropdown-menu";
import { MessageFooter } from "@warpforge/ui/components/message";
import { CheckIcon, CopyIcon, SplitIcon } from "lucide-react";
import { useEffect, useId, useState } from "react";
import { toast } from "sonner";
import { showContextMenu, useContextMenu } from "../../lib/context-menu";

/** Copy a message, or continue the conversation up to it with another agent. Right-click copies too. */
export function MessageActions({
  text,
  agents,
  onContinue,
}: {
  text: string;
  agents: { id: string; displayName: string }[];
  onContinue: (agentId: string) => void;
}) {
  const requestId = `message:${useId()}`;
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 1600);
    return () => window.clearTimeout(timer);
  }, [copied]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch {
      toast.error("Could not copy this message");
    }
  }

  useContextMenu(requestId, new Map([["copy", () => void copy()]]));

  return (
    <MessageFooter
      className="gap-0.5 px-0 opacity-0 transition-opacity group-hover/message:opacity-100 focus-within:opacity-100 has-aria-expanded:opacity-100"
      onContextMenu={(event) => {
        event.preventDefault();
        void showContextMenu(requestId, [{ type: "item", id: "copy", label: "Copy message" }]).then(
          (opened) => {
            if (!opened) void copy();
          },
        );
      }}
    >
      <Button
        variant="ghost"
        size="icon-xs"
        aria-label={copied ? "Copied" : "Copy message"}
        onClick={() => void copy()}
      >
        {copied ? <CheckIcon /> : <CopyIcon />}
      </Button>
      {agents.length > 0 && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label="Continue from here with another agent"
            >
              <SplitIcon />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-56">
            <DropdownMenuLabel className="text-xs text-muted-foreground">
              Continue from here with
            </DropdownMenuLabel>
            {agents.map((agent) => (
              <DropdownMenuItem key={agent.id} onSelect={() => onContinue(agent.id)}>
                {agent.displayName}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </MessageFooter>
  );
}
