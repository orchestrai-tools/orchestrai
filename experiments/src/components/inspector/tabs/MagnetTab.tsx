import { Layers, Magnet, Scissors } from 'lucide-react';
import { useWindowSize } from 'usehooks-ts';
import { useSettingsActions, useSettingsSlice } from '../../../settings/store';
import type { InsetIconSettings, InsetShape, MagnetSettings } from '../../../settings/types';
import { ChoiceGroup } from '../controls/ChoiceGroup';
import { RangeField } from '../controls/RangeField';
import { Stack } from '../controls/Stack';
import { ToggleCard } from '../controls/ToggleCard';
import { ExtrusionPreview } from './ExtrusionPreview';

const INSET_SHAPES: readonly { value: InsetShape; label: string }[] = [
  { value: 'arrow', label: 'Arrow' },
  { value: 'chevron', label: 'Chevron' },
  { value: 'notch', label: 'Slit' },
  { value: 'circle', label: 'Punch hole' },
  { value: 'grip', label: 'Grip' },
  { value: 'diamond', label: 'Diamond' },
];

const INSET_MODES = [
  { value: 'deboss', label: 'Debossed', icon: Layers },
  { value: 'cut', label: 'Cut-through', icon: Scissors },
] as const;

export function MagnetTab() {
  const magnet = useSettingsSlice('magnet');
  const { update } = useSettingsActions();
  const viewport = useWindowSize();
  const setMagnet = (patch: Partial<MagnetSettings>) => update('magnet', patch);
  const setInset = (patch: Partial<InsetIconSettings>) =>
    setMagnet({ inset: { ...magnet.inset, ...patch } });

  const halfCircle = Math.round(magnet.heightPx / 2);
  const formatCorner = (v: number) =>
    v === 0 ? '0px (sharp)' : v >= halfCircle ? `${halfCircle}px (half circle)` : `${v}px`;

  const heightPresets = [
    { value: 5, label: '5' },
    { value: 10, label: '10' },
    { value: 45, label: '45' },
    { value: 90, label: '90' },
    { value: Math.round(viewport.height / 2), label: 'Half' },
    { value: viewport.height, label: 'Full' },
  ];
  const cornerPresets = [
    { value: 0, label: 'Sharp' },
    { value: Math.min(6, halfCircle), label: 'Slight' },
    { value: Math.min(14, halfCircle), label: 'Round' },
    { value: halfCircle, label: 'Half circle' },
  ];

  return (
    <Stack>
      <ToggleCard
        title="Magnet mode"
        description={
          magnet.enabled ? 'The border pulls out into a tab toward the pointer' : 'Plain vertical edge'
        }
        icon={Magnet}
        checked={magnet.enabled}
        onChange={(enabled) => setMagnet({ enabled })}
      />

      {magnet.enabled && (
        <>
          <div className="rounded-xl border border-white/10 bg-black/40 p-2">
            <ExtrusionPreview settings={magnet} />
          </div>

          <RangeField
            label="Extrusion width"
            value={magnet.widthPx}
            min={6}
            max={64}
            onChange={(widthPx) => setMagnet({ widthPx })}
            format={(v) => `${v}px`}
          />

          <RangeField
            label="Extrusion height"
            value={Math.min(magnet.heightPx, viewport.height)}
            min={5}
            max={viewport.height}
            onChange={(heightPx) => setMagnet({ heightPx })}
            format={(v) => (v >= viewport.height ? `${v}px (full)` : `${v}px`)}
          />
          <ChoiceGroup
            options={heightPresets}
            value={magnet.heightPx}
            onChange={(heightPx) => setMagnet({ heightPx })}
            columns={6}
          />

          <RangeField
            label="Outer corner radius"
            value={Math.min(magnet.cornerRadiusPx, halfCircle)}
            min={0}
            max={halfCircle}
            onChange={(cornerRadiusPx) => setMagnet({ cornerRadiusPx })}
            format={formatCorner}
          />
          <ChoiceGroup
            options={cornerPresets}
            value={Math.min(magnet.cornerRadiusPx, halfCircle)}
            onChange={(cornerRadiusPx) => setMagnet({ cornerRadiusPx })}
          />

          <RangeField
            label="Merge radius (flare)"
            value={magnet.mergeRadiusPx}
            min={0}
            max={32}
            onChange={(mergeRadiusPx) => setMagnet({ mergeRadiusPx })}
            format={(v) => `${v}px`}
            hint="Concave curve where the tab leaves the sidebar"
          />
          <RangeField
            label="Magnetic pull range"
            value={magnet.proximityPx}
            min={0}
            max={160}
            step={5}
            onChange={(proximityPx) => setMagnet({ proximityPx })}
            format={(v) => (v === 0 ? '0px (touch only)' : `${v}px`)}
          />

          <ToggleCard
            title="Inset icon"
            description={magnet.inset.cutThrough ? 'Punched through the tab' : 'Engraved into the tab'}
            icon={Scissors}
            checked={magnet.inset.enabled}
            onChange={(enabled) => setInset({ enabled })}
          >
            <ChoiceGroup
              options={INSET_MODES}
              value={magnet.inset.cutThrough ? 'cut' : 'deboss'}
              onChange={(mode) => setInset({ cutThrough: mode === 'cut' })}
              columns={2}
            />
            <ChoiceGroup
              label="Shape"
              options={INSET_SHAPES}
              value={magnet.inset.shape}
              onChange={(shape) => setInset({ shape })}
              columns={3}
            />
            {!magnet.inset.cutThrough && (
              <RangeField
                label="Inset depth"
                value={magnet.inset.depthPercent}
                min={10}
                max={100}
                onChange={(depthPercent) => setInset({ depthPercent })}
                format={(v) => `${v}%`}
              />
            )}
            <RangeField
              label="Icon size"
              value={magnet.inset.sizePx}
              min={8}
              max={24}
              onChange={(sizePx) => setInset({ sizePx })}
              format={(v) => `${v}px`}
            />
            <RangeField
              label="Horizontal position"
              value={magnet.inset.offsetXPx}
              min={-24}
              max={24}
              onChange={(offsetXPx) => setInset({ offsetXPx })}
              format={(v) => (v === 0 ? '0px (centered)' : `${v > 0 ? '+' : ''}${v}px ${v > 0 ? 'out' : 'in'}`)}
              hint="Negative moves toward the sidebar, positive toward the content"
            />
            <RangeField
              label="Vertical position"
              value={magnet.inset.offsetYPx}
              min={-60}
              max={60}
              onChange={(offsetYPx) => setInset({ offsetYPx })}
              format={(v) => (v === 0 ? '0px (centered)' : `${v > 0 ? '+' : ''}${v}px ${v > 0 ? 'down' : 'up'}`)}
            />
          </ToggleCard>
        </>
      )}
    </Stack>
  );
}
