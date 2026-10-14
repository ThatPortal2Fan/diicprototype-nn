'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import {
  addMonths,
  addWeeks,
  endOfMonth,
  endOfWeek,
  format,
  isSameMonth,
  startOfMonth,
  startOfWeek,
} from 'date-fns'
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { MonthView } from '@/components/calendar/month-view'
import { WeekView } from '@/components/calendar/week-view'
import { EditEventDialog } from '@/components/edit-event-dialog'
import { PageHeader } from '@/components/page-header'
import { DataStatusBanner } from '@/components/data-status-banner'
import { useEvents } from '@/hooks/use-events'
import { useNow } from '@/hooks/use-now'
import { WINDOW_END, WINDOW_START } from '@/lib/date-window'
import { getDeviationStats } from '@/lib/event-utils'
import type { CalendarEvent } from '@/lib/types'
import { cn } from '@/lib/utils'

type View = 'month' | 'week'

function weekLabel(cursor: Date) {
  const start = startOfWeek(cursor)
  const end = endOfWeek(cursor)
  return isSameMonth(start, end)
    ? `${format(start, 'MMMM d')} – ${format(end, 'd, yyyy')}`
    : `${format(start, 'MMM d')} – ${format(end, 'MMM d, yyyy')}`
}

function clampToWindow(ms: number) {
  return new Date(Math.min(Math.max(ms, WINDOW_START), WINDOW_END))
}

export function CalendarView() {
  const { events } = useEvents()
  const now = useNow()
  const stats = useMemo(() => getDeviationStats(events), [events])
  const [view, setView] = useState<View>('month')
  const [cursor, setCursor] = useState<Date | null>(null)
  const [editing, setEditing] = useState<CalendarEvent | null>(null)
  const activeCursor = cursor ?? (now ? clampToWindow(now) : null)

  const canGoBack =
    activeCursor !== null &&
    (view === 'month' ? startOfMonth(activeCursor).getTime() : startOfWeek(activeCursor).getTime()) > WINDOW_START
  const canGoForward =
    activeCursor !== null &&
    (view === 'month' ? endOfMonth(activeCursor).getTime() : endOfWeek(activeCursor).getTime()) < WINDOW_END

  function step(direction: 1 | -1) {
    if (!activeCursor) return
    const next = view === 'month' ? addMonths(activeCursor, direction) : addWeeks(activeCursor, direction)
    setCursor(clampToWindow(next.getTime()))
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
          <Button variant="outline" size="icon" onClick={() => step(-1)} disabled={!canGoBack} aria-label={`Previous ${view}`}>
            <ChevronLeft aria-hidden="true" />
          </Button>
          <Button variant="outline" onClick={() => setCursor(null)}>
            Today
          </Button>
          <Button variant="outline" size="icon" onClick={() => step(1)} disabled={!canGoForward} aria-label={`Next ${view}`}>
            <ChevronRight aria-hidden="true" />
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground" aria-hidden="true">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-3 w-4 rounded-sm border-l-[3px] border-primary bg-primary/30" />
          Planned time
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-3 w-4 rounded-sm border border-dashed border-primary/60 bg-primary/10" />
          Usual deviation (early or late)
        </span>
        <span>Calendar covers Oct 2026 – Dec 2027</span>
      </div>

      {activeCursor ? (
        view === 'month' ? (
          <MonthView
            cursor={activeCursor}
            today={now ? new Date(now) : null}
            events={events}
            stats={stats}
            onEdit={setEditing}
            onSelectDay={(day) => {
              setCursor(day)
              setView('week')
            }}
          />
        ) : (
          <WeekView cursor={activeCursor} now={now} events={events} stats={stats} onEdit={setEditing} />
        )
      ) : (
        <div className="h-96 animate-pulse rounded-2xl bg-card ring-1 ring-border" />
      )}

      <EditEventDialog event={editing} onOpenChange={(open) => !open && setEditing(null)} />
    </main>
  )
}
