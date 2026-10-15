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
interface EventPopoverProps { event: CalendarEvent; className?: string; style?: CSSProperties; children: ReactNode }

export function EventPopover({ event, className, style, children }: EventPopoverProps) {
  const { events } = useEvents()
  const [deleting, setDeleting] = useState(false)
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [startedTouched, setStartedTouched] = useState(false)
  const [completedTouched, setCompletedTouched] = useState(false)
  const [detailInput, setDetailInput] = useState(event.detail ?? '')
  const estimate = getEventEstimate(event, events)
  const startStats = estimate.start
  const endStats = estimate.end
  const date = event.startAt === null ? '' : format(event.startAt, 'yyyy-MM-dd')
  const time = event.startAt === null ? '' : format(event.startAt, 'HH:mm')
  const endTime = event.endAt == null ? '' : format(event.endAt, 'HH:mm')
  // Instant events (no end time) have no "actually finished"; follows the end time field while editing.
  const [endInput, setEndInput] = useState(endTime)
  const [finishKey, setFinishKey] = useState(endTime)
  const windows = getBufferWindows(event, events)
  const details = detailOptions(events, event.name)
  // Until an actual start / finish is recorded, suggest the predicted time: the average of past occurrences
  // (or the scheduled time itself without enough history).
  const startOffset = (startStats?.meanMinutes ?? 0) * MINUTE
  const endOffset = (windows.end?.stats.meanMinutes ?? 0) * MINUTE
  const predictedEnd = (startAt: number | null, endAt: number | null | undefined) =>
    startAt === null || endAt == null || endAt <= startAt ? null : endAt + endOffset
  const startedDefault = event.startedAt ?? (event.startAt === null ? null : event.startAt + startOffset)
  const startedDate = startedDefault == null ? '' : format(startedDefault, 'yyyy-MM-dd')
  const startedTime = startedDefault == null ? '' : format(startedDefault, 'HH:mm')
  const typedEnd = date && endInput ? new Date(`${date}T${endInput}`).getTime() : null
  const completedDefault = event.completedAt ?? predictedEnd(event.startAt, typedEnd)
  const completedDate = completedDefault == null ? '' : format(completedDefault, 'yyyy-MM-dd')
  const completedTime = completedDefault == null ? '' : format(completedDefault, 'HH:mm')

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
    let status = String(data.get('status')) as CalendarEvent['status']
    let completedAt: number | null | undefined
    if (startAt === null || endAt === null || endAt <= startAt) {
      completedAt = undefined // instant event: no finish to record from the form
    } else if (event.completedAt == null && !completedTouched) {
      // Suggested value left as is: only record it once the event is done (following any new times).
      // undefined lets the store record "now" when there is no scheduled time to follow.
      const predicted = predictedEnd(startAt, endAt)
      completedAt = status === 'done' && predicted !== null ? predicted : undefined
    } else {
      const cd = String(data.get('completedDate') ?? '')
      const ct = String(data.get('completedTime') ?? '')
      if (Boolean(cd) !== Boolean(ct)) return setError('Enter both a date and a time for when it actually finished.')
      if (cd && (cd < MIN_DATE || cd > MAX_DATE)) return setError(`Actual finish must be between ${BOUNDS_LABEL}.`)
      completedAt = cd && ct ? new Date(`${cd}T${ct}`).getTime() : null
      if (completedAt !== null && Number.isNaN(completedAt)) return setError('Invalid actual finish time.')
      if (completedAt !== null && event.completedAt == null) status = 'done' // a finish was just entered, so it is done
    }
    let startedAt: number | null
    if (event.startedAt == null && !startedTouched) {
      // Suggested value left as is: only record it once the event is in progress or done (following any new start time).
      startedAt = status === 'scheduled' || startAt === null ? null : startAt + startOffset
    } else {
      const sd = String(data.get('startedDate') ?? '')
      const st = String(data.get('startedTime') ?? '')
      if (Boolean(sd) !== Boolean(st)) return setError('Enter both a date and a time for when it actually started.')
      if (sd && (sd < MIN_DATE || sd > MAX_DATE)) return setError(`Actual start must be between ${BOUNDS_LABEL}.`)
      startedAt = sd && st ? new Date(`${sd}T${st}`).getTime() : null
      if (startedAt !== null && Number.isNaN(startedAt)) return setError('Invalid actual start time.')
    }
    if (startedAt !== null && completedAt != null && startedAt > completedAt) return setError('Actual start must be before the actual finish.')
    if (startedAt !== null && status === 'scheduled') status = 'in_progress' // it has started, so it is no longer just scheduled
    const repeatRule = String(data.get('repeatRule') ?? 'none') as RepeatRule
    const until = String(data.get('repeatUntil') ?? '')
    const repeatUntil = until ? new Date(`${until}T${t || '00:00'}`).getTime() : null
    if (repeatRule !== 'none' && (!until || !d || !t)) return setError('Repeating needs a date, a start time and a repeat-until date.')
    if (until && (until < MIN_DATE || until > MAX_DATE || (d && until < d))) return setError('Invalid repeat-until date.')
    setSaving(true)
    try {
      await updateEvent(event, { name, detail, startAt, endAt, repeatRule, repeatUntil, status, startedAt, completedAt })
      await applyRepeatChange(event, { ...event, name, detail, startAt, endAt, repeatRule, repeatUntil, status, startedAt }, events)
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
            <Button size="sm" className="flex-1" onClick={() => { setStartedTouched(false); setCompletedTouched(false); setEndInput(endTime); setDetailInput(event.detail ?? ''); setEditing(true) }}><Pencil aria-hidden="true" />Edit event</Button>
            <Button variant="destructive" size="sm" disabled={deleting} onClick={async () => { setDeleting(true); try { await removeEvent(event) } finally { setDeleting(false) } }}><Trash2 aria-hidden="true" />Delete</Button>
          </div>
        </> : <form onSubmit={save} className="flex flex-col gap-3">
          <p className="font-semibold">Edit event</p>
          <div className="flex flex-col gap-1"><Label htmlFor={`name-${event.id}`}>Name</Label><Input id={`name-${event.id}`} name="name" defaultValue={event.name} required /></div>
          <div className="flex flex-col gap-1">
            <Label htmlFor={`detail-${event.id}`}>Detail (optional)</Label>
            <NameCombobox id={`detail-${event.id}`} name="detail" value={detailInput} onValueChange={setDetailInput} options={details} maxLength={100} required={false} optionsLabel="existing details" className="h-8 text-sm" />
          </div>
          <div className="flex flex-col gap-1"><Label htmlFor={`date-${event.id}`}>Date</Label><Input id={`date-${event.id}`} name="date" type="date" min={MIN_DATE} max={MAX_DATE} defaultValue={date} /></div>
          <div className="flex flex-col gap-1"><Label htmlFor={`time-${event.id}`}>Start time (optional)</Label><Input id={`time-${event.id}`} name="time" type="time" defaultValue={time} /></div>
          <div className="flex flex-col gap-1"><Label htmlFor={`end-${event.id}`}>End time (optional)</Label><Input id={`end-${event.id}`} name="endTime" type="time" defaultValue={endTime} onChange={(e) => setEndInput(e.target.value)} /></div>
          <div className="flex flex-col gap-1">
            <Label htmlFor={`started-date-${event.id}`}>It actually started (optional)</Label>
            <div className="grid grid-cols-2 gap-2" onChange={() => setStartedTouched(true)}>
              <Input id={`started-date-${event.id}`} name="startedDate" type="date" min={MIN_DATE} max={MAX_DATE} defaultValue={startedDate} aria-label="Actual start date" />
              <Input name="startedTime" type="time" defaultValue={startedTime} aria-label="Actual start time" />
            </div>
            <p className="text-xs text-muted-foreground">{event.startedAt == null ? `Pre-filled with ${startStats ? 'the predicted start (average of past occurrences)' : 'the scheduled start'}; only change it if it actually started at a different time. Recorded when the event is in progress or done. ` : ''}Used to predict future timing. Changing it marks a scheduled event as started; clear it to remove.</p>
          </div>
          {endInput ? <div className="flex flex-col gap-1">
            <Label htmlFor={`completed-date-${event.id}`}>It actually finished (optional)</Label>
            {/* Re-mounted while untouched so the pre-fill follows the end time as it is typed. */}
            <div key={completedTouched ? finishKey : endInput} className="grid grid-cols-2 gap-2" onChange={() => { if (!completedTouched) { setFinishKey(endInput); setCompletedTouched(true) } }}>
              <Input id={`completed-date-${event.id}`} name="completedDate" type="date" min={MIN_DATE} max={MAX_DATE} defaultValue={completedDate} aria-label="Actual finish date" />
              <Input name="completedTime" type="time" defaultValue={completedTime} aria-label="Actual finish time" />
            </div>
            <p className="text-xs text-muted-foreground">{event.completedAt == null ? `Pre-filled with ${windows.end ? 'the predicted end (average of past occurrences)' : 'the scheduled end'}; only change it if it actually finished at a different time. Recorded when the event is done. ` : ''}Used to predict future end times. Changing it marks the event as done; clear it to remove.</p>
          </div> : null}
          <div className="flex flex-col gap-1"><Label htmlFor={`repeat-${event.id}`}>Repeats</Label><select id={`repeat-${event.id}`} name="repeatRule" defaultValue={event.repeatRule ?? 'none'} className="h-10 rounded-md border border-input bg-background px-3 text-sm"><option value="none">Never</option><option value="daily">Daily</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option></select></div>
          <div className="flex flex-col gap-1"><Label htmlFor={`until-${event.id}`}>Repeat until</Label><Input id={`until-${event.id}`} name="repeatUntil" type="date" min={MIN_DATE} max={MAX_DATE} defaultValue={event.repeatUntil == null ? '' : format(event.repeatUntil, 'yyyy-MM-dd')} /><p className="text-xs text-muted-foreground">Changing the repeat applies to this and the following occurrences that haven&apos;t started: they are recreated from this one, or removed for &ldquo;Never&rdquo;.</p></div>
          <div className="flex flex-col gap-1"><Label htmlFor={`status-${event.id}`}>Status</Label><select id={`status-${event.id}`} name="status" defaultValue={event.status} className="h-10 rounded-md border border-input bg-background px-3 text-sm"><option value="scheduled">Scheduled</option><option value="in_progress">In progress</option><option value="done">Done</option></select></div>
          {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
          <div className="flex gap-2"><Button type="button" variant="outline" className="flex-1" onClick={() => setEditing(false)}>Cancel</Button><Button type="submit" className="flex-1" disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button></div>
        </form>}
      </PopoverContent>
    </Popover>
  )
}
