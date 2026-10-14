'use client'

import { useId, useState, type FormEvent } from 'react'
import { addHours, format, startOfHour } from 'date-fns'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useEvents } from '@/hooks/use-events'
import {
  isInWindow,
  RECURRENCE_OPTIONS,
  WINDOW_MAX_DATE,
  WINDOW_MIN_DATE,
  WINDOW_START,
} from '@/lib/date-window'
import { getEventNames } from '@/lib/event-utils'
import type { CalendarEvent, EventPatch, EventStatus, NewEventInput, Recurrence } from '@/lib/types'
import { cn } from '@/lib/utils'

const MAX_NAME = 100
const MAX_DEVIATION = 720

const selectClass =
  'h-11 w-full rounded-lg border border-input bg-transparent px-3 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30'

type Direction = 'early' | 'late'

interface CreateProps {
  mode: 'create'
  onSubmit: (input: NewEventInput) => Promise<void>
  event?: never
}

interface EditProps {
  mode: 'edit'
  event: CalendarEvent
  onSubmit: (patch: EventPatch) => Promise<void>
}

type EventFormProps = (CreateProps | EditProps) & { submitLabel: string }

function initialValues(event?: CalendarEvent) {
  if (event) {
    return {
      date: format(event.startAt, 'yyyy-MM-dd'),
      start: format(event.startAt, 'HH:mm'),
      end: format(event.endAt, 'HH:mm'),
      direction: (event.deviationMinutes ?? 0) < 0 ? 'early' : ('late' as Direction),
      deviation: event.deviationMinutes === null ? '' : String(Math.abs(event.deviationMinutes)),
      actualStart: event.actualStartAt ? format(event.actualStartAt, "yyyy-MM-dd'T'HH:mm") : '',
    }
  }
  const base = Math.max(Date.now(), WINDOW_START)
  const next = addHours(startOfHour(base), 1)
  return {
    date: format(next, 'yyyy-MM-dd'),
    start: format(next, 'HH:mm'),
    end: format(addHours(next, 1), 'HH:mm'),
    direction: 'late' as Direction,
    deviation: '',
    actualStart: '',
  }
}

export function EventForm(props: EventFormProps) {
  const { mode, submitLabel } = props
  const event = mode === 'edit' ? props.event : undefined
  const uid = useId()
  const { events } = useEvents()
  const names = getEventNames(events)
  const [initial] = useState(() => initialValues(event))
  const [direction, setDirection] = useState<Direction>(initial.direction)
  const [recurrence, setRecurrence] = useState<Recurrence>('none')
  const [actualStart, setActualStart] = useState(initial.actualStart)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const id = (name: string) => `${uid}-${name}`

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    const data = new FormData(e.currentTarget)
    const name = String(data.get('name') ?? '').trim()
    const date = String(data.get('date') ?? '')
    const start = String(data.get('start') ?? '')
    const end = String(data.get('end') ?? '')
    const deviationRaw = String(data.get('deviation') ?? '').trim()

    if (!name) return setError('Please give the event a name.')
    if (name.length > MAX_NAME) return setError(`Name must be ${MAX_NAME} characters or fewer.`)

    const startAt = new Date(`${date}T${start}`).getTime()
    const endAt = new Date(`${date}T${end}`).getTime()
    if (!date || !start || !end || Number.isNaN(startAt) || Number.isNaN(endAt)) {
      return setError('Please choose a valid date, start and end time.')
    }
    if (endAt <= startAt) return setError('End time must be after the start time.')
    if (!isInWindow(startAt)) return setError('Events must be between October 2026 and December 2027.')

    let deviationMinutes: number | null = null
    if (deviationRaw) {
      const parsed = Number(deviationRaw)
      if (!Number.isInteger(parsed) || parsed < 0 || parsed > MAX_DEVIATION) {
        return setError(`Usual deviation must be a whole number between 0 and ${MAX_DEVIATION} minutes.`)
      }
      deviationMinutes = direction === 'early' ? -parsed : parsed
    }

    setSubmitting(true)
    try {
      if (props.mode === 'create') {
        const untilRaw = String(data.get('until') ?? '')
        const repeatUntil = untilRaw ? new Date(`${untilRaw}T23:59:59`).getTime() : null
        if (recurrence !== 'none' && repeatUntil !== null && repeatUntil < startAt) {
          setSubmitting(false)
          return setError('"Repeat until" must be on or after the event date.')
        }
        await props.onSubmit({ name, startAt, endAt, deviationMinutes, recurrence, repeatUntil })
      } else {
        const actualStartAt = actualStart ? new Date(actualStart).getTime() : null
        if (actualStartAt !== null && Number.isNaN(actualStartAt)) {
          setSubmitting(false)
          return setError('Please choose a valid actual start time.')
        }
        const status = String(data.get('status') ?? props.event.status) as EventStatus
        await props.onSubmit({ name, startAt, endAt, deviationMinutes, actualStartAt, status })
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong saving the event.')
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5" noValidate>
      <div className="flex flex-col gap-2">
        <Label htmlFor={id('name')}>Event name</Label>
        <Input
          id={id('name')}
          name="name"
          list={id('names')}
          placeholder={names.length ? 'Type a new name or pick a repeated one' : 'e.g. Morning run'}
          defaultValue={event?.name}
          maxLength={MAX_NAME}
          required
          autoComplete="off"
          className="h-11 text-base"
          aria-describedby={id('name-help')}
        />
        <datalist id={id('names')}>
          {names.map((n) => (
            <option key={n} value={n} />
          ))}
        </datalist>
        <p id={id('name-help')} className="text-xs text-muted-foreground">
          Events with the same name are treated as repeats and share one deviation.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor={id('date')}>Date</Label>
        <Input
          id={id('date')}
          name="date"
          type="date"
          min={WINDOW_MIN_DATE}
          max={WINDOW_MAX_DATE}
          defaultValue={initial.date}
          required
          className="h-11 text-base"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-2">
          <Label htmlFor={id('start')}>Starts</Label>
          <Input id={id('start')} name="start" type="time" defaultValue={initial.start} required className="h-11 text-base" />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor={id('end')}>Ends</Label>
          <Input id={id('end')} name="end" type="time" defaultValue={initial.end} required className="h-11 text-base" />
        </div>
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-sm font-medium">
          Usual deviation <span className="font-normal text-muted-foreground">(optional)</span>
        </legend>
        <div className="flex gap-2">
          <div role="radiogroup" aria-label="Direction" className="inline-flex shrink-0 rounded-lg bg-secondary p-0.5">
            {(['early', 'late'] as const).map((d) => (
              <button
                key={d}
                type="button"
                role="radio"
                aria-checked={direction === d}
                onClick={() => setDirection(d)}
                className={cn(
                  'h-10 rounded-md px-3 text-sm font-medium capitalize transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none',
                  direction === d ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {d}
              </button>
            ))}
          </div>
          <div className="relative flex-1">
            <Input
              id={id('deviation')}
              name="deviation"
              type="number"
              inputMode="numeric"
              min={0}
              max={MAX_DEVIATION}
              step={1}
              placeholder="10"
              defaultValue={initial.deviation}
              aria-label="Deviation in minutes"
              aria-describedby={id('deviation-help')}
              className="h-11 pr-16 text-base"
            />
            <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-muted-foreground">
              minutes
            </span>
          </div>
        </div>
        <p id={id('deviation-help')} className="text-xs text-muted-foreground">
          Your own estimate. Each time you start this event, the real start time refines it automatically.
        </p>
      </fieldset>

      {mode === 'create' ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <Label htmlFor={id('repeat')}>Repeat</Label>
            <select
              id={id('repeat')}
              value={recurrence}
              onChange={(e) => setRecurrence(e.target.value as Recurrence)}
              className={selectClass}
            >
              {RECURRENCE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          {recurrence !== 'none' ? (
            <div className="flex flex-col gap-2">
              <Label htmlFor={id('until')}>Repeat until</Label>
              <Input
                id={id('until')}
                name="until"
                type="date"
                min={WINDOW_MIN_DATE}
                max={WINDOW_MAX_DATE}
                defaultValue={WINDOW_MAX_DATE}
                className="h-11 text-base"
              />
            </div>
          ) : null}
        </div>
      ) : (
        <>
          <div className="flex flex-col gap-2">
            <Label htmlFor={id('actual')}>
              Actual start <span className="font-normal text-muted-foreground">(counts toward deviation)</span>
            </Label>
            <div className="flex gap-2">
              <Input
                id={id('actual')}
                type="datetime-local"
                value={actualStart}
                onChange={(e) => setActualStart(e.target.value)}
                className="h-11 flex-1 text-base"
              />
              <Button type="button" variant="outline" className="h-11" onClick={() => setActualStart('')} disabled={!actualStart}>
                Clear
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">Leave empty if you never recorded when it started.</p>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor={id('status')}>Status</Label>
            <select id={id('status')} name="status" defaultValue={event?.status} className={selectClass}>
              <option value="scheduled">Scheduled</option>
              <option value="in_progress">In progress</option>
              <option value="done">Done</option>
            </select>
          </div>
        </>
      )}

      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <Button type="submit" size="lg" className="h-12 rounded-xl text-base" disabled={submitting}>
        {submitting ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
        {submitting ? 'Saving…' : submitLabel}
      </Button>
    </form>
  )
}
