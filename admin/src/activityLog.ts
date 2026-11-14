import type { AuditAction, AuditEvent } from "./api";

export type ChangeKind = "on" | "off" | "rules" | "created" | "deleted" | "description";

/** What kind of change an event is, for its icon and label. Toggles are split into on and off. */
export function changeKind(event: Pick<AuditEvent, "action" | "summary">): ChangeKind {
  switch (event.action as AuditAction) {
    case "FLAG_TOGGLED":
      return /\bON\b/.test(event.summary) ? "on" : "off";
    case "RULES_UPDATED":
      return "rules";
    case "FLAG_CREATED":
      return "created";
    case "FLAG_DELETED":
      return "deleted";
    case "FLAG_UPDATED":
      return "description";
  }
}

export const CHANGE_LABELS: Record<ChangeKind, string> = {
  on: "Turned on",
  off: "Turned off",
  rules: "Rules changed",
  created: "Created",
  deleted: "Deleted",
  description: "Description edited",
};

export interface DayGroup {
  label: string;
  events: AuditEvent[];
}

function dayKey(date: Date): string {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

/** Newest-first events grouped under "Today", "Yesterday", or a date ("Wed, Nov 12"; year added if not this year). */
export function groupByDay(events: AuditEvent[], now: Date = new Date()): DayGroup[] {
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const groups: DayGroup[] = [];
  for (const event of events) {
    const at = new Date(event.at);
    const label =
      dayKey(at) === dayKey(now)
        ? "Today"
        : dayKey(at) === dayKey(yesterday)
          ? "Yesterday"
          : at.toLocaleDateString("en-US", {
              weekday: "short",
              month: "short",
              day: "numeric",
              ...(at.getFullYear() === now.getFullYear() ? {} : { year: "numeric" }),
            });
    const last = groups.at(-1);
    if (last?.label === label) last.events.push(event);
    else groups.push({ label, events: [event] });
  }
  return groups;
}

/** Splits text around case-insensitive matches of `query`, for highlighting. */
export function highlight(text: string, query: string): { text: string; match: boolean }[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [{ text, match: false }];
  const parts: { text: string; match: boolean }[] = [];
  const lower = text.toLowerCase();
  let from = 0;
  for (let at = lower.indexOf(needle); at !== -1; at = lower.indexOf(needle, from)) {
    if (at > from) parts.push({ text: text.slice(from, at), match: false });
    parts.push({ text: text.slice(at, at + needle.length), match: true });
    from = at + needle.length;
  }
  if (from < text.length) parts.push({ text: text.slice(from), match: false });
  return parts;
}
