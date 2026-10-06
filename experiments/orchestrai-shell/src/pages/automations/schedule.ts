import type { SchedulePreset } from "@/data/automations"

const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR

/** The mock's "now": Thursday 1 October 2026, 15:56 in New York. */
export const MOCK_NOW = Date.UTC(2026, 9, 1, 19, 56)
const LOCAL_ZONE = "America/New_York"

/** UTC offsets in early October 2026; enough for the zones the mock uses. */
const OFFSET_HOURS: Record<string, number> = {
  "America/New_York": -4,
  "America/Los_Angeles": -7,
  "Europe/Lisbon": 1,
  "Europe/London": 1,
  UTC: 0,
}

export const TIMEZONES = Object.keys(OFFSET_HOURS)

function offset(zone: string): number {
  return (OFFSET_HOURS[zone] ?? 0) * HOUR
}

/** Wall-clock parts of an instant in a zone. */
function wall(at: number, zone: string) {
  const date = new Date(at + offset(zone))
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth(),
    day: date.getUTCDate(),
    weekday: date.getUTCDay(),
    hour: date.getUTCHours(),
    minute: date.getUTCMinutes(),
  }
}

/** A run's `at` is New York wall-clock time without a zone. */
export function parseLocal(iso: string): number {
  const [date, time = "00:00"] = iso.split("T")
  const [year, month, day] = date.split("-").map(Number)
  const [hour, minute] = time.split(":").map(Number)
  return Date.UTC(year, month - 1, day, hour, minute) - offset(LOCAL_ZONE)
}

const DAY_NAMES = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"]
export const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]
const SHORT_DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

/** One cron field as the values it allows. Day-of-week numbers follow the daemon's crate: 1 = Sunday. */
function field(raw: string, min: number, max: number, names?: string[]): number[] | null {
  const values = new Set<number>()
  const value = (token: string) => {
    const named = names?.indexOf(token.toUpperCase()) ?? -1
    if (named >= 0) return named
    if (!/^\d+$/.test(token)) return null
    const number = Number(token)
    if (names) return number >= 1 && number <= 7 ? number - 1 : null
    return number >= min && number <= max ? number : null
  }
  for (const part of raw.split(",")) {
    const [body, stepText] = part.split("/")
    const step = stepText ? Number(stepText) : 1
    if (!step || step < 1) return null
    let from: number | null = min
    let to: number | null = max
    if (body !== "*") {
      const [start, end] = body.split("-")
      from = value(start)
      to = end === undefined ? (stepText ? max : from) : value(end)
    }
    if (from === null || to === null || from > to) return null
    for (let current = from; current <= to; current += step) values.add(current)
  }
  return [...values].sort((a, b) => a - b)
}

interface Cron {
  minutes: number[]
  hours: number[]
  days: number[]
  months: number[]
  weekdays: number[]
  anyDay: boolean
  anyWeekday: boolean
}

export function parseCron(cron: string): Cron | null {
  const parts = cron.trim().split(/\s+/)
  if (parts.length !== 5) return null
  const minutes = field(parts[0], 0, 59)
  const hours = field(parts[1], 0, 23)
  const days = field(parts[2], 1, 31)
  const months = field(parts[3], 1, 12)
  const weekdays = field(parts[4], 0, 6, DAY_NAMES)
  if (!minutes || !hours || !days || !months || !weekdays) return null
  return { minutes, hours, days, months, weekdays, anyDay: parts[2] === "*", anyWeekday: parts[4] === "*" }
}

/** The next `count` occurrences strictly after `after`, computed in the schedule's own zone. */
export function nextOccurrences(cron: string, zone: string, after = MOCK_NOW, count = 1): number[] {
  const parsed = parseCron(cron)
  if (!parsed) return []
  const found: number[] = []
  const start = wall(after, zone)
  for (let index = 0; index < 400 && found.length < count; index++) {
    const date = new Date(Date.UTC(start.year, start.month, start.day + index))
    const matches =
      parsed.months.includes(date.getUTCMonth() + 1) &&
      parsed.days.includes(date.getUTCDate()) &&
      (parsed.anyWeekday || parsed.weekdays.includes(date.getUTCDay()))
    if (!matches) continue
    for (const hour of parsed.hours) {
      for (const minute of parsed.minutes) {
        const at = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), hour, minute) - offset(zone)
        if (at > after && found.length < count) found.push(at)
      }
    }
  }
  return found
}

const clock = (hour: number, minute: number) => `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`

/** Plain words for the shapes people pick; anything else is shown as the cron itself. */
export function describeCron(cron: string): string {
  const parsed = parseCron(cron)
  if (!parsed) return `cron ${cron}`
  const { minutes, hours, weekdays, anyDay, anyWeekday, months } = parsed
  if (cron.trim() === "*/5 * * * *") return "Every 5 minutes"
  if (minutes.length === 1 && hours.length === 24 && anyDay && anyWeekday) return `Every hour at :${String(minutes[0]).padStart(2, "0")}`
  if (minutes.length !== 1 || hours.length !== 1 || months.length !== 12 || !anyDay) return `cron ${cron}`
  const at = clock(hours[0], minutes[0])
  if (anyWeekday) return `Every day at ${at}`
  if (weekdays.join() === "1,2,3,4,5") return `Weekdays at ${at}`
  if (weekdays.length === 1) return `Every ${WEEKDAYS[weekdays[0]]} at ${at}`
  return `${weekdays.map((day) => SHORT_DAYS[day]).join(", ")} at ${at}`
}

export function presetCron(preset: SchedulePreset, hour: number, minute: number, weekday: number): string {
  switch (preset) {
    case "hourly":
      return `${minute} * * * *`
    case "every5":
      return "*/5 * * * *"
    case "daily":
      return `${minute} ${hour} * * *`
    case "weekdays":
      return `${minute} ${hour} * * MON-FRI`
    case "weekly":
      return `${minute} ${hour} * * ${DAY_NAMES[weekday]}`
    case "custom":
      return `${minute} ${hour} * * *`
  }
}

/** "in 10h 34m", "in 3d 15h": coarse on purpose, a schedule is not a stopwatch. */
export function countdown(target: number, now = MOCK_NOW): string {
  const minutes = Math.floor((target - now) / 60000)
  if (minutes < 1) return "due now"
  if (minutes < 60) return `in ${minutes}m`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return minutes % 60 ? `in ${hours}h ${minutes % 60}m` : `in ${hours}h`
  return hours % 24 ? `in ${Math.floor(hours / 24)}d ${hours % 24}h` : `in ${Math.floor(hours / 24)}d`
}

/** Relative to the mock's now, in New York time: "14m ago", "Today 02:30", "Yesterday 18:20", "Mon 07:00". */
export function formatWhen(at: number, now = MOCK_NOW): string {
  const ago = now - at
  if (ago >= 0 && ago < HOUR) return `${Math.max(1, Math.round(ago / 60000))}m ago`
  const when = wall(at, LOCAL_ZONE)
  const today = wall(now, LOCAL_ZONE)
  const days = Math.round((Date.UTC(today.year, today.month, today.day) - Date.UTC(when.year, when.month, when.day)) / DAY)
  const time = clock(when.hour, when.minute)
  if (days === 0) return `Today ${time}`
  if (days === 1) return `Yesterday ${time}`
  if (days === -1) return `Tomorrow ${time}`
  if (Math.abs(days) < 7) return `${SHORT_DAYS[when.weekday]} ${time}`
  return `${MONTHS[when.month]} ${when.day} ${time}`
}

/** "Fri 2 Oct, 02:30" in the schedule's own zone, so 02:30 never reads as a bug. */
export function formatInZone(at: number, zone: string): string {
  const when = wall(at, zone)
  return `${SHORT_DAYS[when.weekday]} ${when.day} ${MONTHS[when.month]}, ${clock(when.hour, when.minute)}`
}
