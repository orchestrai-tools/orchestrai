import {
  ChevronsLeftRight,
  Columns2,
  EyeOff,
  GripVertical,
  MoreVertical,
  MousePointerClick,
  MoveHorizontal,
  Pin,
  Sparkles,
} from 'lucide-react';
import { useSettingsActions, useSettingsSlice } from '../../../settings/store';
import type { BadgeGlyph, BadgeSettings, BadgeShape, EdgeCursor } from '../../../settings/types';
import { ChoiceGroup } from '../controls/ChoiceGroup';
import { RangeField } from '../controls/RangeField';
import { Stack } from '../controls/Stack';
import { ToggleCard } from '../controls/ToggleCard';

const CURSOR_OPTIONS: readonly { value: EdgeCursor; label: string }[] = [
  { value: 'col-resize', label: 'col-resize' },
  { value: 'ew-resize', label: 'ew-resize' },
  { value: 'grab', label: 'grab' },
  { value: 'pointer', label: 'pointer' },
  { value: 'crosshair', label: 'crosshair' },
  { value: 'move', label: 'move' },
  { value: 'default', label: 'default' },
];

const GLYPH_OPTIONS: readonly { value: BadgeGlyph; label: string; icon: typeof Pin }[] = [
  { value: 'arrows', label: 'Arrow', icon: MoveHorizontal },
  { value: 'chevrons', label: 'Chevrons', icon: ChevronsLeftRight },
  { value: 'grip', label: 'Grip', icon: GripVertical },
  { value: 'dots', label: 'Dots', icon: MoreVertical },
  { value: 'split', label: 'Split', icon: Columns2 },
  { value: 'sparkle', label: 'Sparkle', icon: Sparkles },
  { value: 'pin', label: 'Pin', icon: Pin },
  { value: 'none', label: 'None', icon: EyeOff },
];

const SHAPE_OPTIONS: readonly { value: BadgeShape; label: string }[] = [
  { value: 'pill', label: 'Pill' },
  { value: 'circle', label: 'Circle' },
  { value: 'square', label: 'Square' },
  { value: 'minimal', label: 'Minimal' },
  { value: 'none', label: 'None' },
];

export function PointerTab() {
  const badge = useSettingsSlice('badge');
  const border = useSettingsSlice('border');
  const { update } = useSettingsActions();
  const setBadge = (patch: Partial<BadgeSettings>) => update('badge', patch);

  const formatOffset = (v: number) =>
    v > 0 ? `+${v}px (out)` : v < 0 ? `${v}px (in)` : '0px (centered)';

  return (
    <Stack>
      <ChoiceGroup
        label="Mouse cursor on the edge"
        options={CURSOR_OPTIONS}
        value={border.cursor}
        onChange={(cursor) => update('border', { cursor })}
      />

      <ToggleCard
        title="Hover badge"
        description="Small icon that appears on the edge"
        icon={MousePointerClick}
        checked={badge.enabled}
        onChange={(enabled) => setBadge({ enabled })}
      >
        <ChoiceGroup
          label="Glyph"
          options={GLYPH_OPTIONS}
          value={badge.glyph}
          onChange={(glyph) => setBadge({ glyph })}
          hint={
            badge.glyph === 'arrows' || badge.glyph === 'chevrons'
              ? 'Points into an open sidebar and out of a collapsed one'
              : undefined
          }
        />
        <ChoiceGroup
          label="Container"
          options={SHAPE_OPTIONS}
          value={badge.shape}
          onChange={(shape) => setBadge({ shape })}
          columns={5}
          hint={badge.shape === 'none' ? 'No fill, border, or shadow, just the glyph' : undefined}
        />
        <RangeField
          label="Size"
          value={badge.sizePx}
          min={16}
          max={40}
          onChange={(sizePx) => setBadge({ sizePx })}
          format={(v) => `${v}px`}
        />
        <RangeField
          label="Horizontal offset"
          value={badge.offsetPx}
          min={-30}
          max={30}
          onChange={(offsetPx) => setBadge({ offsetPx })}
          format={formatOffset}
          hint="Negative moves into the sidebar, positive into the content"
        />
        <ToggleCard
          title="Follow pointer"
          description={badge.followPointer ? 'Glides with the cursor' : 'Rests at a fixed height'}
          checked={badge.followPointer}
          onChange={(followPointer) => setBadge({ followPointer })}
        />
        {!badge.followPointer && (
          <RangeField
            label="Vertical position"
            value={badge.positionPercent}
            min={5}
            max={95}
            onChange={(positionPercent) => setBadge({ positionPercent })}
            format={(v) => `${v}%`}
          />
        )}
      </ToggleCard>
    </Stack>
  );
}
