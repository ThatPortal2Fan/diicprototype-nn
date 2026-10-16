'use client'

import { useState } from 'react'
import { format } from 'date-fns'
import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { getBufferWindows, getEventEstimate } from '@/lib/event-utils'
import { BOUNDS_LABEL, MAX_DATE, MIN_DATE } from '@/lib/bounds'
import type { CalendarEvent, EventStatus } from '@/lib/types'

const MINUTE = 60_000
const STATUS_RANK: Record<EventStatus, number> = { scheduled: 0, in_progress: 1, done: 2 }
const later = (a: EventStatus, b: EventStatus) => (STATUS_RANK[a] >= STATUS_RANK[b] ? a : b)

type DateTimeInput = { date: string; time: string }
const EMPTY: DateTimeInput = { date: '', time: '' }
const toInput = (at: number | null): DateTimeInput => (at === null ? EMPTY : { date: format(at, 'yyyy-MM-dd'), time: format(at, 'HH:mm') })
const hasValue = (v: DateTimeInput | null) => Boolean(v && (v.date || v.time))

export type ActualTimes = ReturnType<typeof useActualTimes>

/**
 * State for the "when it actually..." fields and the status. The fields start blank (null = not clicked since the
 * form opened, which keeps what was recorded); the first click fills them with the recorded or predicted time.
 * The status follows the fields, but never drops below the saved status (or the one last picked by hand).
 * `scheduled` holds the event's (possibly being edited) scheduled start and end.
 */
export function useActualTimes(event: CalendarEvent, events: CalendarEvent[], scheduled: { startAt: number | null; endAt: number | null | undefined }) {
  const [started, setStarted] = useState<DateTimeInput | null>(null)
  const [completed, setCompleted] = useState<DateTimeInput | null>(null)
  const [floor, setFloor] = useState(event.status)
  const [picked, setPicked] = useState<EventStatus | null>(null)

  const { startAt, endAt } = scheduled
  const instant = startAt === null || endAt == null || endAt <= startAt
  const startStats = getEventEstimate(event, events).start
  const endWindow = getBufferWindows(event, events).end
  // Until an actual start / end is recorded, suggest the predicted time: the average of past occurrences
  // (or the scheduled time itself without enough history).
  const startOffset = (startStats?.meanMinutes ?? 0) * MINUTE
  const endOffset = (endWindow?.stats.meanMinutes ?? 0) * MINUTE
  const predictedStart = (s: number | null) => (s === null ? null : s + startOffset)
  const predictedEnd = (s: number | null, e: number | null | undefined) => (s === null || e == null || e <= s ? null : e + endOffset)

  const implied = (s: DateTimeInput | null, c: DateTimeInput | null): EventStatus =>
    (!instant && hasValue(c)) || (instant && hasValue(s)) ? 'done' : hasValue(s) ? 'in_progress' : 'scheduled'
  const derived = picked ?? later(floor, implied(started, completed))
  const status: EventStatus = instant && derived === 'in_progress' ? 'done' : derived

  function changeStarted(value: DateTimeInput) { setStarted(value); setPicked(null) }
  function changeCompleted(value: DateTimeInput) { setCompleted(value); setPicked(null) }

  return {
    instant, status, started, completed,
    hasStartHistory: startStats !== null, hasEndHistory: endWindow !== null,
    recordedStart: event.startedAt, recordedEnd: event.completedAt ?? null,
    fillStarted() { if (!started) changeStarted(toInput(event.startedAt ?? predictedStart(startAt))) },
    fillCompleted() { if (!completed) changeCompleted(toInput(event.completedAt ?? predictedEnd(startAt, endAt))) },
    changeStarted, changeCompleted,
    clearStarted() { changeStarted(EMPTY) },
    clearCompleted() { changeCompleted(EMPTY) },
    pickStatus(value: EventStatus) { setFloor(value); setPicked(value) },
    /** Blank fields and the saved status again, e.g. when the form is reopened. */
    reset() { setStarted(null); setCompleted(null); setFloor(event.status); setPicked(null) },

    /**
     * The actual times to save for the given scheduled times (undefined = leave as recorded, null = remove),
     * or an error message.
     */
    resolve(s: number | null, e: number | null | undefined): { startedAt: number | null | undefined; completedAt: number | null | undefined } | string {
      const isInstant = s === null || e == null || e <= s
      const word = isInstant ? 'happened' : 'started'
      let startedAt: number | null | undefined
      if (!started) {
        // Untouched: keep what was recorded. Just started (or done) without a time: assume the predicted start.
        startedAt = event.status === 'scheduled' && status !== 'scheduled' && event.startedAt == null ? predictedStart(s) ?? undefined : undefined
      } else {
        const parsed = parse(started, `when it actually ${word}`)
        if (typeof parsed === 'string') return parsed
        startedAt = parsed
      }
      let completedAt: number | null | undefined
      if (isInstant) {
        // It ends when it happens; otherwise undefined lets the store record "now" when it is marked done.
        completedAt = started ? startedAt : undefined
      } else if (!completed) {
        // Untouched: keep what was recorded. Just marked done without a time: assume the predicted end.
        completedAt = event.status !== 'done' && status === 'done' && event.completedAt == null ? predictedEnd(s, e) ?? undefined : undefined
      } else {
        const parsed = parse(completed, 'when it actually ended')
        if (typeof parsed === 'string') return parsed
        completedAt = parsed
      }
      const actualStart = startedAt === undefined ? event.startedAt : startedAt
      const actualEnd = completedAt === undefined ? event.completedAt : completedAt
      if (!isInstant && actualStart != null && actualEnd != null && actualStart > actualEnd) return 'It must have actually started before it actually ended.'
      return { startedAt, completedAt }
    },
  }
}

function parse(value: DateTimeInput, what: string): number | null | string {
  if (!value.date && !value.time) return null
  if (!value.date || !value.time) return `Enter both a date and a time for ${what}.`
  if (value.date < MIN_DATE || value.date > MAX_DATE) return `The date for ${what} must be between ${BOUNDS_LABEL}.`
  const at = new Date(`${value.date}T${value.time}`).getTime()
  return Number.isNaN(at) ? `Invalid time for ${what}.` : at
}

/** The "when it actually..." fields (only "happened" for instant events) and the status. */
export function ActualTimesFields({ id, times }: { id: string; times: ActualTimes }) {
  const { instant } = times
  return (
    <>
      <ActualTimeField
        id={`started-${id}`}
        label={instant ? 'When it actually happened (optional)' : 'When it actually started (optional)'}
        value={times.started}
        onFill={times.fillStarted}
        onChange={times.changeStarted}
        onClear={times.clearStarted}
        hint={`${hint(times.recordedStart, times.started, times.hasStartHistory ? 'the predicted time (average of past occurrences)' : 'the scheduled time')} Used to predict future timing.`}
      />
      {instant ? null : <ActualTimeField
        id={`completed-${id}`}
        label="When it actually ended (optional)"
        value={times.completed}
        onFill={times.fillCompleted}
        onChange={times.changeCompleted}
        onClear={times.clearCompleted}
        hint={`${hint(times.recordedEnd, times.completed, times.hasEndHistory ? 'the predicted end (average of past occurrences)' : 'the scheduled end')} Used to predict future end times.`}
      />}
      <div className="flex flex-col gap-1">
        <Label htmlFor={`status-${id}`}>Status</Label>
        <select id={`status-${id}`} value={times.status} onChange={(e) => times.pickStatus(e.target.value as EventStatus)} className="h-10 rounded-md border border-input bg-background px-3 text-sm">
          <option value="scheduled">Scheduled</option>
          {instant ? null : <option value="in_progress">In progress</option>}
          <option value="done">Done</option>
        </select>
      </div>
    </>
  )
}

function hint(recorded: number | null, value: DateTimeInput | null, suggestion: string) {
  if (recorded == null) return `Click to fill in ${suggestion}, then adjust it if needed.`
  if (value && !hasValue(value)) return 'The recorded time is removed when you save.'
  return `Recorded ${format(recorded, 'MMM d, HH:mm')}. Click to change it.`
}

interface ActualTimeFieldProps {
  id: string
  label: string
  value: DateTimeInput | null
  onFill: () => void
  onChange: (value: DateTimeInput) => void
  onClear: () => void
  hint: string
}

/** A date + time pair that starts blank and fills itself in on the first click (focus). */
function ActualTimeField({ id, label, value, onFill, onChange, onClear, hint }: ActualTimeFieldProps) {
  const current = value ?? EMPTY
  return (
    <div className="flex flex-col gap-1">
      <Label htmlFor={id}>{label}</Label>
      <div className="flex items-center gap-1">
        <div className="grid flex-1 grid-cols-2 gap-2" onFocus={onFill}>
          <Input id={id} type="date" min={MIN_DATE} max={MAX_DATE} value={current.date} onChange={(e) => onChange({ ...current, date: e.target.value })} aria-label={`${label}: date`} />
          <Input type="time" value={current.time} onChange={(e) => onChange({ ...current, time: e.target.value })} aria-label={`${label}: time`} />
        </div>
        {hasValue(value) ? (
          <Button type="button" variant="ghost" size="icon-sm" onClick={onClear} aria-label={`Clear ${label.replace(' (optional)', '').toLowerCase()}`}>
            <X aria-hidden="true" />
          </Button>
        ) : null}
      </div>
      <p className="text-xs text-muted-foreground">{hint}</p>
    </div>
  )
}
