import { useId } from "react"
import { Settings2Icon } from "lucide-react"
import { useShallow } from "zustand/react/shallow"

import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldSeparator,
  FieldTitle,
} from "@/components/ui/field"
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover"
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem } from "@/components/ui/sidebar"
import { Switch } from "@/components/ui/switch"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { useAppActions, useAppSession } from "@/lib/app-instance"
import { PROJECT_NAVS } from "@/lib/apps"
import { useLayoutStore } from "@/lib/layout-store"

function Choice<T extends string>({
  title,
  description,
  value,
  options,
  onChange,
}: {
  title: string
  description: string
  value: T
  options: readonly { value: T; label: string }[]
  onChange: (value: T) => void
}) {
  const titleId = useId()
  return (
    <Field>
      <FieldContent>
        <FieldTitle id={titleId}>{title}</FieldTitle>
        <FieldDescription>{description}</FieldDescription>
      </FieldContent>
      <ToggleGroup
        type="single"
        variant="outline"
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
  )
}

/** Appearance settings, opened from the bottom of the inspector rail. Each is one product-wide token. */
export function LayoutConfig() {
  const layout = useLayoutStore(useShallow((state) => state))
  const projectNav = useAppSession((session) => session.projectNav)
  const { setProjectNav } = useAppActions()
  const frameId = useId()
  const controlsId = useId()

  return (
    <Popover>
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
        className="max-h-(--radix-popover-content-available-height) w-80 overflow-y-auto"
      >
        <PopoverHeader>
          <PopoverTitle>Appearance</PopoverTitle>
          <PopoverDescription>Applies to every page and both windows, except where noted.</PopoverDescription>
        </PopoverHeader>

        <FieldGroup className="mt-4 gap-5">
          <Choice
            title="Theme"
            description="Check both: removing borders loses contrast in light mode first."
            value={layout.theme}
            options={[{ value: "light", label: "Light" }, { value: "dark", label: "Dark" }]}
            onChange={layout.setTheme}
          />
          <Choice
            title="Density"
            description="Compact steps row padding down by 4 px everywhere, never per page."
            value={layout.density}
            options={[{ value: "comfortable", label: "Comfortable" }, { value: "compact", label: "Compact" }]}
            onChange={layout.setDensity}
          />
          <Choice
            title="Corners"
            description="One radius token. Things that touch stay square."
            value={layout.radius}
            options={[{ value: "none", label: "Square" }, { value: "small", label: "4 px" }, { value: "medium", label: "10 px" }]}
            onChange={layout.setRadius}
          />

          <FieldSeparator />

          <Choice
            title="Header"
            description="Breadcrumbs, or a desktop-style app menu."
            value={layout.header.content}
            options={[{ value: "breadcrumbs", label: "Breadcrumbs" }, { value: "menubar", label: "App menu" }]}
            onChange={(content) => layout.setHeader({ content })}
          />
          <Field orientation="horizontal">
            <FieldContent>
              <FieldLabel htmlFor={frameId}>Window frame</FieldLabel>
              <FieldDescription>Both apps as macOS windows on a desktop.</FieldDescription>
            </FieldContent>
            <Switch id={frameId} checked={layout.appFrame} onCheckedChange={layout.setAppFrame} />
          </Field>
          <Field orientation="horizontal">
            <FieldContent>
              <FieldLabel htmlFor={controlsId}>Window controls</FieldLabel>
              <FieldDescription>Close, minimize, and zoom in the title bar.</FieldDescription>
            </FieldContent>
            <Switch id={controlsId} checked={layout.windowControls} onCheckedChange={layout.setWindowControls} />
          </Field>

          <FieldSeparator />

          <Choice
            title="Projects (this window)"
            description="Tabs keep every open project's status in view. The dropdown shows one."
            value={projectNav}
            options={PROJECT_NAVS}
            onChange={setProjectNav}
          />
        </FieldGroup>
      </PopoverContent>
    </Popover>
  )
}
