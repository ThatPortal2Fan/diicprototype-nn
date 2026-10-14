import type { CalendarEvent } from './types'

const MINUTE = 60_000

export function formatDuration(totalMinutes: number) {
  const m = Math.abs(Math.round(totalMinutes))
  if (m < 1) return 'less than a minute'
  const days = Math.floor(m / 1440)
  const hours = Math.floor((m % 1440) / 60)
  const minutes = m % 60
  if (days > 0) return hours ? `${days}d ${hours}h` : `${days}d`
  if (hours > 0) return minutes ? `${hours}h ${minutes}m` : `${hours}h`
  return `${minutes}m`
}

export function relativeLabel(startAt: number, now: number) {
  const diff = (startAt - now) / MINUTE
  if (Math.abs(diff) < 1) return 'now'
  return diff > 0 ? `in ${formatDuration(diff)}` : `${formatDuration(diff)} ago`
}

/** The nearest event that has not been started or completed (overdue ones included). */
export function getNearestEvent(events: CalendarEvent[]) {
  return events
    .filter((e) => e.status === 'scheduled')
    .sort((a, b) => (a.startAt ?? Infinity) - (b.startAt ?? Infinity))[0]
}

export function getInProgressEvents(events: CalendarEvent[]) {
  return events.filter((e) => e.status === 'in_progress')
}

export type NotificationKind = 'in_progress' | 'overdue' | 'soon'

export interface AppNotification {
  id: string
  kind: NotificationKind
  event: CalendarEvent
  message: string
}

const SOON_WINDOW_MINUTES = 60

export function getNotifications(events: CalendarEvent[], now: number): AppNotification[] {
  const items: AppNotification[] = []
  for (const event of events) {
    if (event.status === 'in_progress') {
      items.push({
        id: `${event.id}-progress`,
        kind: 'in_progress',
        event,
        message: `Started ${event.startedAt !== null ? relativeLabel(event.startedAt, now) : 'just now'}`,
      })
      continue
    }
    if (event.status !== 'scheduled') continue

    if (event.startAt === null) continue
    const minutesUntil = (event.startAt - now) / MINUTE
    const tolerance = event.deviationMinutes ?? 0
    if (minutesUntil < -tolerance) {
      items.push({
        id: `${event.id}-overdue`,
        kind: 'overdue',
        event,
        message: tolerance
          ? `Overdue by ${formatDuration(-minutesUntil)}, beyond the usual ±${tolerance}m`
          : `Overdue by ${formatDuration(-minutesUntil)}`,
      })
    } else if (minutesUntil <= SOON_WINDOW_MINUTES) {
      items.push({
        id: `${event.id}-soon`,
        kind: 'soon',
        event,
        message: minutesUntil <= 0 ? 'Due now' : `Starts in ${formatDuration(minutesUntil)}`,
      })
    }
  }
  const order: Record<NotificationKind, number> = { overdue: 0, soon: 1, in_progress: 2 }
  return items.sort((a, b) => order[a.kind] - order[b.kind] || (a.event.startAt ?? Infinity) - (b.event.startAt ?? Infinity))
}

/** Average observed start-time offset for events sharing the same name.
 * Negative means early; positive means late. Events without a scheduled start are excluded.
 */
export function getTypicalDeviation(event: CalendarEvent, events: CalendarEvent[]): number | null {
  const observations = events.filter((item) =>
    item.name.trim().toLocaleLowerCase() === event.name.trim().toLocaleLowerCase() &&
    item.startAt !== null && item.startedAt !== null
  ).map((item) => (item.startedAt! - item.startAt!) / MINUTE)
  if (observations.length === 0) return event.deviationMinutes
  return Math.round(observations.reduce((sum, value) => sum + value, 0) / observations.length)
}
