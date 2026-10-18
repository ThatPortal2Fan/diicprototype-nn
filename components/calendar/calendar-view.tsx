'use client'

import Link from 'next/link'
import { useState } from 'react'
import { addMonths, addWeeks, endOfWeek, format, isSameMonth, startOfWeek } from 'date-fns'
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DayEvents } from '@/components/calendar/day-events'
import { MonthView } from '@/components/calendar/month-view'
import { WeekView } from '@/components/calendar/week-view'
import { PageHeader } from '@/components/page-header'
import { DataStatusBanner } from '@/components/data-status-banner'
import { useEvents } from '@/hooks/use-events'
import { useNow } from '@/hooks/use-now'
import { cn } from '@/lib/utils'

type View = 'month' | 'week'

function weekLabel(cursor: Date) {
  const start = startOfWeek(cursor)
  const end = endOfWeek(cursor)
  return isSameMonth(start, end)
    ? `${format(start, 'MMMM d')} – ${format(end, 'd, yyyy')}`
    : `${format(start, 'MMM d')} – ${format(end, 'MMM d, yyyy')}`
}

export function CalendarView() {
  const { events } = useEvents()
  const now = useNow()
  const [view, setView] = useState<View>('week')
  const [cursor, setCursor] = useState<Date | null>(null)
  const activeCursor = cursor ?? (now ? new Date(now) : null)
  // Day whose events are listed below the month grid; defaults to today.
  const [selectedDay, setSelectedDay] = useState<Date | null>(null)
  const activeDay = selectedDay ?? (now ? new Date(now) : null)

  function step(direction: 1 | -1) {
    if (!activeCursor) return
    setCursor(view === 'month' ? addMonths(activeCursor, direction) : addWeeks(activeCursor, direction))
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-5xl flex-col gap-4 px-4 pb-10 sm:px-6">
      <PageHeader
        title={activeCursor ? (view === 'month' ? format(activeCursor, 'MMMM yyyy') : weekLabel(activeCursor)) : 'Calendar'}
        actions={
          <Button render={<Link href="/add" />} nativeButton={false} size="icon-lg" aria-label="Add event" className="rounded-full">
            <Plus aria-hidden="true" />
          </Button>
        }
      />

      <DataStatusBanner />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div role="tablist" aria-label="Calendar view" className="inline-flex rounded-lg bg-secondary p-0.5">
          {(['month', 'week'] as const).map((v) => (
            <button
              key={v}
              type="button"
              role="tab"
              aria-selected={view === v}
              onClick={() => setView(v)}
              className={cn(
                'h-8 rounded-md px-4 text-sm font-medium capitalize transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none',
                view === v ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {v}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1">
          <Button variant="outline" size="icon" onClick={() => step(-1)} aria-label={`Previous ${view}`}>
            <ChevronLeft aria-hidden="true" />
          </Button>
          <Button variant="outline" onClick={() => { setCursor(null); setSelectedDay(null) }}>
            Today
          </Button>
          <Button variant="outline" size="icon" onClick={() => step(1)} aria-label={`Next ${view}`}>
            <ChevronRight aria-hidden="true" />
          </Button>
        </div>
      </div>

      {activeCursor ? (
        view === 'month' ? (
          <>
            <MonthView
              cursor={activeCursor}
              today={now ? new Date(now) : null}
              selected={activeDay}
              events={events}
              onSelectDay={setSelectedDay}
            />
            {activeDay ? (
              <DayEvents
                day={activeDay}
                now={now}
                events={events}
                onOpenWeek={() => {
                  setCursor(activeDay)
                  setView('week')
                }}
              />
            ) : null}
          </>
        ) : (
          <WeekView cursor={activeCursor} now={now} events={events} />
        )
      ) : (
        <div className="h-96 animate-pulse rounded-2xl bg-card ring-1 ring-border" />
      )}
    </main>
  )
}
