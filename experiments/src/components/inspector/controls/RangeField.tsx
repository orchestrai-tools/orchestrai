import { useId, type CSSProperties } from 'react';
import { Slider } from 'radix-ui';

interface RangeFieldProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
  format?: (value: number) => string;
  hint?: string;
  trackStyle?: CSSProperties;
}

export function RangeField({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
  format,
  hint,
  trackStyle,
}: RangeFieldProps) {
  const labelId = useId();
  const display = format ? format(value) : String(value);

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-2 text-xs">
        <span id={labelId} className="font-medium text-slate-300">
          {label}
        </span>
        <span className="font-mono text-[11px] text-slate-400" aria-hidden="true">
          {display}
        </span>
      </div>
      <Slider.Root
        className="relative flex h-4 w-full touch-none select-none items-center"
        value={[value]}
        min={min}
        max={max}
        step={step}
        onValueChange={([next]) => onChange(next)}
      >
        <Slider.Track
          className="relative h-1.5 grow overflow-hidden rounded-full bg-slate-700"
          style={trackStyle}
        >
          {!trackStyle && <Slider.Range className="absolute h-full bg-[var(--inspector-accent)]" />}
        </Slider.Track>
        <Slider.Thumb
          aria-labelledby={labelId}
          aria-valuetext={display}
          className="block h-3.5 w-3.5 rounded-full border border-white/40 bg-white shadow outline-none focus-visible:ring-2 focus-visible:ring-[var(--inspector-accent)]"
        />
      </Slider.Root>
      {hint && <span className="text-[10px] text-slate-400">{hint}</span>}
    </div>
  );
}
