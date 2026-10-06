export interface DayBreak {
  kind: "day";
  id: string;
  label: string;
}

export interface ChannelItem<T> {
  kind: "message";
  message: T;
}

function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

/** Today, Yesterday, or a short date. */
export function dayLabel(unix: number, now: Date): string {
  const date = new Date(unix * 1000);
  const days = Math.round((startOfDay(now) - startOfDay(date)) / 86_400_000);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/** Insert a day break whenever the calendar day changes. */
export function withDayBreaks<T extends { id: string; at?: number }>(
  messages: T[],
  now = new Date(),
): Array<DayBreak | ChannelItem<T>> {
  const items: Array<DayBreak | ChannelItem<T>> = [];
  let last = "";
  for (const message of messages) {
    if (message.at != null && Number.isFinite(message.at)) {
      const label = dayLabel(message.at, now);
      if (label !== last) {
        items.push({ kind: "day", id: `day-${message.id}`, label });
        last = label;
      }
    }
    items.push({ kind: "message", message });
  }
  return items;
}

/** A follow-up from the same person, still on the same day, keeps their name off the second line. */
export function continuesAuthor<T extends { author: string; role: string }>(
  items: Array<DayBreak | ChannelItem<T>>,
  index: number,
): boolean {
  const item = items[index];
  const previous = items[index - 1];
  return (
    item?.kind === "message" &&
    previous?.kind === "message" &&
    previous.message.author === item.message.author &&
    previous.message.role === item.message.role
  );
}
