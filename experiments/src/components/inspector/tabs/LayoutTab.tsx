import { Link2, PanelLeftClose } from 'lucide-react';
import { EASING_OPTIONS } from '../../../settings/presets';
import { LAYOUT_LIMITS } from '../../../settings/defaults';
import { useSettingsActions, useSettingsSlice } from '../../../settings/store';
import type { LayoutSettings, Side, SidebarSettings } from '../../../settings/types';
import { ChoiceGroup } from '../controls/ChoiceGroup';
import { RangeField } from '../controls/RangeField';
import { Note, Stack } from '../controls/Stack';
import { ToggleCard } from '../controls/ToggleCard';

const formatAngle = (v: number) =>
  v === 0 ? '0° (vertical)' : `${Math.abs(v)}° ${v > 0 ? 'out' : 'in'}`;

function SidebarGeometryFields({
  title,
  sidebar,
  onChange,
}: {
  title: string;
  sidebar: SidebarSettings;
  onChange: (patch: Partial<SidebarSettings>) => void;
}) {
  return (
    <div className="flex flex-col gap-2.5 rounded-xl border border-white/10 bg-white/5 p-2.5">
      <span className="text-xs font-medium text-slate-200">{title}</span>
      <RangeField
        label="Width"
        value={sidebar.widthPx}
        min={LAYOUT_LIMITS.minWidthPx}
        max={LAYOUT_LIMITS.maxWidthPx}
        onChange={(widthPx) => onChange({ widthPx })}
        format={(v) => `${v}px`}
      />
      <RangeField
        label="Edge angle"
        value={sidebar.angleDeg}
        min={-LAYOUT_LIMITS.maxAngleDeg}
        max={LAYOUT_LIMITS.maxAngleDeg}
        step={0.5}
        onChange={(angleDeg) => onChange({ angleDeg })}
        format={formatAngle}
        hint="Out leans the edge toward the content at the top; in leans it back"
      />
    </div>
  );
}

export function LayoutTab() {
  const layout = useSettingsSlice('layout');
  const { update, updateSidebar } = useSettingsActions();
  const setLayout = (patch: Partial<LayoutSettings>) => update('layout', patch);
  const sides: readonly { side: Side; title: string }[] = [
    { side: 'left', title: 'Left sidebar' },
    { side: 'right', title: 'Right sidebar' },
  ];

  return (
    <Stack>
      <ToggleCard
        title="Link sidebars"
        description={layout.linked ? 'Width and angle change together' : 'Each sidebar is tuned on its own'}
        icon={Link2}
        checked={layout.linked}
        onChange={(linked) => setLayout({ linked })}
      />

      {layout.linked ? (
        <SidebarGeometryFields
          title="Both sidebars"
          sidebar={layout.left}
          onChange={(patch) => updateSidebar('left', patch)}
        />
      ) : (
        sides.map(({ side, title }) => (
          <SidebarGeometryFields
            key={side}
            title={title}
            sidebar={layout[side]}
            onChange={(patch) => updateSidebar(side, patch)}
          />
        ))
      )}

      {sides.map(({ side, title }) => (
        <ToggleCard
          key={side}
          title={`Collapse ${title.toLowerCase()}`}
          description={layout[side].collapsed ? 'Collapsed to the rail' : 'Open'}
          icon={PanelLeftClose}
          checked={layout[side].collapsed}
          onChange={(collapsed) => updateSidebar(side, { collapsed })}
        />
      ))}

      <RangeField
        label="Collapsed rail width"
        value={layout.collapsedWidthPx}
        min={0}
        max={LAYOUT_LIMITS.maxCollapsedWidthPx}
        onChange={(collapsedWidthPx) => setLayout({ collapsedWidthPx })}
        format={(v) => (v === 0 ? '0px (edge only)' : `${v}px`)}
      />
      <RangeField
        label="Collapse duration"
        value={layout.collapseDurationMs}
        min={0}
        max={800}
        step={20}
        onChange={(collapseDurationMs) => setLayout({ collapseDurationMs })}
        format={(v) => `${v}ms`}
      />
      <ChoiceGroup
        label="Collapse curve"
        options={EASING_OPTIONS}
        value={layout.collapseEasing}
        onChange={(collapseEasing) => setLayout({ collapseEasing })}
      />

      <Note>
        Click an edge to collapse or expand it, drag it to resize, or focus it with Tab and use
        Enter and the arrow keys. Edges straighten while collapsed and keep their border,
        ripple, magnet, and badge.
      </Note>
    </Stack>
  );
}
