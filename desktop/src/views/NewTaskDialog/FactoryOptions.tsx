import { MonitorPlay } from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { LOCATION_LABEL } from "@/lib/factory";
import type { EntryRunLocation } from "@/protocol";

import { ToggleChip } from "./chips";
import type { FactoryOptions as Options } from "./useFactoryOptions";

const LOCATIONS: EntryRunLocation[] = ["default", "worktree", "checkout"];

/**
 * Where a Factory task runs, as a note with a Change link rather than a
 * question, since Automatic is right almost every time.
 * @param props.options The dialog's Factory options.
 */
export function FactoryLocationNote({ options }: { options: Options }) {
  return (
    <span className="flex min-w-0 items-center gap-1.5">
      <span className="truncate">{options.note}</span>
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="shrink-0 font-medium text-foreground/80 underline-offset-2 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            aria-label="Change where it runs"
          >
            Change
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-60">
          <DropdownMenuRadioGroup
            value={options.location}
            onValueChange={(value) => options.setLocation(value as EntryRunLocation)}
          >
            {LOCATIONS.map((location) => (
              <DropdownMenuRadioItem key={location} value={location}>
                {LOCATION_LABEL[location]}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </span>
  );
}

/**
 * The Factory switches under the composer: test in the running app, and
 * whether a successful run opens a draft PR.
 * @param props.options The dialog's Factory options.
 */
export function FactoryOptions({ options }: { options: Options }) {
  return (
    <div className="mt-1 flex min-h-8 flex-wrap items-center gap-x-3 gap-y-1 text-[13px]">
      {options.canTest && (
        <ToggleChip
          active={options.testing}
          icon={MonitorPlay}
          label="Test in the running app"
          title="Add a stage that checks the change in the running app, in the in-app browser"
          onClick={() => options.setTesting(!options.testing)}
        />
      )}
      <label className="flex items-center gap-1.5 text-foreground/85">
        <input
          type="checkbox"
          checked={options.deliver}
          onChange={(event) => options.setDeliver(event.target.checked)}
        />
        Open a draft PR when done
      </label>
      {options.verifyBlocked && (
        <p className="w-full text-[11px] text-warn">
          This template tests the running app, which only works in your project folder. In a
          background copy it stops at the test and waits for you.
        </p>
      )}
    </div>
  );
}
