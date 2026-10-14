'use client'

import Link from 'next/link'
import { useState } from 'react'
import { format } from 'date-fns'
import { CheckCircle2, Loader2, Play, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ShiftControls } from '@/components/next-event/shift-controls'
import { useEvents } from '@/hooks/use-events'
import { useNow } from '@/hooks/use-now'
import { completeEvent, startEventNow } from '@/lib/events-store'
import {
  getInProgressEvents,
  getNearestEvent,
  relativeLabel,
} from '@/lib/event-utils'
import type { CalendarEvent } from '@/lib/types'

export function NextEventView() {
  const { events, status } = useEvents()
  const now = useNow()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const nearest = getNearestEvent(events)
  const inProgress = getInProgressEvents(events)

  async function run(action: () => Promise<void>) {
    setBusy(true)
    setError(null)
    try {
      await action()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
    } finally {
      setBusy(false)
    }
  }

  if (status === 'loading') {
    return <div className="h-64 animate-pulse rounded-2xl bg-card ring-1 ring-border" />
  }

  return (
    <div className="flex flex-col gap-4">
      {inProgress.map((event) => (
        <InProgressCard
          key={event.id}
          event={event}
          now={now}
          busy={busy}
          onComplete={() => run(() => completeEvent(event))}
        />
      ))}

      {nearest ? (
        <>
          <NearestCard
            event={nearest}
            now={now}
            busy={busy}
            onStart={() => run(() => startEventNow(nearest))}
          />
          <ShiftControls
            key={nearest.id}
            event={nearest}
            busy={busy}
            events={events}
          />
        </>
      ) : (
        <div className="flex flex-col items-center gap-4 rounded-2xl bg-card px-6 py-12 text-center shadow-sm ring-1 ring-border">
          <p className="text-lg font-semibold">No upcoming events</p>
          <p className="text-sm text-muted-foreground">Add one and it will show up here.</p>
          <Button render={<Link href="/add" />} nativeButton={false} className="rounded-xl">
            <Plus aria-hidden="true" />
            Add event
          </Button>
        </div>
      )}

      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  )
}

function NearestCard({
  event,
  now,
  busy,
  onStart,
}: {
  event: CalendarEvent
  now: number | null
  busy: boolean
  onStart: () => void
}) {
  const dev = event.deviationMinutes
  const minutesUntil = now !== null && event.startAt !== null ? (event.startAt - now) / 60_000 : 0
  const overdue = now !== null && event.startAt !== null && minutesUntil < 0
  const withinWindow = now !== null && event.startAt !== null && dev !== null && Math.abs(minutesUntil) <= Math.abs(dev)

  return (
    <section
      aria-labelledby="nearest-heading"
      className="flex flex-col gap-5 rounded-2xl bg-card p-5 shadow-sm ring-1 ring-border"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-primary">{now !== null && event.startAt !== null && now >= event.startAt ? 'Current event' : event.startAt === null ? 'Date/time not set' : format(event.startAt, 'EEEE, MMMM d')}</p>
          <h2 id="nearest-heading" className="text-2xl font-semibold text-balance">
            {event.name}
          </h2>
        </div>
        {overdue ? (
          <Badge variant="destructive">Overdue</Badge>
        ) : withinWindow ? (
          <Badge>In window</Badge>
        ) : null}
      </div>

      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="font-mono text-5xl font-semibold tracking-tight tabular-nums">
            {event.startAt === null ? '—' : format(event.startAt, 'HH:mm')}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">{now !== null && event.startAt !== null ? relativeLabel(event.startAt, now) : '\u00a0'}</p>
        </div>

      </div>



      <Button size="lg" className="h-14 rounded-xl text-base" disabled={busy} onClick={onStart}>
        {busy ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Play className="fill-current" aria-hidden="true" />}
        Start it now
      </Button>
    </section>
  )
}

function InProgressCard({
  event,
  now,
  busy,
  onComplete,
}: {
  event: CalendarEvent
  now: number | null
  busy: boolean
  onComplete: () => void
}) {
  return (
    <section className="flex items-center justify-between gap-3 rounded-2xl bg-emerald-50 p-4 ring-1 ring-emerald-200">
      <div className="min-w-0">
        <p className="flex items-center gap-1.5 text-xs font-semibold tracking-wide text-emerald-700 uppercase">
          <span className="size-2 animate-pulse rounded-full bg-emerald-500" aria-hidden="true" />
          In progress
        </p>
        <p className="truncate font-semibold">{event.name}</p>
        <p className="text-xs text-muted-foreground">
          Started {now !== null && (event.startedAt ?? event.startAt) !== null ? relativeLabel((event.startedAt ?? event.startAt)!, now) : ''}
        </p>
      </div>
      <Button variant="outline" disabled={busy} onClick={onComplete} className="shrink-0 rounded-xl bg-card">
        <CheckCircle2 aria-hidden="true" />
        Done
      </Button>
    </section>
  )
}
