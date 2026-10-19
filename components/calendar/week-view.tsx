'use client'

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { addDays, format, isSameDay, startOfWeek } from 'date-fns'
import { EventPopover } from '@/components/calendar/event-popover'
import type { CalendarEvent } from '@/lib/types'
import { eventTitle, getBufferWindows, getManualWindows, isInstant, type ManualRange } from '@/lib/event-utils'
import { cn } from '@/lib/utils'

/** Default pixels per hour; pinching (or ctrl/trackpad zoom) scales it between the min and max, like Apple Calendar. */
const HOUR_HEIGHT = 48
const MIN_HOUR_HEIGHT = 20
const MAX_HOUR_HEIGHT = 200
const ZOOM_STORAGE_KEY = 'week-view-hour-height'
const MIN_BLOCK_MINUTES = 15
const DAY_MINUTES = 24 * 60
/** Height of an instant event's label, which sits above its line. */
const LABEL_HEIGHT = 15
const HOURS = Array.from({ length: 24 }, (_, i) => i)

interface WeekViewProps {
  cursor: Date
  now: number | null
  events: CalendarEvent[]
}

/** Clock time in minutes, matching the hour grid. Not time elapsed since midnight, which is off by an hour after a DST change. */
function minutesIntoDay(ms: number) {
  const date = new Date(ms)
  return date.getHours() * 60 + date.getMinutes() + date.getSeconds() / 60
}

const toMinutes = (ms: number, event: CalendarEvent, start: number) => start + (ms - event.startAt!) / 60_000
const clampDay = (minutes: number) => Math.min(Math.max(minutes, 0), DAY_MINUTES)
const clampHeight = (px: number) => Math.min(Math.max(px, MIN_HOUR_HEIGHT), MAX_HOUR_HEIGHT)

function layoutDay(dayEvents: CalendarEvent[], events: CalendarEvent[], hourHeight: number) {
  const labelMinutes = (LABEL_HEIGHT / hourHeight) * 60
  const sorted = dayEvents.filter((event) => event.startAt !== null).sort((a, b) => a.startAt! - b.startAt!)
  const laneEnds: number[] = []
  const placed = sorted.map((event) => {
    const start = minutesIntoDay(event.startAt!)
    const instant = isInstant(event)
    // Duration events span their real start and end; instant events are a line at the start.
    const end = instant ? start : Math.min(start + Math.max((event.endAt! - event.startAt!) / 60_000, MIN_BLOCK_MINUTES), DAY_MINUTES)
    // Buffers: scheduled time ± 1.5σ, around the start and (for duration events) the end.
    const windows = getBufferWindows(event, events)
    const toBand = (w: ManualRange) => ({ from: clampDay(toMinutes(w.from, event, start)), to: clampDay(toMinutes(w.to, event, start)) })
    const bands = [windows.start, windows.end].filter((w) => w !== null && w.stats.bufferMinutes > 0).map((w) => toBand(w!))
    // The user's own buffer, drawn separately from the calculated one.
    const manual = getManualWindows(event)
    const manualBands = [manual.start, manual.end].filter((w) => w !== null).map((w) => toBand(w!))
    const allBands = [...bands, ...manualBands]
    // Lanes account for labels and buffers too, so they never overlap another event.
    const top = Math.min(instant ? start - labelMinutes : start, ...allBands.map((b) => b.from))
    const bottom = Math.max(end + 2, ...allBands.map((b) => b.to))
    let lane = laneEnds.findIndex((laneEnd) => laneEnd <= top)
    if (lane === -1) {
      lane = laneEnds.length
      laneEnds.push(-Infinity)
    }
    laneEnds[lane] = bottom
    return { event, start, end, instant, bands, manualBands, lane }
  })
  return { placed, lanes: Math.max(laneEnds.length, 1) }
}

const STATUS_COLORS: Record<CalendarEvent['status'], { line: string; text: string; band: string }> = {
  scheduled: { line: 'bg-primary', text: 'text-accent-foreground', band: 'bg-primary/15 border-primary/80' },
  in_progress: { line: 'bg-emerald-500', text: 'text-emerald-900', band: 'bg-emerald-500/15 border-emerald-600/80' },
  done: { line: 'bg-muted-foreground/50', text: 'text-muted-foreground line-through', band: 'bg-muted-foreground/10 border-muted-foreground/60' },
}
/** The user's own buffer: same look as the calculated one, in violet with dashed edges. */
const MANUAL_BAND = 'bg-violet-500/15 border-violet-600/80 border-dashed'

export function WeekView({ cursor, now, events }: WeekViewProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [hourHeight, setHourHeight] = useState(HOUR_HEIGHT)
  const heightRef = useRef(hourHeight)
  heightRef.current = hourHeight
  /** Keeps a point in time (hour) at a fixed distance from the top of the scroll area across a zoom. */
  const anchorRef = useRef<{ hour: number; offset: number } | null>(null)
  const weekStart = startOfWeek(cursor)
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))

  // Restore this device's zoom, then scroll to a couple of hours before now.
  useEffect(() => {
    let stored = HOUR_HEIGHT
    try {
      const value = Number(localStorage.getItem(ZOOM_STORAGE_KEY))
      if (value) stored = clampHeight(value)
    } catch {}
    const hour = Math.min(Math.max(new Date().getHours() - 2, 0), 7)
    anchorRef.current = { hour, offset: 0 }
    if (stored === heightRef.current && scrollRef.current) scrollRef.current.scrollTop = hour * stored
    else setHourHeight(stored)
  }, [])

  useLayoutEffect(() => {
    const el = scrollRef.current
    const anchor = anchorRef.current
    if (!el || !anchor) return
    el.scrollTop = anchor.hour * hourHeight - anchor.offset
  }, [hourHeight])

  // Pinch to zoom the time axis (touch), and ctrl + wheel / trackpad pinch on desktop.
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    let pinch: { distance: number; height: number; hour: number } | null = null
    let frame = 0
    const save = () => {
      try {
        localStorage.setItem(ZOOM_STORAGE_KEY, String(Math.round(heightRef.current)))
      } catch {}
    }
    const zoomTo = (height: number, hour: number, offset: number) => {
      anchorRef.current = { hour, offset }
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => setHourHeight(clampHeight(height)))
    }
    const midpoint = (touches: TouchList) => {
      const [a, b] = [touches[0], touches[1]]
      return {
        distance: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY),
        offset: (a.clientY + b.clientY) / 2 - el.getBoundingClientRect().top,
      }
    }
    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length !== 2) return
      e.preventDefault()
      const { distance, offset } = midpoint(e.touches)
      pinch = { distance, height: heightRef.current, hour: (el.scrollTop + offset) / heightRef.current }
    }
    const onTouchMove = (e: TouchEvent) => {
      if (!pinch || e.touches.length !== 2) return
      e.preventDefault() // stop the browser zooming the page
      const { distance, offset } = midpoint(e.touches)
      zoomTo(pinch.height * (distance / pinch.distance), pinch.hour, offset)
    }
    const onTouchEnd = (e: TouchEvent) => {
      if (!pinch || e.touches.length >= 2) return
      pinch = null
      save()
    }
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return // trackpad pinches arrive as ctrl + wheel
      e.preventDefault()
      const offset = e.clientY - el.getBoundingClientRect().top
      zoomTo(heightRef.current * Math.exp(-e.deltaY * 0.01), (el.scrollTop + offset) / heightRef.current, offset)
      save()
    }
    const stopGesture = (e: Event) => e.preventDefault() // iOS Safari's own pinch-zoom events
    el.addEventListener('touchstart', onTouchStart, { passive: false })
    el.addEventListener('touchmove', onTouchMove, { passive: false })
    el.addEventListener('touchend', onTouchEnd)
    el.addEventListener('touchcancel', onTouchEnd)
    el.addEventListener('wheel', onWheel, { passive: false })
    el.addEventListener('gesturestart', stopGesture)
    el.addEventListener('gesturechange', stopGesture)
    return () => {
      cancelAnimationFrame(frame)
      el.removeEventListener('touchstart', onTouchStart)
      el.removeEventListener('touchmove', onTouchMove)
      el.removeEventListener('touchend', onTouchEnd)
      el.removeEventListener('touchcancel', onTouchEnd)
      el.removeEventListener('wheel', onWheel)
      el.removeEventListener('gesturestart', stopGesture)
      el.removeEventListener('gesturechange', stopGesture)
    }
  }, [])

  // Zoomed far out, label every other hour so the labels don't collide.
  const labelEvery = hourHeight < 28 ? 2 : 1

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

      <div ref={scrollRef} className="h-[65dvh] touch-pan-y overflow-y-auto overscroll-contain">
        <div
          className="relative grid grid-cols-[3rem_repeat(7,minmax(0,1fr))]"
          style={{ height: hourHeight * 24 }}
        >
          <div className="relative" aria-hidden="true">
            {HOURS.map((h) =>
              h === 0 || h % labelEvery !== 0 ? null : (
                <span
                  key={h}
                  className="absolute right-2 -translate-y-1/2 text-[10px] text-muted-foreground tabular-nums"
                  style={{ top: h * hourHeight }}
                >
                  {format(new Date(2000, 0, 1, h), 'ha').toLowerCase()}
                </span>
              ),
            )}
          </div>

          {days.map((day) => {
            const dayEvents = events.filter((e) => e.startAt !== null && isSameDay(e.startAt, day))
            const { placed, lanes } = layoutDay(dayEvents, events, hourHeight)
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
                    style={{ height: hourHeight }}
                    aria-hidden="true"
                  />
                ))}

                {placed.map(({ event, start, end, instant, bands, manualBands, lane }) => {
                  const top = (start / 60) * hourHeight
                  const left = `calc(${(lane / lanes) * 100}% + 2px)`
                  const width = `calc(${100 / lanes}% - 4px)`
                  const colors = STATUS_COLORS[event.status]
                  const time = format(event.startAt!, 'HH:mm')
                  // Buffer: lower-opacity colour over the event, edges as dotted lines. The user's own buffer goes on
                  // top of the calculated one with dashed edges, so both stay visible where they overlap.
                  const bandStyle = (band: { from: number; to: number }) => ({
                    top: (band.from / 60) * hourHeight,
                    height: ((band.to - band.from) / 60) * hourHeight,
                    left,
                    width,
                  })
                  const bufferBands = [
                    ...bands.map((band, i) => (
                      <div key={`calc-${i}`} className={cn('pointer-events-none absolute border-y-2 border-dotted', colors.band)} style={bandStyle(band)} aria-hidden="true" />
                    )),
                    ...manualBands.map((band, i) => (
                      <div key={`manual-${i}`} className={cn('pointer-events-none absolute border-y-2', MANUAL_BAND, event.status === 'done' && 'opacity-60')} style={bandStyle(band)} aria-hidden="true" />
                    )),
                  ]
                  return (
                    <div key={event.id}>
                      {/* Instant events draw the buffer under their label, whose see-through background keeps both readable; blocks get it on top. */}
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
                          <span className="mb-px flex max-w-full min-w-0 gap-1 self-start rounded-sm bg-card/70 px-1">
                            <span className="truncate font-semibold">{eventTitle(event)}</span>
                            <span className="shrink-0 opacity-80 tabular-nums">{time}</span>
                          </span>
                          <span className={cn('h-0.5 w-full shrink-0 rounded-full', colors.line)} />
                        </EventPopover>
                      ) : (
                        <EventPopover
                          event={event}
                          style={{ top, left, width, height: ((end - start) / 60) * hourHeight - 1 }}
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
                    style={{ top: (minutesIntoDay(now) / 60) * hourHeight }}
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
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-border px-3 py-2 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <span className={cn('h-3 w-5 border-y-2 border-dotted', STATUS_COLORS.scheduled.band)} aria-hidden="true" />
          Calculated buffer
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className={cn('h-3 w-5 border-y-2', MANUAL_BAND)} aria-hidden="true" />
          Your own buffer
        </span>
      </div>
    </div>
  )
}
