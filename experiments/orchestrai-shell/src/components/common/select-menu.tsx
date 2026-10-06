import { ChevronDownIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"

export interface SelectOption {
  value: string
  label: string
  hint?: string
  disabled?: boolean
}

/** A select built from the menu primitives. It stays modal: inside a dialog, a non-modal menu loses focus to the dialog's trap. */
export function SelectMenu({
  value,
  options,
  onChange,
  label,
  className,
}: {
  value: string
  options: readonly SelectOption[]
  onChange: (value: string) => void
  label: string
  className?: string
}) {
  const current = options.find((option) => option.value === value)
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" aria-label={label} className={cn("justify-between font-normal", className)}>
          <span className="truncate">{current?.label ?? value}</span>
          <ChevronDownIcon className="text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-(--radix-dropdown-menu-trigger-width) min-w-56">
        <DropdownMenuLabel>{label}</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={value} onValueChange={onChange}>
          {options.map((option) => (
            <DropdownMenuRadioItem key={option.value} value={option.value} disabled={option.disabled} className="items-start">
              <span className="flex min-w-0 flex-col">
                <span>{option.label}</span>
                {option.hint && <span className="text-xs text-muted-foreground">{option.hint}</span>}
              </span>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
