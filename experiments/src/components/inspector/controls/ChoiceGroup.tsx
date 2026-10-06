import { useId } from 'react';
import type { LucideIcon } from 'lucide-react';
import { ToggleGroup } from 'radix-ui';
import { cn } from '../../../lib/cn';

export interface ChoiceOption<T extends string | number> {
  value: T;
  label: string;
  icon?: LucideIcon;
}

const COLUMN_CLASS = {
  2: 'grid-cols-2',
  3: 'grid-cols-3',
  4: 'grid-cols-4',
  5: 'grid-cols-5',
  6: 'grid-cols-6',
} as const;

interface ChoiceGroupProps<T extends string | number> {
  label?: string;
  options: readonly ChoiceOption<T>[];
  value: T;
  onChange: (value: T) => void;
  columns?: keyof typeof COLUMN_CLASS;
  hint?: string;
}

/** Single-select button grid. Options are keyed by label because preset values can coincide. */
export function ChoiceGroup<T extends string | number>({
  label,
  options,
  value,
  onChange,
  columns = 4,
  hint,
}: ChoiceGroupProps<T>) {
  const labelId = useId();
  const selected = options.find((option) => option.value === value)?.label ?? '';

  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <span id={labelId} className="text-xs font-medium text-slate-300">
          {label}
        </span>
      )}
      <ToggleGroup.Root
        type="single"
        value={selected}
        onValueChange={(nextLabel) => {
          const option = options.find((candidate) => candidate.label === nextLabel);
          if (option) onChange(option.value);
        }}
        aria-labelledby={label ? labelId : undefined}
        className={cn('grid gap-1', COLUMN_CLASS[columns])}
      >
        {options.map(({ label: optionLabel, icon: Icon }) => (
          <ToggleGroup.Item
            key={optionLabel}
            value={optionLabel}
            className="flex flex-col items-center justify-center gap-1 rounded-md border border-white/5 bg-white/5 px-1 py-1 text-center text-[10px] font-medium text-slate-400 transition-colors outline-none hover:text-white focus-visible:ring-2 focus-visible:ring-white/40 data-[state=on]:border-[var(--inspector-accent)] data-[state=on]:bg-white/10 data-[state=on]:text-white"
          >
            {Icon && <Icon className="h-4 w-4" />}
            <span className="truncate leading-tight">{optionLabel}</span>
          </ToggleGroup.Item>
        ))}
      </ToggleGroup.Root>
      {hint && <span className="text-[10px] text-slate-400">{hint}</span>}
    </div>
  );
}
