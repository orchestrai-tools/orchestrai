import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldSeparator,
  FieldTitle,
} from "@warpforge/ui/components/field";
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@warpforge/ui/components/popover";
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem } from "@warpforge/ui/components/sidebar";
import { ToggleGroup, ToggleGroupItem } from "@warpforge/ui/components/toggle-group";
import { Tooltip, TooltipContent, TooltipTrigger } from "@warpforge/ui/components/tooltip";
import { Settings2Icon } from "lucide-react";
import { useId, useState, type ReactNode } from "react";
import { useAppearance } from "../lib/appearance";
import { useShell } from "../lib/shell-store";
import { openSettingsAt } from "../lib/actions";
import { ThemePicker } from "./theme-picker";

export function Choice<T extends string>({
  title,
  description,
  value,
  options,
  onChange,
}: {
  title: string;
  description: string;
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  const titleId = useId();
  return (
    <Field className="gap-2">
      <FieldContent className="gap-0.5">
        <FieldTitle id={titleId}>{title}</FieldTitle>
        <FieldDescription className="text-xs">{description}</FieldDescription>
      </FieldContent>
      <ToggleGroup
        type="single"
        variant="outline"
        size="sm"
        spacing={0}
        className="w-full"
        value={value}
        aria-labelledby={titleId}
        onValueChange={(next) => next && onChange(next as T)}
      >
        {options.map((option) => (
          <ToggleGroupItem key={option.value} value={option.value} className="flex-1">
            {option.label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </Field>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-4">
      <h3 className="text-xs font-medium text-muted-foreground">{title}</h3>
      {children}
    </section>
  );
}

const DENSITY = [
  { value: "comfortable", label: "Comfortable" },
  { value: "compact", label: "Compact" },
] as const;
const CORNERS = [
  { value: "none", label: "Square" },
  { value: "default", label: "4 px" },
  { value: "round", label: "10 px" },
] as const;
const PROJECT_NAV = [
  { value: "tabs", label: "Tabs" },
  { value: "dropdown", label: "Dropdown" },
] as const;

/** Appearance settings, opened from the bottom of the inspector rail. Each is one product-wide token. */
export function LayoutConfig() {
  const appearance = useAppearance();
  const shell = useShell();
  const [open, setOpen] = useState(false);

  const openAppearanceSettings = () => {
    openSettingsAt("appearance");
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <SidebarMenu>
        <SidebarMenuItem>
          <Tooltip>
            <TooltipTrigger asChild>
              <PopoverTrigger asChild>
                <SidebarMenuButton aria-label="Appearance" className="justify-center">
                  <Settings2Icon />
                </SidebarMenuButton>
              </PopoverTrigger>
            </TooltipTrigger>
            <TooltipContent side="left">Appearance</TooltipContent>
          </Tooltip>
        </SidebarMenuItem>
      </SidebarMenu>

      <PopoverContent
        side="left"
        align="end"
        sideOffset={8}
        collisionPadding={8}
        className="flex max-h-(--radix-popover-content-available-height) w-[22rem] flex-col gap-0 overflow-hidden p-0"
      >
        <PopoverHeader className="border-b px-4 py-3">
          <PopoverTitle>Appearance</PopoverTitle>
          <PopoverDescription className="text-xs">
            Applies to every page.{" "}
            <button
              type="button"
              onClick={openAppearanceSettings}
              className="text-foreground underline-offset-2 hover:underline"
            >
              More in Settings
            </button>
          </PopoverDescription>
        </PopoverHeader>

        <FieldGroup className="min-h-0 gap-5 overflow-y-auto px-4 py-4">
          <Section title="Look">
            <Field className="gap-2">
              <FieldTitle>Theme</FieldTitle>
              <ThemePicker value={appearance.themeId} onChange={appearance.setTheme} />
            </Field>
            <Choice
              title="Density"
              description="Compact tightens row spacing everywhere."
              value={appearance.density}
              options={DENSITY}
              onChange={appearance.setDensity}
            />
            <Choice
              title="Corners"
              description="One corner radius for the whole app."
              value={appearance.radius}
              options={CORNERS}
              onChange={appearance.setRadius}
            />
          </Section>
          <FieldSeparator />
          <Section title="Layout">
            <Choice
              title="Projects"
              description="Tabs show every open project. The dropdown shows one."
              value={shell.projectNav}
              options={PROJECT_NAV}
              onChange={shell.setProjectNav}
            />
          </Section>
        </FieldGroup>
      </PopoverContent>
    </Popover>
  );
}
