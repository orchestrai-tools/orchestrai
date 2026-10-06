import { Waves } from 'lucide-react';
import { useReducedMotion } from 'motion/react';
import { useSettingsActions, useSettingsSlice } from '../../../settings/store';
import type { RippleSettings, RippleTrigger } from '../../../settings/types';
import { ChoiceGroup } from '../controls/ChoiceGroup';
import { RangeField } from '../controls/RangeField';
import { Note, Stack } from '../controls/Stack';
import { ToggleCard } from '../controls/ToggleCard';

const TRIGGER_OPTIONS: readonly { value: RippleTrigger; label: string }[] = [
  { value: 'enter', label: 'On enter' },
  { value: 'enter-exit', label: 'Enter & exit' },
];

export function RippleTab() {
  const ripple = useSettingsSlice('ripple');
  const { update } = useSettingsActions();
  const reducedMotion = useReducedMotion() ?? false;
  const setRipple = (patch: Partial<RippleSettings>) => update('ripple', patch);

  return (
    <Stack>
      <ToggleCard
        title="Water surface"
        description={
          ripple.enabled
            ? 'The sidebar edge ripples like water when you cross it'
            : 'Static edge'
        }
        icon={Waves}
        checked={ripple.enabled}
        onChange={(enabled) => setRipple({ enabled })}
      />

      {ripple.enabled && (
        <>
          {reducedMotion && (
            <Note>Your system asks for reduced motion, so the surface stays still.</Note>
          )}

          <Note>
            The border is the surface: it ripples with the edge and keeps its colour, line
            style, hover, glow and lightsaber settings from the Border tab.
          </Note>

          <ChoiceGroup
            label="Trigger"
            options={TRIGGER_OPTIONS}
            value={ripple.trigger}
            onChange={(trigger) => setRipple({ trigger })}
            columns={2}
          />

          <RangeField
            label="Amplitude"
            value={ripple.amplitudePx}
            min={1}
            max={16}
            step={0.5}
            onChange={(amplitudePx) => setRipple({ amplitudePx })}
            format={(v) => `${v}px`}
            hint="How far the edge swells and dips"
          />
          <RangeField
            label="Wavelength"
            value={ripple.wavelengthPx}
            min={24}
            max={320}
            step={2}
            onChange={(wavelengthPx) => setRipple({ wavelengthPx })}
            format={(v) => `${v}px`}
            hint="Distance between crests along the edge"
          />
          <RangeField
            label="Speed"
            value={ripple.speedPxPerSec}
            min={150}
            max={2000}
            step={25}
            onChange={(speedPxPerSec) => setRipple({ speedPxPerSec })}
            format={(v) => `${v}px/s`}
          />
          <RangeField
            label="Settle time"
            value={ripple.durationMs}
            min={400}
            max={4000}
            step={50}
            onChange={(durationMs) => setRipple({ durationMs })}
            format={(v) => `${v}ms`}
            hint="How long the surface takes to calm down"
          />
          <RangeField
            label="Reach"
            value={ripple.reachPx}
            min={60}
            max={1200}
            step={10}
            onChange={(reachPx) => setRipple({ reachPx })}
            format={(v) => `${v}px`}
            hint="Distance along the edge before a wave fades out"
          />
        </>
      )}
    </Stack>
  );
}
