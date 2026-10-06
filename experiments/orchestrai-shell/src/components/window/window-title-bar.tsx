import type { HTMLAttributes } from "react"

import { WindowControls } from "@/components/window-controls"
import { ProjectSwitcher } from "@/components/window/project-switcher"
import { ProjectTabs } from "@/components/window/project-tabs"
import { TitleBarStatus } from "@/components/window/title-bar-status"
import { useAppSession, useIsFrontApp } from "@/lib/app-instance"
import { useLayoutStore } from "@/lib/layout-store"
import { cn } from "@/lib/utils"

/**
 * A unified title bar, as in TradingView's desktop app: the window controls
 * and the project tabs (or the project menu) share one row. Empty space
 * still drags the window and double-click zooms it.
 */
export function WindowTitleBar({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  const projectNav = useAppSession((session) => session.projectNav)
  const controls = useLayoutStore((state) => state.windowControls)
  const front = useIsFrontApp()

  return (
    <div
      {...props}
      data-front={front}
      className={cn(
        "flex h-10 shrink-0 items-stretch gap-3 border-b bg-muted pr-2 pl-3 select-none",
        !front && "*:opacity-70",
        className
      )}
    >
      {controls && <WindowControls className="pr-1" />}
      {projectNav === "tabs" ? (
        <ProjectTabs />
      ) : (
        <div className="flex items-center">
          <ProjectSwitcher />
        </div>
      )}
      <TitleBarStatus />
    </div>
  )
}
