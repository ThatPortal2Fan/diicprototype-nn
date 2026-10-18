'use client'

import { useState } from 'react'
import { addDays, format, set } from 'date-fns'
import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { EventEstimate, TimeStats } from '@/lib/event-utils'
import type { CalendarEvent, ManualWindow } from '@/lib/types'

const MINUTE = 60_000
const HALF_DAY = 12 * 60 * MINUTE

type Slot = 'start' | 'end'
type RangeInput = { from: string; to: string }
const EMPTY: RangeInput = { from: '', to: '' }
const hasValue = (v: RangeInput) => Boolean(v.from || v.to)

const toInput = (at: number | null | undefined, window: ManualWindow | null | undefined): RangeInput =>
  at == null || !window ? EMPTY : { from: format(at + window.fromMinutes * MINUTE, 'HH:mm'), to: format(at + window.toMinutes * MINUTE, 'HH:mm') }

/** The time of day `time` (HH:mm) closest to `at`, so a window can cross midnight (e.g. 23:30–00:30). */
function nearest(time: string, at: number) {
  const [hours, minutes] = time.split(':').map(Number)
  const sameDay = set(at, { hours, minutes, seconds: 0, milliseconds: 0 }).getTime()
  if (sameDay - at > HALF_DAY) return addDays(sameDay, -1).getTime()
  if (at - sameDay > HALF_DAY) return addDays(sameDay, 1).getTime()
  return sameDay
}

/** The calculated buffer around `at` (or just `at` without enough history), as a starting point. */
function suggest(at: number, stats: TimeStats | null): RangeInput {
  const center = at + (stats?.meanMinutes ?? 0) * MINUTE
  const buffer = (stats?.bufferMinutes ?? 0) * MINUTE
  return { from: format(center - buffer, 'HH:mm'), to: format(center + buffer, 'HH:mm') }
}

export type ManualWindows = ReturnType<typeof useManualWindows>

/**
 * State for the user's own buffer: the earliest and latest time they think the event might start and end
 * (or, for instant events, happen). Completely separate from the calculated buffer. The fields start with what
 * was saved; clicking an empty one fills it with the calculated buffer (or the scheduled time).
 * `scheduled` holds the event's (possibly being edited) scheduled start and end.
 */
export function useManualWindows(
  saved: Pick<CalendarEvent, 'startAt' | 'endAt' | 'manualStart' | 'manualEnd'> | null,
  scheduled: { startAt: number | null; endAt: number | null | undefined },
  estimate: EventEstimate,
) {
  const initial = () => ({ start: toInput(saved?.startAt, saved?.manualStart), end: toInput(saved?.endAt, saved?.manualEnd) })
  const [values, setValues] = useState(initial)
  const { startAt, endAt } = scheduled
  const instant = startAt === null || endAt == null || endAt <= startAt
  const at = (slot: Slot) => (slot === 'start' ? startAt : endAt ?? null)
  const change = (slot: Slot, value: RangeInput) => setValues((v) => ({ ...v, [slot]: value }))

  return {
    instant, values,
    hasHistory: (slot: Slot) => estimate[slot] !== null,
    hasTime: (slot: Slot) => at(slot) !== null,
    change,
    fill(slot: Slot) {
      const time = at(slot)
      if (time !== null && !hasValue(values[slot])) change(slot, suggest(time, estimate[slot]))
    },
    clear(slot: Slot) { change(slot, EMPTY) },
    /** The saved values again, e.g. when the form is reopened. */
    reset() { setValues(initial()) },

    /** The windows to save for the given scheduled times (null = none), or an error message. */
    resolve(s: number | null, e: number | null | undefined): { manualStart: ManualWindow | null; manualEnd: ManualWindow | null } | string {
      const isInstant = s === null || e == null || e <= s
      const manualStart = parse(values.start, s, isInstant ? 'when it might happen' : 'when it might start', 'start')
      if (typeof manualStart === 'string') return manualStart
      // Instant events have no end, so an end window is dropped.
      const manualEnd = isInstant ? null : parse(values.end, e ?? null, 'when it might end', 'end')
      if (typeof manualEnd === 'string') return manualEnd
      return { manualStart, manualEnd }
    },
  }
}

function parse(value: RangeInput, at: number | null, what: string, slot: Slot): ManualWindow | null | string {
  if (!hasValue(value)) return null
  if (!value.from || !value.to) return `Enter both the earliest and latest time for ${what}.`
  if (at === null) return `Set a ${slot} time before giving a window for ${what}.`
  const from = nearest(value.from, at)
  const to = nearest(value.to, at)
  if (Number.isNaN(from) || Number.isNaN(to)) return `Invalid time for ${what}.`
  if (to < from) return `The latest time for ${what} must be after the earliest.`
  return { fromMinutes: Math.round((from - at) / MINUTE), toMinutes: Math.round((to - at) / MINUTE) }
}

/** The "might start / end / happen between" fields (only "happen" for instant events). */
export function ManualWindowFields({ id, windows, inputClassName }: { id: string; windows: ManualWindows; inputClassName?: string }) {
  const { instant } = windows
  return (
    <div role="group" aria-labelledby={`manual-${id}`} className="flex flex-col gap-3">
      <div className="flex flex-col gap-0.5">
        <p id={`manual-${id}`} className="text-sm font-medium">Your own buffer (optional)</p>
        <p className="text-xs text-muted-foreground">
          The earliest and latest you think it could {instant ? 'happen' : 'start or end'}. Kept separate from the calculated buffer, and shown in violet in the week view.
        </p>
      </div>
      <RangeField id={`manual-start-${id}`} slot="start" label={instant ? 'Might happen between' : 'Might start between'} windows={windows} inputClassName={inputClassName} />
      {instant ? null : <RangeField id={`manual-end-${id}`} slot="end" label="Might end between" windows={windows} inputClassName={inputClassName} />}
    </div>
  )
}

interface RangeFieldProps { id: string; slot: Slot; label: string; windows: ManualWindows; inputClassName?: string }

/** An earliest + latest time pair that fills itself in whenever it is clicked (focused) while empty. */
function RangeField({ id, slot, label, windows, inputClassName }: RangeFieldProps) {
  const current = windows.values[slot]
  const enabled = windows.hasTime(slot)
  const hint = !enabled
    ? `Set a ${slot} time first.`
    : hasValue(current)
      ? null
      : `Click to fill in ${windows.hasHistory(slot) ? 'the calculated buffer' : 'the scheduled time'}, then adjust it.`
  return (
    <div className="flex flex-col gap-1">
      <Label htmlFor={id}>{label}</Label>
      <div className="flex items-center gap-1">
        <div className="grid flex-1 grid-cols-[1fr_auto_1fr] items-center gap-2" onFocus={() => windows.fill(slot)}>
          <Input id={id} type="time" disabled={!enabled} value={current.from} onChange={(e) => windows.change(slot, { ...current, from: e.target.value })} aria-label={`${label}: earliest`} className={inputClassName} />
          <span className="text-xs text-muted-foreground" aria-hidden="true">and</span>
          <Input type="time" disabled={!enabled} value={current.to} onChange={(e) => windows.change(slot, { ...current, to: e.target.value })} aria-label={`${label}: latest`} className={inputClassName} />
        </div>
        {hasValue(current) ? (
          <Button type="button" variant="ghost" size="icon-sm" onClick={() => windows.clear(slot)} aria-label={`Clear ${label.toLowerCase()}`}>
            <X aria-hidden="true" />
          </Button>
        ) : null}
      </div>
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  )
}
