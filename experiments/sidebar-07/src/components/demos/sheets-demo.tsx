import { PanelBottomIcon, PanelLeftIcon, PanelRightIcon, PanelTopIcon, type LucideIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/base/sheet"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"

type Side = "top" | "right" | "bottom" | "left"

const SIDES: readonly { side: Side; label: string; icon: LucideIcon }[] = [
  { side: "top", label: "Top", icon: PanelTopIcon },
  { side: "right", label: "Right", icon: PanelRightIcon },
  { side: "bottom", label: "Bottom", icon: PanelBottomIcon },
  { side: "left", label: "Left", icon: PanelLeftIcon },
]

function ProfileSheet({ side, label, icon: Icon }: { side: Side; label: string; icon: LucideIcon }) {
  return (
    <Sheet>
      <SheetTrigger render={<Button variant="outline" className="h-20 flex-col gap-2" />}>
        <Icon className="size-5" />
        {label}
      </SheetTrigger>
      <SheetContent side={side}>
        <SheetHeader>
          <SheetTitle>Edit profile</SheetTitle>
          <SheetDescription>
            Make changes to your profile here. Click save when you&apos;re done. This sheet opens from the {side}.
          </SheetDescription>
        </SheetHeader>
        <FieldGroup className="gap-4 px-4">
          <Field>
            <FieldLabel htmlFor={`${side}-name`}>Name</FieldLabel>
            <Input id={`${side}-name`} defaultValue="Pedro Duarte" />
          </Field>
          <Field>
            <FieldLabel htmlFor={`${side}-username`}>Username</FieldLabel>
            <Input id={`${side}-username`} defaultValue="@peduarte" />
          </Field>
        </FieldGroup>
        <SheetFooter>
          <Button type="submit">Save changes</Button>
          <SheetClose render={<Button variant="outline" />}>Close</SheetClose>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}

/** One sheet per edge of the screen. */
export function SheetsDemo() {
  return (
    <Card className="max-w-xl">
      <CardHeader>
        <CardTitle>Sheet</CardTitle>
        <CardDescription>Open the same sheet from each side of the screen.</CardDescription>
      </CardHeader>
      <CardContent className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {SIDES.map((side) => (
          <ProfileSheet key={side.side} {...side} />
        ))}
      </CardContent>
    </Card>
  )
}
