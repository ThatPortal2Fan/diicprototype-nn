'use client'

import { format, isSameDay } from 'date-fns'
import { CalendarRange, Timer } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { EventPopover } from '@/components/calendar/event-popover'
import type { CalendarEvent } from '@/lib/types'
import { eventTitle, formatDuration, getStartWindow, isInstant, relativeLabel } from '@/lib/event-utils'
import { cn } from '@/lib/utils'

const STATUS_LABEL: Record<CalendarEvent['status'], string> = { scheduled: 'Scheduled', in_progress: 'In progress', done: 'Done' }

interface DayEventsProps {
  day: Date
  now: number | null
  events: CalendarEvent[]
  onOpenWeek: () => void
}

/** The selected day's events below the month grid, one card each (styled like the main menu's next event). */
export function DayEvents({ day, now, events, onOpenWeek }: DayEventsProps) {
  const dayEvents = events
    .filter((e) => e.startAt !== null && isSameDay(e.startAt, day))
    .sort((a, b) => a.startAt! - b.startAt!)

  return (
    <section aria-labelledby="day-events-heading" className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <h2 id="day-events-heading" className="text-lg font-semibold">
          {format(day, 'EEEE, MMMM d')}
          <span className="ml-2 text-sm font-normal text-muted-foreground">
            {dayEvents.length === 1 ? '1 event' : `${dayEvents.length} events`}
          </span>
        </h2>
        <Button variant="outline" size="sm" onClick={onOpenWeek}>
          <CalendarRange aria-hidden="true" />
          Week view
        </Button>
      </div>

      {dayEvents.length === 0 ? (
        <p className="rounded-2xl bg-card p-5 text-sm text-muted-foreground ring-1 ring-border">Nothing scheduled for this day.</p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {dayEvents.map((e) => {
            const done = e.status === 'done'
            const window = e.status === 'scheduled' ? getStartWindow(e, events) : null
            return (
              <li key={e.id}>
                <EventPopover
                  event={e}
                  className={cn(
                    'flex w-full flex-col gap-3 rounded-2xl p-5 text-left shadow-sm transition-transform focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:ring-offset-2 focus-visible:outline-none active:scale-[0.99]',
                    done ? 'bg-card text-muted-foreground ring-1 ring-border' : 'bg-primary text-primary-foreground',
                  )}
                >
                  <span className="inline-flex items-center gap-2 text-sm font-medium opacity-90">
                    <Timer className="size-4" aria-hidden="true" />
                    {STATUS_LABEL[e.status]}
                  </span>
                  <span className="block">
                    <span className={cn('block text-xl font-semibold text-balance', done && 'line-through')}>{eventTitle(e)}</span>
                    <span className="mt-1 block text-sm opacity-90 tabular-nums">
                      {format(e.startAt!, 'p')}
                      {isInstant(e) ? '' : ` – ${format(e.endAt!, 'p')}`}
                      {now !== null && !done ? ` · ${relativeLabel(e.startAt!, now)}` : ''}
                    </span>
                  </span>
                  {window ? (
                    <span className="inline-flex flex-wrap items-center gap-x-1.5 self-start rounded-lg border border-dashed border-primary-foreground/50 bg-primary-foreground/10 px-2.5 py-1 text-sm">
                      <span className="font-medium tabular-nums">
                        Predicted start {format(window.from, 'p')} – {format(window.to, 'p')}
                      </span>
                      <span className="opacity-80">· ±{formatDuration(window.stats.bufferMinutes)}</span>
                    </span>
                  ) : null}
                </EventPopover>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
