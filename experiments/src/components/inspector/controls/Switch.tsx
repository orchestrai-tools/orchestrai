import { cva, type VariantProps } from 'class-variance-authority';
import { Switch as SwitchPrimitive } from 'radix-ui';

const switchRoot = cva(
  'relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent bg-slate-700 transition-colors duration-200 outline-none focus-visible:ring-2 focus-visible:ring-white/40',
  {
    variants: {
      tone: {
        accent: 'data-[state=checked]:bg-[var(--inspector-accent)]',
        warning: 'data-[state=checked]:bg-amber-400',
        danger: 'data-[state=checked]:bg-rose-500',
      },
    },
    defaultVariants: { tone: 'accent' },
  },
);

export type SwitchTone = NonNullable<VariantProps<typeof switchRoot>['tone']>;

interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  tone?: SwitchTone;
}

export function Switch({ checked, onChange, label, tone }: SwitchProps) {
  return (
    <SwitchPrimitive.Root
      checked={checked}
      onCheckedChange={onChange}
      aria-label={label}
      className={switchRoot({ tone })}
    >
      <SwitchPrimitive.Thumb className="pointer-events-none block h-4 w-4 rounded-full bg-white shadow-md transition-transform duration-200 data-[state=checked]:translate-x-4" />
    </SwitchPrimitive.Root>
  );
}
