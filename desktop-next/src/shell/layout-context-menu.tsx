import {
  ContextMenu,
  ContextMenuCheckboxItem,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuRadioGroup,
  ContextMenuRadioItem,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from "@warpforge/ui/components/context-menu";
import type { ReactNode } from "react";
import { activeTheme, useAppearance } from "../lib/appearance";
import { useShell, type InspectorId } from "../lib/shell-store";
import { INSPECTOR_PANELS } from "./inspector/right-sidebar";

const CLOSED = "closed";

/** Leave the native menu for text fields and editors, where copy and paste live. */
function wantsNativeMenu(target: EventTarget | null): boolean {
  return target instanceof Element && Boolean(target.closest("input, textarea, [contenteditable], .cm-editor, .xterm"));
}

/**
 * Right-click on empty chrome for the layout. Most-used items first, the reset
 * last. Every item is also in the palette.
 */
export function LayoutContextMenu({ children }: { children: ReactNode }) {
  const shell = useShell();
  const appearance = useAppearance();
  const dark = activeTheme(appearance.themeId).mode === "dark";

  return (
    <ContextMenu>
      {/* The trigger defaults to select-none, which would block text selection across the page. */}
      <ContextMenuTrigger
        asChild
        className="select-auto"
        onContextMenu={(event) => {
          if (wantsNativeMenu(event.target)) event.stopPropagation();
        }}
      >
        {children}
      </ContextMenuTrigger>
      <ContextMenuContent className="w-60" onCloseAutoFocus={(event) => event.preventDefault()}>
        <ContextMenuItem onSelect={() => shell.toggle("focus")}>
          Focus mode <ContextMenuShortcut>⇧⌘\</ContextMenuShortcut>
        </ContextMenuItem>
        <ContextMenuCheckboxItem checked={shell.sidebar} onCheckedChange={() => shell.toggle("sidebar")}>
          Sidebar <ContextMenuShortcut>⌘\</ContextMenuShortcut>
        </ContextMenuCheckboxItem>
        <ContextMenuSub>
          <ContextMenuSubTrigger>Inspector</ContextMenuSubTrigger>
          <ContextMenuSubContent className="w-44">
            <ContextMenuRadioGroup
              value={shell.inspector ? shell.inspectorPanel : CLOSED}
              onValueChange={(value) =>
                value === CLOSED
                  ? useShell.setState({ inspector: false })
                  : useShell.setState({ inspector: true, inspectorPanel: value as InspectorId })
              }
            >
              <ContextMenuRadioItem value={CLOSED}>Closed</ContextMenuRadioItem>
              <ContextMenuSeparator />
              {INSPECTOR_PANELS.map(({ id, title }) => (
                <ContextMenuRadioItem key={id} value={id}>
                  {title}
                </ContextMenuRadioItem>
              ))}
            </ContextMenuRadioGroup>
          </ContextMenuSubContent>
        </ContextMenuSub>
        {!shell.home && (
          <ContextMenuCheckboxItem checked={shell.terminal} onCheckedChange={() => shell.toggle("terminal")}>
            Terminal drawer <ContextMenuShortcut>⌃`</ContextMenuShortcut>
          </ContextMenuCheckboxItem>
        )}

        <ContextMenuSeparator />
        <ContextMenuLabel>Appearance</ContextMenuLabel>
        <ContextMenuCheckboxItem
          checked={dark}
          onCheckedChange={(next) => appearance.setTheme(next ? "neutral-dark" : "neutral-light")}
        >
          Dark theme
        </ContextMenuCheckboxItem>
        <ContextMenuSub>
          <ContextMenuSubTrigger>Density</ContextMenuSubTrigger>
          <ContextMenuSubContent className="w-44">
            <ContextMenuRadioGroup
              value={appearance.density}
              onValueChange={(value) => appearance.setDensity(value as "comfortable" | "compact")}
            >
              <ContextMenuRadioItem value="comfortable">Comfortable</ContextMenuRadioItem>
              <ContextMenuRadioItem value="compact">Compact</ContextMenuRadioItem>
            </ContextMenuRadioGroup>
          </ContextMenuSubContent>
        </ContextMenuSub>
        <ContextMenuCheckboxItem
          checked={shell.projectNav === "tabs"}
          onCheckedChange={(tabs) => shell.setProjectNav(tabs ? "tabs" : "dropdown")}
        >
          Project tabs
        </ContextMenuCheckboxItem>

        <ContextMenuSeparator />
        <ContextMenuItem
          onSelect={() => {
            useShell.setState({ sidebar: true, inspector: false, inspectorPanel: "details", focus: false });
            appearance.setDensity("comfortable");          }}
        >
          Reset layout
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
