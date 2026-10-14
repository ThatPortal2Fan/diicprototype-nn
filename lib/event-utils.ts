import type { CalendarEvent } from './types'

const MINUTE = 60_000
const MAX_SAMPLE_MINUTES = 12 * 60

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

export function relativeLabel(at: number, now: number) {
  const diff = (at - now) / MINUTE
  if (Math.abs(diff) < 1) return 'now'
  return diff > 0 ? `in ${formatDuration(diff)}` : `${formatDuration(diff)} ago`
}

export function formatSignedMinutes(minutes: number) {
  if (minutes === 0) return '0m'
  return `${minutes > 0 ? '+' : '−'}${formatDuration(minutes)}`
}

/** Events with the same name are treated as recurrences of each other. */
export function groupKey(name: string) {
  return name.trim().toLowerCase()
}

export function getEventNames(events: CalendarEvent[]) {
  const names = new Map<string, string>()
  for (const e of events) {
    const key = groupKey(e.name)
    if (!names.has(key)) names.set(key, e.name.trim())
  }
  return [...names.values()].sort((a, b) => a.localeCompare(b))
}

export interface DeviationStats {
  /** Signed: negative = usually early, positive = usually late. */
  minutes: number | null
  samples: number
  manual: number | null
}

/**
 * Deviation per event group. Every recorded actual start counts as one sample;
 * the user's most recent estimate counts as one more. Events without a
 * recorded start are ignored.
 */
export function getDeviationStats(events: CalendarEvent[]) {
  const groups = new Map<string, { sum: number; samples: number; manual: number | null; manualAt: number }>()
  for (const e of events) {
    const key = groupKey(e.name)
    const g = groups.get(key) ?? { sum: 0, samples: 0, manual: null, manualAt: -1 }
    if (e.actualStartAt !== null) {
      const diff = (e.actualStartAt - e.startAt) / MINUTE
      if (Math.abs(diff) <= MAX_SAMPLE_MINUTES) {
        g.sum += diff
        g.samples += 1
      }
    }
    if (e.deviationMinutes !== null && e.updatedAt > g.manualAt) {
      g.manual = e.deviationMinutes
      g.manualAt = e.updatedAt
    }
    groups.set(key, g)
  }

  const result = new Map<string, DeviationStats>()
  for (const [key, g] of groups) {
    const count = g.samples + (g.manual !== null ? 1 : 0)
    const minutes = count ? Math.round((g.sum + (g.manual ?? 0)) / count) : null
    result.set(key, { minutes, samples: g.samples, manual: g.manual })
  }
  return result
}

export function statsFor(stats: Map<string, DeviationStats>, event: CalendarEvent): DeviationStats {
  return stats.get(groupKey(event.name)) ?? { minutes: null, samples: 0, manual: null }
}

export function describeDeviation(minutes: number | null) {
  if (minutes === null) return null
  if (minutes === 0) return 'This event usually starts on time'
  const amount = Math.abs(minutes)
  const unit = amount === 1 ? 'minute' : 'minutes'
  const text = amount >= 60 ? formatDuration(amount) : `${amount} ${unit}`
  return `This event usually starts ${text} ${minutes < 0 ? 'early' : 'late'}`
}

/** The event to focus on: the earliest one not yet started that hasn't ended. */
export function getFocusEvent(events: CalendarEvent[], now: number | null) {
  return events
    .filter((e) => e.status === 'scheduled' && (now === null || e.endAt > now))
    .sort((a, b) => a.startAt - b.startAt)[0]
}

export function isOngoing(event: CalendarEvent, now: number | null) {
  return now !== null && event.startAt <= now && now < event.endAt
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
  const stats = getDeviationStats(events)
  const items: AppNotification[] = []
  for (const event of events) {
    if (event.status === 'in_progress') {
      items.push({
        id: `${event.id}-progress`,
        kind: 'in_progress',
        event,
        message: `Started ${relativeLabel(event.actualStartAt ?? event.startAt, now)}`,
      })
      continue
    }
    if (event.status !== 'scheduled' || event.endAt <= now) continue

    const dev = statsFor(stats, event).minutes ?? 0
    const expected = event.startAt + dev * MINUTE
    const minutesUntil = (expected - now) / MINUTE
    if (minutesUntil < 0) {
      items.push({
        id: `${event.id}-overdue`,
        kind: 'overdue',
        event,
        message: `Not started, ${formatDuration(-minutesUntil)} past its usual start`,
      })
    } else if (minutesUntil <= SOON_WINDOW_MINUTES) {
      items.push({
        id: `${event.id}-soon`,
        kind: 'soon',
        event,
        message: `Usually starts in ${formatDuration(minutesUntil)}`,
      })
    }
  }
  const order: Record<NotificationKind, number> = { overdue: 0, soon: 1, in_progress: 2 }
  return items.sort((a, b) => order[a.kind] - order[b.kind] || a.event.startAt - b.event.startAt)
}
