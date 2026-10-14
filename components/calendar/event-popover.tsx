'use client'

import { useState, type CSSProperties, type ReactNode } from 'react'
import { format } from 'date-fns'
import { Clock, Pencil, PlayCircle, Repeat, Timer, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { removeEvent, removeSeries } from '@/lib/events-store'
import { describeDeviation, type DeviationStats } from '@/lib/event-utils'
import type { CalendarEvent } from '@/lib/types'

const STATUS_LABEL: Record<CalendarEvent['status'], string> = {
  scheduled: 'Scheduled',
  in_progress: 'In progress',
  done: 'Done',
}

interface EventPopoverProps {
  event: CalendarEvent
  stats: DeviationStats
  onEdit: (event: CalendarEvent) => void
  className?: string
  style?: CSSProperties
  children: ReactNode
}

export function EventPopover({ event, stats, onEdit, className, style, children }: EventPopoverProps) {
  const [open, setOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const summary = describeDeviation(stats.minutes)

  async function handleDelete(all: boolean) {
    setDeleting(true)
    try {
      if (all && event.seriesId) await removeSeries(event.seriesId)
      else await removeEvent(event)
      setOpen(false)
    } finally {
      setDeleting(false)
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        className={className}
        style={style}
        aria-label={`${event.name}, ${format(event.startAt, 'EEEE MMMM d, p')}`}
      >
        {children}
      </PopoverTrigger>
      <PopoverContent className="w-80">
        <div className="flex items-start justify-between gap-2">
          <p className="font-semibold text-balance">{event.name}</p>
          <Badge variant={event.status === 'scheduled' ? 'secondary' : 'outline'}>{STATUS_LABEL[event.status]}</Badge>
        </div>
        <div className="flex flex-col gap-1.5 text-sm text-muted-foreground">
          <p className="flex items-center gap-2">
            <Clock className="size-4 shrink-0" aria-hidden="true" />
            {`${format(event.startAt, 'EEE, MMM d · p')} – ${format(event.endAt, 'p')}`}
          </p>
          {event.seriesId ? (
            <p className="flex items-center gap-2">
              <Repeat className="size-4 shrink-0" aria-hidden="true" />
              Part of a repeating series
            </p>
          ) : null}
          {event.actualStartAt ? (
            <p className="flex items-center gap-2">
              <PlayCircle className="size-4 shrink-0" aria-hidden="true" />
              {`Actually started ${format(event.actualStartAt, 'p')}`}
            </p>
          ) : null}
          {summary ? (
            <p className="flex items-start gap-2">
              <Timer className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              <span>
                {summary}
                <span className="block text-xs">
                  {stats.samples === 1 ? '1 recorded start' : `${stats.samples} recorded starts`}
                  {stats.manual !== null ? ' + your estimate' : ''}
                </span>
              </span>
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            className="flex-1"
            onClick={() => {
              setOpen(false)
              onEdit(event)
            }}
          >
            <Pencil aria-hidden="true" />
            Edit
          </Button>
          <Button variant="destructive" size="sm" disabled={deleting} onClick={() => handleDelete(false)}>
            <Trash2 aria-hidden="true" />
            Delete
          </Button>
          {event.seriesId ? (
            <Button variant="outline" size="sm" className="w-full" disabled={deleting} onClick={() => handleDelete(true)}>
              Delete entire series
            </Button>
          ) : null}
        </div>
      </PopoverContent>
    </Popover>
  )
}
