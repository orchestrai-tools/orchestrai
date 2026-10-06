import { cn } from "@warpforge/ui/lib/utils";
import { CheckIcon } from "lucide-react";
import type { CSSProperties } from "react";
import { themeChoices, type AppTheme } from "../lib/appearance";

/** Neutral themes take their colours from the UI kit, so their preview is fixed here. */
const NEUTRAL_PREVIEW: Record<string, Preview> = {
  "neutral-light": { surface: "#ffffff", card: "#f5f5f5", text: "#171717", accent: "#171717" },
  "neutral-dark": { surface: "#0a0a0a", card: "#262626", text: "#fafafa", accent: "#fafafa" },
};

interface Preview {
  surface: string;
  card: string;
  text: string;
  accent: string;
}

function preview(theme: AppTheme): Preview {
  if (!("colors" in theme)) return NEUTRAL_PREVIEW[theme.id] ?? NEUTRAL_PREVIEW["neutral-light"];
  const c = theme.colors;
  return {
    surface: `hsl(${c.background})`,
    card: `hsl(${c.card})`,
    text: `hsl(${c.foreground})`,
    accent: `hsl(${c.primary})`,
  };
}

function Swatch({ theme }: { theme: AppTheme }) {
  const p = preview(theme);
  return (
    <span
      aria-hidden
      className="flex h-8 w-full flex-col justify-between overflow-hidden rounded-sm border p-1.5"
      style={{ background: p.surface, borderColor: `color-mix(in srgb, ${p.text} 15%, transparent)` } as CSSProperties}
    >
      <span className="flex items-center gap-1">
        <span className="size-1.5 rounded-full" style={{ background: p.accent }} />
        <span className="h-1 w-6 rounded-full" style={{ background: p.text, opacity: 0.7 }} />
      </span>
      <span className="h-2 w-full rounded-[2px]" style={{ background: p.card }} />
    </span>
  );
}

/** Every theme as a small preview of its own colours. */
export function ThemePicker({
  value,
  onChange,
  className,
}: {
  value: string;
  onChange: (id: string) => void;
  className?: string;
}) {
  return (
    <div role="radiogroup" aria-label="Theme" className={cn("grid grid-cols-3 gap-1.5", className)}>
      {themeChoices().map((theme) => {
        const selected = theme.id === value;
        return (
          <button
            key={theme.id}
            title={`${theme.name} · ${theme.mode === "dark" ? "dark" : "light"}`}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(theme.id)}
            className={cn(
              "flex flex-col gap-1.5 rounded-md border p-1.5 text-left transition-colors outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/50",
              selected && "border-primary ring-1 ring-primary",
            )}
          >
            <span className="relative">
              <Swatch theme={theme} />
              {selected && (
                <span className="absolute -top-1 -right-1 flex size-4 items-center justify-center rounded-full bg-primary text-primary-foreground">
                  <CheckIcon className="size-3" />
                </span>
              )}
            </span>
            <span className="truncate px-0.5 text-xs font-medium">{theme.name}</span>
          </button>
        );
      })}
    </div>
  );
}
