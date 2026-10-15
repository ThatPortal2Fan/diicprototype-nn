'use client'

import Link from 'next/link'
import { format, isSameWeek } from 'date-fns'
import { ArrowRight, CalendarDays, Plus, Timer } from 'lucide-react'
import { NotificationBell } from '@/components/notification-bell'
import { DataStatusBanner } from '@/components/data-status-banner'
import { useEvents } from '@/hooks/use-events'
import { useNow } from '@/hooks/use-now'
import { eventTitle, formatDuration, getNearestEvent, getStartWindow, relativeLabel } from '@/lib/event-utils'

export function MainMenu() {
  const { events, status } = useEvents()
  const now = useNow()
  const nearest = getNearestEvent(events, now)
  const nearestWindow = nearest && nearest.status === 'scheduled' ? getStartWindow(nearest, events) : null
  const thisWeekCount = now
    ? events.filter((e) => e.status !== 'done' && e.startAt !== null && isSameWeek(e.startAt, now)).length
    : 0

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-6 px-5 pt-6 pb-10">
      <header className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-primary">
            {now ? format(now, 'EEEE, MMMM d') : '\u00a0'}
          </p>
          <h1 className="text-3xl font-bold tracking-tight text-balance">SteadyPace</h1>
        </div>
        <NotificationBell />
      </header>

      <DataStatusBanner />

      <nav aria-label="Main menu" className="flex flex-col gap-3">
        <Link
          href="/next"
          className="group flex flex-col gap-4 rounded-2xl bg-primary p-5 text-primary-foreground shadow-sm transition-transform focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:ring-offset-2 focus-visible:outline-none active:scale-[0.99]"
        >
          <div className="flex items-center justify-between">
            <span className="inline-flex items-center gap-2 text-sm font-medium opacity-90">
              <Timer className="size-4" aria-hidden="true" />
              Next event
            </span>
            <ArrowRight
              className="size-5 transition-transform group-hover:translate-x-0.5"
              aria-hidden="true"
            />
          </div>
          {status === 'loading' ? (
            <div className="h-16 animate-pulse rounded-lg bg-primary-foreground/15" />
          ) : nearest ? (
            <div>
              <p className="text-2xl font-semibold text-balance">{eventTitle(nearest)}</p>
              <p className="mt-1 text-sm opacity-90">
                {nearest.status === 'in_progress' ? 'In progress · ' : ''}
                {nearest.startAt === null ? 'Time not set' : format(nearest.startAt, 'EEE, MMM d · p')}
                {now !== null && nearest.startAt !== null ? ` · ${relativeLabel(nearest.startAt, now)}` : ''}
              </p>
              {nearestWindow ? (
                <p className="mt-2 inline-flex flex-wrap items-center gap-x-1.5 rounded-lg border border-dashed border-primary-foreground/50 bg-primary-foreground/10 px-2.5 py-1 text-sm">
                  <span className="font-medium tabular-nums">
                    Predicted start {format(nearestWindow.from, 'p')} – {format(nearestWindow.to, 'p')}
                  </span>
                  <span className="opacity-80">· ±{formatDuration(nearestWindow.stats.bufferMinutes)}</span>
                </p>
              ) : null}
            </div>
          ) : (
            <div>
              <p className="text-2xl font-semibold">Nothing scheduled</p>
              <p className="mt-1 text-sm opacity-90">Add an event to see it here.</p>
            </div>
          )}
          <span className="self-start rounded-full bg-primary-foreground/15 px-3 py-1 text-xs font-medium">
            Start, anticipate or delay
          </span>
        </Link>

        <div className="grid grid-cols-2 gap-3">
          <Link
            href="/calendar"
            className="flex flex-col gap-6 rounded-2xl bg-card p-5 shadow-sm ring-1 ring-border transition-colors hover:bg-secondary focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
          >
            <span className="flex size-10 items-center justify-center rounded-full bg-accent text-accent-foreground">
              <CalendarDays className="size-5" aria-hidden="true" />
            </span>
            <span>
              <span className="block font-semibold">Calendar</span>
              <span className="block text-sm text-muted-foreground">
                {thisWeekCount === 1 ? '1 event this week' : `${thisWeekCount} events this week`}
              </span>
            </span>
          </Link>

          <Link
            href="/add"
            className="flex flex-col gap-6 rounded-2xl bg-card p-5 shadow-sm ring-1 ring-border transition-colors hover:bg-secondary focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
          >
            <span className="flex size-10 items-center justify-center rounded-full bg-accent text-accent-foreground">
              <Plus className="size-5" aria-hidden="true" />
            </span>
            <span>
              <span className="block font-semibold">Add event</span>
              <span className="block text-sm text-muted-foreground">Name, date & time</span>
            </span>
          </Link>
        </div>
      </nav>
    </main>
  )
}
