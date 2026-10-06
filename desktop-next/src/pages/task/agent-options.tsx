import { daemon } from "@warpforge/daemon";
import type { ConfigOption } from "@warpforge/protocol";
import { Button } from "@warpforge/ui/components/button";
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from "@warpforge/ui/components/command";
import { Popover, PopoverContent, PopoverTrigger } from "@warpforge/ui/components/popover";
import { CheckIcon, ChevronDownIcon, SlidersHorizontalIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { configRole } from "../../lib/config-role";

const SEARCH_AT = 8;

function choose(taskId: string, option: ConfigOption, value: string) {
  void daemon
    .request("session.setConfigOption", { task_id: taskId, config_id: option.id, value })
    .catch((err: unknown) => {
      const label = option.options.find((choice) => choice.value === value)?.name ?? value;
      toast.error(
        err instanceof Error ? err.message : `Could not switch ${option.name} to ${label}`,
      );
    });
}

/** One session selector the agent reported, switched live. Long lists can be searched. */
function OptionPicker({ taskId, option }: { taskId: string; option: ConfigOption }) {
  const [open, setOpen] = useState(false);
  const current = option.options.find((choice) => choice.value === option.currentValue);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="xs"
          aria-label={option.name}
          className="max-w-48 text-muted-foreground"
        >
          <span className="truncate">{current?.name ?? (option.currentValue || option.name)}</span>
          <ChevronDownIcon />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" side="top" className="w-64 p-0">
        <Command>
          {option.options.length > SEARCH_AT && (
            <CommandInput placeholder={`Search ${option.name}`} />
          )}
          <CommandList>
            <CommandEmpty>No match.</CommandEmpty>
            {option.options.map((choice) => (
              <CommandItem
                key={choice.value}
                value={`${choice.name} ${choice.value}`}
                onSelect={() => {
                  setOpen(false);
                  if (choice.value !== option.currentValue) choose(taskId, option, choice.value);
                }}
              >
                <span className="min-w-0 flex-1 truncate">{choice.name}</span>
                {choice.value === option.currentValue && <CheckIcon className="size-3.5" />}
              </CommandItem>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

/** Model and effort sit on the composer. Everything else the agent reports is under one more button. */
export function AgentOptions({ taskId, options }: { taskId: string; options: ConfigOption[] }) {
  if (options.length === 0) return null;
  const model = options.find((option) => configRole(option) === "model");
  const effort = options.find((option) => configRole(option) === "effort");
  const primary = [model, effort].filter((option): option is ConfigOption => Boolean(option));
  const overflow = options.filter((option) => option !== model && option !== effort);

  return (
    <>
      {primary.map((option) => (
        <OptionPicker key={option.id} taskId={taskId} option={option} />
      ))}
      {overflow.length > 0 && (
        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label="More session options"
              className="text-muted-foreground"
            >
              <SlidersHorizontalIcon />
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" side="top" className="w-72">
            <ul className="flex flex-col gap-1">
              {overflow.map((option) => (
                <li key={option.id} className="flex items-center justify-between gap-2 text-xs">
                  <span className="text-muted-foreground">{option.name}</span>
                  <OptionPicker taskId={taskId} option={option} />
                </li>
              ))}
            </ul>
          </PopoverContent>
        </Popover>
      )}
    </>
  );
}
