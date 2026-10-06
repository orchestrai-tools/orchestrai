import { cn } from "@warpforge/ui/lib/utils";
import { XIcon } from "lucide-react";

/** Open files, one tab each. The palette finds the active tab by `data-active` and closes it by its label. */
export function FileTabsBar({
  tabs,
  active,
  dirty,
  onSelect,
  onClose,
}: {
  tabs: string[];
  active: string | null;
  dirty: boolean;
  onSelect: (path: string) => void;
  onClose: (path: string) => void;
}) {
  if (tabs.length === 0) return null;
  return (
    <div role="tablist" aria-label="Open files" className="flex shrink-0 items-stretch overflow-x-auto border-b">
      {tabs.map((tab) => {
        const on = tab === active;
        return (
          <div
            key={tab}
            data-file-tab
            data-active={on ? "true" : "false"}
            className={cn(
              "group/tab flex shrink-0 items-center gap-1 border-r pr-1 pl-3 text-xs",
              on ? "bg-background text-foreground" : "bg-muted/30 text-muted-foreground hover:text-foreground",
            )}
          >
            <button
              type="button"
              role="tab"
              aria-selected={on}
              title={tab}
              onClick={() => onSelect(tab)}
              className="flex items-center gap-1.5 py-1.5"
            >
              {tab.split("/").pop()}
              {on && dirty && <span className="size-1.5 rounded-full bg-amber-500" aria-label="Unsaved" />}
            </button>
            <button
              type="button"
              aria-label={`Close ${tab}`}
              onClick={() => onClose(tab)}
              className={cn(
                "rounded-sm p-0.5 hover:bg-muted",
                on ? "opacity-100" : "opacity-0 group-hover/tab:opacity-100 focus-visible:opacity-100",
              )}
            >
              <XIcon className="size-3" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
