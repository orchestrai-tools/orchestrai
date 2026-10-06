import { Button } from "@warpforge/ui/components/button";

import { FONT_DEFAULT, FONT_MAX, FONT_MIN, useAppearance } from "../../lib/appearance";
import { nativeGlass } from "../../lib/platform";
import { useShell } from "../../lib/shell-store";
import { ThemePicker } from "../../shell/theme-picker";
import { AppIconPicker } from "./app-icon-picker";
import { Choice, Group, Row, SectionHeader, Stepper, SwitchRow } from "./primitives";

const DENSITIES = [
  { value: "comfortable", label: "Comfortable" },
  { value: "compact", label: "Compact" },
] as const;
const RADII = [
  { value: "none", label: "Square" },
  { value: "default", label: "Default" },
  { value: "round", label: "Round" },
] as const;
const PROJECT_NAVS = [
  { value: "tabs", label: "Tabs" },
  { value: "dropdown", label: "Dropdown" },
] as const;

/** Product-wide look: theme, density, corners, text sizes, window glass, and project navigation. */
export function AppearanceSection() {
  const appearance = useAppearance();
  const projectNav = useShell((state) => state.projectNav);
  const glass = nativeGlass();
  const glassOff = !glass || !appearance.transparentWindow;
  const textChanged = appearance.fontSize !== FONT_DEFAULT || appearance.monoFontSize !== 13;
  return (
    <>
      <SectionHeader
        title="Appearance"
        scope="One look for every page. The same controls sit in the Appearance menu at the bottom of the inspector."
      >
        {textChanged && (
          <Button
            variant="ghost"
            size="sm"
            className="text-xs"
            onClick={() => appearance.resetText()}
          >
            Reset text size
          </Button>
        )}
      </SectionHeader>

      <Group title="Look">
        <Row
          title="Theme"
          description="Check both light and dark: removing borders loses contrast in light mode first."
        >
          <ThemePicker
            value={appearance.themeId}
            onChange={appearance.setTheme}
            className="grid-cols-[repeat(auto-fill,minmax(8.5rem,1fr))]"
          />
        </Row>
        <Row
          title="App icon"
          description="Shown in the Dock and app switcher while OrchestrAI runs. Finder keeps the silhouette."
        >
          <AppIconPicker value={appearance.appIcon} onChange={appearance.setAppIcon} />
        </Row>
        <Row
          title="Density"
          description="Compact steps row padding down everywhere, never page by page."
          control={
            <Choice
              label="Density"
              value={appearance.density}
              onChange={appearance.setDensity}
              options={DENSITIES}
            />
          }
        />
        <Row
          title="Corners"
          description="One radius for everything. Things that touch stay square."
          control={
            <Choice
              label="Corners"
              value={appearance.radius}
              onChange={appearance.setRadius}
              options={RADII}
            />
          }
        />
      </Group>

      <Group title="Text">
        <Row
          title="Interface text"
          description="Labels, chat, and buttons. ⌘+ and ⌘− change both sizes, ⌘0 resets to 16."
          control={
            <Stepper
              label="interface text size"
              value={appearance.fontSize}
              min={FONT_MIN}
              max={FONT_MAX}
              onChange={appearance.setFontSize}
              suffix=" px"
            />
          }
        />
        <Row
          title="Code and terminal"
          description="Diffs, the editor, and the terminal drawer, on their own scale. Default 13."
          control={
            <Stepper
              label="code text size"
              value={appearance.monoFontSize}
              min={9}
              max={22}
              onChange={appearance.setMonoFontSize}
              suffix=" px"
            />
          }
        />
      </Group>

      <Group title="Window">
        <Row
          title="Projects"
          description="Tabs keep every open project's status in view; the dropdown shows one."
          control={
            <Choice
              label="Projects"
              value={projectNav}
              onChange={(mode) => useShell.getState().setProjectNav(mode)}
              options={PROJECT_NAVS}
            />
          }
        />
        <SwitchRow
          title="Transparent window"
          description={
            glass
              ? "Blurs the desktop behind the app's chrome."
              : "macOS and Windows only. Linux stays opaque."
          }
          checked={appearance.transparentWindow}
          onChange={appearance.setTransparentWindow}
          disabled={!glass}
        />
        <Row
          title="Glass opacity"
          description="How much of the desktop shows through."
          control={
            <Stepper
              label="glass opacity"
              value={Math.round(appearance.sidebarOpacity * 100)}
              min={60}
              max={100}
              step={5}
              onChange={(value) => appearance.setSidebarOpacity(value / 100)}
              suffix="%"
              disabled={glassOff}
            />
          }
        />
        <Row
          title="Blur radius"
          description="Higher costs more to draw."
          control={
            <Stepper
              label="blur radius"
              value={appearance.blurRadius}
              min={1}
              max={64}
              step={4}
              onChange={appearance.setBlurRadius}
              disabled={glassOff}
            />
          }
        />
        <SwitchRow
          title="Glass behind the work"
          description="Off keeps diffs, editors, and pages solid while the chrome stays glass."
          checked={appearance.bodyGlass}
          onChange={appearance.setBodyGlass}
          disabled={glassOff}
        />
      </Group>

      <Group title="Screen sharing">
        <SwitchRow
          title="Blur email addresses"
          description="Hides every address on screen while you share it. Hover one to peek; copying still works."
          checked={appearance.theoMod}
          onChange={appearance.setTheoMod}
        />
      </Group>
    </>
  );
}
