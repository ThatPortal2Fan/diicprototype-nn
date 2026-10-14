'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { format } from 'date-fns'
import { CheckCircle2, History, Loader2, Pencil, Play, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { EditEventDialog } from '@/components/edit-event-dialog'
import { useEvents } from '@/hooks/use-events'
import { useNow } from '@/hooks/use-now'
import { completeEvent, startEventNow } from '@/lib/events-store'
import {
  describeDeviation,
  getDeviationStats,
  getFocusEvent,
  getInProgressEvents,
  isOngoing,
  relativeLabel,
  statsFor,
  type DeviationStats,
} from '@/lib/event-utils'
import type { CalendarEvent } from '@/lib/types'

export function NextEventView() {
  const { events, status } = useEvents()
  const now = useNow()
  const stats = useMemo(() => getDeviationStats(events), [events])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState<CalendarEvent | null>(null)

  const focus = getFocusEvent(events, now)
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
        <InProgressCard key={event.id} event={event} now={now} busy={busy} onComplete={() => run(() => completeEvent(event))} />
      ))}

      {focus ? (
        <>
          <FocusCard
            event={focus}
            now={now}
            busy={busy}
            onStart={() => run(() => startEventNow(focus))}
            onEdit={() => setEditing(focus)}
          />
          <DeviationCard event={focus} stats={statsFor(stats, focus)} />
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

      <EditEventDialog event={editing} onOpenChange={(open) => !open && setEditing(null)} />
    </div>
  )
}

function FocusCard({
  event,
  now,
  busy,
  onStart,
  onEdit,
}: {
  event: CalendarEvent
  now: number | null
  busy: boolean
  onStart: () => void
  onEdit: () => void
}) {
  const current = isOngoing(event, now)

  return (
    <section aria-labelledby="focus-heading" className="flex flex-col gap-5 rounded-2xl bg-card p-5 shadow-sm ring-1 ring-border">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-primary">{current ? 'Current event' : 'Next event'}</p>
          <h2 id="focus-heading" className="text-2xl font-semibold text-balance">
            {event.name}
          </h2>
          <p className="text-sm text-muted-foreground">{format(event.startAt, 'EEEE, MMMM d')}</p>
        </div>
        <div className="flex items-center gap-1">
          {current ? <Badge>Ongoing</Badge> : null}
          <Button variant="ghost" size="icon" onClick={onEdit} aria-label="Edit event">
            <Pencil aria-hidden="true" />
          </Button>
        </div>
      </div>

      <div>
        <p className="font-mono text-5xl font-semibold tracking-tight tabular-nums">
          {format(event.startAt, 'HH:mm')}
          <span className="text-2xl text-muted-foreground">{` – ${format(event.endAt, 'HH:mm')}`}</span>
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          {now ? (current ? `Planned to start ${relativeLabel(event.startAt, now)}` : relativeLabel(event.startAt, now)) : '\u00a0'}
        </p>
      </div>

      <Button size="lg" className="h-14 rounded-xl text-base" disabled={busy} onClick={onStart}>
        {busy ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Play className="fill-current" aria-hidden="true" />}
        Start it now
      </Button>
    </section>
  )
}

function DeviationCard({ event, stats }: { event: CalendarEvent; stats: DeviationStats }) {
  const summary = describeDeviation(stats.minutes)
  const sources = [
    stats.samples ? (stats.samples === 1 ? '1 recorded start' : `${stats.samples} recorded starts`) : null,
    stats.manual !== null ? 'your estimate' : null,
  ].filter(Boolean)

  return (
    <section aria-labelledby="deviation-heading" className="flex gap-4 rounded-2xl bg-card p-5 shadow-sm ring-1 ring-border">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-accent text-accent-foreground">
        <History className="size-5" aria-hidden="true" />
      </span>
      <div className="flex flex-col gap-1">
        <h2 id="deviation-heading" className="font-semibold text-pretty">
          {summary ?? 'No start history yet'}
        </h2>
        {stats.minutes !== null ? (
          <>
            <p className="text-sm text-muted-foreground">
              {`Expect it around ${format(event.startAt + stats.minutes * 60_000, 'p')}.`}
            </p>
            <p className="text-xs text-muted-foreground">{`Based on ${sources.join(' and ')}.`}</p>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">
            {"Starting this event records how early or late it begins. Repeats with the same name build up the average."}
          </p>
        )}
      </div>
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
    <section className="flex items-center justify-between gap-3 rounded-2xl bg-emerald-500/10 p-4 ring-1 ring-emerald-500/30">
      <div className="min-w-0">
        <p className="flex items-center gap-1.5 text-xs font-semibold tracking-wide text-emerald-600 uppercase dark:text-emerald-400">
          <span className="size-2 animate-pulse rounded-full bg-emerald-500" aria-hidden="true" />
          In progress
        </p>
        <p className="truncate font-semibold">{event.name}</p>
        <p className="text-xs text-muted-foreground">
          Started {now ? relativeLabel(event.actualStartAt ?? event.startAt, now) : ''}
        </p>
      </div>
      <Button variant="outline" disabled={busy} onClick={onComplete} className="shrink-0 rounded-xl bg-card">
        <CheckCircle2 aria-hidden="true" />
        Done
      </Button>
    </section>
  )
}
