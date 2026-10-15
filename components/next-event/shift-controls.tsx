'use client'
import type { CalendarEvent } from '@/lib/types'
import { getEventEstimate, formatDuration, type TimeStats } from '@/lib/event-utils'
interface ShiftControlsProps { event: CalendarEvent; events: CalendarEvent[]; busy: boolean; onShift?: (minutes: number) => void }

function describe(stats: TimeStats | null, verb: string, onTime: string) {
  if (!stats) return <p className="text-sm text-muted-foreground">Not enough similar occurrences to calculate this yet.</p>
  const mean = Math.round(stats.meanMinutes)
  return <p className="text-sm text-muted-foreground">
    {verb} {mean === 0 ? <strong className="text-foreground">{onTime}</strong> : <strong className="text-foreground">{formatDuration(mean)} {mean < 0 ? 'early' : 'late'}</strong>}
    , predicted within <strong className="text-foreground">±{formatDuration(stats.bufferMinutes)}</strong> of that average (1.5 × σ, {stats.n} occurrences).
  </p>
}

export function ShiftControls({ event, events }: ShiftControlsProps) {
  const { start, end } = getEventEstimate(event, events)
  return <section className="flex flex-col gap-2 rounded-2xl bg-card p-5 shadow-sm ring-1 ring-border">
    <h2 className="font-semibold">Calculated timing</h2>
    <div className="flex flex-col gap-1">
      <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Pick-up / start</h3>
      {describe(start, 'This event usually starts', 'on time')}
    </div>
    <div className="flex flex-col gap-1">
      <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">End</h3>
      {event.endAt == null && !end ? <p className="text-sm text-muted-foreground">No end time set for this event.</p> : describe(end, 'This event usually ends', 'on time')}
    </div>
    <p className="text-xs text-muted-foreground">Calculated from past occurrences with the same name and detail, using a normal distribution of their actual start and end times versus the scheduled ones. Only occurrences with a recorded actual time are included.</p>
  </section>
}
