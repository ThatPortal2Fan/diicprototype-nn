'use client'

import { useEffect, useRef } from 'react'
import { addDays, format, isSameDay, startOfDay, startOfWeek } from 'date-fns'
import { EventPopover } from '@/components/calendar/event-popover'
import type { CalendarEvent } from '@/lib/types'
import { getEventEstimate } from '@/lib/event-utils'
import { cn } from '@/lib/utils'

const HOUR_HEIGHT = 48
const BLOCK_MINUTES = 45
const HOURS = Array.from({ length: 24 }, (_, i) => i)

interface WeekViewProps {
  cursor: Date
  now: number | null
  events: CalendarEvent[]
}

function minutesIntoDay(ms: number) {
  return (ms - startOfDay(ms).getTime()) / 60_000
}

function layoutDay(dayEvents: CalendarEvent[]) {
  const sorted = dayEvents.filter((event) => event.startAt !== null).sort((a, b) => a.startAt! - b.startAt!)
  const laneEnds: number[] = []
  const placed = sorted.map((event) => {
    const start = minutesIntoDay(event.startAt!)
    let lane = laneEnds.findIndex((end) => end <= start)
    if (lane === -1) {
      lane = laneEnds.length
      laneEnds.push(0)
    }
    laneEnds[lane] = start + BLOCK_MINUTES
    return { event, start, lane }
  })
  return { placed, lanes: Math.max(laneEnds.length, 1) }
}

export function WeekView({ cursor, now, events }: WeekViewProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const weekStart = startOfWeek(cursor)
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const hour = Math.max(new Date().getHours() - 2, 0)
    el.scrollTop = Math.min(hour, 7) * HOUR_HEIGHT
  }, [])

  return (
    <div className="overflow-hidden rounded-2xl bg-card shadow-sm ring-1 ring-border">
      <div className="grid grid-cols-[3rem_repeat(7,minmax(0,1fr))] border-b border-border">
        <div aria-hidden="true" />
        {days.map((day) => {
          const isToday = now ? isSameDay(day, now) : false
          return (
            <div key={day.toISOString()} className="flex flex-col items-center gap-0.5 py-2">
              <span className="text-xs font-medium text-muted-foreground">{format(day, 'EEE')}</span>
              <span
                className={cn(
                  'flex size-7 items-center justify-center rounded-full text-sm tabular-nums',
                  isToday && 'bg-primary font-semibold text-primary-foreground',
                )}
              >
                {format(day, 'd')}
              </span>
            </div>
          )
        })}
      </div>

      <div ref={scrollRef} className="h-[65dvh] overflow-y-auto">
        <div
          className="relative grid grid-cols-[3rem_repeat(7,minmax(0,1fr))]"
          style={{ height: HOUR_HEIGHT * 24 }}
        >
          <div className="relative" aria-hidden="true">
            {HOURS.map((h) =>
              h === 0 ? null : (
                <span
                  key={h}
                  className="absolute right-2 -translate-y-1/2 text-[10px] text-muted-foreground tabular-nums"
                  style={{ top: h * HOUR_HEIGHT }}
                >
                  {format(new Date(2000, 0, 1, h), 'ha').toLowerCase()}
                </span>
              ),
            )}
          </div>

          {days.map((day) => {
            const dayEvents = events.filter((e) => e.startAt !== null && isSameDay(e.startAt, day))
            const { placed, lanes } = layoutDay(dayEvents)
            const isToday = now ? isSameDay(day, now) : false

            return (
              <div
                key={day.toISOString()}
                className="relative border-l border-border"
                aria-label={format(day, 'EEEE, MMMM d')}
                role="group"
              >
                {HOURS.map((h) => (
                  <div
                    key={h}
                    className="border-b border-border/60"
                    style={{ height: HOUR_HEIGHT }}
                    aria-hidden="true"
                  />
                ))}

                {placed.map(({ event, start, lane }) => {
                  const top = (start / 60) * HOUR_HEIGHT
                  const left = `calc(${(lane / lanes) * 100}% + 2px)`
                  const width = `calc(${100 / lanes}% - 4px)`
                  const stats = getEventEstimate(event, events).start
                  const windowStart = stats ? start + stats.meanMinutes - stats.bufferMinutes : 0
                  return (
                    <div key={event.id}>
                      {stats && stats.bufferMinutes > 0 ? (
                        <div
                          className="pointer-events-none absolute rounded-md bg-primary/10"
                          style={{
                            top: (windowStart / 60) * HOUR_HEIGHT,
                            height: ((2 * stats.bufferMinutes) / 60) * HOUR_HEIGHT,
                            left,
                            width,
                          }}
                          aria-hidden="true"
                        />
                      ) : null}
                      <EventPopover
                        event={event}
                        style={{ top, left, width, height: (BLOCK_MINUTES / 60) * HOUR_HEIGHT - 2 }}
                        className={cn(
                          'absolute flex flex-col overflow-hidden rounded-md border-l-[3px] px-1.5 py-1 text-left text-[11px] leading-tight shadow-sm focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none',
                          event.status === 'done' &&
                            'border-muted-foreground/40 bg-secondary text-muted-foreground line-through',
                          event.status === 'in_progress' && 'border-emerald-500 bg-emerald-50 text-emerald-900',
                          event.status === 'scheduled' && 'border-primary bg-accent text-accent-foreground',
                        )}
                      >
                        <span className="truncate font-semibold">{event.name}</span>
                        <span className="truncate opacity-80 tabular-nums">{event.startAt === null ? 'Time unset' : format(event.startAt, 'HH:mm')}</span>
                      </EventPopover>
                    </div>
                  )
                })}

                {isToday && now ? (
                  <div
                    className="pointer-events-none absolute inset-x-0 z-10 flex items-center"
                    style={{ top: (minutesIntoDay(now) / 60) * HOUR_HEIGHT }}
                    aria-hidden="true"
                  >
                    <span className="-ml-1 size-2 rounded-full bg-destructive" />
                    <span className="h-px flex-1 bg-destructive" />
                  </div>
                ) : null}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
