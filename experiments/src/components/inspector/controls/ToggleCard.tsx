import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { Switch, type SwitchTone } from './Switch';

interface ToggleCardProps {
  title: string;
  description?: string;
  icon?: LucideIcon;
  checked: boolean;
  onChange: (checked: boolean) => void;
  tone?: SwitchTone;
  /** Shown below the header while the card is switched on. */
  children?: ReactNode;
}

export function ToggleCard({
  title,
  description,
  icon: Icon,
  checked,
  onChange,
  tone,
  children,
}: ToggleCardProps) {
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-white/10 bg-white/5 p-2.5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          {Icon && <Icon className="h-3.5 w-3.5 shrink-0 text-[var(--inspector-accent)]" />}
          <div className="flex min-w-0 flex-col">
            <span className="text-xs font-medium text-slate-200">{title}</span>
            {description && <span className="text-[10px] text-slate-400">{description}</span>}
          </div>
        </div>
        <Switch checked={checked} onChange={onChange} label={title} tone={tone} />
      </div>
      {checked && children && (
        <div className="flex flex-col gap-2.5 border-t border-white/10 pt-2">{children}</div>
      )}
    </div>
  );
}
