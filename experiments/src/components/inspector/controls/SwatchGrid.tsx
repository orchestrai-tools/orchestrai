import { useId } from 'react';
import { ToggleGroup } from 'radix-ui';

export interface Swatch {
  value: string;
  label: string;
  color: string;
}

interface SwatchGridProps {
  label?: string;
  swatches: readonly Swatch[];
  value: string;
  onChange: (value: string) => void;
  glowSelected?: boolean;
}

export function SwatchGrid({ label, swatches, value, onChange, glowSelected = false }: SwatchGridProps) {
  const labelId = useId();
  const selected = swatches.find((swatch) => swatch.value.toLowerCase() === value.toLowerCase())?.value ?? '';

  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <span id={labelId} className="text-[11px] font-medium text-slate-300">
          {label}
        </span>
      )}
      <ToggleGroup.Root
        type="single"
        value={selected}
        onValueChange={(next) => next && onChange(next)}
        aria-labelledby={label ? labelId : undefined}
        className="grid grid-cols-4 gap-1.5"
      >
        {swatches.map((swatch) => (
          <ToggleGroup.Item
            key={swatch.value}
            value={swatch.value}
            aria-label={swatch.label}
            className="group flex flex-col items-center gap-1 rounded-lg border border-white/10 bg-black/30 p-1 text-[10px] text-slate-400 transition-colors outline-none hover:border-white/30 focus-visible:ring-2 focus-visible:ring-white/40 data-[state=on]:border-white data-[state=on]:bg-white/15 data-[state=on]:text-white"
          >
            <span
              className="h-3 w-full rounded-md"
              style={{
                backgroundColor: swatch.color,
                boxShadow: glowSelected && swatch.value === selected ? `0 0 10px ${swatch.color}` : undefined,
              }}
            />
            <span className="w-full truncate text-center leading-none">{swatch.label}</span>
          </ToggleGroup.Item>
        ))}
      </ToggleGroup.Root>
    </div>
  );
}
