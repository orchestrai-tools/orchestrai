import { useSidebar } from "@/components/ui/sidebar"
import { findTask } from "@/data/tasks"
import type { ActionContext } from "@/lib/actions"
import { useAppActions, useAppSession } from "@/lib/app-instance"
import { useDialog } from "@/lib/dialog-store"
import { useLayoutStore } from "@/lib/layout-store"

/** What an action can do, bound to this window. Must render inside SidebarProvider. */
export function useActionContext(): ActionContext {
  const project = useAppSession((session) => session.project)
  const inspector = useAppSession((session) => session.inspector)
  const projectNav = useAppSession((session) => session.projectNav)
  const actions = useAppActions()
  const { open } = useDialog()
  const { toggleSidebar } = useSidebar()
  const { theme, setTheme, density, setDensity } = useLayoutStore()

  return {
    project,
    setPage: actions.setPage,
    select: actions.select,
    openTask: (id) => {
      const task = findTask(id)
      if (task) actions.selectProject(task.project)
      actions.select("task", id, "task")
    },
    selectProject: actions.selectProject,
    openHome: actions.openHome,
    openInboxAll: () => {
      actions.selectProject(project)
      actions.select("inbox", "all", "inbox")
    },
    openDialog: open,
    toggleSidebar,
    toggleInspector: () => actions.selectInspector(inspector.active),
    toggleTerminal: () => actions.toggleTerminal(),
    toggleFocus: () => actions.toggleFocus(),
    toggleTheme: () => setTheme(theme === "dark" ? "light" : "dark"),
    toggleDensity: () => setDensity(density === "compact" ? "comfortable" : "compact"),
    toggleProjectNav: () => actions.setProjectNav(projectNav === "tabs" ? "dropdown" : "tabs"),
  }
}
