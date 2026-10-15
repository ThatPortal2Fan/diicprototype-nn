'use client'

import { useEffect, useRef } from 'react'
import { addDays, format, isSameDay, startOfDay, startOfWeek } from 'date-fns'
import { EventPopover } from '@/components/calendar/event-popover'
import type { CalendarEvent } from '@/lib/types'
import { eventTitle, getBufferWindows, isInstant } from '@/lib/event-utils'
import { cn } from '@/lib/utils'

const HOUR_HEIGHT = 48
const MIN_BLOCK_MINUTES = 15
const DAY_MINUTES = 24 * 60
/** Height of an instant event's label, which sits above its line. */
const LABEL_HEIGHT = 15
const LABEL_MINUTES = (LABEL_HEIGHT / HOUR_HEIGHT) * 60
const HOURS = Array.from({ length: 24 }, (_, i) => i)

interface WeekViewProps {
  cursor: Date
  now: number | null
  events: CalendarEvent[]
}

function minutesIntoDay(ms: number) {
  return (ms - startOfDay(ms).getTime()) / 60_000
}

const toMinutes = (ms: number, event: CalendarEvent, start: number) => start + (ms - event.startAt!) / 60_000
const clampDay = (minutes: number) => Math.min(Math.max(minutes, 0), DAY_MINUTES)

function layoutDay(dayEvents: CalendarEvent[], events: CalendarEvent[]) {
  const sorted = dayEvents.filter((event) => event.startAt !== null).sort((a, b) => a.startAt! - b.startAt!)
  const laneEnds: number[] = []
  const placed = sorted.map((event) => {
    const start = minutesIntoDay(event.startAt!)
    const instant = isInstant(event)
    // Duration events span their real start and end; instant events are a line at the start.
    const end = instant ? start : Math.min(start + Math.max((event.endAt! - event.startAt!) / 60_000, MIN_BLOCK_MINUTES), DAY_MINUTES)
    // Buffers: scheduled time ± 1.5σ, around the start and (for duration events) the end.
    const windows = getBufferWindows(event, events)
    const bands = [windows.start, windows.end]
      .filter((w) => w !== null && w.stats.bufferMinutes > 0)
      .map((w) => ({ from: clampDay(toMinutes(w!.from, event, start)), to: clampDay(toMinutes(w!.to, event, start)) }))
    // Lanes account for labels and buffers too, so they never overlap another event.
    const top = Math.min(instant ? start - LABEL_MINUTES : start, ...bands.map((b) => b.from))
    const bottom = Math.max(end + 2, ...bands.map((b) => b.to))
    let lane = laneEnds.findIndex((laneEnd) => laneEnd <= top)
    if (lane === -1) {
      lane = laneEnds.length
      laneEnds.push(-Infinity)
    }
    laneEnds[lane] = bottom
    return { event, start, end, instant, bands, lane }
  })
  return { placed, lanes: Math.max(laneEnds.length, 1) }
}

const STATUS_COLORS: Record<CalendarEvent['status'], { line: string; text: string; band: string }> = {
  scheduled: { line: 'bg-primary', text: 'text-accent-foreground', band: 'bg-primary/15 border-primary/80' },
  in_progress: { line: 'bg-emerald-500', text: 'text-emerald-900', band: 'bg-emerald-500/15 border-emerald-600/80' },
  done: { line: 'bg-muted-foreground/50', text: 'text-muted-foreground line-through', band: 'bg-muted-foreground/10 border-muted-foreground/60' },
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
            const { placed, lanes } = layoutDay(dayEvents, events)
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

                {placed.map(({ event, start, end, instant, bands, lane }) => {
                  const top = (start / 60) * HOUR_HEIGHT
                  const left = `calc(${(lane / lanes) * 100}% + 2px)`
                  const width = `calc(${100 / lanes}% - 4px)`
                  const colors = STATUS_COLORS[event.status]
                  const time = format(event.startAt!, 'HH:mm')
                  // Buffer: lower-opacity colour over the event, edges as dotted lines.
                  const bufferBands = bands.map((band, i) => (
                    <div
                      key={i}
                      className={cn('pointer-events-none absolute border-y-2 border-dotted', colors.band)}
                      style={{
                        top: (band.from / 60) * HOUR_HEIGHT,
                        height: ((band.to - band.from) / 60) * HOUR_HEIGHT,
                        left,
                        width,
                      }}
                      aria-hidden="true"
                    />
                  ))
                  return (
                    <div key={event.id}>
                      {/* Instant events draw the buffer under their label so it stays readable; blocks get it on top. */}
                      {instant ? bufferBands : null}
                      {instant ? (
                        // Instant event: a line at its time, with the name just above it.
                        <EventPopover
                          event={event}
                          style={{ top: top - LABEL_HEIGHT - 1, left, width, height: LABEL_HEIGHT + 3 }}
                          className={cn(
                            'absolute flex flex-col justify-end text-left text-[11px] leading-tight focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none',
                            colors.text,
                          )}
                        >
                          <span className="mb-px flex max-w-full min-w-0 gap-1 self-start rounded-sm bg-card px-1">
                            <span className="truncate font-semibold">{eventTitle(event)}</span>
                            <span className="shrink-0 opacity-80 tabular-nums">{time}</span>
                          </span>
                          <span className={cn('h-0.5 w-full shrink-0 rounded-full', colors.line)} />
                        </EventPopover>
                      ) : (
                        <EventPopover
                          event={event}
                          style={{ top, left, width, height: ((end - start) / 60) * HOUR_HEIGHT - 1 }}
                          className={cn(
                            'absolute flex flex-col overflow-hidden rounded-md border-l-[3px] px-1.5 py-1 text-left text-[11px] leading-tight shadow-sm ring-1 focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none',
                            event.status === 'done' &&
                              'border-muted-foreground/40 bg-secondary text-muted-foreground line-through ring-border',
                            event.status === 'in_progress' && 'border-emerald-500 bg-emerald-50 text-emerald-900 ring-emerald-300',
                            event.status === 'scheduled' && 'border-primary bg-card text-accent-foreground ring-primary/40',
                          )}
                        >
                          <span className="truncate font-semibold">{eventTitle(event)}</span>
                          <span className="truncate opacity-80 tabular-nums">
                            {time}–{format(event.endAt!, 'HH:mm')}
                          </span>
                        </EventPopover>
                      )}
                      {instant ? null : bufferBands}
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
