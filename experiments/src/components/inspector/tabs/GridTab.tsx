import { useState } from 'react';
import { Grid3x3, Link2, Pin } from 'lucide-react';
import { useSettingsActions, useSettingsSlice } from '../../../settings/store';
import type { GridLayerSettings, GridRegion, GridRelief, GridSymbol } from '../../../settings/types';
import { ChoiceGroup } from '../controls/ChoiceGroup';
import { RangeField } from '../controls/RangeField';
import { Stack } from '../controls/Stack';
import { ToggleCard } from '../controls/ToggleCard';

const REGIONS: readonly { value: GridRegion; label: string }[] = [
  { value: 'left', label: 'Left sidebar' },
  { value: 'main', label: 'Center' },
  { value: 'right', label: 'Right sidebar' },
];

const SYMBOLS: readonly { value: GridSymbol; label: string }[] = [
  { value: 'dot', label: 'Dot' },
  { value: 'ring', label: 'Ring' },
  { value: 'plus', label: 'Plus' },
  { value: 'cross', label: 'Cross' },
  { value: 'square', label: 'Square' },
  { value: 'diamond', label: 'Diamond' },
];

const RELIEFS: readonly { value: GridRelief; label: string }[] = [
  { value: 'flat', label: 'Flat' },
  { value: 'raised', label: 'Raised' },
  { value: 'inset', label: 'Inset' },
];

function GridLayerFields({
  title,
  layer,
  onChange,
}: {
  title: string;
  layer: GridLayerSettings;
  onChange: (patch: Partial<GridLayerSettings>) => void;
}) {
  return (
    <ToggleCard
      title={title}
      description={layer.enabled ? 'Dotted grid on' : 'Plain surface'}
      icon={Grid3x3}
      checked={layer.enabled}
      onChange={(enabled) => onChange({ enabled })}
    >
      <ChoiceGroup
        label="Symbol"
        options={SYMBOLS}
        value={layer.symbol}
        onChange={(symbol) => onChange({ symbol })}
        columns={6}
      />
      <RangeField
        label="Visibility"
        value={layer.opacityPercent}
        min={2}
        max={60}
        onChange={(opacityPercent) => onChange({ opacityPercent })}
        format={(v) => `${v}%`}
        hint="Lower is more subtle"
      />
      <RangeField
        label="Spacing"
        value={layer.spacingPx}
        min={6}
        max={64}
        onChange={(spacingPx) => onChange({ spacingPx })}
        format={(v) => `${v}px`}
      />
      <RangeField
        label="Symbol size"
        value={layer.sizePx}
        min={1}
        max={12}
        step={0.5}
        onChange={(sizePx) => onChange({ sizePx })}
        format={(v) => `${v}px`}
      />
      <ChoiceGroup
        label="Relief"
        options={RELIEFS}
        value={layer.relief}
        onChange={(relief) => onChange({ relief })}
        columns={3}
        hint="Raised and inset are lit from the top left"
      />
      {layer.relief !== 'flat' && (
        <RangeField
          label="Relief depth"
          value={layer.reliefPx}
          min={0.25}
          max={3}
          step={0.25}
          onChange={(reliefPx) => onChange({ reliefPx })}
          format={(v) => `${v}px`}
        />
      )}
    </ToggleCard>
  );
}

export function GridTab() {
  const grid = useSettingsSlice('grid');
  const { update, updateGrid, setGridLinked } = useSettingsActions();
  const [region, setRegion] = useState<GridRegion>('main');
  const regionLabel = REGIONS.find((option) => option.value === region)?.label ?? '';

  return (
    <Stack>
      <ToggleCard
        title="Link regions"
        description={
          grid.linked ? 'Both sidebars and the center share one grid' : 'Each region is tuned on its own'
        }
        icon={Link2}
        checked={grid.linked}
        onChange={(linked) => setGridLinked(linked, region)}
      />
      <ToggleCard
        title="Pin to window"
        description={
          grid.pinned ? 'Symbols stay put while sidebars resize' : 'Symbols move with each panel'
        }
        icon={Pin}
        checked={grid.pinned}
        onChange={(pinned) => update('grid', { pinned })}
      />

      {!grid.linked && (
        <ChoiceGroup label="Region" options={REGIONS} value={region} onChange={setRegion} columns={3} />
      )}

      <GridLayerFields
        title={grid.linked ? 'All regions' : regionLabel}
        layer={grid[region]}
        onChange={(patch) => updateGrid(region, patch)}
      />
    </Stack>
  );
}
