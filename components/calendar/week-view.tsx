'use client'

import { useEffect, useRef } from 'react'
import { addDays, format, isSameDay, startOfDay, startOfWeek } from 'date-fns'
import { EventPopover } from '@/components/calendar/event-popover'
import { formatSignedMinutes, statsFor, type DeviationStats } from '@/lib/event-utils'
import type { CalendarEvent } from '@/lib/types'
import { cn } from '@/lib/utils'

const HOUR_HEIGHT = 48
const MIN_BLOCK_MINUTES = 20
const DAY_MINUTES = 24 * 60
const HOURS = Array.from({ length: 24 }, (_, i) => i)

interface WeekViewProps {
  cursor: Date
  now: number | null
  events: CalendarEvent[]
  stats: Map<string, DeviationStats>
  onEdit: (event: CalendarEvent) => void
}

const toPx = (minutes: number) => (minutes / 60) * HOUR_HEIGHT

function minutesIntoDay(ms: number) {
  return (ms - startOfDay(ms).getTime()) / 60_000
}

interface Placed {
  event: CalendarEvent
  start: number
  duration: number
  earlyMin: number
  lateMin: number
  dev: number | null
  lane: number
}

function layoutDay(dayEvents: CalendarEvent[], stats: Map<string, DeviationStats>) {
  const sorted = [...dayEvents].sort((a, b) => a.startAt - b.startAt)
  const laneEnds: number[] = []
  const placed: Placed[] = sorted.map((event) => {
    const start = minutesIntoDay(event.startAt)
    const duration = Math.min(
      Math.max((event.endAt - event.startAt) / 60_000, MIN_BLOCK_MINUTES),
      DAY_MINUTES - start,
    )
    const dev = statsFor(stats, event).minutes
    const earlyMin = dev !== null && dev < 0 ? Math.min(-dev, start) : 0
    const lateMin = dev !== null && dev > 0 ? Math.min(dev, duration) : 0
    const visualStart = start - earlyMin
    let lane = laneEnds.findIndex((end) => end <= visualStart)
    if (lane === -1) {
      lane = laneEnds.length
      laneEnds.push(0)
    }
    laneEnds[lane] = start + duration
    return { event, start, duration, earlyMin, lateMin, dev, lane }
  })
  return { placed, lanes: Math.max(laneEnds.length, 1) }
}

const TONE: Record<CalendarEvent['status'], { solid: string; light: string }> = {
  scheduled: {
    solid: 'border-primary bg-primary/30 text-foreground',
    light: 'border-primary/60 bg-primary/10',
  },
  in_progress: {
    solid: 'border-emerald-500 bg-emerald-500/30 text-foreground',
    light: 'border-emerald-500/60 bg-emerald-500/10',
  },
  done: {
    solid: 'border-muted-foreground/50 bg-muted text-muted-foreground',
    light: 'border-muted-foreground/30 bg-muted/40',
  },
}

export function WeekView({ cursor, now, events, stats, onEdit }: WeekViewProps) {
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
        <div className="relative grid grid-cols-[3rem_repeat(7,minmax(0,1fr))]" style={{ height: HOUR_HEIGHT * 24 }}>
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
            const dayEvents = events.filter((e) => isSameDay(e.startAt, day))
            const { placed, lanes } = layoutDay(dayEvents, stats)
            const isToday = now ? isSameDay(day, now) : false

            return (
              <div key={day.toISOString()} className="relative border-l border-border" aria-label={format(day, 'EEEE, MMMM d')} role="group">
                {HOURS.map((h) => (
                  <div key={h} className="border-b border-border/60" style={{ height: HOUR_HEIGHT }} aria-hidden="true" />
                ))}

                {placed.map(({ event, start, duration, earlyMin, lateMin, dev, lane }) => {
                  const tone = TONE[event.status]
                  return (
                    <EventPopover
                      key={event.id}
                      event={event}
                      stats={statsFor(stats, event)}
                      onEdit={onEdit}
                      style={{
                        top: toPx(start - earlyMin),
                        height: toPx(duration + earlyMin) - 2,
                        left: `calc(${(lane / lanes) * 100}% + 2px)`,
                        width: `calc(${100 / lanes}% - 4px)`,
                      }}
                      className="absolute flex flex-col overflow-hidden rounded-md text-left text-[11px] leading-tight shadow-sm focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
                    >
                      {earlyMin > 0 ? (
                        <span
                          className={cn('shrink-0 border-t border-l-[3px] border-dashed', tone.light)}
                          style={{ height: toPx(earlyMin) }}
                          aria-hidden="true"
                        />
                      ) : null}
                      <span className={cn('relative flex min-h-0 flex-1 flex-col border-l-[3px]', tone.solid)}>
                        {lateMin > 0 ? (
                          <span
                            className={cn('absolute inset-x-0 top-0 border-b border-dashed', tone.light, 'bg-card/60')}
                            style={{ height: toPx(lateMin) }}
                            aria-hidden="true"
                          />
                        ) : null}
                        <span className="relative flex flex-col px-1.5 py-1">
                          <span className={cn('truncate font-semibold', event.status === 'done' && 'line-through')}>
                            {event.name}
                          </span>
                          <span className="truncate opacity-80 tabular-nums">
                            {format(event.startAt, 'HH:mm')}–{format(event.endAt, 'HH:mm')}
                            {dev ? ` · ${formatSignedMinutes(dev)}` : ''}
                          </span>
                        </span>
                      </span>
                    </EventPopover>
                  )
                })}

                {isToday && now ? (
                  <div
                    className="pointer-events-none absolute inset-x-0 z-10 flex items-center"
                    style={{ top: toPx(minutesIntoDay(now)) }}
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
