import type { ComponentType } from "react"
import { HistoryIcon, ListTreeIcon, MessageSquareIcon, type LucideIcon } from "lucide-react"

import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from "@/components/ui/sidebar"
import type { RightPanelId } from "@/lib/window-store"

/** Sample data from shadcn's sidebar-14 block. */
const tableOfContents = [
  {
    title: "Getting Started",
    items: [{ title: "Installation" }, { title: "Project Structure" }],
  },
  {
    title: "Build Your Application",
    items: [
      { title: "Routing" },
      { title: "Data Fetching", isActive: true },
      { title: "Rendering" },
      { title: "Caching" },
      { title: "Styling" },
      { title: "Optimizing" },
      { title: "Configuring" },
      { title: "Testing" },
      { title: "Authentication" },
      { title: "Deploying" },
      { title: "Upgrading" },
      { title: "Examples" },
    ],
  },
  {
    title: "API Reference",
    items: [
      { title: "Components" },
      { title: "File Conventions" },
      { title: "Functions" },
      { title: "next.config.js Options" },
      { title: "CLI" },
      { title: "Edge Runtime" },
    ],
  },
  {
    title: "Architecture",
    items: [
      { title: "Accessibility" },
      { title: "Fast Refresh" },
      { title: "Next.js Compiler" },
      { title: "Supported Browsers" },
      { title: "Turbopack" },
    ],
  },
  { title: "Community", items: [{ title: "Contribution Guide" }] },
]

const comments = [
  { author: "Ana Ruiz", when: "2m ago", text: "Can we cache this response for an hour?" },
  { author: "Kenji Mori", when: "18m ago", text: "Added a note about revalidation." },
  { author: "Priya Shah", when: "1h ago", text: "The fetch example needs error handling." },
]

const activity = [
  { title: "Data Fetching edited", when: "Just now" },
  { title: "Caching published", when: "Today, 9:12" },
  { title: "Routing reviewed", when: "Yesterday" },
  { title: "Installation updated", when: "Mon" },
]

function TableOfContentsPanel() {
  return (
    <SidebarGroup>
      <SidebarGroupContent>
        <SidebarMenu>
          {tableOfContents.map((section) => (
            <SidebarMenuItem key={section.title}>
              <SidebarMenuButton asChild>
                <a href="#" className="font-medium">
                  {section.title}
                </a>
              </SidebarMenuButton>
              <SidebarMenuSub>
                {section.items.map((item) => (
                  <SidebarMenuSubItem key={item.title}>
                    <SidebarMenuSubButton asChild isActive={"isActive" in item && item.isActive}>
                      <a href="#">{item.title}</a>
                    </SidebarMenuSubButton>
                  </SidebarMenuSubItem>
                ))}
              </SidebarMenuSub>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  )
}

function CommentsPanel() {
  return (
    <SidebarGroup>
      <SidebarGroupContent>
        <SidebarMenu className="gap-1">
          {comments.map((comment) => (
            <SidebarMenuItem key={comment.author}>
              <SidebarMenuButton className="h-auto flex-col items-start gap-1 py-2">
                <span className="flex w-full items-center justify-between text-xs">
                  <span className="font-medium">{comment.author}</span>
                  <span className="text-muted-foreground">{comment.when}</span>
                </span>
                <span className="text-xs leading-snug whitespace-normal text-muted-foreground">
                  {comment.text}
                </span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  )
}

function ActivityPanel() {
  return (
    <SidebarGroup>
      <SidebarGroupContent>
        <SidebarMenu>
          {activity.map((event) => (
            <SidebarMenuItem key={event.title}>
              <SidebarMenuButton className="justify-between">
                <span className="truncate">{event.title}</span>
                <span className="shrink-0 text-xs text-muted-foreground">{event.when}</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  )
}

export interface RightPanel {
  id: RightPanelId
  title: string
  icon: LucideIcon
  Content: ComponentType
}

export const RIGHT_PANELS: readonly RightPanel[] = [
  { id: "contents", title: "Table of Contents", icon: ListTreeIcon, Content: TableOfContentsPanel },
  { id: "comments", title: "Comments", icon: MessageSquareIcon, Content: CommentsPanel },
  { id: "activity", title: "Activity", icon: HistoryIcon, Content: ActivityPanel },
]
