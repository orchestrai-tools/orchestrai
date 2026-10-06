import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { PAIRED_DEVICES } from "@/data/app-settings"
import { NOTIFY_EVENTS, type Channel } from "@/data/settings"
import type { Project } from "@/lib/projects"
import { cn } from "@/lib/utils"
import { openSettingsSection } from "@/pages/settings/nav-store"
import { Group, Row, SectionHeader, SwitchRow } from "@/pages/settings/primitives"
import { useProjectSetting } from "@/pages/settings/settings-store"

const CHANNELS: readonly { id: Channel; label: string }[] = [
  { id: "desktop", label: "Desktop" },
  { id: "sound", label: "Sound" },
  { id: "phone", label: "Phone" },
]

const DEFAULTS: Record<string, Channel[]> = Object.fromEntries(NOTIFY_EVENTS.map((event) => [event.id, event.defaults]))

export function NotificationsSection({ project }: { project: Project }) {
  const [matrix, setMatrix] = useProjectSetting(project.id, "notify.matrix", DEFAULTS)
  const [muted, setMuted] = useProjectSetting(project.id, "notify.muted", project.id === "handbook")
  const [background, setBackground] = useProjectSetting(project.id, "notify.background", true)
  const [quiet, setQuiet] = useProjectSetting(project.id, "notify.quiet", true)
  const [from, setFrom] = useProjectSetting(project.id, "notify.from", "22:00")
  const [to, setTo] = useProjectSetting(project.id, "notify.to", "08:00")
  const phones = PAIRED_DEVICES.length

  const toggle = (event: string, channel: Channel, on: boolean) => {
    const current = matrix[event] ?? []
    setMatrix({ ...matrix, [event]: on ? [...current, channel] : current.filter((entry) => entry !== channel) })
  }

  return (
    <>
      <SectionHeader title="Notifications" scope="For this project on this Mac. Everything else stays a quiet mark at the edge and waits in the Inbox." />

      <Group>
        <SwitchRow title="Mute this project" description="Nothing notifies. The Inbox still collects every request." checked={muted} onChange={setMuted} />
      </Group>

      <Group
        title="What reaches you"
        note={
          <>
            Phone goes to {phones} paired {phones === 1 ? "device" : "devices"}.{" "}
            <button type="button" className="underline underline-offset-2" onClick={() => openSettingsSection(project.id, "remote")}>
              Manage them under Remote
            </button>
            .
          </>
        }
        className={cn(muted && "opacity-50")}
      >
        <div role="row" className="grid grid-cols-[minmax(0,1fr)_repeat(3,4.5rem)] items-end gap-2 pb-1 text-xs text-muted-foreground">
          <span>When</span>
          {CHANNELS.map((channel) => (
            <span key={channel.id} className="text-center">
              {channel.label}
            </span>
          ))}
        </div>
        {NOTIFY_EVENTS.map((event) => (
          <div key={event.id} role="row" className="grid grid-cols-[minmax(0,1fr)_repeat(3,4.5rem)] items-center gap-2 py-(--row-py)">
            <span className="min-w-0">
              <span className="block text-sm">{event.label}</span>
              <span className="block text-xs text-muted-foreground">{event.hint}</span>
            </span>
            {CHANNELS.map((channel) => (
              <span key={channel.id} className="flex justify-center">
                <Checkbox
                  aria-label={`${channel.label}: ${event.label}`}
                  disabled={muted || (channel.id === "phone" && phones === 0)}
                  checked={(matrix[event.id] ?? []).includes(channel.id)}
                  onCheckedChange={(checked) => toggle(event.id, channel.id, checked === true)}
                />
              </span>
            ))}
          </div>
        ))}
      </Group>

      <Group title="Timing">
        <SwitchRow
          title="Only while OrchestrAI is in the background"
          description="When you are looking at the app, the Inbox badge is enough."
          checked={background}
          onChange={setBackground}
        />
        <SwitchRow title="Quiet hours" description="Holds desktop notifications and sound. Approvals still reach your phone." checked={quiet} onChange={setQuiet} />
        {quiet && (
          <Row
            title="Between"
            description="Your Mac's time zone."
            control={
              <>
                <Input type="time" value={from} onChange={(event) => setFrom(event.target.value)} aria-label="Quiet from" className="h-7 w-28 text-xs md:text-xs" />
                <span className="text-xs text-muted-foreground">and</span>
                <Input type="time" value={to} onChange={(event) => setTo(event.target.value)} aria-label="Quiet until" className="h-7 w-28 text-xs md:text-xs" />
              </>
            }
          />
        )}
      </Group>
    </>
  )
}
