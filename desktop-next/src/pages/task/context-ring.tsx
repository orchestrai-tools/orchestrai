import { Button } from "@warpforge/ui/components/button";
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@warpforge/ui/components/popover";
import { cn } from "@warpforge/ui/lib/utils";
import { compactTokenCount, contextPercent, type ContextUsage } from "../../lib/context-usage";

const RADIUS = 6;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

/** How full the agent's context window is, as a ring that opens into the numbers. */
export function ContextRing({ usage }: { usage?: ContextUsage }) {
  if (!usage) return null;
  const used = Math.max(0, usage.used);
  const size = Math.max(1, usage.size);
  const remaining = Math.max(0, size - used);
  const percentage = contextPercent(used, size);
  const detail = `${compactTokenCount(used)} used · ${compactTokenCount(remaining)} remaining · ${compactTokenCount(size)} total`;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon-xs" aria-label={`Context window: ${detail}`}>
          <svg
            viewBox="0 0 16 16"
            aria-hidden
            className={cn(
              "size-3.5 -rotate-90 text-muted-foreground",
              percentage >= 75 && "text-amber-500",
              percentage >= 90 && "text-red-500",
            )}
          >
            <circle
              cx="8"
              cy="8"
              r={RADIUS}
              fill="none"
              strokeWidth="2.5"
              className="stroke-foreground/15"
            />
            <circle
              cx="8"
              cy="8"
              r={RADIUS}
              fill="none"
              strokeWidth="2.5"
              stroke="currentColor"
              strokeDasharray={CIRCUMFERENCE}
              strokeDashoffset={CIRCUMFERENCE * (1 - percentage / 100)}
            />
          </svg>
        </Button>
      </PopoverTrigger>
      <PopoverContent side="top" align="end" className="w-64">
        <PopoverHeader>
          <PopoverTitle>Context window</PopoverTitle>
          <PopoverDescription>
            The agent can compact its context automatically when needed.
          </PopoverDescription>
        </PopoverHeader>
        <p className="text-sm tabular-nums">
          {percentage}% · {compactTokenCount(used)} of {compactTokenCount(size)}
        </p>
        {usage.cost && (
          <p className="text-xs text-muted-foreground tabular-nums">
            Session cost ·{" "}
            {usage.cost.amount.toLocaleString("en-US", {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}{" "}
            {usage.cost.currency}
          </p>
        )}
      </PopoverContent>
    </Popover>
  );
}
