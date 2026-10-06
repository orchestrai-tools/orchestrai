import type { ReactNode } from "react"

import { Button } from "@/components/ui/button"
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { useAppActions, useAppId, useAppSession } from "@/lib/app-instance"
import { useLayoutStore, type DrawerEdge } from "@/lib/layout-store"
import { useWindowStore } from "@/lib/window-store"

/**
 * Modal or not, from the layout settings. Non-modal drawers also ignore
 * outside presses; otherwise the first click on the page would close them.
 */
function useDrawerMode() {
  const modal = useLayoutStore((state) => state.drawersModal)
  return { modal, disablePointerDismissal: !modal }
}

/** Fractions of the viewport height. */
const SNAP_POINTS = [0.4, 0.7, 1]
const SNAP_HINT = "Drag the handle to snap at 40%, 70%, or full height."

/** Snap points for vertical drawers, when enabled in the layout settings. */
function useSnapPoints() {
  const enabled = useLayoutStore((state) => state.drawerSnapPoints)
  return { enabled, props: enabled ? { snapPoints: SNAP_POINTS } : {} }
}

/** Opens one edge's drawer from this window's state, so menus outside the drawer can open it. */
function useEdgeDrawer(edge: DrawerEdge) {
  const app = useAppId()
  const open = useAppSession((session) => session.openDrawer === edge)
  const { setOpenDrawer } = useAppActions()
  return {
    ...useDrawerMode(),
    open,
    onOpenChange: (next: boolean) => {
      if (next) setOpenDrawer(edge)
      // Read live: opening another edge's drawer must not be undone by this one closing.
      else if (useWindowStore.getState().sessions[app].openDrawer === edge) setOpenDrawer(null)
    },
  }
}

function InspectorBody() {
  const rows = [
    ["Name", "Data Fetching"],
    ["Section", "Build Your Application"],
    ["Owner", "Kenji Mori"],
    ["Updated", "Today, 9:12"],
  ]
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2">
      {rows.map(([term, value]) => (
        <div key={term} className="contents">
          <dt className="text-muted-foreground">{term}</dt>
          <dd className="truncate">{value}</dd>
        </div>
      ))}
    </dl>
  )
}

function PropertiesBody() {
  return (
    <FieldGroup className="gap-4">
      <Field>
        <FieldLabel htmlFor="drawer-title">Title</FieldLabel>
        <Input id="drawer-title" defaultValue="Data Fetching" />
      </Field>
      <Field>
        <FieldLabel htmlFor="drawer-slug">Slug</FieldLabel>
        <Input id="drawer-slug" defaultValue="data-fetching" />
      </Field>
    </FieldGroup>
  )
}

function HistoryBody() {
  const versions = ["v12 · Today", "v11 · Yesterday", "v10 · Mon", "v9 · Last week"]
  return (
    <ul className="flex flex-col gap-2">
      {versions.map((version) => (
        <li key={version} className="rounded-md border px-3 py-2">
          {version}
        </li>
      ))}
    </ul>
  )
}

/** Each level opens the next as a nested drawer that stacks on top of it. */
const RIGHT_LEVELS: readonly { title: string; description: string; Body: () => ReactNode }[] = [
  { title: "Inspector", description: "Details for the current page.", Body: InspectorBody },
  { title: "Properties", description: "Edit the page's properties.", Body: PropertiesBody },
  { title: "History", description: "Earlier versions of the page.", Body: HistoryBody },
]

function RightDrawerLevel({ level }: { level: number }) {
  const { title, description, Body } = RIGHT_LEVELS[level]
  const next = RIGHT_LEVELS[level + 1]
  const mode = useDrawerMode()
  return (
    <>
      <DrawerHeader>
        <DrawerTitle>{title}</DrawerTitle>
        <DrawerDescription>
          Level {level + 1} of {RIGHT_LEVELS.length}. {description}
        </DrawerDescription>
      </DrawerHeader>
      <div className="flex-1 overflow-y-auto p-4">
        <Body />
      </div>
      <DrawerFooter>
        {next && (
          <Drawer swipeDirection="right" {...mode}>
            <DrawerTrigger render={<Button />}>Open {next.title}</DrawerTrigger>
            <DrawerContent>
              <RightDrawerLevel level={level + 1} />
            </DrawerContent>
          </Drawer>
        )}
        <DrawerClose render={<Button variant="outline" />}>Close</DrawerClose>
      </DrawerFooter>
    </>
  )
}

function RightDrawers() {
  return (
    <Drawer swipeDirection="right" {...useEdgeDrawer("right")}>
      <DrawerContent>
        <RightDrawerLevel level={0} />
      </DrawerContent>
    </Drawer>
  )
}

function BottomDrawer() {
  const lines = [
    "$ npm run dev",
    "VITE v8.3.0  ready in 212 ms",
    "➜  Local:   http://localhost:5175/",
    "hmr update /src/App.tsx",
  ]
  const snap = useSnapPoints()
  return (
    <Drawer swipeDirection="down" showSwipeHandle {...useEdgeDrawer("bottom")} {...snap.props}>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>Output</DrawerTitle>
          <DrawerDescription>
            Recent output from the dev server.{snap.enabled && ` ${SNAP_HINT}`}
          </DrawerDescription>
        </DrawerHeader>
        <pre className="m-4 overflow-x-auto rounded-md bg-muted p-3 font-mono text-xs leading-relaxed">
          {lines.join("\n")}
        </pre>
        <DrawerFooter>
          <DrawerClose render={<Button variant="outline" />}>Close</DrawerClose>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  )
}

function TopDrawer() {
  const notices = [
    { title: "Build finished", detail: "Deployed preview in 41s." },
    { title: "New comment", detail: "Ana Ruiz commented on Data Fetching." },
    { title: "Review requested", detail: "Priya Shah asked for your review." },
  ]
  const snap = useSnapPoints()
  return (
    <Drawer swipeDirection="up" showSwipeHandle {...useEdgeDrawer("top")} {...snap.props}>
      <DrawerContent>
        {/* A top drawer reveals from its bottom edge, so at a partial snap point only the bottom shows. */}
        <div className="flex flex-1 flex-col justify-end">
          <DrawerHeader>
            <DrawerTitle>Notifications</DrawerTitle>
            <DrawerDescription>
              What happened while you were away.{snap.enabled && ` ${SNAP_HINT}`}
            </DrawerDescription>
          </DrawerHeader>
          <ul className="flex flex-col gap-2 p-4">
            {notices.map((notice) => (
              <li key={notice.title} className="rounded-md border px-3 py-2">
                <p className="font-medium">{notice.title}</p>
                <p className="text-muted-foreground">{notice.detail}</p>
              </li>
            ))}
          </ul>
          <DrawerFooter className="mt-0">
            <DrawerClose render={<Button variant="outline" />}>Dismiss</DrawerClose>
          </DrawerFooter>
        </div>
      </DrawerContent>
    </Drawer>
  )
}

/** Drawers opened from the context menu: nested right stack, bottom, and top. */
export function AppDrawers() {
  return (
    <>
      <RightDrawers />
      <BottomDrawer />
      <TopDrawer />
    </>
  )
}
