import { ChevronDownIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import type { OutcomeFilter, StateFilter } from "@/pages/automations/describe"

const STATES: readonly { id: StateFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "on", label: "On" },
  { id: "paused", label: "Paused" },
]

const OUTCOMES: readonly { id: OutcomeFilter; label: string }[] = [
  { id: "all", label: "Any outcome" },
  { id: "completed", label: "Completed" },
  { id: "failed", label: "Failed" },
  { id: "skipped", label: "Skipped" },
  { id: "never", label: "Never run" },
]

/** View controls for the toolbar: a search, and one menu that says when it is narrowing the list. */
export function AutomationFilters({
  search,
  onSearch,
  state,
  onState,
  outcome,
  onOutcome,
}: {
  search: string
  onSearch: (search: string) => void
  state: StateFilter
  onState: (state: StateFilter) => void
  outcome: OutcomeFilter
  onOutcome: (outcome: OutcomeFilter) => void
}) {
  const active = state !== "all" || outcome !== "all"
  const label = [
    state !== "all" && STATES.find((entry) => entry.id === state)?.label,
    outcome !== "all" && OUTCOMES.find((entry) => entry.id === outcome)?.label,
  ]
    .filter(Boolean)
    .join(" · ")
  return (
    <>
      <Input
        type="search"
        aria-label="Search automations"
        placeholder="Search name or goal"
        value={search}
        onChange={(event) => onSearch(event.target.value)}
        className="h-7 w-44"
      />
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button size="sm" variant={active ? "secondary" : "ghost"}>
            {label || "Filter"}
            <ChevronDownIcon className="text-muted-foreground" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          <DropdownMenuLabel>State</DropdownMenuLabel>
          <DropdownMenuRadioGroup value={state} onValueChange={(value) => onState(value as StateFilter)}>
            {STATES.map((entry) => (
              <DropdownMenuRadioItem key={entry.id} value={entry.id}>
                {entry.label}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
          <DropdownMenuSeparator />
          <DropdownMenuLabel>Last run</DropdownMenuLabel>
          <DropdownMenuRadioGroup value={outcome} onValueChange={(value) => onOutcome(value as OutcomeFilter)}>
            {OUTCOMES.map((entry) => (
              <DropdownMenuRadioItem key={entry.id} value={entry.id}>
                {entry.label}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
          {active && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onSelect={() => {
                  onState("all")
                  onOutcome("all")
                }}
              >
                Clear filters
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  )
}
