import type { ReactNode } from "react"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable"

function PanelLabel({ children }: { children: ReactNode }) {
  return <div className="flex h-full items-center justify-center p-6 font-medium">{children}</div>
}

function DemoCard({
  title,
  description,
  children,
}: {
  title: string
  description: string
  children: ReactNode
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  )
}

/** Resizable layouts: sidebar and content, vertical split, and nested groups. */
export function ResizableDemo() {
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <DemoCard title="Sidebar and content" description="Drag the grip to resize; arrow keys work when the handle is focused.">
        <ResizablePanelGroup orientation="horizontal" className="min-h-64 rounded-lg border">
          <ResizablePanel defaultSize="30%" minSize="15%">
            <PanelLabel>Sidebar</PanelLabel>
          </ResizablePanel>
          <ResizableHandle withHandle />
          <ResizablePanel defaultSize="70%">
            <PanelLabel>Content</PanelLabel>
          </ResizablePanel>
        </ResizablePanelGroup>
      </DemoCard>

      <DemoCard title="Vertical" description="Stack panels and resize them top to bottom.">
        <ResizablePanelGroup orientation="vertical" className="min-h-64 rounded-lg border">
          <ResizablePanel defaultSize="35%">
            <PanelLabel>Header</PanelLabel>
          </ResizablePanel>
          <ResizableHandle withHandle />
          <ResizablePanel defaultSize="65%">
            <PanelLabel>Content</PanelLabel>
          </ResizablePanel>
        </ResizablePanelGroup>
      </DemoCard>

      <div className="xl:col-span-2">
        <DemoCard title="Nested" description="Groups nest, so one side can split again in the other direction.">
          <ResizablePanelGroup orientation="horizontal" className="min-h-80 rounded-lg border">
            <ResizablePanel defaultSize="50%">
              <PanelLabel>One</PanelLabel>
            </ResizablePanel>
            <ResizableHandle />
            <ResizablePanel defaultSize="50%">
              <ResizablePanelGroup orientation="vertical">
                <ResizablePanel defaultSize="25%">
                  <PanelLabel>Two</PanelLabel>
                </ResizablePanel>
                <ResizableHandle />
                <ResizablePanel defaultSize="75%">
                  <PanelLabel>Three</PanelLabel>
                </ResizablePanel>
              </ResizablePanelGroup>
            </ResizablePanel>
          </ResizablePanelGroup>
        </DemoCard>
      </div>
    </div>
  )
}
