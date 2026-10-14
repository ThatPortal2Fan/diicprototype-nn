'use client'

import {
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  startOfMonth,
  startOfWeek,
} from 'date-fns'
import { EventPopover } from '@/components/calendar/event-popover'
import type { CalendarEvent } from '@/lib/types'
import { getEventEstimate } from '@/lib/event-utils'
import { cn } from '@/lib/utils'

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MAX_VISIBLE = 3

interface MonthViewProps {
  cursor: Date
  today: Date | null
  events: CalendarEvent[]
  onSelectDay: (day: Date) => void
}

export function MonthView({ cursor, today, events, onSelectDay }: MonthViewProps) {
  const days = eachDayOfInterval({
    start: startOfWeek(startOfMonth(cursor)),
    end: endOfWeek(endOfMonth(cursor)),
  })

  const byDay = new Map<string, CalendarEvent[]>()
  for (const e of events) {
    if (e.startAt === null) continue
    const key = format(e.startAt, 'yyyy-MM-dd')
    const list = byDay.get(key) ?? []
    list.push(e)
    byDay.set(key, list)
  }

  return (
    <div className="overflow-hidden rounded-2xl bg-card shadow-sm ring-1 ring-border">
      <div className="grid grid-cols-7 border-b border-border" aria-hidden="true">
        {WEEKDAYS.map((d) => (
          <div key={d} className="py-2 text-center text-xs font-medium text-muted-foreground">
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 [&>*:nth-child(7n)]:border-r-0">
        {days.map((day) => {
          const key = format(day, 'yyyy-MM-dd')
          const dayEvents = byDay.get(key) ?? []
          const inMonth = isSameMonth(day, cursor)
          const isToday = today ? isSameDay(day, today) : false

          return (
            <div
              key={key}
              className={cn(
                'flex min-h-20 flex-col gap-1 border-r border-b border-border p-1 sm:min-h-28 sm:p-1.5',
                !inMonth && 'bg-secondary/50',
              )}
            >
              <button
                type="button"
                onClick={() => onSelectDay(day)}
                aria-label={`${format(day, 'EEEE, MMMM d')}, ${dayEvents.length} events. Open week view.`}
                className={cn(
                  'flex size-7 items-center justify-center self-center rounded-full text-sm tabular-nums hover:bg-secondary focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none sm:self-end',
                  !inMonth && 'text-muted-foreground',
                  isToday && 'bg-primary font-semibold text-primary-foreground hover:bg-primary/90',
                )}
              >
                {format(day, 'd')}
              </button>

              <ul className="hidden flex-col gap-0.5 sm:flex">
                {dayEvents.slice(0, MAX_VISIBLE).map((e) => (
                  <li key={e.id}>
                    <EventPopover
                      event={e}
                      className={cn(
                        'flex w-full items-center gap-1 truncate rounded-md px-1.5 py-0.5 text-left text-xs hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none',
                        e.status === 'done' && 'text-muted-foreground line-through',
                        (getEventEstimate(e, events).start?.bufferMinutes ?? 0) > 0 && 'opacity-75',
                      )}
                    >
                      <span
                        className={cn(
                          'size-1.5 shrink-0 rounded-full',
                          e.status === 'in_progress' ? 'bg-emerald-500' : 'bg-primary',
                        )}
                        aria-hidden="true"
                      />
                      <span className="truncate font-medium">{e.name}</span>
                      <span className="ml-auto shrink-0 text-muted-foreground tabular-nums">
                        {format(e.startAt, 'HH:mm')}
                      </span>
                    </EventPopover>
                  </li>
                ))}
                {dayEvents.length > MAX_VISIBLE ? (
                  <li>
                    <button
                      type="button"
                      onClick={() => onSelectDay(day)}
                      className="px-1.5 text-xs text-muted-foreground hover:text-foreground"
                    >
                      +{dayEvents.length - MAX_VISIBLE} more
                    </button>
                  </li>
                ) : null}
              </ul>

              {dayEvents.length > 0 ? (
                <div className="flex justify-center gap-0.5 sm:hidden" aria-hidden="true">
                  {dayEvents.slice(0, MAX_VISIBLE).map((e) => (
                    <span
                      key={e.id}
                      className={cn(
                        'size-1.5 rounded-full',
                        e.status === 'done' ? 'bg-muted-foreground/40' : 'bg-primary',
                      )}
                    />
                  ))}
                </div>
              ) : null}
            </div>
          )
        })}
      </div>
    </div>
  )
}
