'use client'

import { useState, type CSSProperties, type ReactNode, type FormEvent } from 'react'
import { format } from 'date-fns'
import { Clock, Pencil, Timer, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { removeEvent, updateEvent } from '@/lib/events-store'
import { useEvents } from '@/hooks/use-events'
import { getEventEstimate, formatDuration } from '@/lib/event-utils'
import type { CalendarEvent, RepeatRule } from '@/lib/types'

const STATUS_LABEL: Record<CalendarEvent['status'], string> = { scheduled: 'Scheduled', in_progress: 'In progress', done: 'Done' }
const MIN_DATE = '2026-10-01'
const MAX_DATE = '2027-12-31'
interface EventPopoverProps { event: CalendarEvent; className?: string; style?: CSSProperties; children: ReactNode }

export function EventPopover({ event, className, style, children }: EventPopoverProps) {
  const { events } = useEvents()
  const [deleting, setDeleting] = useState(false)
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const estimate = getEventEstimate(event, events)
  const startStats = estimate.start
  const endStats = estimate.end
  const date = event.startAt === null ? '' : format(event.startAt, 'yyyy-MM-dd')
  const time = event.startAt === null ? '' : format(event.startAt, 'HH:mm')
  const endTime = event.endAt == null ? '' : format(event.endAt, 'HH:mm')

  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    const data = new FormData(e.currentTarget)
    const name = String(data.get('name') ?? '').trim()
    const d = String(data.get('date') ?? '')
    const t = String(data.get('time') ?? '')
    const et = String(data.get('endTime') ?? '')
    if (!name) return setError('Event name is required.')
    if (d && (d < MIN_DATE || d > MAX_DATE)) return setError('Events must be between October 2026 and December 2027.')
    const startAt = d && t ? new Date(`${d}T${t}`).getTime() : null
    const endAt = d && et ? new Date(`${d}T${et}`).getTime() : null
    if (startAt !== null && Number.isNaN(startAt)) return setError('Invalid start time.')
    if (endAt !== null && Number.isNaN(endAt)) return setError('Invalid end time.')
    if (startAt !== null && endAt !== null && endAt < startAt) return setError('End time must be after start time.')
    const repeatRule = String(data.get('repeatRule') ?? 'none') as RepeatRule
    const until = String(data.get('repeatUntil') ?? '')
    const repeatUntil = until ? new Date(`${until}T${t || '00:00'}`).getTime() : null
    if (until && (until < MIN_DATE || until > MAX_DATE || (d && until < d))) return setError('Invalid repeat-until date.')
    setSaving(true)
    try {
      await updateEvent(event, { name, startAt, endAt, repeatRule, repeatUntil, status: String(data.get('status')) as CalendarEvent['status'] })
      setEditing(false)
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not save event.') }
    finally { setSaving(false) }
  }

  return (
    <Popover>
      <PopoverTrigger className={className} style={style} aria-label={`${event.name}${event.startAt === null ? '' : `, ${format(event.startAt, 'EEEE MMMM d, p')}`}`}>{children}</PopoverTrigger>
      <PopoverContent className="w-80 max-h-[80vh] overflow-y-auto">
        {!editing ? <>
          <div className="flex items-start justify-between gap-2"><p className="font-semibold text-balance">{event.name}</p><Badge variant={event.status === 'scheduled' ? 'secondary' : 'outline'}>{STATUS_LABEL[event.status]}</Badge></div>
          <div className="flex flex-col gap-1.5 text-sm text-muted-foreground">
            <p className="flex items-center gap-2"><Clock className="size-4" aria-hidden="true" />{event.startAt === null ? 'Start time not set' : format(event.startAt, 'EEE, MMM d · p')}</p>
            {event.endAt != null ? <p>Ends {format(event.endAt, 'p')}</p> : null}
            {startStats ? <p className="flex items-center gap-2"><Timer className="size-4" aria-hidden="true" />{Math.round(startStats.meanMinutes) === 0 ? 'Usually starts on time' : `Usually starts ${formatDuration(startStats.meanMinutes)} ${startStats.meanMinutes < 0 ? 'early' : 'late'}`}, buffer {formatDuration(startStats.bufferMinutes)}</p> : <p>Not enough history to estimate timing yet</p>}
            {endStats ? <p className="pl-6">Usually ends {Math.round(endStats.meanMinutes) === 0 ? 'on time' : `${formatDuration(endStats.meanMinutes)} ${endStats.meanMinutes < 0 ? 'early' : 'late'}`}, buffer {formatDuration(endStats.bufferMinutes)}</p> : null}
          </div>
          <div className="flex gap-2">
            <Button size="sm" className="flex-1" onClick={() => setEditing(true)}><Pencil aria-hidden="true" />Edit event</Button>
            <Button variant="destructive" size="sm" disabled={deleting} onClick={async () => { setDeleting(true); try { await removeEvent(event) } finally { setDeleting(false) } }}><Trash2 aria-hidden="true" />Delete</Button>
          </div>
        </> : <form onSubmit={save} className="flex flex-col gap-3">
          <p className="font-semibold">Edit event</p>
          <div className="flex flex-col gap-1"><Label htmlFor={`name-${event.id}`}>Name</Label><Input id={`name-${event.id}`} name="name" defaultValue={event.name} required /></div>
          <div className="flex flex-col gap-1"><Label htmlFor={`date-${event.id}`}>Date</Label><Input id={`date-${event.id}`} name="date" type="date" min={MIN_DATE} max={MAX_DATE} defaultValue={date} /></div>
          <div className="flex flex-col gap-1"><Label htmlFor={`time-${event.id}`}>Start time (optional)</Label><Input id={`time-${event.id}`} name="time" type="time" defaultValue={time} /></div>
          <div className="flex flex-col gap-1"><Label htmlFor={`end-${event.id}`}>End time (optional)</Label><Input id={`end-${event.id}`} name="endTime" type="time" defaultValue={endTime} /></div>
          <div className="flex flex-col gap-1"><Label htmlFor={`repeat-${event.id}`}>Repeats</Label><select id={`repeat-${event.id}`} name="repeatRule" defaultValue={event.repeatRule ?? 'none'} className="h-10 rounded-md border border-input bg-background px-3 text-sm"><option value="none">Never</option><option value="daily">Daily</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option></select></div>
          <div className="flex flex-col gap-1"><Label htmlFor={`until-${event.id}`}>Repeat until</Label><Input id={`until-${event.id}`} name="repeatUntil" type="date" min={MIN_DATE} max={MAX_DATE} defaultValue={event.repeatUntil == null ? '' : format(event.repeatUntil, 'yyyy-MM-dd')} /></div>
          <div className="flex flex-col gap-1"><Label htmlFor={`status-${event.id}`}>Status</Label><select id={`status-${event.id}`} name="status" defaultValue={event.status} className="h-10 rounded-md border border-input bg-background px-3 text-sm"><option value="scheduled">Scheduled</option><option value="in_progress">In progress</option><option value="done">Done</option></select></div>
          {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
          <div className="flex gap-2"><Button type="button" variant="outline" className="flex-1" onClick={() => setEditing(false)}>Cancel</Button><Button type="submit" className="flex-1" disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button></div>
        </form>}
      </PopoverContent>
    </Popover>
  )
}
