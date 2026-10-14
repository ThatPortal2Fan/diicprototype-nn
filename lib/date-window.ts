import { addDays, addMonths, addWeeks, isWeekend } from 'date-fns'
import type { Recurrence } from './types'

export const WINDOW_START = new Date(2026, 9, 1).getTime()
export const WINDOW_END = new Date(2027, 11, 31, 23, 59, 59, 999).getTime()
export const WINDOW_MIN_DATE = '2026-10-01'
export const WINDOW_MAX_DATE = '2027-12-31'

const MAX_OCCURRENCES = 500

export function isInWindow(ms: number) {
  return ms >= WINDOW_START && ms <= WINDOW_END
}

export const RECURRENCE_OPTIONS: { value: Recurrence; label: string }[] = [
  { value: 'none', label: 'Does not repeat' },
  { value: 'daily', label: 'Every day' },
  { value: 'weekdays', label: 'Every weekday (Mon–Fri)' },
  { value: 'weekly', label: 'Every week' },
  { value: 'biweekly', label: 'Every 2 weeks' },
  { value: 'monthly', label: 'Every month' },
]

/** Start times of every occurrence, clamped to the storage window and the repeat-until date. */
export function expandOccurrences(startAt: number, recurrence: Recurrence, repeatUntil: number | null) {
  const limit = Math.min(repeatUntil ?? WINDOW_END, WINDOW_END)
  if (recurrence === 'none') return isInWindow(startAt) ? [startAt] : []

  const first = new Date(startAt)
  const results: number[] = []
  for (let i = 0; results.length < MAX_OCCURRENCES; i++) {
    let next: Date
    if (recurrence === 'daily' || recurrence === 'weekdays') next = addDays(first, i)
    else if (recurrence === 'weekly') next = addWeeks(first, i)
    else if (recurrence === 'biweekly') next = addWeeks(first, i * 2)
    else next = addMonths(first, i)

    const ms = next.getTime()
    if (ms > limit) break
    if (recurrence === 'weekdays' && isWeekend(next)) continue
    if (ms >= WINDOW_START) results.push(ms)
  }
  return results
}
