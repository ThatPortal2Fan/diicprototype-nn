import type { CalendarEvent, ManualWindow } from './types'

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

function byClosestTo(now: number | null) {
  const distance = (e: CalendarEvent) =>
    e.startAt === null ? Infinity : now === null ? e.startAt : Math.abs(e.startAt - now)
  return (a: CalendarEvent, b: CalendarEvent) => {
    const da = distance(a)
    const db = distance(b)
    return da === db ? 0 : da < db ? -1 : 1
  }
}

/**
 * The unfinished event (scheduled or in progress) whose start time is closest to now, past or future.
 * Events without a start time come last. Before `now` is known, falls back to the earliest one.
 */
export function getNearestEvent(events: CalendarEvent[], now: number | null) {
  return events.filter((e) => e.status !== 'done').sort(byClosestTo(now))[0]
}

/** Same as getNearestEvent, but only events that have not been started yet (these can be started). */
export function getNearestScheduledEvent(events: CalendarEvent[], now: number | null) {
  return events.filter((e) => e.status === 'scheduled').sort(byClosestTo(now))[0]
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
    if (minutesUntil > SOON_WINDOW_MINUTES) continue // not due yet; skip the estimate (there can be thousands of these)
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
 * "Similar" means the same name and detail (both case-insensitive), so a recurring pick-up / event / person
 * described the same way is grouped together. The event itself is excluded.
 * - start offsets: actual start - scheduled start
 * - end offsets:   actual completion - scheduled end
 * A normal distribution is fitted to each; the buffer is 1.5x its standard deviation.
 */
function similarityKey(event: Pick<CalendarEvent, 'name' | 'detail'>) {
  return `${event.name.trim().toLocaleLowerCase()}\u0000${(event.detail ?? '').trim().toLocaleLowerCase()}`
}

export function getEventEstimate(event: Pick<CalendarEvent, 'id' | 'name' | 'detail'>, events: CalendarEvent[]): EventEstimate {
  const key = similarityKey(event)
  const similar = events.filter((item) => item.id !== event.id && similarityKey(item) === key)
  const startOffsets = similar
    .filter((item) => item.startAt !== null && item.startedAt !== null)
    .map((item) => (item.startedAt! - item.startAt!) / MINUTE)
  const endOffsets = similar
    .filter((item) => item.endAt != null && item.completedAt != null)
    .map((item) => (item.completedAt! - item.endAt!) / MINUTE)
  return { start: fitNormal(startOffsets), end: fitNormal(endOffsets) }
}

export interface BufferWindow {
  /** Buffer edge before the usual time, in ms. */
  from: number
  /** Buffer edge after the usual time, in ms. */
  to: number
  stats: TimeStats
}

function bufferAround(at: number | null | undefined, stats: TimeStats | null): BufferWindow | null {
  if (at == null || !stats) return null
  const center = at + stats.meanMinutes * MINUTE
  const buffer = stats.bufferMinutes * MINUTE
  return { from: center - buffer, to: center + buffer, stats }
}

/**
 * Buffer around the start and end, counted from the distribution average:
 * scheduled time + mean offset ± 1.5σ. Null without the time or enough history.
 */
export function getBufferWindows(event: CalendarEvent, events: CalendarEvent[]) {
  const estimate = getEventEstimate(event, events)
  return {
    start: bufferAround(event.startAt, estimate.start),
    end: isInstant(event) ? null : bufferAround(event.endAt, estimate.end),
  }
}

export interface ManualRange {
  /** Earliest time, in ms. */
  from: number
  /** Latest time, in ms. */
  to: number
}

function manualAround(at: number | null | undefined, window: ManualWindow | null | undefined): ManualRange | null {
  if (at == null || !window) return null
  return { from: at + window.fromMinutes * MINUTE, to: at + window.toMinutes * MINUTE }
}

/**
 * The user's own buffer (earliest and latest time they think it might start / end / happen), separate from the
 * calculated one. Stored relative to the scheduled times, so it moves with the event.
 */
export function getManualWindows(event: CalendarEvent) {
  return {
    start: manualAround(event.startAt, event.manualStart),
    end: isInstant(event) ? null : manualAround(event.endAt, event.manualEnd),
  }
}

export function getStartWindow(event: CalendarEvent, events: CalendarEvent[]) {
  return getBufferWindows(event, events).start
}

/** An event with no duration (no end time, or ending when it starts). */
export function isInstant(event: CalendarEvent) {
  return event.endAt == null || event.startAt === null || event.endAt <= event.startAt
}

/** Name plus detail, for display. */
export function eventTitle(event: Pick<CalendarEvent, 'name' | 'detail'>) {
  const detail = event.detail?.trim()
  return detail ? `${event.name} · ${detail}` : event.name
}

/** Distinct non-empty values (case-insensitive, first spelling kept), sorted. */
export function distinctOptions(values: (string | undefined)[]) {
  const map = new Map<string, string>()
  for (const value of values) {
    const trimmed = value?.trim()
    if (trimmed && !map.has(trimmed.toLocaleLowerCase())) map.set(trimmed.toLocaleLowerCase(), trimmed)
  }
  return Array.from(map.values()).sort((a, b) => a.localeCompare(b))
}

/** Details used before with this name (all details when the name has none yet). */
export function detailOptions(events: CalendarEvent[], name: string) {
  const key = name.trim().toLocaleLowerCase()
  const forName = distinctOptions(events.filter((e) => e.name.trim().toLocaleLowerCase() === key).map((e) => e.detail))
  return forName.length ? forName : distinctOptions(events.map((e) => e.detail))
}

/** Use the existing spelling of a typed value when it matches one case-insensitively. */
export function canonical(value: string, options: string[]) {
  const trimmed = value.trim()
  return options.find((option) => option.toLocaleLowerCase() === trimmed.toLocaleLowerCase()) ?? trimmed
}
