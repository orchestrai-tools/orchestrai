import type { AutomationPreset } from "@warpforge/protocol";

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

const DAY_NAMES = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
export const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const SHORT_DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export const localZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;

const formatters = new Map<string, Intl.DateTimeFormat>();

/** Wall-clock parts of an instant (ms) in a zone. An empty zone is the local one. */
function wall(at: number, zone: string) {
  const key = zone || localZone();
  let format = formatters.get(key);
  if (!format) {
    format = new Intl.DateTimeFormat("en-US", {
      timeZone: key,
      hourCycle: "h23",
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
      weekday: "short",
    });
    formatters.set(key, format);
  }
  const parts = Object.fromEntries(format.formatToParts(new Date(at)).map((part) => [part.type, part.value]));
  return {
    year: Number(parts.year),
    month: Number(parts.month) - 1,
    day: Number(parts.day),
    weekday: SHORT_DAYS.indexOf(parts.weekday ?? ""),
    hour: Number(parts.hour) % 24,
    minute: Number(parts.minute),
  };
}

/** The instant a wall-clock time in a zone names. Two passes settle the offset across a DST change. */
function instant(year: number, month: number, day: number, hour: number, minute: number, zone: string): number {
  const target = Date.UTC(year, month, day, hour, minute);
  let guess = target;
  for (let pass = 0; pass < 2; pass++) {
    const seen = wall(guess, zone);
    const shown = Date.UTC(seen.year, seen.month, seen.day, seen.hour, seen.minute);
    guess += target - shown;
  }
  return guess;
}

/** One cron field as the values it allows. Day-of-week numbers follow the daemon's crate: 1 = Sunday. */
function field(raw: string, min: number, max: number, names?: string[]): number[] | null {
  const values = new Set<number>();
  const value = (token: string) => {
    const named = names?.indexOf(token.toUpperCase()) ?? -1;
    if (named >= 0) return named;
    if (!/^\d+$/.test(token)) return null;
    const number = Number(token);
    if (names) return number >= 1 && number <= 7 ? number - 1 : null;
    return number >= min && number <= max ? number : null;
  };
  for (const part of raw.split(",")) {
    const [body, stepText] = part.split("/");
    const step = stepText ? Number(stepText) : 1;
    if (!step || step < 1) return null;
    let from: number | null = min;
    let to: number | null = max;
    if (body !== "*") {
      const [start, end] = body.split("-");
      from = value(start);
      to = end === undefined ? (stepText ? max : from) : value(end);
    }
    if (from === null || to === null || from > to) return null;
    for (let current = from; current <= to; current += step) values.add(current);
  }
  return [...values].sort((a, b) => a - b);
}

interface Cron {
  minutes: number[];
  hours: number[];
  days: number[];
  months: number[];
  weekdays: number[];
  anyDay: boolean;
  anyWeekday: boolean;
}

export function parseCron(cron: string): Cron | null {
  const parts = cron.trim().split(/\s+/);
  if (parts.length !== 5) return null;
  const minutes = field(parts[0], 0, 59);
  const hours = field(parts[1], 0, 23);
  const days = field(parts[2], 1, 31);
  const months = field(parts[3], 1, 12);
  const weekdays = field(parts[4], 0, 6, DAY_NAMES);
  if (!minutes || !hours || !days || !months || !weekdays) return null;
  return { minutes, hours, days, months, weekdays, anyDay: parts[2] === "*", anyWeekday: parts[4] === "*" };
}

/** The next `count` occurrences (ms) strictly after `after`, in the schedule's own zone. */
export function nextOccurrences(cron: string, zone: string, after = Date.now(), count = 1): number[] {
  const parsed = parseCron(cron);
  if (!parsed) return [];
  const found: number[] = [];
  const start = wall(after, zone);
  for (let index = 0; index < 400 && found.length < count; index++) {
    const date = new Date(Date.UTC(start.year, start.month, start.day + index));
    const matches =
      parsed.months.includes(date.getUTCMonth() + 1) &&
      parsed.days.includes(date.getUTCDate()) &&
      (parsed.anyWeekday || parsed.weekdays.includes(date.getUTCDay()));
    if (!matches) continue;
    for (const hour of parsed.hours) {
      for (const minute of parsed.minutes) {
        const at = instant(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), hour, minute, zone);
        if (at > after && found.length < count) found.push(at);
      }
    }
  }
  return found;
}

const clock = (hour: number, minute: number) => `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;

/** Plain words for the shapes people pick; anything else is shown as the cron itself. */
export function describeCron(cron: string): string {
  const parsed = parseCron(cron);
  if (!parsed) return `cron ${cron}`;
  const { minutes, hours, weekdays, anyDay, anyWeekday, months } = parsed;
  if (cron.trim() === "*/5 * * * *") return "Every 5 minutes";
  if (minutes.length === 1 && hours.length === 24 && anyDay && anyWeekday) return `Every hour at :${String(minutes[0]).padStart(2, "0")}`;
  if (minutes.length !== 1 || hours.length !== 1 || months.length !== 12 || !anyDay) return `cron ${cron}`;
  const at = clock(hours[0], minutes[0]);
  if (anyWeekday) return `Every day at ${at}`;
  if (weekdays.join() === "1,2,3,4,5") return `Weekdays at ${at}`;
  if (weekdays.length === 1) return `Every ${WEEKDAYS[weekdays[0]]} at ${at}`;
  return `${weekdays.map((day) => SHORT_DAYS[day]).join(", ")} at ${at}`;
}

export interface ScheduleTime {
  hour: number;
  minute: number;
  weekday: number;
}

export function presetCron(preset: AutomationPreset, time: ScheduleTime): string {
  const { hour, minute, weekday } = time;
  switch (preset) {
    case "hourly":
      return `${minute} * * * *`;
    case "every5":
      return "*/5 * * * *";
    case "daily":
      return `${minute} ${hour} * * *`;
    case "weekdays":
      return `${minute} ${hour} * * MON-FRI`;
    case "weekly":
      return `${minute} ${hour} * * ${DAY_NAMES[weekday]}`;
    case "custom":
      return `${minute} ${hour} * * *`;
  }
}

/** The hour, minute and weekday a preset's cron was built from. */
export function timeOf(cron: string): ScheduleTime {
  const [minute, hour, , , weekday] = cron.split(" ");
  const day = DAY_NAMES.indexOf(weekday?.split("-")[0]?.toUpperCase() ?? "");
  return { hour: Number(hour) || 9, minute: Number(minute) || 0, weekday: day >= 0 ? day : 1 };
}

/** "in 10h 34m", "in 3d 15h": coarse on purpose, a schedule is not a stopwatch. */
export function countdown(target: number, now = Date.now()): string {
  const minutes = Math.floor((target - now) / MINUTE);
  if (minutes < 1) return "due now";
  if (minutes < 60) return `in ${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return minutes % 60 ? `in ${hours}h ${minutes % 60}m` : `in ${hours}h`;
  return hours % 24 ? `in ${Math.floor(hours / 24)}d ${hours % 24}h` : `in ${Math.floor(hours / 24)}d`;
}

/** Relative to now, in local time: "14m ago", "Today 02:30", "Yesterday 18:20", "Mon 07:00". */
export function formatWhen(at: number, now = Date.now()): string {
  const ago = now - at;
  if (ago >= 0 && ago < HOUR) return `${Math.max(1, Math.round(ago / MINUTE))}m ago`;
  const zone = localZone();
  const when = wall(at, zone);
  const today = wall(now, zone);
  const days = Math.round((Date.UTC(today.year, today.month, today.day) - Date.UTC(when.year, when.month, when.day)) / DAY);
  const time = clock(when.hour, when.minute);
  if (days === 0) return `Today ${time}`;
  if (days === 1) return `Yesterday ${time}`;
  if (days === -1) return `Tomorrow ${time}`;
  if (Math.abs(days) < 7) return `${SHORT_DAYS[when.weekday]} ${time}`;
  return `${MONTHS[when.month]} ${when.day} ${time}`;
}

/** "Fri 2 Oct, 02:30" in the schedule's own zone, so 02:30 never reads as a bug. */
export function formatInZone(at: number, zone: string): string {
  const when = wall(at, zone);
  return `${SHORT_DAYS[when.weekday]} ${when.day} ${MONTHS[when.month]}, ${clock(when.hour, when.minute)}`;
}
