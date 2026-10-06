import { useRef, useState, type ComponentType } from 'react';
import {
  Activity,
  Grid3x3,
  Magnet,
  MousePointerClick,
  Palette,
  PanelLeft,
  RotateCcw,
  SlidersHorizontal,
  Sparkles,
  Waves,
  X,
  type LucideIcon,
} from 'lucide-react';
import { m } from 'motion/react';
import { Popover, Tabs } from 'radix-ui';
import { useSettingsActions } from '../../settings/store';
import { BorderTab } from './tabs/BorderTab';
import { GridTab } from './tabs/GridTab';
import { LayoutTab } from './tabs/LayoutTab';
import { MagnetTab } from './tabs/MagnetTab';
import { PaletteTab } from './tabs/PaletteTab';
import { PointerTab } from './tabs/PointerTab';
import { RippleTab } from './tabs/RippleTab';

interface InspectorTab {
  id: string;
  label: string;
  icon: LucideIcon;
  Panel: ComponentType;
}

const TABS: readonly InspectorTab[] = [
  { id: 'border', label: 'Border', icon: Activity, Panel: BorderTab },
  { id: 'ripple', label: 'Ripple', icon: Waves, Panel: RippleTab },
  { id: 'magnet', label: 'Magnet', icon: Magnet, Panel: MagnetTab },
  { id: 'pointer', label: 'Pointer', icon: MousePointerClick, Panel: PointerTab },
  { id: 'layout', label: 'Layout', icon: PanelLeft, Panel: LayoutTab },
  { id: 'grid', label: 'Grid', icon: Grid3x3, Panel: GridTab },
  { id: 'palette', label: 'Palette', icon: SlidersHorizontal, Panel: PaletteTab },
];

const iconButton =
  'rounded p-1 text-slate-400 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40';

export function FloatingInspector() {
  const { reset } = useSettingsActions();
  const [open, setOpen] = useState(false);
  const [activeTab, setActiveTab] = useState(TABS[0].id);
  const boundsRef = useRef<HTMLDivElement>(null);

  return (
    <Popover.Root open={open} onOpenChange={setOpen} modal={false}>
      <div ref={boundsRef} className="inspector-bounds">
        <Popover.Anchor asChild>
          <m.button
            type="button"
            className="inspector-trigger"
            aria-label="Customize theme and layout"
            aria-expanded={open}
            title="Drag to move, click to customize"
            drag
            dragMomentum={false}
            dragElastic={0}
            dragConstraints={boundsRef}
            whileTap={{ scale: 0.95 }}
            onTap={() => setOpen((value) => !value)}
          >
            <Palette className="inspector-trigger__icon" />
          </m.button>
        </Popover.Anchor>
      </div>

      <Popover.Content
        side="right"
        align="center"
        sideOffset={12}
        collisionPadding={16}
        updatePositionStrategy="always"
        onOpenAutoFocus={(event) => event.preventDefault()}
        onInteractOutside={(event) => event.preventDefault()}
        className="inspector-panel z-50 flex w-[var(--inspector-panel-width)] max-w-[calc(100vw-32px)] flex-col gap-3 rounded-2xl border p-4 text-slate-100 shadow-2xl backdrop-blur-xl"
        aria-label="Design and motion tuner"
      >
        <header className="flex shrink-0 items-center justify-between border-b border-white/10 pb-2">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-[var(--inspector-accent)]" />
            <h2 className="text-xs font-semibold tracking-wide">Design & Motion Tuner</h2>
          </div>
          <div className="flex items-center gap-1">
            <button type="button" onClick={reset} className={iconButton} aria-label="Reset to defaults" title="Reset to defaults">
              <RotateCcw className="h-3.5 w-3.5" />
            </button>
            <Popover.Close className={iconButton} aria-label="Close tuner">
              <X className="h-4 w-4" />
            </Popover.Close>
          </div>
        </header>

        <Tabs.Root value={activeTab} onValueChange={setActiveTab} className="flex min-h-0 flex-col gap-3">
          <Tabs.List
            aria-label="Tuner sections"
            className="grid shrink-0 grid-cols-4 gap-0.5 rounded-lg border border-white/10 bg-black/40 p-0.5 text-xs font-medium"
          >
            {TABS.map(({ id, label, icon: Icon }) => (
              <Tabs.Trigger
                key={id}
                value={id}
                className="flex items-center justify-center gap-1 rounded-md px-1 py-1 text-slate-400 transition-colors outline-none hover:text-slate-200 focus-visible:ring-2 focus-visible:ring-white/40 data-[state=active]:bg-white/15 data-[state=active]:text-white data-[state=active]:shadow-sm"
              >
                <Icon className="h-3 w-3 text-[var(--inspector-accent)]" />
                <span className="truncate">{label}</span>
              </Tabs.Trigger>
            ))}
          </Tabs.List>

          {TABS.map(({ id, Panel }) => (
            <Tabs.Content key={id} value={id} className="inspector-scroll pr-1 outline-none">
              <Panel />
            </Tabs.Content>
          ))}
        </Tabs.Root>
      </Popover.Content>
    </Popover.Root>
  );
}
