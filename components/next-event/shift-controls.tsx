'use client'
import type { CalendarEvent } from '@/lib/types'
import { getTypicalDeviation, formatDuration } from '@/lib/event-utils'
interface ShiftControlsProps { event: CalendarEvent; events: CalendarEvent[]; busy: boolean; onShift?: (minutes: number) => void }
export function ShiftControls({ event, events }: ShiftControlsProps) {
  const deviation = getTypicalDeviation(event, events)
  return <section className="flex flex-col gap-2 rounded-2xl bg-card p-5 shadow-sm ring-1 ring-border">
    <h2 className="font-semibold">Typical start-time deviation</h2>
    {deviation === null ? <p className="text-sm text-muted-foreground">Not enough recorded starts to calculate a typical deviation yet. Start recurring events to build a history.</p>
      : deviation === 0 ? <p className="text-sm text-muted-foreground">This event usually starts on time, based on recorded occurrences.</p>
      : <p className="text-sm text-muted-foreground">This event usually starts <strong className="text-foreground">{formatDuration(deviation)} {deviation < 0 ? 'early' : 'late'}</strong>, based on recorded occurrences.</p>}
    <p className="text-xs text-muted-foreground">Only occurrences with a scheduled start time and a recorded actual start are included.</p>
  </section>
}
