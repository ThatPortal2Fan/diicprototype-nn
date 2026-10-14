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
    const stats = getEventEstimate(event, events).start
    // Overdue once we're past the usual start plus the calculated buffer (never before the scheduled time).
    const tolerance = stats ? Math.max(0, stats.meanMinutes + stats.bufferMinutes) : 0
    if (minutesUntil < -tolerance) {
      items.push({
        id: `${event.id}-overdue`,
        kind: 'overdue',
        event,
        message: tolerance
          ? `Overdue by ${formatDuration(-minutesUntil)}, beyond the usual ${formatDuration(tolerance)} window`
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

export interface TimeStats {
  /** Number of similar past occurrences used. */
  n: number
  /** Mean offset from the scheduled time, in minutes (negative = early, positive = late). */
  meanMinutes: number
  /** Standard deviation of the offsets, in minutes. */
  stdMinutes: number
  /** Buffer = 1.5 x the standard deviation, in minutes. */
  bufferMinutes: number
}

export interface EventEstimate {
  /** Pick-up / start time. */
  start: TimeStats | null
  /** End time. */
  end: TimeStats | null
}

export const BUFFER_FACTOR = 1.5
const MIN_SAMPLES = 2

/** Fit a normal distribution to offsets (minutes). Needs at least two samples for a standard deviation. */
export function fitNormal(offsets: number[]): TimeStats | null {
  const n = offsets.length
  if (n < MIN_SAMPLES) return null
  const mean = offsets.reduce((sum, v) => sum + v, 0) / n
  const variance = offsets.reduce((sum, v) => sum + (v - mean) ** 2, 0) / (n - 1) // sample variance
  const std = Math.sqrt(variance)
  return { n, meanMinutes: mean, stdMinutes: std, bufferMinutes: BUFFER_FACTOR * std }
}

/**
 * Estimate start (pick-up) and end timing for an event from similar occurrences.
 * "Similar" means the same name (case-insensitive), so a recurring pick-up / event / person named the same way
 * is grouped together. The event itself is excluded.
 * - start offsets: actual start - scheduled start
 * - end offsets:   actual completion - scheduled end
 * A normal distribution is fitted to each; the buffer is 1.5x its standard deviation.
 */
export function getEventEstimate(event: CalendarEvent, events: CalendarEvent[]): EventEstimate {
  const key = event.name.trim().toLocaleLowerCase()
  const similar = events.filter((item) => item.id !== event.id && item.name.trim().toLocaleLowerCase() === key)
  const startOffsets = similar
    .filter((item) => item.startAt !== null && item.startedAt !== null)
    .map((item) => (item.startedAt! - item.startAt!) / MINUTE)
  const endOffsets = similar
    .filter((item) => item.endAt != null && item.completedAt != null)
    .map((item) => (item.completedAt! - item.endAt!) / MINUTE)
  return { start: fitNormal(startOffsets), end: fitNormal(endOffsets) }
}
