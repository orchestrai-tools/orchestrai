import { useShallow } from "zustand/react/shallow"

import { Button } from "@/components/ui/button"
import { useAppActions, useAppSession } from "@/lib/app-instance"
import { PROJECT_NAVS } from "@/lib/apps"
import { useLayoutStore, type Density, type HeaderContent, type Radius, type Theme } from "@/lib/layout-store"
import { Choice, Group, Row, SectionHeader, Stepper, SwitchRow } from "@/pages/settings/primitives"
import { useAppSetting } from "@/pages/settings/settings-store"

const THEMES: readonly { value: Theme; label: string }[] = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
]
const DENSITIES: readonly { value: Density; label: string }[] = [
  { value: "comfortable", label: "Comfortable" },
  { value: "compact", label: "Compact" },
]
const RADII: readonly { value: Radius; label: string }[] = [
  { value: "none", label: "Square" },
  { value: "small", label: "4 px" },
  { value: "medium", label: "10 px" },
]
const HEADERS: readonly { value: HeaderContent; label: string }[] = [
  { value: "breadcrumbs", label: "Breadcrumbs" },
  { value: "menubar", label: "App menu" },
]

/** The same product-wide tokens as the appearance popover in the inspector rail, read from one store. */
export function AppearanceSection() {
  const layout = useLayoutStore(useShallow((state) => state))
  const projectNav = useAppSession((session) => session.projectNav)
  const { setProjectNav } = useAppActions()
  const [font, setFont] = useAppSetting("appearance.font", 14)
  const [mono, setMono] = useAppSetting("appearance.mono", 13)
  const [glass, setGlass] = useAppSetting("appearance.glass", false)
  const [opacity, setOpacity] = useAppSetting("appearance.opacity", 85)
  const [blur, setBlur] = useAppSetting("appearance.blur", 24)
  const [paneGlass, setPaneGlass] = useAppSetting("appearance.paneGlass", true)
  const [theoMod, setTheoMod] = useAppSetting("appearance.theoMod", false)

  return (
    <>
      <SectionHeader title="Appearance" scope="One look for every page and both windows. The same controls sit at the bottom of the inspector rail.">
        <Button variant="ghost" size="sm" className="text-xs" onClick={layout.resetLayout}>
          Reset
        </Button>
      </SectionHeader>

      <Group title="Look">
        <Row title="Theme" description="Check both: removing borders loses contrast in light mode first." control={<Choice label="Theme" value={layout.theme} onChange={layout.setTheme} options={THEMES} />} />
        <Row
          title="Density"
          description="Compact steps row padding down by 4 px everywhere, never page by page."
          control={<Choice label="Density" value={layout.density} onChange={layout.setDensity} options={DENSITIES} />}
        />
        <Row title="Corners" description="One radius for everything. Things that touch stay square." control={<Choice label="Corners" value={layout.radius} onChange={layout.setRadius} options={RADII} />} />
      </Group>

      <Group title="Text">
        <Row
          title="Interface text"
          description="Labels, chat, and buttons. ⌘+ and ⌘− change it, ⌘0 resets to 14."
          control={<Stepper label="interface text size" value={font} min={10} max={24} onChange={setFont} suffix=" px" />}
        />
        <Row
          title="Code and terminal"
          description="Diffs, the editor, and the terminal drawer, on their own scale. Default 13."
          control={<Stepper label="code text size" value={mono} min={9} max={22} onChange={setMono} suffix=" px" />}
        />
      </Group>

      <Group title="Window">
        <Row
          title="Header"
          description="Breadcrumbs, or a desktop-style app menu."
          control={<Choice label="Header" value={layout.header.content} onChange={(content) => layout.setHeader({ content })} options={HEADERS} />}
        />
        <Row
          title="Projects"
          description="This window only. Tabs keep every open project's status in view; the dropdown shows one."
          control={<Choice label="Projects" value={projectNav} onChange={setProjectNav} options={PROJECT_NAVS} />}
        />
        <SwitchRow title="Window frame" description="Run both apps as macOS windows on a desktop." checked={layout.appFrame} onChange={layout.setAppFrame} />
        <SwitchRow title="Window controls" description="Close, minimize, and zoom in the title bar." checked={layout.windowControls} onChange={layout.setWindowControls} />
        <SwitchRow title="Transparent window" description="Blurs the desktop behind the app's chrome. macOS and Windows only." checked={glass} onChange={setGlass} />
        <Row
          title="Glass opacity"
          description="How much of the desktop shows through. The conversation is the clearest surface."
          control={<Stepper label="glass opacity" value={opacity} min={60} max={100} step={5} onChange={setOpacity} suffix="%" disabled={!glass} />}
        />
        <Row
          title="Blur radius"
          description="Higher costs more to draw. macOS only; Windows uses a fixed blur."
          control={<Stepper label="blur radius" value={blur} min={1} max={64} step={4} onChange={setBlur} disabled={!glass} />}
        />
        <SwitchRow
          title="Glass behind the work"
          description="Off keeps diffs, editors, and pages solid while the chrome stays glass."
          checked={paneGlass}
          onChange={setPaneGlass}
          disabled={!glass}
        />
      </Group>

      <Group title="Screen sharing">
        <SwitchRow
          title="Blur email addresses"
          description="Hides every address on screen while you share it. Hover one to peek; copying still works."
          checked={theoMod}
          onChange={setTheoMod}
        />
      </Group>
    </>
  )
}
