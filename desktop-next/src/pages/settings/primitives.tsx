import { Button } from "@warpforge/ui/components/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@warpforge/ui/components/collapsible";
import { Switch } from "@warpforge/ui/components/switch";
import { ToggleGroup, ToggleGroupItem } from "@warpforge/ui/components/toggle-group";
import { cn } from "@warpforge/ui/lib/utils";
import { ChevronDownIcon, ChevronRightIcon } from "lucide-react";
import { useId, useState, type ReactNode } from "react";
import { SectionLabel } from "../../components/common/page-toolbar";

/** The selected section's own header: what it covers and where its values are stored. */
export function SectionHeader({
  title,
  scope,
  children,
}: {
  title: string;
  scope: ReactNode;
  children?: ReactNode;
}) {
  return (
    <header className="flex items-start gap-4 pb-6">
      <div className="min-w-0 flex-1">
        <h2 className="text-sm font-semibold">{title}</h2>
        <p className="text-xs text-muted-foreground">{scope}</p>
      </div>
      {children}
    </header>
  );
}

/** A titled group of rows. Groups are told apart by space; rows by a soft rule. */
export function Group({
  title,
  note,
  children,
  className,
}: {
  title?: string;
  note?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("pb-8 last:pb-0", className)}>
      {title && <SectionLabel className="pb-1">{title}</SectionLabel>}
      <div className="divide-y divide-border/60">{children}</div>
      {note && <p className="pt-2 text-xs text-muted-foreground">{note}</p>}
    </section>
  );
}

/** One setting: what it is and what it does in one line, the control at the right. */
export function Row({
  title,
  description,
  control,
  htmlFor,
  children,
}: {
  title: ReactNode;
  description?: ReactNode;
  control?: ReactNode;
  htmlFor?: string;
  children?: ReactNode;
}) {
  const text = (
    <>
      <span className="block text-sm font-medium">{title}</span>
      {description && <span className="block text-xs text-muted-foreground">{description}</span>}
    </>
  );
  return (
    <div className="py-[calc(var(--row-py)+0.25rem)]">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        {htmlFor ? (
          <label htmlFor={htmlFor} className="min-w-0 flex-[1_1_16rem]">
            {text}
          </label>
        ) : (
          <div className="min-w-0 flex-[1_1_16rem]">{text}</div>
        )}
        {control && (
          <div className="ml-auto flex shrink-0 flex-wrap items-center justify-end gap-2">
            {control}
          </div>
        )}
      </div>
      {children && <div className="pt-2">{children}</div>}
    </div>
  );
}

/** A row whose control is an on/off switch. */
export function SwitchRow({
  title,
  description,
  checked,
  onChange,
  disabled,
}: {
  title: ReactNode;
  description: ReactNode;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <Row
      title={title}
      description={description}
      htmlFor={id}
      control={<Switch id={id} checked={checked} onCheckedChange={onChange} disabled={disabled} />}
    />
  );
}

/** A segmented control for two to four answers that are all worth seeing at once. */
export function Choice<T extends string>({
  value,
  options,
  onChange,
  label,
  disabled,
}: {
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (value: T) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <ToggleGroup
      type="single"
      variant="outline"
      size="sm"
      spacing={0}
      value={value}
      disabled={disabled}
      aria-label={label}
      onValueChange={(next) => next && onChange(next as T)}
    >
      {options.map((option) => (
        <ToggleGroupItem key={option.value} value={option.value} className="px-2.5 text-xs">
          {option.label}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}

/** A number with minus and plus, clamped to its range. */
export function Stepper({
  value,
  min,
  max,
  step = 1,
  onChange,
  suffix,
  label,
  disabled,
}: {
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
  suffix?: string;
  label: string;
  disabled?: boolean;
}) {
  return (
    <div
      className={cn("flex items-center", disabled && "opacity-50")}
      role="group"
      aria-label={label}
    >
      <Button
        variant="outline"
        size="icon-sm"
        className="rounded-r-none"
        disabled={disabled || value <= min}
        onClick={() => onChange(Math.max(min, value - step))}
        aria-label={`Less ${label}`}
      >
        −
      </Button>
      <span className="flex h-7 min-w-16 items-center justify-center border-y px-2 text-xs tabular-nums">
        {value}
        {suffix}
      </span>
      <Button
        variant="outline"
        size="icon-sm"
        className="rounded-l-none"
        disabled={disabled || value >= max}
        onClick={() => onChange(Math.min(max, value + step))}
        aria-label={`More ${label}`}
      >
        +
      </Button>
    </div>
  );
}

/** Rare settings stay one click away, with the way to them always visible. */
export function Advanced({
  label = "Advanced",
  children,
}: {
  label?: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Collapsible open={open} onOpenChange={setOpen} className="pb-8 last:pb-0">
      <CollapsibleTrigger asChild>
        <Button variant="ghost" size="sm" className="-ml-2 text-xs text-muted-foreground">
          {open ? <ChevronDownIcon /> : <ChevronRightIcon />}
          {label}
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent className="pt-2">{children}</CollapsibleContent>
    </Collapsible>
  );
}

/** A load or save failure in place, with a way to try again. */
export function ErrorLine({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <p className="flex items-center gap-2 py-2 text-xs text-red-600 dark:text-red-400" role="alert">
      <span className="min-w-0 flex-1">{message}</span>
      {onRetry && (
        <Button variant="ghost" size="xs" className="text-xs" onClick={onRetry}>
          Retry
        </Button>
      )}
    </p>
  );
}

/** A quiet line for loading and empty states inside a group. */
export function Quiet({ children }: { children: ReactNode }) {
  return (
    <p className="py-[calc(var(--row-py)+0.25rem)] text-xs text-muted-foreground">{children}</p>
  );
}

/** The shared select, sized for a settings row. */
export const ROW_SELECT = "h-7 min-w-36 text-xs";

export function fail(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback;
}
