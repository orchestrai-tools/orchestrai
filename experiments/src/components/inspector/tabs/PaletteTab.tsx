import { computePalette } from '../../../lib/palette';
import { HUE_PRESETS, findCrystal } from '../../../settings/presets';
import { useSettingsActions, useSettingsSlice } from '../../../settings/store';
import type { HarmonyMode, PaletteSettings } from '../../../settings/types';
import { ChoiceGroup } from '../controls/ChoiceGroup';
import { RangeField } from '../controls/RangeField';
import { Stack } from '../controls/Stack';

const HUE_TRACK = {
  background:
    'linear-gradient(to right, #f00 0%, #ff0 17%, #0f0 33%, #0ff 50%, #00f 67%, #f0f 83%, #f00 100%)',
};

const HARMONY_OPTIONS: readonly { value: HarmonyMode; label: string }[] = [
  { value: 'monochrome', label: 'Tonal' },
  { value: 'analogous', label: 'Analogous' },
  { value: 'complementary', label: 'Complementary' },
];

export function PaletteTab() {
  const palette = useSettingsSlice('palette');
  const border = useSettingsSlice('border');
  const lightsaber = useSettingsSlice('lightsaber');
  const { update } = useSettingsActions();
  const setPalette = (patch: Partial<PaletteSettings>) => update('palette', patch);
  const colors = computePalette(palette);

  const borderSwatch = lightsaber.enabled
    ? findCrystal(lightsaber.crystalId).color
    : border.useCustomColor
      ? border.customColor
      : colors.borderHover;

  const swatches = [
    { label: 'Left', color: colors.bgSidebarLeft },
    { label: 'Main', color: colors.bgMain },
    { label: 'Right', color: colors.bgSidebarRight },
    { label: lightsaber.enabled ? 'Saber' : 'Border', color: borderSwatch },
  ];

  return (
    <Stack>
      <RangeField
        label="Harmonious hue"
        value={palette.hue}
        min={0}
        max={360}
        onChange={(hue) => setPalette({ hue })}
        format={(v) => `${v}°`}
        trackStyle={HUE_TRACK}
      />
      <ChoiceGroup
        label="Harmony"
        options={HARMONY_OPTIONS}
        value={palette.harmony}
        onChange={(harmony) => setPalette({ harmony })}
        columns={3}
      />
      <RangeField
        label="Surface tint depth"
        value={palette.saturation}
        min={2}
        max={45}
        onChange={(saturation) => setPalette({ saturation })}
        format={(v) => `${v}%`}
      />

      <div className="flex flex-col gap-1.5">
        <span className="text-[11px] font-medium text-slate-400">Presets</span>
        <div className="flex flex-wrap gap-1.5">
          {HUE_PRESETS.map((preset) => (
            <button
              key={preset.name}
              type="button"
              onClick={() => setPalette({ hue: preset.hue })}
              className={`rounded-full border px-2 py-0.5 text-[10px] transition-colors ${
                Math.abs(palette.hue - preset.hue) <= 4
                  ? 'border-[var(--inspector-accent)] bg-white/10 text-white'
                  : 'border-white/10 text-slate-400 hover:text-slate-200'
              }`}
            >
              {preset.name}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-4 gap-1.5 border-t border-white/10 pt-2 text-center font-mono text-[9px]">
        {swatches.map((swatch) => (
          <div key={swatch.label} className="flex flex-col items-center gap-1">
            <div
              className="h-4 w-full rounded border border-white/20"
              style={{ backgroundColor: swatch.color }}
            />
            <span className="text-slate-400">{swatch.label}</span>
          </div>
        ))}
      </div>
    </Stack>
  );
}
