import { cn } from "@warpforge/ui/lib/utils";
import { CheckIcon } from "lucide-react";

import { APP_ICONS } from "../../lib/app-icon";

/** Every app icon at Dock size, picked like a theme. */
export function AppIconPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (id: string) => void;
}) {
  return (
    <div role="radiogroup" aria-label="App icon" className="flex flex-wrap gap-1.5">
      {APP_ICONS.map((icon) => {
        const selected = icon.id === value;
        return (
          <button
            key={icon.id}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(icon.id)}
            className={cn(
              "flex w-24 flex-col items-center gap-1.5 rounded-md border p-2 transition-colors outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/50",
              selected && "border-primary ring-1 ring-primary",
            )}
          >
            <span className="relative">
              <img src={icon.src} alt="" draggable={false} className="size-16" />
              {selected && (
                <span className="absolute -top-1 -right-1 flex size-4 items-center justify-center rounded-full bg-primary text-primary-foreground">
                  <CheckIcon className="size-3" />
                </span>
              )}
            </span>
            <span className="truncate text-xs font-medium">{icon.label}</span>
          </button>
        );
      })}
    </div>
  );
}
