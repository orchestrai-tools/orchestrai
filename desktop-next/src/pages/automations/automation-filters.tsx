import { Button } from "@warpforge/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@warpforge/ui/components/dropdown-menu";
import { Input } from "@warpforge/ui/components/input";
import { ChevronDownIcon } from "lucide-react";
import { IDLE_FILTERS, type AutomationFilters as Filters, type OutcomeFilter, type Scope, type StateFilter } from "./use-automations";

const STATES: readonly { id: StateFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "on", label: "On" },
  { id: "off", label: "Paused" },
];

const OUTCOMES: readonly { id: OutcomeFilter; label: string }[] = [
  { id: "all", label: "Any outcome" },
  { id: "completed", label: "Completed" },
  { id: "failed", label: "Failed" },
  { id: "skipped", label: "Skipped" },
  { id: "never", label: "Never run" },
];

/** View controls for the toolbar: which projects, a search, and one menu that says when it is narrowing the list. */
export function AutomationFilters({
  scope,
  onScope,
  filters,
  onChange,
}: {
  scope: Scope;
  onScope: (scope: Scope) => void;
  filters: Filters;
  onChange: (filters: Filters) => void;
}) {
  const { state, outcome } = filters;
  const active = state !== "all" || outcome !== "all";
  const label = [
    scope === "all" && "All projects",
    state !== "all" && STATES.find((entry) => entry.id === state)?.label,
    outcome !== "all" && OUTCOMES.find((entry) => entry.id === outcome)?.label,
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <>
      <Input
        type="search"
        aria-label="Search automations"
        placeholder="Search name or prompt"
        value={filters.search}
        onChange={(event) => onChange({ ...filters, search: event.target.value })}
        className="h-7 w-44"
      />
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button size="sm" variant={active || scope === "all" ? "secondary" : "ghost"}>
            {label || "Filter"}
            <ChevronDownIcon className="text-muted-foreground" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          <DropdownMenuLabel>Projects</DropdownMenuLabel>
          <DropdownMenuRadioGroup value={scope} onValueChange={(value) => onScope(value as Scope)}>
            <DropdownMenuRadioItem value="project">This project</DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="all">All projects</DropdownMenuRadioItem>
          </DropdownMenuRadioGroup>
          <DropdownMenuSeparator />
          <DropdownMenuLabel>State</DropdownMenuLabel>
          <DropdownMenuRadioGroup value={state} onValueChange={(value) => onChange({ ...filters, state: value as StateFilter })}>
            {STATES.map((entry) => (
              <DropdownMenuRadioItem key={entry.id} value={entry.id}>
                {entry.label}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
          <DropdownMenuSeparator />
          <DropdownMenuLabel>Last run</DropdownMenuLabel>
          <DropdownMenuRadioGroup value={outcome} onValueChange={(value) => onChange({ ...filters, outcome: value as OutcomeFilter })}>
            {OUTCOMES.map((entry) => (
              <DropdownMenuRadioItem key={entry.id} value={entry.id}>
                {entry.label}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
          {active && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => onChange({ ...IDLE_FILTERS, search: filters.search })}>Clear filters</DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}
