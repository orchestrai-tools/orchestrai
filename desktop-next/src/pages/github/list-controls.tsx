import { Button } from "@warpforge/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@warpforge/ui/components/dropdown-menu";
import { Skeleton } from "@warpforge/ui/components/skeleton";
import { cn } from "@warpforge/ui/lib/utils";
import { ChevronDownIcon, SearchIcon } from "lucide-react";
import type { ReactNode } from "react";

export interface Option<T extends string> {
  value: T;
  label: string;
  hint?: string;
  disabled?: boolean;
}

/** The search box at the head of a list. */
export function SearchField({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  return (
    <label className="flex h-7 w-56 items-center gap-2 rounded-md border bg-background px-2 text-sm focus-within:ring-2 focus-within:ring-ring/50">
      <SearchIcon className="size-3.5 shrink-0 text-muted-foreground" />
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className="min-w-0 flex-1 bg-transparent text-xs outline-none placeholder:text-muted-foreground"
      />
    </label>
  );
}

/**
 * One filter, named for what it narrows. It reads quiet until it is set, and
 * then says what it is set to, so a narrowed list never hides why.
 */
export function FilterMenu<T extends string>({
  label,
  value,
  options,
  onChange,
  idle,
}: {
  label: string;
  value: T;
  options: (Option<T> | "separator")[];
  onChange: (value: T) => void;
  /** The value that means "not filtering". */
  idle: T;
}) {
  const current = options.find(
    (option): option is Option<T> => option !== "separator" && option.value === value,
  );
  const active = value !== idle;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="xs"
          className={cn("text-xs", active ? "bg-muted text-foreground" : "text-muted-foreground")}
        >
          {active ? `${label}: ${current?.label ?? value}` : label}
          <ChevronDownIcon />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        <DropdownMenuLabel>{label}</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={value} onValueChange={(next) => onChange(next as T)}>
          {options.map((option, index) =>
            option === "separator" ? (
              <DropdownMenuSeparator key={`separator-${index}`} />
            ) : (
              <DropdownMenuRadioItem
                key={option.value}
                value={option.value}
                disabled={option.disabled}
              >
                <span className="truncate">{option.label}</span>
                {option.hint && (
                  <span className="ml-auto text-xs text-muted-foreground">{option.hint}</span>
                )}
              </DropdownMenuRadioItem>
            ),
          )}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** The row of narrowing controls under a page's toolbar: search, filters, then sort at the far end. */
export function FilterBar({
  children,
  sort,
  onReset,
}: {
  children: ReactNode;
  sort?: ReactNode;
  onReset?: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5 px-4 pb-2">
      {children}
      {onReset && (
        <Button
          variant="ghost"
          size="xs"
          className="text-xs text-muted-foreground"
          onClick={onReset}
        >
          Reset
        </Button>
      )}
      {sort && <div className="ml-auto flex items-center gap-1">{sort}</div>}
    </div>
  );
}

/** A failed load, said plainly, with the one action that helps. */
export function LoadError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <p className="mx-4 mb-2 flex items-center gap-2 rounded-md border border-red-500/30 bg-red-500/5 px-3 py-2 text-xs text-red-600 dark:text-red-400">
      <span className="min-w-0 flex-1">{message}</span>
      <Button variant="ghost" size="xs" onClick={onRetry}>
        Retry
      </Button>
    </p>
  );
}

/** Placeholder rows while a list loads. */
export function ListSkeletonRows({ label }: { label: string }) {
  return (
    <div role="status" aria-label={label} className="flex flex-col gap-2 px-2 py-2">
      {[0, 1, 2, 3, 4].map((index) => (
        <div key={index} className="flex flex-col gap-1.5 px-2 py-1">
          <Skeleton className="h-3.5 w-2/3 rounded-sm" />
          <Skeleton className="h-3 w-1/3 rounded-sm" />
        </div>
      ))}
    </div>
  );
}
