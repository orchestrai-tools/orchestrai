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
import { useLayoutStore, type HeaderContent, type HeaderSpan } from "@/lib/layout-store"

function ChoiceField<T extends string>({
  title,
  description,
  value,
  options,
  disabled,
  onChange,
}: {
  title: string
  description: string
  value: T
  options: readonly { value: T; label: string }[]
  disabled: boolean
  onChange: (value: T) => void
}) {
  const titleId = useId()
  return (
    <Field data-disabled={disabled}>
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
        disabled={disabled}
        aria-labelledby={titleId}
        // Radix reports "" when the active item is clicked again; a choice must stay selected.
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

const SPAN_OPTIONS: readonly { value: HeaderSpan; label: string }[] = [
  { value: "full", label: "Full width" },
  { value: "inset", label: "Beside sidebar" },
]

const CONTENT_OPTIONS: readonly { value: HeaderContent; label: string }[] = [
  { value: "breadcrumbs", label: "Breadcrumbs" },
  { value: "menubar", label: "App menu" },
]

/** Layout settings popover, opened from the right rail. */
export function LayoutConfig() {
  const header = useLayoutStore(useShallow((state) => state.header))
  const setHeader = useLayoutStore((state) => state.setHeader)
  const drawersModal = useLayoutStore((state) => state.drawersModal)
  const setDrawersModal = useLayoutStore((state) => state.setDrawersModal)
  const drawerSnapPoints = useLayoutStore((state) => state.drawerSnapPoints)
  const setDrawerSnapPoints = useLayoutStore((state) => state.setDrawerSnapPoints)
  const windowControls = useLayoutStore((state) => state.windowControls)
  const setWindowControls = useLayoutStore((state) => state.setWindowControls)
  const windowControlsId = useId()
  const appFrame = useLayoutStore((state) => state.appFrame)
  const setAppFrame = useLayoutStore((state) => state.setAppFrame)
  const frameId = useId()
  const switchId = useId()
  const nonModalId = useId()
  const snapId = useId()

  return (
    <Popover>
      <SidebarMenu>
        <SidebarMenuItem>
          <Tooltip>
            <TooltipTrigger asChild>
              <PopoverTrigger asChild>
                <SidebarMenuButton aria-label="Layout settings" className="justify-center">
                  <Settings2Icon />
                </SidebarMenuButton>
              </PopoverTrigger>
            </TooltipTrigger>
            <TooltipContent side="left">Layout settings</TooltipContent>
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
          <PopoverTitle>Layout</PopoverTitle>
          <PopoverDescription>Header bar, sidebars, and drawers.</PopoverDescription>
        </PopoverHeader>

        <FieldGroup className="mt-4 gap-5">
          <Field orientation="horizontal">
            <FieldContent>
              <FieldLabel htmlFor={frameId}>Window frame</FieldLabel>
              <FieldDescription>
                Run both apps as macOS windows on a desktop. Off, the last app used fills the page.
              </FieldDescription>
            </FieldContent>
            <Switch id={frameId} checked={appFrame} onCheckedChange={setAppFrame} />
          </Field>

          <FieldSeparator />

          <Field orientation="horizontal">
            <FieldContent>
              <FieldLabel htmlFor={switchId}>Header bar</FieldLabel>
              <FieldDescription>Show the bar above the page.</FieldDescription>
            </FieldContent>
            <Switch
              id={switchId}
              checked={header.visible}
              onCheckedChange={(visible) => setHeader({ visible })}
            />
          </Field>

          <ChoiceField
            title="Header width"
            description="Span the window, or sit beside the left sidebar."
            value={header.span}
            options={SPAN_OPTIONS}
            disabled={!header.visible}
            onChange={(span) => setHeader({ span })}
          />

          <ChoiceField
            title="Header content"
            description="Simple breadcrumbs, or a desktop-style app menu."
            value={header.content}
            options={CONTENT_OPTIONS}
            disabled={!header.visible}
            onChange={(content) => setHeader({ content })}
          />

          <Field orientation="horizontal">
            <FieldContent>
              <FieldLabel htmlFor={windowControlsId}>Window controls</FieldLabel>
              <FieldDescription>Close, minimize, and zoom in the title bar, like a desktop app.</FieldDescription>
            </FieldContent>
            <Switch id={windowControlsId} checked={windowControls} onCheckedChange={setWindowControls} />
          </Field>

          <FieldSeparator />

          <Field orientation="horizontal">
            <FieldContent>
              <FieldLabel htmlFor={nonModalId}>Non-modal drawers</FieldLabel>
              <FieldDescription>Keep the page usable while a drawer is open.</FieldDescription>
            </FieldContent>
            <Switch
              id={nonModalId}
              checked={!drawersModal}
              onCheckedChange={(nonModal) => setDrawersModal(!nonModal)}
            />
          </Field>

          <Field orientation="horizontal">
            <FieldContent>
              <FieldLabel htmlFor={snapId}>Drawer snap points</FieldLabel>
              <FieldDescription>Bottom and top drawers stop at 40%, 70%, and full height.</FieldDescription>
            </FieldContent>
            <Switch id={snapId} checked={drawerSnapPoints} onCheckedChange={setDrawerSnapPoints} />
          </Field>
        </FieldGroup>
      </PopoverContent>
    </Popover>
  )
}
