import { Eye, EyeOff, Paintbrush, Sword } from 'lucide-react';
import {
  BORDER_COLOR_PRESETS,
  EASING_OPTIONS,
  LIGHTSABER_CRYSTALS,
} from '../../../settings/presets';
import { useSettingsActions, useSettingsSlice } from '../../../settings/store';
import type { BorderSettings, LineStyle } from '../../../settings/types';
import { ChoiceGroup } from '../controls/ChoiceGroup';
import { RangeField } from '../controls/RangeField';
import { Stack } from '../controls/Stack';
import { SwatchGrid } from '../controls/SwatchGrid';
import { ToggleCard } from '../controls/ToggleCard';

const LINE_STYLE_OPTIONS: readonly { value: LineStyle; label: string }[] = [
  { value: 'full', label: 'Full track' },
  { value: 'center-rail', label: 'Center rail' },
  { value: 'soft-glow', label: 'Soft glow' },
];

const CRYSTAL_SWATCHES = LIGHTSABER_CRYSTALS.map((crystal) => ({
  value: crystal.id,
  label: crystal.name,
  color: crystal.color,
}));

const BORDER_SWATCHES = BORDER_COLOR_PRESETS.map((preset) => ({
  value: preset.color,
  label: preset.name,
  color: preset.color,
}));

export function BorderTab() {
  const border = useSettingsSlice('border');
  const lightsaber = useSettingsSlice('lightsaber');
  const { update } = useSettingsActions();
  const setBorder = (patch: Partial<BorderSettings>) => update('border', patch);

  return (
    <Stack>
      <ToggleCard
        title="Hide border"
        description={border.hidden ? 'Resting line is hidden' : 'Resting line is visible'}
        icon={border.hidden ? EyeOff : Eye}
        tone="danger"
        checked={border.hidden}
        onChange={(hidden) => setBorder({ hidden })}
      />

      <ToggleCard
        title="Custom border color"
        description={border.useCustomColor ? 'Manual override' : 'Follows the palette hue'}
        icon={Paintbrush}
        checked={border.useCustomColor}
        onChange={(useCustomColor) => setBorder({ useCustomColor })}
      >
        <label className="flex items-center gap-2 text-xs text-slate-300">
          <input
            type="color"
            value={border.customColor}
            onChange={(event) => setBorder({ customColor: event.target.value })}
            className="h-6 w-6 cursor-pointer rounded border border-white/20 bg-transparent p-0"
          />
          <span className="font-mono">{border.customColor}</span>
        </label>
        <SwatchGrid
          swatches={BORDER_SWATCHES}
          value={border.customColor}
          onChange={(customColor) => setBorder({ customColor })}
        />
      </ToggleCard>

      <ToggleCard
        title="Show on hover only"
        description={border.hoverOnly ? 'Line reveals while hovering the edge' : 'Line is always visible'}
        checked={border.hoverOnly}
        onChange={(hoverOnly) => setBorder({ hoverOnly })}
      />

      <ToggleCard
        title="Lightsaber mode"
        description={lightsaber.enabled ? 'Plasma blade and kyber glow' : 'Standard border hue'}
        icon={Sword}
        tone="warning"
        checked={lightsaber.enabled}
        onChange={(enabled) => update('lightsaber', { enabled })}
      >
        <SwatchGrid
          label="Kyber crystal"
          swatches={CRYSTAL_SWATCHES}
          value={lightsaber.crystalId}
          onChange={(crystalId) => update('lightsaber', { crystalId })}
          glowSelected
        />
      </ToggleCard>

      <RangeField
        label="Border track width"
        value={border.widthPx}
        min={2}
        max={32}
        onChange={(widthPx) => setBorder({ widthPx })}
        format={(v) => `${v}px`}
      />
      <RangeField
        label="Grab area"
        value={border.hitTargetPx}
        min={4}
        max={40}
        onChange={(hitTargetPx) => setBorder({ hitTargetPx })}
        format={(v) => `${v}px`}
        hint="Pointer target around the track; never narrower than the track itself"
      />

      <ChoiceGroup
        label="Line style"
        options={LINE_STYLE_OPTIONS}
        value={border.lineStyle}
        onChange={(lineStyle) => setBorder({ lineStyle })}
        columns={3}
      />

      <div className="grid grid-cols-2 gap-2.5">
        <RangeField
          label="Entrance"
          value={border.fadeInMs}
          min={50}
          max={500}
          step={10}
          onChange={(fadeInMs) => setBorder({ fadeInMs })}
          format={(v) => `${v}ms`}
        />
        <RangeField
          label="Exit decay"
          value={border.fadeOutMs}
          min={100}
          max={1000}
          step={20}
          onChange={(fadeOutMs) => setBorder({ fadeOutMs })}
          format={(v) => `${v}ms`}
        />
      </div>

      <ChoiceGroup
        label="Transition curve"
        options={EASING_OPTIONS}
        value={border.easing}
        onChange={(easing) => setBorder({ easing })}
      />

      <RangeField
        label="Ambient glow bloom"
        value={border.glowBlurPx}
        min={0}
        max={24}
        onChange={(glowBlurPx) => setBorder({ glowBlurPx })}
        format={(v) => (v === 0 ? '0px (off)' : `${v}px`)}
      />
    </Stack>
  );
}
