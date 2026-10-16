'use client'

import { useState, type CSSProperties, type ReactNode, type FormEvent } from 'react'
import { format } from 'date-fns'
import { Clock, Pencil, Timer, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { NameCombobox } from '@/components/name-combobox'
import { applyRepeatChange, removeEvent, updateEvent } from '@/lib/events-store'
import { useEvents } from '@/hooks/use-events'
import { canonical, detailOptions, eventTitle, getBufferWindows, getEventEstimate, formatDuration, isInstant } from '@/lib/event-utils'
import { BOUNDS_LABEL, MAX_DATE, MIN_DATE } from '@/lib/bounds'
import type { CalendarEvent, RepeatRule } from '@/lib/types'

const STATUS_LABEL: Record<CalendarEvent['status'], string> = { scheduled: 'Scheduled', in_progress: 'In progress', done: 'Done' }
const MINUTE = 60_000
type DateTimeInput = { date: string; time: string }
const toInput = (at: number | null): DateTimeInput => (at === null ? { date: '', time: '' } : { date: format(at, 'yyyy-MM-dd'), time: format(at, 'HH:mm') })
interface EventPopoverProps { event: CalendarEvent; className?: string; style?: CSSProperties; children: ReactNode }

export function EventPopover({ event, className, style, children }: EventPopoverProps) {
  const { events } = useEvents()
  const [deleting, setDeleting] = useState(false)
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // The "when it actually..." fields start blank (null = not clicked yet since opening the form). The first click fills
  // them with the recorded or predicted time and moves the status along.
  const [started, setStarted] = useState<DateTimeInput | null>(null)
  const [completed, setCompleted] = useState<DateTimeInput | null>(null)
  const [statusInput, setStatusInput] = useState(event.status)
  const [detailInput, setDetailInput] = useState(event.detail ?? '')
  const estimate = getEventEstimate(event, events)
  const startStats = estimate.start
  const endStats = estimate.end
  const date = event.startAt === null ? '' : format(event.startAt, 'yyyy-MM-dd')
  const time = event.startAt === null ? '' : format(event.startAt, 'HH:mm')
  const endTime = event.endAt == null ? '' : format(event.endAt, 'HH:mm')
  // Follow the date and times while editing: instant events (no end time) have no "in progress" or "actually ended".
  const [dateInput, setDateInput] = useState(date)
  const [timeInput, setTimeInput] = useState(time)
  const [endInput, setEndInput] = useState(endTime)
  const formInstant = !dateInput || !timeInput || !endInput || endInput <= timeInput
  const shownStatus = formInstant && statusInput === 'in_progress' ? 'done' : statusInput
  const windows = getBufferWindows(event, events)
  const details = detailOptions(events, event.name)
  // Until an actual start / finish is recorded, suggest the predicted time: the average of past occurrences
  // (or the scheduled time itself without enough history).
  const startOffset = (startStats?.meanMinutes ?? 0) * MINUTE
  const endOffset = (windows.end?.stats.meanMinutes ?? 0) * MINUTE
  const predictedEnd = (startAt: number | null, endAt: number | null | undefined) =>
    startAt === null || endAt == null || endAt <= startAt ? null : endAt + endOffset
  const typedStart = dateInput && timeInput ? new Date(`${dateInput}T${timeInput}`).getTime() : null
  const typedEnd = dateInput && endInput ? new Date(`${dateInput}T${endInput}`).getTime() : null
  const startedDefault = event.startedAt ?? (typedStart === null ? null : typedStart + startOffset)
  const completedDefault = event.completedAt ?? predictedEnd(typedStart, typedEnd)

  function fillStarted() {
    if (started) return
    setStarted(toInput(startedDefault))
    // An instant event just happens; otherwise it is now under way (a finished event stays done).
    setStatusInput((s) => (formInstant ? 'done' : s === 'done' ? s : 'in_progress'))
  }
  function fillCompleted() {
    if (completed) return
    setCompleted(toInput(completedDefault))
    setStatusInput('done')
  }
  function openEditor() {
    setStarted(null); setCompleted(null); setStatusInput(event.status)
    setDateInput(date); setTimeInput(time); setEndInput(endTime); setDetailInput(event.detail ?? ''); setEditing(true)
  }

  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    const data = new FormData(e.currentTarget)
    const name = String(data.get('name') ?? '').trim()
    const detail = canonical(String(data.get('detail') ?? ''), details)
    const d = String(data.get('date') ?? '')
    const t = String(data.get('time') ?? '')
    const et = String(data.get('endTime') ?? '')
    if (!name) return setError('Event name is required.')
    if (d && (d < MIN_DATE || d > MAX_DATE)) return setError(`Events must be between ${BOUNDS_LABEL}.`)
    const startAt = d && t ? new Date(`${d}T${t}`).getTime() : null
    const endAt = d && et ? new Date(`${d}T${et}`).getTime() : null
    if (startAt !== null && Number.isNaN(startAt)) return setError('Invalid start time.')
    if (endAt !== null && Number.isNaN(endAt)) return setError('Invalid end time.')
    if (startAt !== null && endAt !== null && endAt < startAt) return setError('End time must be after start time.')
    const instant = startAt === null || endAt === null || endAt <= startAt
    const status = String(data.get('status')) as CalendarEvent['status']
    const startedWord = instant ? 'happened' : 'started'
    // Fields left blank (never clicked) keep what was recorded. Once clicked, a cleared field removes it.
    let startedAt: number | null | undefined
    if (!started) {
      // Nothing recorded yet but marked in progress / done: assume the predicted start (following any new start time).
      startedAt = event.startedAt != null ? undefined : status === 'scheduled' || startAt === null ? null : startAt + startOffset
    } else {
      if (Boolean(started.date) !== Boolean(started.time)) return setError(`Enter both a date and a time for when it actually ${startedWord}.`)
      if (started.date && (started.date < MIN_DATE || started.date > MAX_DATE)) return setError(`When it actually ${startedWord} must be between ${BOUNDS_LABEL}.`)
      startedAt = started.date ? new Date(`${started.date}T${started.time}`).getTime() : null
      if (startedAt !== null && Number.isNaN(startedAt)) return setError(`Invalid time for when it actually ${startedWord}.`)
    }
    let completedAt: number | null | undefined
    if (instant) {
      // It ends when it happens; otherwise undefined lets the store record "now" when it is marked done.
      completedAt = started ? startedAt : undefined
    } else if (!completed) {
      // Nothing recorded yet but marked done: assume the predicted end (following any new times).
      const predicted = predictedEnd(startAt, endAt)
      completedAt = event.completedAt == null && status === 'done' && predicted !== null ? predicted : undefined
    } else {
      if (Boolean(completed.date) !== Boolean(completed.time)) return setError('Enter both a date and a time for when it actually ended.')
      if (completed.date && (completed.date < MIN_DATE || completed.date > MAX_DATE)) return setError(`When it actually ended must be between ${BOUNDS_LABEL}.`)
      completedAt = completed.date ? new Date(`${completed.date}T${completed.time}`).getTime() : null
      if (completedAt !== null && Number.isNaN(completedAt)) return setError('Invalid time for when it actually ended.')
    }
    const actualStart = startedAt === undefined ? event.startedAt : startedAt
    const actualEnd = completedAt === undefined ? event.completedAt : completedAt
    if (!instant && actualStart != null && actualEnd != null && actualStart > actualEnd) return setError('It must have actually started before it actually ended.')
    const repeatRule = String(data.get('repeatRule') ?? 'none') as RepeatRule
    const until = String(data.get('repeatUntil') ?? '')
    const repeatUntil = until ? new Date(`${until}T${t || '00:00'}`).getTime() : null
    if (repeatRule !== 'none' && (!until || !d || !t)) return setError('Repeating needs a date, a start time and a repeat-until date.')
    if (until && (until < MIN_DATE || until > MAX_DATE || (d && until < d))) return setError('Invalid repeat-until date.')
    setSaving(true)
    try {
      await updateEvent(event, { name, detail, startAt, endAt, repeatRule, repeatUntil, status, startedAt, completedAt })
      await applyRepeatChange(event, { ...event, name, detail, startAt, endAt, repeatRule, repeatUntil, status, startedAt: actualStart ?? null }, events)
      setEditing(false)
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not save event.') }
    finally { setSaving(false) }
  }

  return (
    <Popover>
      <PopoverTrigger className={className} style={style} aria-label={`${eventTitle(event)}${event.startAt === null ? '' : `, ${format(event.startAt, 'EEEE MMMM d, p')}`}`}>{children}</PopoverTrigger>
      <PopoverContent className="w-80 max-h-[80vh] overflow-y-auto">
        {!editing ? <>
          <div className="flex items-start justify-between gap-2"><p className="font-semibold text-balance">{event.name}{event.detail ? <span className="block text-sm font-normal text-muted-foreground">{event.detail}</span> : null}</p><Badge variant={event.status === 'scheduled' ? 'secondary' : 'outline'}>{STATUS_LABEL[event.status]}</Badge></div>
          <div className="flex flex-col gap-1.5 text-sm text-muted-foreground">
            <p className="flex items-center gap-2"><Clock className="size-4" aria-hidden="true" />{event.startAt === null ? 'Start time not set' : format(event.startAt, 'EEE, MMM d · p')}</p>
            {event.endAt != null ? <p>Ends {format(event.endAt, 'p')}</p> : null}
            {startStats ? <p className="flex items-center gap-2"><Timer className="size-4" aria-hidden="true" />{Math.round(startStats.meanMinutes) === 0 ? 'Usually starts on time' : `Usually starts ${formatDuration(startStats.meanMinutes)} ${startStats.meanMinutes < 0 ? 'early' : 'late'}`} (±{formatDuration(startStats.bufferMinutes)})</p> : <p>Not enough history to estimate timing yet</p>}
            {windows.start ? <p className="pl-6">Predicted start {format(windows.start.from, 'HH:mm')}–{format(windows.start.to, 'HH:mm')}</p> : null}
            {endStats && !isInstant(event) ? <p className="pl-6">Usually ends {Math.round(endStats.meanMinutes) === 0 ? 'on time' : `${formatDuration(endStats.meanMinutes)} ${endStats.meanMinutes < 0 ? 'early' : 'late'}`} (±{formatDuration(endStats.bufferMinutes)})</p> : null}
            {windows.end ? <p className="pl-6">Predicted end {format(windows.end.from, 'HH:mm')}–{format(windows.end.to, 'HH:mm')}</p> : null}
          </div>
          <div className="flex gap-2">
            <Button size="sm" className="flex-1" onClick={openEditor}><Pencil aria-hidden="true" />Edit event</Button>
            <Button variant="destructive" size="sm" disabled={deleting} onClick={async () => { setDeleting(true); try { await removeEvent(event) } finally { setDeleting(false) } }}><Trash2 aria-hidden="true" />Delete</Button>
          </div>
        </> : <form onSubmit={save} className="flex flex-col gap-3">
          <p className="font-semibold">Edit event</p>
          <div className="flex flex-col gap-1"><Label htmlFor={`name-${event.id}`}>Name</Label><Input id={`name-${event.id}`} name="name" defaultValue={event.name} required /></div>
          <div className="flex flex-col gap-1">
            <Label htmlFor={`detail-${event.id}`}>Detail (optional)</Label>
            <NameCombobox id={`detail-${event.id}`} name="detail" value={detailInput} onValueChange={setDetailInput} options={details} maxLength={100} required={false} optionsLabel="existing details" className="h-8 text-sm" />
          </div>
          <div className="flex flex-col gap-1"><Label htmlFor={`date-${event.id}`}>Date</Label><Input id={`date-${event.id}`} name="date" type="date" min={MIN_DATE} max={MAX_DATE} defaultValue={date} onChange={(e) => setDateInput(e.target.value)} /></div>
          <div className="flex flex-col gap-1"><Label htmlFor={`time-${event.id}`}>Start time (optional)</Label><Input id={`time-${event.id}`} name="time" type="time" defaultValue={time} onChange={(e) => setTimeInput(e.target.value)} /></div>
          <div className="flex flex-col gap-1"><Label htmlFor={`end-${event.id}`}>End time (optional)</Label><Input id={`end-${event.id}`} name="endTime" type="time" defaultValue={endTime} onChange={(e) => setEndInput(e.target.value)} /></div>
          <ActualTimeField
            id={`started-date-${event.id}`}
            label={formInstant ? 'When it actually happened (optional)' : 'When it actually started (optional)'}
            value={started}
            onFill={fillStarted}
            onChange={setStarted}
            hint={`${event.startedAt != null ? `Recorded ${format(event.startedAt, 'MMM d, HH:mm')}. Click to change it; clear it to remove.` : `Click to fill in ${startStats ? 'the predicted time (average of past occurrences)' : 'the scheduled time'}, then adjust it if needed.`} Filling it in marks the event as ${formInstant ? 'done' : 'in progress'}. Used to predict future timing.`}
          />
          {formInstant ? null : <ActualTimeField
            id={`completed-date-${event.id}`}
            label="When it actually ended (optional)"
            value={completed}
            onFill={fillCompleted}
            onChange={setCompleted}
            hint={`${event.completedAt != null ? `Recorded ${format(event.completedAt, 'MMM d, HH:mm')}. Click to change it; clear it to remove.` : `Click to fill in ${windows.end ? 'the predicted end (average of past occurrences)' : 'the scheduled end'}, then adjust it if needed.`} Filling it in marks the event as done. Used to predict future end times.`}
          />}
          <div className="flex flex-col gap-1"><Label htmlFor={`repeat-${event.id}`}>Repeats</Label><select id={`repeat-${event.id}`} name="repeatRule" defaultValue={event.repeatRule ?? 'none'} className="h-10 rounded-md border border-input bg-background px-3 text-sm"><option value="none">Never</option><option value="daily">Daily</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option></select></div>
          <div className="flex flex-col gap-1"><Label htmlFor={`until-${event.id}`}>Repeat until</Label><Input id={`until-${event.id}`} name="repeatUntil" type="date" min={MIN_DATE} max={MAX_DATE} defaultValue={event.repeatUntil == null ? '' : format(event.repeatUntil, 'yyyy-MM-dd')} /><p className="text-xs text-muted-foreground">Changing the repeat applies to this and the following occurrences that haven&apos;t started: they are recreated from this one, or removed for &ldquo;Never&rdquo;.</p></div>
          <div className="flex flex-col gap-1"><Label htmlFor={`status-${event.id}`}>Status</Label><select id={`status-${event.id}`} name="status" value={shownStatus} onChange={(e) => setStatusInput(e.target.value as CalendarEvent['status'])} className="h-10 rounded-md border border-input bg-background px-3 text-sm"><option value="scheduled">Scheduled</option>{formInstant ? null : <option value="in_progress">In progress</option>}<option value="done">Done</option></select></div>
          {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
          <div className="flex gap-2"><Button type="button" variant="outline" className="flex-1" onClick={() => setEditing(false)}>Cancel</Button><Button type="submit" className="flex-1" disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button></div>
        </form>}
      </PopoverContent>
    </Popover>
  )
}

interface ActualTimeFieldProps { id: string; label: string; value: DateTimeInput | null; onFill: () => void; onChange: (value: DateTimeInput) => void; hint: string }

/** A date + time pair that starts blank and fills itself in on the first click (focus). */
function ActualTimeField({ id, label, value, onFill, onChange, hint }: ActualTimeFieldProps) {
  const current = value ?? { date: '', time: '' }
  return (
    <div className="flex flex-col gap-1">
      <Label htmlFor={id}>{label}</Label>
      <div className="grid grid-cols-2 gap-2" onFocus={onFill}>
        <Input id={id} type="date" min={MIN_DATE} max={MAX_DATE} value={current.date} onChange={(e) => onChange({ ...current, date: e.target.value })} aria-label={`${label}: date`} />
        <Input type="time" value={current.time} onChange={(e) => onChange({ ...current, time: e.target.value })} aria-label={`${label}: time`} />
      </div>
      <p className="text-xs text-muted-foreground">{hint}</p>
    </div>
  )
}
